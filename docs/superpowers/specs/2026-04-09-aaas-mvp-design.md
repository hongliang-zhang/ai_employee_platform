# Agent as a Service — MVP 设计文档

**日期：** 2026-04-09  
**状态：** 草稿  
**参考：** [全量设计文档](./2026-03-30-agent-as-a-service-design.md)

---

## 1. 目标

验证 AaaS 平台的核心基础设施：用户通过 Telegram 与运行在 e2b 隔离沙箱中的 AI agent 对话，平台负责消息路由、对话历史持久化与 sandbox 生命周期管理。

**完成标准：**
- 一条 Telegram 消息进来 → sandbox 处理 → 回复发回 Telegram
- 对话历史跨 sandbox 重启后仍然保留

---

## 2. 非目标（MVP 不实现）

- Dashboard UI
- Agent marketplace 与开发者发布流程
- agent-sdk
- 多 IM 平台（Feishu、Slack、企业微信）
- 文件存储（`/gateway/files/presign`）
- 限流与计费
- Redis
- Teams 管理
- 多 dispatcher 实例（仅单实例部署）

---

## 3. 系统边界与服务划分

```
┌─────────────────────────────────────────────┐
│                 Trusted Zone                 │
│                                              │
│   dispatcher          gateway               │
│   (Node.js)           (Node.js)             │
│     │                   │                   │
│     └──────────────── PostgreSQL            │
└─────────────────────────────────────────────┘
         │                   ▲
    e2b SDK              Gateway API
    create/POST/kill      (JWT auth)
         │                   │
         ▼                   │
┌─────────────────────────────────────────────┐
│              Untrusted Zone                  │
│                                             │
│         demo-agent sandbox (e2b)            │
│    SESSION_TOKEN / GATEWAY_URL / SESSION_ID │
└─────────────────────────────────────────────┘
         ▲
    Telegram long-polling
```

### dispatcher

职责：
- Telegram long-polling（单个 bot binding，`getUpdates` 30 秒超时后立即重新轮询）
- 入站消息去重（`inbound_jobs` UNIQUE 约束）
- Conversation 识别或创建
- Sandbox 生命周期（创建、复用、空闲销毁）
- 按 conversation 串行化消息处理

### gateway

职责：
- JWT 校验（所有来自 sandbox 的请求）
- LLM 调用代理（`POST /gateway/llm`）
- 对话历史读写（`POST /gateway/messages/load`、`POST /gateway/messages/append`）

### demo-agent

职责：
- 暴露 `GET /health` 和 `POST /chat`
- 从 gateway 加载历史 → 调用 LLM → 追加 assistant 消息
- 打包为 e2b 模板（Python Flask）
- System prompt 硬编码为 "You are a helpful assistant."

---

## 4. 数据模型

### 4.1 表定义

```sql
-- 用户（MVP 只有内置管理员，表结构预留）
users (
  id          TEXT PRIMARY KEY,
  email       TEXT UNIQUE NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
)

-- Agent 实例（MVP 只有一个，类型硬编码为 demo-agent）
agents (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('active','paused','deleted')),
  e2b_template_id TEXT NOT NULL,
  port            INT  NOT NULL DEFAULT 8080,
  idle_timeout_ms INT  NOT NULL DEFAULT 300000,  -- 5 分钟
  created_at      TIMESTAMPTZ DEFAULT now()
)

-- Telegram bot binding（MVP 只有一个）
im_configs (
  id               TEXT PRIMARY KEY,
  agent_id         TEXT NOT NULL REFERENCES agents(id),
  platform         TEXT NOT NULL DEFAULT 'telegram',
  bot_token_enc    TEXT NOT NULL,   -- AES-256-GCM 加密后的 bot token
  chat_scope       TEXT NOT NULL DEFAULT 'all',
  status           TEXT NOT NULL CHECK (status IN ('active','paused','disabled')),
  lease_owner      TEXT,
  lease_expires_at TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT now()
)

-- 对话（一个 Telegram chat 一条记录）
conversations (
  id                  TEXT PRIMARY KEY,
  agent_id            TEXT NOT NULL REFERENCES agents(id),
  channel_key         TEXT NOT NULL,  -- im:<im_config_id>
  external_chat_id    TEXT NOT NULL,
  external_thread_key TEXT NOT NULL DEFAULT '',
  created_at          TIMESTAMPTZ DEFAULT now(),
  last_message_at     TIMESTAMPTZ,
  UNIQUE (channel_key, external_chat_id, external_thread_key)
)

-- 消息历史（gateway 持有的 canonical record）
messages (
  id                  TEXT PRIMARY KEY,
  conversation_id     TEXT NOT NULL REFERENCES conversations(id),
  role                TEXT NOT NULL CHECK (role IN ('user','assistant','system','tool')),
  content_json        JSONB NOT NULL,
  source              TEXT NOT NULL CHECK (source IN ('im','sandbox')),
  external_message_id TEXT,
  metadata_json       JSONB DEFAULT '{}',
  created_at          TIMESTAMPTZ DEFAULT now()
)

-- 入站任务（去重 + 崩溃恢复）
inbound_jobs (
  id                  TEXT PRIMARY KEY,
  channel_key         TEXT NOT NULL,
  external_message_id TEXT NOT NULL,
  conversation_id     TEXT NOT NULL REFERENCES conversations(id),
  status              TEXT NOT NULL CHECK (status IN ('pending','processing','done','failed')),
  lease_owner         TEXT,
  lease_expires_at    TIMESTAMPTZ,
  received_at         TIMESTAMPTZ DEFAULT now(),
  UNIQUE (channel_key, external_message_id)
)
-- 崩溃恢复扫描索引（MVP 可延后，但建议随初始 migration 一并创建）
CREATE INDEX idx_inbound_jobs_recovery ON inbound_jobs (status, lease_expires_at)
  WHERE status = 'processing';
```

---

## 5. 消息流与 Sandbox 生命周期

### 5.1 完整消息处理流程

```
Telegram getUpdates
  → 归一化：{ channel_key, external_chat_id, external_thread_key,
              external_message_id, author, content }
  → 找到或创建 conversation（UPSERT，需先于 inbound_jobs 插入以满足 FK 约束）
  → INSERT INTO inbound_jobs ON CONFLICT DO NOTHING
      返回 0 行 → 重复消息，丢弃
  → gateway: POST /gateway/messages/append（写入 user 消息）
      失败时重试，最多 3 次（指数退避）
      全部失败 → UPDATE inbound_jobs SET status='failed'
              → 通过 Telegram sendMessage 回复用户"服务暂时不可用，请稍后重试"
              → 终止本次处理
  → UPDATE inbound_jobs SET status='processing', lease_owner=..., lease_expires_at=...
  → 查找活跃 sandbox
      存在 → 复用
      不存在 → 冷启动：
          发送 Telegram sendChatAction "typing"（立即发送，掩盖冷启动延迟）
          e2b.create(template_id)
          注入 SESSION_TOKEN / GATEWAY_URL / SESSION_ID
          轮询 GET /health，最多 30 次（每次 1 秒间隔，共 30 秒超时）
          超时后 → 销毁 sandbox → UPDATE inbound_jobs SET status='failed'
                → 通过 Telegram sendMessage 回复用户"服务暂时不可用，请稍后重试"
                → 终止本次处理
  → POST /chat { message } 到 sandbox（超时 60 秒）
      超时或非 200 响应 → UPDATE inbound_jobs SET status='failed'
                       → 通过 Telegram sendMessage 回复用户"服务暂时不可用，请稍后重试"
                       → 终止本次处理（不重试，MVP 阶段）
  → 收到响应后通过 Telegram sendMessage 回复用户
  → UPDATE inbound_jobs SET status='done'
  → 重置 idle timer（idle_timeout_ms 后销毁 sandbox）
```

### 5.2 Sandbox 注入的环境变量

```
SESSION_TOKEN  = <JWT，由 dispatcher 用共享密钥签发>
GATEWAY_URL    = http://gateway:3001
SESSION_ID     = <conversation_id>
```

Sandbox **不持有** LLM API key、数据库连接串或任何其他凭证。

### 5.3 JWT Payload

```json
{
  "conversation_id": "conv_xxx",
  "agent_id":        "agent_xxx",
  "exp":             "<now + 24h>"
}
```

算法：HS256，dispatcher 与 gateway 共享密钥（仅通过环境变量共享，不经过 HTTP）。

`exp` 设为固定 24 小时，而非 `idle_timeout_ms`——sandbox 可能在同一 conversation 内被多次重建，JWT 需覆盖整个对话生命周期。实际上 sandbox 的存活时间由 `idle_timeout_ms`（默认 5 分钟）约束，24 小时远超任何单次 sandbox 生命周期，安全可用。Sandbox 若收到 gateway 返回的 401，应将错误透传给 dispatcher（返回 500），由 dispatcher 标记 job failed。

### 5.4 Sandbox 空闲回收

dispatcher 内存维护 `Map<conversationId, NodeJS.Timeout>`，每次 POST /chat 成功后 reset timer，到期后调用 `e2b.sandbox.kill()`。

**已知限制**：idle timer 存储在内存中，dispatcher 重启后定时器丢失。重启前已创建的 sandbox 将成为孤儿，等待 e2b 平台自身的最大存活时间限制回收。MVP 阶段可接受此行为。

### 5.5 Demo Agent 内部逻辑

```python
POST /chat { "message": "..." }
  → resp = gateway.load_messages()
  # 历史中已包含 dispatcher 写入的 user 消息，无需重复添加
  → last_id = resp["last_message_id"]
  → 构造 messages 数组（system prompt + 完整历史）
  → gateway.invoke_llm(messages, model="gpt-4o-mini")
  → gateway.append_messages(
        expected_last_message_id=last_id,
        messages=[{ "role": "assistant", "content": ..., "source": "sandbox" }]
    )
    # 409 stale_write：由于 dispatcher 保证按 conversation 串行处理，
    # 正常情况下不会发生。若发生则视为 fatal error，
    # 返回 500，由 dispatcher 标记 job failed 并通知用户。
  → return { "reply": "<assistant text>" }
```

**重要**：dispatcher 在调用 `POST /chat` 之前已将 user 消息写入 gateway history。demo-agent 通过 `load_messages()` 获取历史时，user 消息已在其中，**不应再将 `/chat` 请求体中的 message 重新添加到 messages 数组**。

---

## 6. Gateway API

所有端点要求 `Authorization: Bearer <SESSION_TOKEN>` 请求头。

### `POST /gateway/llm`

代理 LLM 调用。Gateway 用平台 LLM API Key 转发请求，sandbox 不持有任何 LLM 凭证。

**请求体：**
```json
{
  "model": "gpt-4o-mini",
  "messages": [
    { "role": "system",    "content": [{ "type": "text", "text": "..." }] },
    { "role": "user",      "content": [{ "type": "text", "text": "..." }] }
  ]
}
```

**返回体：**
```json
{
  "message": {
    "role": "assistant",
    "content": [{ "type": "text", "text": "..." }]
  },
  "usage": { "input_tokens": 100, "output_tokens": 50 }
}
```

### `POST /gateway/messages/load`

加载当前 conversation 的历史消息。

**请求体（可选）：**
```json
{ "after_message_id": "msg_100" }
```

`after_message_id` 可选；不传时返回完整对话历史。

**返回体：**
```json
{
  "conversation_id": "conv_xxx",
  "messages": [...],
  "last_message_id": "msg_102"
}
```

### `POST /gateway/messages/append`

追加消息，带乐观并发控制。

**请求体：**
```json
{
  "expected_last_message_id": "msg_102",
  "messages": [
    { "role": "assistant", "content": [...], "source": "sandbox" }
  ]
}
```

Gateway 根据请求来源校验 `source` 字段：sandbox（通过 JWT）发起的 append 必须使用 `source='sandbox'`；dispatcher 直接调用时使用 `source='im'`。来源与 `source` 不匹配时返回 `400 invalid_request`。

冲突时返回 `409`：
```json
{
  "error": {
    "code": "stale_write",
    "message": "expected_last_message_id does not match current history head",
    "retryable": false,
    "details": { "actual_last_message_id": "msg_105" }
  }
}
```

---

## 7. 安全模型

### 凭证存储

| 位置 | 持有的凭证 |
|---|---|
| gateway env | LLM API key、JWT 共享密钥、DATABASE_URL |
| dispatcher env | JWT 共享密钥、bot token 加密密钥（AES-256-GCM）、DATABASE_URL、E2B_API_KEY |
| sandbox env | 仅 SESSION_TOKEN、GATEWAY_URL、SESSION_ID |

### Bot Token 加密

Bot token 由 setup 脚本接收明文 → AES-256-GCM 加密 → 存入 `im_configs.bot_token_enc`。加密密钥仅存放在 dispatcher 环境变量中，不进数据库，也不暴露给 gateway。

---

## 8. Setup 脚本与项目结构

### 目录结构

```
z-mono/
  packages/
    gateway/          # Node.js，Express
    dispatcher/       # Node.js，Express + Telegram polling
    demo-agent/       # Python Flask，打包为 e2b 模板
  scripts/
    setup.ts          # 初始化 DB + 配置 agent + bot token
  migrations/
    001_initial.sql
  docker-compose.yml  # 本地起 postgres
```

### Setup 脚本流程

```
1. 运行 DB migrations
2. 从 stdin 读取 bot token 明文（不落日志）
3. AES-256-GCM 加密 bot token
4. INSERT agents（从环境变量 E2B_TEMPLATE_ID 读取模板 ID；setup.ts 与 dispatcher 共用此环境变量）
5. INSERT im_configs（写入加密后的 token）
6. 打印 "Setup complete. Start dispatcher and gateway to go live."
```

### 本地启动

```bash
docker-compose up -d          # 启动 postgres
npx ts-node scripts/setup.ts  # 初始化配置
pnpm --filter gateway dev
pnpm --filter dispatcher dev
```

### 环境变量

```bash
# 共用
DATABASE_URL=postgres://...

# gateway
LLM_API_KEY=sk-...
JWT_SECRET=<共享密钥>

# dispatcher
JWT_SECRET=<共享密钥>
BOT_TOKEN_ENC_KEY=<32 字节 hex>
GATEWAY_URL=http://localhost:3001
E2B_API_KEY=...
E2B_TEMPLATE_ID=...
```

---

## 9. 可观测性

MVP 采用 structured JSON logging（pino），写到 stdout。

关键事件：

| 服务 | 事件 | 关键字段 |
|---|---|---|
| dispatcher | `message.received` | channel_key, external_message_id |
| dispatcher | `message.deduplicated` | external_message_id |
| dispatcher | `sandbox.created` | conversation_id, duration_ms |
| dispatcher | `sandbox.reused` | conversation_id |
| dispatcher | `sandbox.destroyed` | conversation_id |
| dispatcher | `reply.delivered` | conversation_id |
| gateway | `llm.request` | model, conversation_id |
| gateway | `llm.response` | duration_ms, input_tokens, output_tokens |
| gateway | `auth.rejected` | reason |

每条日志带 `trace_id`（由 dispatcher 在消息入站时生成，通过 `X-Trace-Id` 请求头传递）。

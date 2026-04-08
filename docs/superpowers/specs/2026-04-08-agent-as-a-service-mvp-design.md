# Agent as a Service — MVP 实现方案

**日期：** 2026-04-08  
**状态：** 草稿  
**参考：** [Agent as a Service 设计文档](./2026-03-30-agent-as-a-service-design.md)

---

## 1. MVP 范围

本文档描述 Agent as a Service（AaaS）平台的 MVP 实现方案。MVP 在完整设计文档的基础上，明确缩减以下范围：

| 维度 | 完整设计 | MVP |
|---|---|---|
| IM 平台 | Telegram、Slack、飞书、企业微信 | **仅 Telegram** |
| Agent 类型 | Marketplace（开发者发布流程） | **一个硬编码 agent 类型，通过 migration 预置** |
| Sandbox 隔离 | e2b micro-VM | **e2b（从第一天起）** |
| 管理界面 | 完整 dashboard（用户注册、marketplace UI、使用指标） | **极简 ops UI（单管理员，env var 鉴权）** |
| 服务拆分 | dashboard + dispatcher + gateway 三个独立服务 | **dashboard + backend（dispatcher 与 gateway 合并）** |
| Redis | 可选缓存/限流层 | **不引入，全部走 PostgreSQL** |
| S3 文件存储 | 完整 presigned URL 支持 | **`/gateway/files/presign` 返回 501，暂不实现** |
| 限流 | 按用户限流 + 计费追踪 | **暂不实现** |
| 多实例 dispatcher | binding lease 多实例协调 | **单实例，lease 机制代码预留但不激活** |

**MVP 的核心验证目标：** 用户能通过 Telegram 与一个运行在 e2b 沙箱中的 agent 对话，对话历史跨沙箱重启持久化，整个消息链路端到端跑通。

---

## 2. 架构概览

```
┌─────────────────────────────────────────────────────┐
│ Trusted Zone                                        │
│                                                     │
│  ┌───────────────┐     ┌──────────────────────────┐ │
│  │  dashboard    │────▶│  backend                 │ │
│  │  (Next.js)    │REST │  port 3001: internal-api  │ │
│  │  port 3000    │     │  port 3002: gateway-api   │ │
│  └───────────────┘     └──────────┬───────────────┘ │
│                                   │ e2b SDK          │
└───────────────────────────────────┼─────────────────┘
                                    │
                         ┌──────────▼──────────┐
                         │  e2b Sandbox        │
                         │  hello-agent        │
                         │  POST /chat         │
                         │  GET  /health       │
                         └──────────┬──────────┘
                                    │ /gateway/* (JWT)
                         ┌──────────▼──────────┐
                         │  backend:3002        │
                         │  gateway module      │
                         │  → PostgreSQL        │
                         │  → OpenAI API        │
                         └─────────────────────┘
```

`backend` 是单个 Node.js 进程，内部按模块分层（`im-ingress`、`conversation-router`、`sandbox-orchestrator`、`gateway`、`internal-api`），对外暴露两个 HTTP 服务器。两个端口的分离确保信任边界在代码层面是显式的——沙箱只能访问 3002，dashboard 只能访问 3001。

---

## 3. 仓库结构

```
z-mono/
├── packages/
│   ├── backend/                   # dispatcher + gateway（Node.js/TypeScript）
│   │   ├── src/
│   │   │   ├── im-ingress/        # Telegram long-polling 循环
│   │   │   ├── conversation-router/ # 消息归一化、去重、inbound_jobs
│   │   │   ├── sandbox-orchestrator/ # e2b 生命周期管理
│   │   │   ├── gateway/           # /gateway/* HTTP API（供沙箱调用）
│   │   │   └── internal-api/      # /internal/* HTTP API（供 dashboard 调用）
│   │   ├── migrations/            # PostgreSQL 迁移脚本
│   │   └── package.json
│   ├── dashboard/                 # Next.js 极简 ops UI
│   │   └── package.json
│   └── agent-sdk/                 # TypeScript SDK（供 agent 开发者使用）
│       └── package.json
├── agents/
│   └── hello-agent/               # 硬编码 agent 类型（e2b 模板）
│       ├── src/index.ts           # Express 服务：GET /health, POST /chat
│       └── e2b.toml               # e2b 模板配置
├── docker-compose.yml             # 本地开发：postgres + backend + dashboard
├── .env.example
└── package.json                   # pnpm workspace 根
```

---

## 4. 数据模型

MVP 删除了用户/团队鉴权相关表，Marketplace 相关字段简化为最小集合。

```sql
-- Agent 类型（MVP 仅一行，通过 migration 预置）
CREATE TABLE agent_types (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  template_id      TEXT NOT NULL,      -- e2b 模板 ID
  port             INTEGER NOT NULL,   -- 沙箱监听端口
  idle_timeout_ms  INTEGER NOT NULL DEFAULT 300000,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Agent 实例（通过 dashboard 创建）
CREATE TABLE agents (
  id             TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_type_id  TEXT NOT NULL REFERENCES agent_types(id),
  name           TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'active', -- active | paused | deleted
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- IM 渠道绑定（MVP 仅 Telegram）
CREATE TABLE im_configs (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id         TEXT NOT NULL REFERENCES agents(id),
  platform         TEXT NOT NULL DEFAULT 'telegram',
  bot_token_enc    TEXT NOT NULL,         -- AES-256-GCM 加密后的 bot token
  chat_scope       TEXT NOT NULL DEFAULT 'all', -- MVP 固定为 'all'，im-ingress 不做白名单过滤
  status           TEXT NOT NULL DEFAULT 'active', -- active | paused | disabled
  lease_owner      TEXT,                  -- dispatcher 实例 ID
  lease_expires_at TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 对话（每个稳定的 channel + chat 一条记录）
CREATE TABLE conversations (
  id                   TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id             TEXT NOT NULL REFERENCES agents(id),
  channel_key          TEXT NOT NULL,  -- 'im:<im_config_id>' 或 'web:<agent_id>:test'
  external_chat_id     TEXT NOT NULL,
  external_thread_key  TEXT NOT NULL DEFAULT '',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at      TIMESTAMPTZ,
  UNIQUE (channel_key, external_chat_id, external_thread_key)
);

-- 消息历史（由 gateway 模块持有）
CREATE TABLE messages (
  id                   TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id      TEXT NOT NULL REFERENCES conversations(id),
  role                 TEXT NOT NULL,  -- user | assistant | system | tool
  content_json         JSONB NOT NULL,
  source               TEXT NOT NULL,  -- im | web | sandbox | system
  external_message_id  TEXT,
  metadata_json        JSONB NOT NULL DEFAULT '{}',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 入站任务（去重 + 崩溃恢复）
CREATE TABLE inbound_jobs (
  id                   TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_key          TEXT NOT NULL,
  external_message_id  TEXT NOT NULL,
  conversation_id      TEXT REFERENCES conversations(id),
  status               TEXT NOT NULL DEFAULT 'pending', -- pending | processing | done | failed
  lease_owner          TEXT,
  lease_expires_at     TIMESTAMPTZ,
  received_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (channel_key, external_message_id)
);
```

---

## 5. Backend 服务设计

### 5.1 进程结构

单个 Node.js 进程，启动时：

1. 连接 PostgreSQL，执行 pending migrations
2. 在端口 3001 启动 internal-api HTTP 服务器
3. 在端口 3002 启动 gateway-api HTTP 服务器
4. 扫描 `im_configs WHERE status = 'active'`，获取 lease，启动 Telegram long-polling 循环
5. 启动 heartbeat timer（每 15s 续租持有的 bindings）
6. 启动 takeover scanner（每 10s 扫描过期 lease 并接管）

### 5.2 Telegram 消息处理流程

```
getUpdates 收到 update
  ↓
归一化为 NormalizedMessage { channel_key, external_chat_id,
  external_thread_key, external_message_id, author, content }
  ↓
INSERT INTO inbound_jobs ... ON CONFLICT DO NOTHING
  → 0 rows → 重复消息，丢弃
  → 1 row  → 继续
  ↓
UPDATE inbound_jobs SET status='processing', lease_owner=..., lease_expires_at=...
  ↓
UPSERT conversations → 获取 conversation_id
  ↓
gateway.appendMessages([用户消息])  ← 写入 canonical history
  ↓
sandbox-orchestrator.dispatch(conversation_id, agent_id, message)
  ↓
  ├─ 内存 Map 中存在活跃 sandbox？
  │    → 是：直接 POST /chat { message: string }
  │    → 否：e2b.create(template_id)
  │           注入 SESSION_TOKEN / GATEWAY_URL / SESSION_ID
  │           轮询 GET /health 直到 200（最多 30s，超时则进入失败路径）
  │           POST /chat { message: string }
  ↓
  ├─ sandbox 调用成功？
  │    → 是：Telegram sendMessage(chat_id, reply_text)
  │           UPDATE inbound_jobs SET status='done'
  │           重置该 conversation 的 idle timer
  │           （idle_timeout_ms 后无新消息则 e2b.kill(sandboxId)，从内存 Map 移除）
  │    → 否（超时 / e2b 错误 / /health 超时）：
  │           Telegram sendMessage(chat_id, "抱歉，处理失败，请稍后重试")
  │           UPDATE inbound_jobs SET status='failed'
  │           孤儿用户消息保留在 messages 表中（不清理）；
  │           下次对话继续追加，历史不会损坏
```

**`POST /chat` 请求体（dispatcher → sandbox）：**

```json
{ "message": "用户消息文本" }
```

`conversation_id` 和 `agent_id` 已通过 `SESSION_TOKEN` 传递给沙箱，无需在请求体中重复。

**`POST /chat` 响应体（sandbox → dispatcher）：**

```json
{ "reply": "助手回复文本" }
```

### 5.3 Sandbox 环境变量

```
SESSION_TOKEN  = <HS256 JWT，由 dispatcher 签发>
GATEWAY_URL    = http://backend:3002
SESSION_ID     = <conversation_id>
```

JWT payload：
```json
{
  "conversation_id": "conv_abc123",
  "agent_id": "agent_xyz",
  "jti": "sess_456",
  "exp": <now + idle_timeout_ms + 300s buffer>
}
```

**JWT 过期与长会话问题：** JWT 在沙箱创建时签发，`exp` 基于当时的时间戳。如果一个 conversation 的活跃时间超过 `exp`（即 `idle_timeout_ms + 5min`），沙箱后续请求会收到 gateway 返回的 `401 token_expired`。

MVP 的处理方式：每次 `sandbox-orchestrator.dispatch()` 调用前，重新签发一个新的 JWT 并通过 e2b 的环境变量更新接口（`sandbox.setEnvVars`）注入沙箱，同时更新内存 Map 中的 token 引用。这确保每次消息到来时 token 都是新鲜的，不依赖原始 exp。

### 5.4 Gateway API（端口 3002，供沙箱调用）

所有请求需携带 `Authorization: Bearer <SESSION_TOKEN>`。

| 端点 | 说明 |
|---|---|
| `POST /gateway/llm` | 代理 LLM 调用，透传给 OpenAI，记录 usage |
| `POST /gateway/messages/load` | 加载 conversation 历史 |
| `POST /gateway/messages/append` | 追加消息（含 optimistic concurrency check，冲突返回 `409 { error: { code: "stale_write" } }`；SDK 不自动重试，调用方负责重新加载历史后重试） |
| `POST /gateway/files/presign` | **MVP 返回 501** |

### 5.5 Internal API（端口 3001，供 dashboard 调用）

所有请求需携带 `X-Internal-Api-Key: <shared key>`。

| 端点 | 说明 |
|---|---|
| `POST /internal/agents` | 创建 agent 实例 |
| `POST /internal/agents/:id/activate` | 上线 agent，建立 Telegram 连接 |
| `POST /internal/agents/:id/deactivate` | 下线 agent，释放连接，销毁沙箱 |
| `POST /internal/agents/:id/im-configs` | 添加 Telegram binding（加密 bot token） |
| `PUT /internal/im-configs/:id` | 更新 binding |
| `DELETE /internal/im-configs/:id` | 解绑 |
| `POST /internal/agents/:id/chat` | Web 测试聊天（走与 IM 相同的链路） |

---

## 6. Dashboard（极简 ops UI）

Next.js 应用，单管理员通过 `ADMIN_API_KEY` 环境变量鉴权（输入后写入 cookie session，无需数据库用户表）。

**页面列表：**

| 路径 | 说明 |
|---|---|
| `/login` | 输入 ADMIN_API_KEY，写入 session cookie |
| `/agents` | Agent 列表，显示状态 |
| `/agents/new` | 创建 agent（从预置的 agent_types 中选择，填写名称） |
| `/agents/[id]` | Agent 详情：激活/停用、添加/删除 Telegram binding、Web 测试聊天 |

Web 测试聊天面板调用 `POST /internal/agents/:id/chat`，走与 Telegram 消息完全相同的处理路径（归一化、sandbox 调度、gateway 历史），是 MVP 最重要的 demo 功能。

**对话隔离说明：** `POST /internal/agents/:id/chat` 的 `channel_key` 固定为 `web:<agent_id>:test`，`external_chat_id` 使用请求体中的 `session_id`。这意味着同一个 `session_id` 的多次请求共享同一个 conversation 和沙箱。如需多会话隔离，调用方应为每个独立会话生成不同的 `session_id`（dashboard 在页面加载时生成一次即可）。

---

## 7. Agent SDK（TypeScript，MVP 范围）

`@z-mono/agent-sdk` 是一个轻量级 TypeScript 包，封装 gateway API。`hello-agent` 依赖它。

```typescript
import { Gateway } from '@z-mono/agent-sdk'

const gateway = new Gateway()
// 自动从环境变量读取 SESSION_TOKEN、GATEWAY_URL、SESSION_ID

// 加载历史
const { messages, last_message_id } = await gateway.loadMessages()

// 调用 LLM
const response = await gateway.invokeLlm({
  model: 'gpt-4o',
  messages: [...messages, { role: 'user', content: [{ type: 'text', text: userMsg }] }]
})

// 写回历史
await gateway.appendMessages({
  expected_last_message_id: last_message_id,
  messages: [{ role: 'assistant', content: response.message.content, source: 'sandbox' }]
})
```

MVP 额外提供 `GatewayMock`，用内存状态 stub 所有 gateway 调用，供本地开发和单元测试使用。

---

## 8. Hello Agent（e2b 模板）

`agents/hello-agent/` 是平台内置的唯一 agent 类型，通过 `e2b template build` 打包为 e2b 模板，`template_id` 通过 migration 写入 `agent_types` 表。

```typescript
// agents/hello-agent/src/index.ts
import express from 'express'
import { Gateway } from '@z-mono/agent-sdk'

const app = express()
app.use(express.json())

app.get('/health', (_req, res) => res.json({ status: 'ok' }))

app.post('/chat', async (req, res) => {
  const gateway = new Gateway()
  const { messages, last_message_id } = await gateway.loadMessages()
  const userMsg = req.body.message

  const response = await gateway.invokeLlm({
    model: 'gpt-4o',
    messages: [...messages, { role: 'user', content: [{ type: 'text', text: userMsg }] }]
  })

  const replyText = response.message.content[0].text

  await gateway.appendMessages({
    expected_last_message_id: last_message_id,
    messages: [{ role: 'assistant', content: response.message.content, source: 'sandbox' }]
  })

  res.json({ reply: replyText })
})

app.listen(Number(process.env.PORT ?? 8080))
```

---

## 9. 安全模型

| 密钥 | 存放位置 | 说明 |
|---|---|---|
| `JWT_SECRET` | backend 环境变量 | HS256 签名密钥，仅在 backend 内部使用（dispatcher 签发，gateway 模块验证） |
| `BOT_TOKEN_ENCRYPTION_KEY` | backend 环境变量 | AES-256-GCM 密钥，用于加密 `im_configs.bot_token_enc` |
| `INTERNAL_API_KEY` | backend + dashboard 环境变量 | dashboard 调用 internal-api 的共享 Key |
| `OPENAI_API_KEY` | backend 环境变量 | 仅 gateway 模块可访问，沙箱不持有 |
| `E2B_API_KEY` | backend 环境变量 | 仅 sandbox-orchestrator 使用 |
| `ADMIN_API_KEY` | dashboard 环境变量 | ops UI 登录密码 |

沙箱在整个生命周期内只持有三个环境变量：`SESSION_TOKEN`、`GATEWAY_URL`、`SESSION_ID`。无数据库凭证、无 LLM key、无 S3 凭证。

---

## 10. 本地开发环境

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: aaas
      POSTGRES_USER: aaas
      POSTGRES_PASSWORD: aaas
    ports:
      - "5432:5432"

  backend:
    build: ./packages/backend
    ports:
      - "3001:3001"
      - "3002:3002"
    env_file: .env
    depends_on: [postgres]

  dashboard:
    build: ./packages/dashboard
    ports:
      - "3000:3000"
    env_file: .env
    depends_on: [backend]
```

e2b 沙箱在 e2b 云端运行，本地无需额外基础设施。`hello-agent` e2b 模板通过 `cd agents/hello-agent && e2b template build` 构建一次，将生成的 `template_id` 填入 `packages/backend/migrations/001_seed_agent_types.sql`。

---

## 11. 构建顺序

MVP 按以下顺序实现，每步可独立验证：

| 步骤 | 内容 | 验证方式 |
|---|---|---|
| 1 | DB schema + migrations | `psql` 直接查询 |
| 2 | `gateway` 模块（JWT 验证 + `/gateway/llm` + `/gateway/messages/*`） | curl 测试 |
| 3 | `agent-sdk` + `GatewayMock` | 单元测试 |
| 4 | `hello-agent` e2b 模板 | `e2b template build` + 手动调用 `/chat` |
| 5 | `sandbox-orchestrator`（e2b 生命周期） | 集成测试 |
| 6 | `im-ingress` + `conversation-router`（Telegram long-polling） | 真实 Telegram bot 测试 |
| 7 | `internal-api`（activate/deactivate/im-configs/chat） | curl 测试 |
| 8 | `dashboard`（ops UI + web test chat） | 浏览器手动测试 |

---

## 12. 明确延期（MVP 之后）

- Slack、飞书、企业微信 IM 平台
- Agent Marketplace（开发者发布流程、审核、定价）
- Dashboard 用户注册/登录（多租户）
- S3 文件存储（`/gateway/files/presign`）
- 限流与计费追踪
- Redis 缓存层
- 多实例 dispatcher 横向扩展
- 流式响应（SSE）
- 多区域部署

# Gateway Session Events 重设计

**日期：** 2026-05-11  
**分支：** feat/session-events  
**状态：** Draft

---

## 背景与动机

当前 gateway 的 `/messages` API 存在一个核心问题：

**harness-server 只存最终文本回复**：tool_use / tool_result 消息没有写入 DB，session 历史不完整，无法从存储层追溯 agent 的完整行为链路，也无法通过 session 表做业务分析。

设计参考：[Anthropic Managed Agents — Scaling Managed Agents](https://www.anthropic.com/engineering/managed-agents)

> *"The session is the append-only log of everything that happened."*  
> *`emitEvent(id, event)` — harness writes to the session during the agent loop.*

将 `messages` 概念升级为 **session event log**：会话中发生的一切（用户消息、assistant 回复、tool_use、tool_result）都是事件，由 harness 自动写入，统一存入同一张表。业务 outcome（disqualify、lead captured 等）直接从 action tool_use 记录中提取，无需单独打点。

---

## 目标

- **Session 是完整的 append-only 事件日志**：用户消息、assistant 回复、tool 调用、tool 结果全部持久化，可从存储层完整追溯 agent 行为链路
- **Harness 是 session 的唯一写入方**：gateway 只做持久化，不参与上下文管理；职责边界清晰，与 Anthropic Managed Agents 架构对齐
- **Session 与 harness 解耦**：harness 重启后可通过 `events/list` 恢复 `lastEventId`，为后续 `wake(sessionId)` 语义打下基础

## 非目标（本 spec 不包含）

- Context compaction / 跨 session 历史摘要
- `wake(sessionId)` 完整的 harness 崩溃恢复流程
- Token 用量 / cost 归因存储

---

## 涉及包

| 包 | 变更类型 |
|----|----------|
| `packages/gateway` | 新增 `/events/*` 路由，删除 `/messages/*` 路由 |
| `packages/agent-sdk` | GatewayClient 重命名；harness-server 自动存完整事件 |
| `packages/dispatcher` | 删除 gateway session 写入逻辑，简化为纯路由 |

---

## 设计

### 1. Gateway 路由变更

**删除旧路由：**
```
POST /gateway/messages/append
POST /gateway/messages/load
```

**新增路由：**

#### `POST /gateway/events/emit`

替换 `/messages/append`。接受 user / assistant event，含 tool_use / tool_result。

请求体：
```typescript
{
  expected_last_event_id: string | null,
  events: SessionEvent[]
}

type SessionEvent = {
  role: 'user' | 'assistant' | 'toolResult'   // Pi agent-core native roles
  content: PiContentBlock[]                    // Pi agent-core content blocks（含 toolCall）
}

// Pi content block 类型（与 @mariozechner/pi-agent-core 内部格式一致）
type PiTextBlock = { type: 'text'; text: string }
type PiToolCallBlock = { type: 'toolCall'; name: string; id: string; input: unknown }
type PiToolResultBlock = { type: 'toolResult'; toolUseId: string; content: PiTextBlock[] }
type PiContentBlock = PiTextBlock | PiToolCallBlock | PiToolResultBlock
```

响应：
```json
{
  "conversation_id": "...",
  "appended": [{ "seq": "1", "role": "assistant", "created_at": "..." }],
  "last_event_id": "1"
}
```

**鉴权规则：**
- 仅 `caller: 'sandbox'` 可调用此端点（dispatcher 不再写 session events）

#### `POST /gateway/events/list`

替换 `/messages/load`。

请求体：
```typescript
{
  after_event_id?: string   // 增量拉取；不传则返回全部
}
```

响应：
```json
{
  "conversation_id": "...",
  "events": [...],
  "last_event_id": "42"
}
```

**注：`events/list` 返回 `role: 'user' | 'assistant' | 'toolResult'` 的所有记录，为 Pi agent-core native format。harness 重建 LLM context 时可直接加载到 Pi session，无需格式转换。**

---

### 2. DB Schema

`messages` 表重命名为 `session_events`，同步删除冗余字段，新增 `seq` 自增主键。

```sql
CREATE TABLE session_events (
  conversation_id VARCHAR(191) NOT NULL,
  seq             BIGINT       NOT NULL,
  role            ENUM('user', 'assistant', 'toolResult') NOT NULL,
  content_json    JSON         NOT NULL,
  created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (conversation_id, seq)
);
```

**设计要点：**

- **`(conversation_id, seq)` 做复合主键**：`seq` 是 conversation-scoped BIGINT，由 gateway 在写入事务内基于当前 conversation 的最大 seq 分配；避免依赖 TDSQL/RocksDB `AUTO_INCREMENT` 的全局分配顺序，也避免全局 sequence 热点
- **`role` ENUM**：`'user' | 'assistant' | 'toolResult'`，DB 层强类型，与 Pi native format 直接对应
- **复合主键 `(conversation_id, seq)`**：覆盖全部查询模式（load all、增量拉取、OCC check）
- **删除 `source`**：Pi native format 中 `role` 本身已完全区分三类事件，`source` 无额外信息
- **删除 `message_id`、`metadata_json`**：无具体用途；IM 消息 ID 已由 `im_message_receipts` 表管理

API 中 `last_event_id` / `expected_last_event_id` / `after_event_id` 均使用当前 conversation 内 `seq` 的字符串表示（`"42"`），避免 JSON BigInt 序列化问题。

---

### 3. harness-server 变更（agent-sdk）

**当前行为：** 仅在 `agent_end` 后将 `lastReply`（纯文本）追加到 gateway，fire-and-forget。

**新行为：** harness 负责写入所有 session events，包括用户消息。职责拆成两步：

1. `/chat` 入口：先将用户 IM 消息写入 gateway，再启动 agent loop
2. `turn_end` 触发：将本轮 assistant message + tool_results 写入 gateway

**为什么用 `turn_end` 而非 `message_update`：**  
`turn_end` 携带完整的 assistant message（含所有 tool_use blocks）及配对的 tool_result 列表，是自然的原子边界，无需在 harness 侧维护增量累积状态机。

**harness-server 改动伪代码：**
```typescript
// 启动时从 gateway 同步当前 lastEventId（sandbox 重启后恢复状态）
let lastEventId: string | null = null
if (gateway) {
  const current = await gateway.listEvents()
  lastEventId = current.last_event_id
}

app.post('/chat', async (req, res) => {
  const { message } = req.body   // dispatcher 不再传 last_message_id

  // 第一步：写用户消息（harness 负责，不再由 dispatcher 写）
  if (gateway) {
    const result = await gateway.emitEvents(lastEventId, [{
      role: 'user',
      content: [{ type: 'text', text: message }],
    }])
    lastEventId = result.last_event_id
  }

  // 第二步：运行 agent loop，turn_end 时写 assistant + tool_results
  await new Promise<void>((resolve, reject) => {
    session.subscribe(async (event) => {
      if (event.type === 'turn_end') {
        if (gateway) {
          const eventsToEmit = buildEventsFromTurn(event)
          const result = await gateway.emitEvents(lastEventId, eventsToEmit)
          lastEventId = result.last_event_id
        }
      }
      if (event.type === 'agent_end') resolve()
    })
    session.prompt(message).catch(reject)
  })

  res.json({ reply: lastReply })
})
```

---

### 4. GatewayClient 变更（agent-sdk）

重命名方法，保持接口语义一致：

| 旧方法 | 新方法 |
|--------|--------|
| `appendMessages(expectedLastMessageId, messages)` | `emitEvents(expectedLastEventId, events)` |
| — | `listEvents(afterEventId?)` |

响应字段：`last_message_id` → `last_event_id`

**存储格式为 Pi agent-core native format：** 直接存储 Pi 内部 message 结构，无需格式转换。三类记录通过 `role` 区分：

| role | 含义 |
|------|------|
| `'user'` | IM 用户消息 |
| `'assistant'` | assistant 回复（content 中含 `type: 'toolCall'` blocks） |
| `'toolResult'` | tool 执行结果 |

harness 重建 context 时直接将 `events/list` 返回的记录加载进 Pi session，不需要任何转换层。

---

### 5. dispatcher 变更

dispatcher 不再写 session events，变成纯路由器：

- 删除对 `/gateway/messages/append` 的调用（session 写入由 harness 接管）
- 删除对 `/gateway/messages/load` 的调用（harness 启动时自行拉取）
- 删除 `last_message_id` 缓存逻辑
- `/chat` 请求体简化为 `{ message: string }`，去掉 `last_message_id` 字段

---

## Dashboard 查询示例

无需外部 analytics API，直接查 `session_events` 表。业务 outcome 通过 action tool 的名称识别，无需单独打点。

```sql
-- 所有 disqualify 行为（Pi native: toolCall block 在 assistant message 的 content_json 中）
SELECT e.*, c.agent_id
FROM session_events e
JOIN conversations c ON e.conversation_id = c.id
WHERE e.role = 'assistant'
  AND JSON_CONTAINS(e.content_json, '{"type":"toolCall","name":"disqualify_lead"}')
  AND e.created_at >= '2026-05-01';

-- 所有 kb_search tool 调用
SELECT * FROM session_events
WHERE role = 'assistant'
  AND JSON_CONTAINS(content_json, '{"type":"toolCall","name":"kb_search"}');

-- 用户消息
SELECT * FROM session_events WHERE role = 'user';

-- tool 执行结果
SELECT * FROM session_events WHERE role = 'toolResult';
```

---

## 迁移策略

直接替换，不保留旧端点：

1. gateway 删除 `/messages/*`，新增 `/events/*`
2. agent-sdk 更新 GatewayClient + harness-server
3. dispatcher 更新端点引用
4. **三个包同一 PR 合并**，避免中间态

**Sandbox image 注意事项：** 旧版 agent-sdk 已打入 sandbox docker image / e2b template，合并后需同步重建所有 sandbox image。合并前确认没有运行中的长期 sandbox 实例，或在 PR 合并前做好版本隔离。

---

## 受影响的环境变量

无新增。鉴权逻辑（`JWT_SECRET`）不变。

---

## 测试要点

- [ ] 一轮 `/chat` 后，`session_events` 表包含：`role='user'`（IM 消息）+ `role='assistant'`（含 toolCall blocks）+ `role='toolResult'`（tool 结果）
- [ ] harness 启动时调 `events/list` 正确初始化 `lastEventId`（含 sandbox 重启场景）
- [ ] `/chat` 入口写用户消息后 `lastEventId` 更新，后续 `turn_end` emit 无 stale_write
- [ ] harness 一轮内多次 tool call 后 `turn_end` 串行写入，`expected_last_event_id` 无 stale_write
- [ ] sandbox kill（模拟崩溃）后，已完成的 `turn_end` 事件正常落库，未完成的 turn 数据丢失可接受
- [ ] gateway 拒绝 `caller: 'dispatcher'` 调用 `events/emit`（400）
- [ ] local 模式下（无 gateway）harness 正常运行，session events 静默跳过

# Fix: Sandbox Ready Signal & Message History Sync

> 修复 dispatcher 与 agent-sdk 之间的两个协议缺陷：就绪信号不匹配导致 sandbox 反复重启；`last_message_id` 未传递导致 assistant 消息写入冲突。

## Context

当前 MVP 中，dispatcher 与 sandbox 之间存在两个独立但相关的协议缺陷，会导致用户消息无法被正确处理：

1. **Sandbox 就绪信号不匹配**：dispatcher 认为 sandbox 已就绪（`/health` 返回 200），但 `/chat` 尚未准备好（返回 503），触发 sandbox 反复重启的死循环。
2. **Assistant 消息无法持久化**：sandbox 生成回复后尝试通过 gateway 写入历史，但因缺少 `last_message_id` 导致乐观并发检查失败（`stale_write`），assistant 消息丢失。

两个问题都源于 dispatcher ↔ agent-sdk 之间的接口协议不够精确。

## Design decisions

### Decision 1：`/health` 端点改为反映真实就绪状态

修改 `/health` 端点的语义：从「服务器已启动即返回 200」改为「session 初始化 + 文件同步完成后才返回 200」。

Dispatcher 无需改动轮询的端点（仍然是 `/health`），只需要 agent-sdk 侧让 `/health` 在 `sessionReady && fileSyncReady` 为 true 时才返回 200。

**否决的替代方案：**
- 新增 `/ready` 端点（Kubernetes liveness/readiness 分离模式）— MVP 阶段过度设计，dispatcher 不需要区分「活着但没准备好」和「准备好了」，只需要等后者。
- 轮询 `/chat` — `/chat` 有副作用（触发 agent 处理），不适合做探针。

### Decision 2：在 `/chat` 请求中传递 `last_message_id`

Dispatcher 在追加用户消息后获得新的 `last_message_id`，通过 `/chat` 请求体传递给 sandbox。Sandbox 在处理前更新本地缓存的 `last_message_id`，确保后续通过 gateway 追加 assistant 消息时乐观并发检查能通过。

## Bug 1: Sandbox ready signal mismatch

### Symptom

Dispatcher 创建 sandbox → 轮询 `/health` → 获得 200 → 发送 `/chat` → 收到 503 → 标记 sandbox 为 stale → 销毁 → 重试 → 循环。2 次重试后放弃，向用户发送错误消息。

### Root cause

Agent-sdk 的启动时序：

```
server.listen(8080)               ← /health 返回 200 从此处开始
      ↓ (async, non-blocking)
  ┌─ initSession()                ← 注册 LLM provider，调用 createAgentSession (pi SDK)
  └─ fileSync.init()              ← 通过 gateway 从 COS 下载文件
      ↓
  app.locals.sessionReady = true  ← /chat 返回 200 从此处开始
```

Dispatcher 的就绪检查（`sandbox.ts`）：

```typescript
async function pollHealth(chatUrl: string, maxAttempts = 150): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(`${chatUrl}/health`, { signal: AbortSignal.timeout(5_000) })
    if (res.ok) return true   // ← 在此认为 sandbox 已就绪
  }
}
```

`/health` 端点在 HTTP 服务器启动后立即返回 200，但 session 初始化和文件同步尚未完成。`/chat` 端点有守卫检查：

```typescript
if (!app.locals.sessionReady || !app.locals.fileSyncReady) {
  res.status(503).json({ error: 'agent initializing' })
  return
}
```

结果：dispatcher 认为就绪 → 发 `/chat` → 被拒 → 判定 stale → 销毁 → 循环。

### Fix

**agent-sdk** (`harness-server.ts`)：修改 `/health` 端点，增加就绪守卫

```typescript
// Before:
app.get('/health', (_req, res) => {
  res.json({ ok: true })
})

// After:
app.get('/health', (_req, res) => {
  if (!app.locals.sessionReady || !app.locals.fileSyncReady) {
    res.status(503).json({ ok: false, reason: 'agent initializing' })
    return
  }
  res.json({ ok: true })
})
```

Dispatcher 无需改动（仍然轮询 `/health`，但现在 200 意味着真正就绪）。

### Files changed

| Component | File | Change |
|-----------|------|--------|
| agent-sdk | `packages/agent-sdk/src/harness-server.ts` | `/health` 增加就绪状态守卫 |

---

## Bug 2: Assistant messages not persisted (`stale_write`)

### Symptom

Sandbox 生成回复并投递给用户，但 assistant 消息未写入 `messages` 表。日志显示：`harness.append_messages_failed: Error: stale_write`。

### Root cause

`last_message_id`（乐观并发令牌）从未从 dispatcher 同步到 sandbox。

消息流：

```
1. Dispatcher 通过 gateway 追加用户消息:
   POST /gateway/messages/append
     expected_last_message_id: null (或上一次的 head)
     messages: [{ role: "user", source: "im", content: "你好" }]
   → Response: { last_message_id: "msg_abc123" }

2. Dispatcher 发送 chat 请求到 sandbox:
   POST /chat
     { message: "你好" }           ← 只有纯文本，没有 last_message_id
                                     ↑ BUG: msg_abc123 在此丢失

3. Sandbox 生成回复，尝试持久化:
   POST /gateway/messages/append
     expected_last_message_id: null  ← BUG: 应该是 msg_abc123
     messages: [{ role: "assistant", source: "sandbox", content: "..." }]
   → Gateway 检查: 实际 head 是 msg_abc123，期望是 null
   → 409 stale_write
```

在 `harness-server.ts` 中，`lastMessageId` 初始化为 `null` 且从未从外部更新：

```typescript
let lastMessageId: string | null = null   // 从未接收到真实值
```

### Fix

**dispatcher** (`processor.ts`)：在 `/chat` 请求中传递 `last_message_id`

```typescript
const chatRes = await fetch(`${entry.chatUrl}/chat`, {
  method: 'POST',
  body: JSON.stringify({
    message: msg.content.text,
    last_message_id: conversation.getLastMessageId(conversationId),
  }),
})
```

**agent-sdk** (`harness-server.ts`)：从请求中接收并使用 `last_message_id`

```typescript
app.post('/chat', async (req, res) => {
  const { message, last_message_id } = req.body
  if (last_message_id) {
    lastMessageId = last_message_id
  }
  // ... 现有的 agent 处理逻辑 ...
})
```

### Files changed

| Component | File | Change |
|-----------|------|--------|
| dispatcher | `packages/dispatcher/src/processor.ts` | 在 `/chat` 请求体中传递 `last_message_id` |
| agent-sdk | `packages/agent-sdk/src/harness-server.ts` | 从请求体接收并使用 `last_message_id` |

## Components affected

| Component | Changes |
|-----------|---------|
| **agent-sdk** | `/health` 增加就绪状态守卫；`/chat` 接受并使用 `last_message_id` |
| **dispatcher** | `/chat` 请求传递 `last_message_id` |

## Known limitations

- `last_message_id` 只在 `/chat` 请求时同步；如果 sandbox 在两次 `/chat` 之间自行调用 `append_messages`（不经过 dispatcher），仍可能产生冲突。当前 MVP 场景下不会发生。
- `/health` 返回 503 时不区分失败原因（session 失败 vs 文件同步失败），统一返回 `{ ok: false, reason: 'agent initializing' }`。

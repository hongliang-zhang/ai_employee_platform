# Tech Debt Tracker

Known issues and deferred work. Each item includes context so future agents can make informed decisions.

---

## Active debt

### [TD-001] Sandbox map is in-memory only

**Location:** `packages/dispatcher/src/sandbox.ts`
**Impact:** Medium — on dispatcher restart, all active sandboxes are lost. The next user message recreates the sandbox (transparent to users but adds ~30s latency).
**Why deferred:** MVP scope. Acceptable for single-instance deployment.
**Resolution path:** Persist sandbox IDs to DB or Redis; on startup, reconnect to existing sandboxes via `Sandbox.connect(sandboxId)`.

---

### [TD-002] No horizontal scaling for dispatcher

**Location:** `packages/dispatcher/src/`
**Impact:** Medium — only one dispatcher instance can run. `inbound_jobs` lease recovery logic exists (`idx_inbound_jobs_recovery` index) but is not exercised.
**Why deferred:** MVP runs single instance.
**Resolution path:** Add a background recovery loop that queries stale `processing` jobs and reprocesses them.

---

### [TD-003] `lastMessageId` cache not persisted

**Location:** `packages/dispatcher/src/conversation.ts`
**Impact:** Low — on dispatcher restart, the cache is empty. The first `appendMessages` call will use `null` as `expected_last_message_id`, which succeeds only if no race is happening. Sandboxes always reload from gateway, so they are unaffected.
**Why deferred:** MVP scope; race window is narrow.
**Resolution path:** Persist `last_message_id` in the `conversations` table and load on startup.

---

### [TD-004] No `gen-schema.ts` script

**Location:** `scripts/` (missing)
**Impact:** Low — `docs/generated/db-schema.md` must be updated manually after migrations.
**Why deferred:** Small team, single migration file.
**Resolution path:** Write `scripts/gen-schema.ts` that reads `migrations/*.sql` and regenerates `docs/generated/db-schema.md`.

---

<!-- DOC-GARDENING-CHANGE: 2026-04-16
  - Updated TD-005: demo-agent rewritten from Python to TypeScript using agent-sdk. The SDK supports configurable systemPrompt via createAgent() parameter, but demo-agent/src/agent.ts still has hardcoded prompt. Partially resolved.
-->
### [TD-005] `demo-agent` system prompt is hardcoded

**Location:** `packages/demo-agent/src/agent.ts`
**Impact:** Low — the system prompt `"You are a helpful assistant."` cannot be configured per-agent without modifying the code.
**Why deferred:** MVP uses a single agent.
**Resolution path:** Pass system prompt via env var set at sandbox start time in `sandbox.ts`.
**Status update:** Demo-agent was rewritten in TypeScript using agent-sdk (2026-04-15). The SDK's `createAgent()` accepts `systemPrompt` as a parameter, so the framework now supports configuration. However, demo-agent still hardcodes the prompt.

---

### [TD-006] `append` 乐观并发校验存在竞态窗口

**Location:** `packages/gateway/src/routes/messages.ts` — `POST /append`
**Impact:** Low — 两个并发写入请求可能同时通过 `expected_last_message_id` 校验，导致消息时间戳冲突或写入顺序错乱。MVP 场景下 dispatcher 和 sandbox 的写入基本串行，实际触发概率极低。
**Why deferred:** MVP 低并发场景下风险可接受；修复需引入数据库事务或行锁，增加复杂度。
**Resolution path:** 将「查 head + 写入」包在同一个数据库事务中，或对 `conversationId` 加行级锁（`SELECT ... FOR UPDATE`），保证原子性。

---

## Resolved debt

_(none yet)_

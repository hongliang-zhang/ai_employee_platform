# Tech Debt Tracker

Known issues and deferred work. Each item includes context so future agents can make informed decisions.

---

## Active debt

### [TD-001] Per-request sandbox cold start latency

**Location:** `packages/dispatcher/src/sandbox.ts`
**Impact:** Medium — each chat creates a fresh sandbox and waits for `/health`, which simplifies lifecycle correctness but adds cold-start latency to every user message.
**Why deferred:** MVP favors stateless sandbox lifecycle over reuse complexity.
**Resolution path:** Reintroduce reusable sandbox sessions only with explicit health checks, stale-session eviction, and persistence/reconnect semantics.

---

### [TD-002] No horizontal scaling for dispatcher

**Location:** `packages/dispatcher/src/`
**Impact:** Medium — only one dispatcher instance can run. `im_message_receipts` lease recovery logic exists (`idx_im_message_receipts_recovery` index) but is not exercised.
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

### [TD-006] `append` 乐观并发校验存在竞态窗口

**Location:** `packages/gateway/src/routes/messages.ts` — `POST /append`
**Impact:** Low — 两个并发写入请求可能同时通过 `expected_last_message_id` 校验，导致消息时间戳冲突或写入顺序错乱。MVP 场景下 dispatcher 和 sandbox 的写入基本串行，实际触发概率极低。
**Why deferred:** MVP 低并发场景下风险可接受；修复需引入数据库事务或行锁，增加复杂度。
**Resolution path:** 将「查 head + 写入」包在同一个数据库事务中，或对 `conversationId` 加行级锁（`SELECT ... FOR UPDATE`），保证原子性。

---

### [TD-007] `signDispatcherToken` 信任模型不对齐

**Location:** `packages/dispatcher/src/jwt.ts`, `packages/dispatcher/src/gateway-client.ts`, `packages/gateway/src/auth.ts`
**Impact:** Low — 功能正确，但 dispatcher 自签自验 JWT 是不必要的复杂度。JWT 的 scoping 属性（`caller`, `conversation_id`）对可信方无约束力。
**Why deferred:** 当前功能正常，优先级低于其他重构工作。
**Resolution path:** Dispatcher ↔ Gateway 改用静态共享密钥（`INTERNAL_API_KEY`）认证，JWT 仅用于约束不可信的 sandbox。详见 [docs/design-docs/dispatcher-gateway-auth.md](../design-docs/dispatcher-gateway-auth.md)。

---

## Resolved debt

_(none yet)_

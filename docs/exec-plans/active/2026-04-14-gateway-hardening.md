# Gateway Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 `packages/gateway` 的高优先级审查问题：跨会话 anchor、非原子 optimistic concurrency、缺少运行时校验、以及错误信息泄漏，并补齐回归测试与文档。

**Architecture:** 保持现有 gateway API 与职责不变，在 HTTP 边界增加统一校验和统一错误 envelope；将 `/gateway/messages/load` 的 `after_message_id` 严格限制在 JWT 对应会话内；将 `/gateway/messages/append` 改为“同一事务内检查 head + 写入消息”，并通过锁定 `conversations` 行串行化同一会话的写入。

**Tech Stack:** Node.js, Express, Prisma, PostgreSQL, Vitest, Supertest, jsonwebtoken

---

## Scope

本计划只做 `gateway` 的 P0/P1 修复，不在本轮引入新的消息顺序字段，也不修改 dispatcher / sandbox 协议。消息排序模型增强单独立项。

## File Structure

### Create
- `packages/gateway/src/http/errors.ts`
  - 统一错误 envelope helper。
- `packages/gateway/src/http/validation.ts`
  - JWT claims 与 route body 的运行时校验工具。

### Modify
- `packages/gateway/src/auth.ts`
- `packages/gateway/src/routes/messages.ts`
- `packages/gateway/src/routes/llm.ts`
- `packages/gateway/tests/auth.test.ts`
- `packages/gateway/tests/messages.test.ts`
- `packages/gateway/tests/llm.test.ts`
- `packages/gateway/README.md`
- `docs/QUALITY_SCORE.md`

### Read Before Editing
- `ARCHITECTURE.md`
- `docs/QUALITY_SCORE.md`
- `packages/gateway/src/auth.ts`
- `packages/gateway/src/routes/messages.ts`
- `packages/gateway/src/routes/llm.ts`
- `packages/gateway/tests/messages.test.ts`
- `packages/db/prisma/schema.prisma`

---

### Task 1: Prerequisite checklist — verify the Supabase-backed test database

**Files:**
- Verify: `.env.example`
- Verify: `docs/LOCAL-DEV.md`
- Verify: `packages/gateway/vitest.global-setup.ts`
- Verify: `packages/db/.env` (symlink to repo root `.env`)

> This task is a **local prerequisite checklist**, not part of the gateway hardening change set. Do not create a dedicated commit for this task unless you intentionally decide to update repo docs/config for everyone.

- [ ] **Step 1: Verify local `.env` without overwriting it**

If `.env` already exists, do **not** overwrite it. Only create it when it is missing:

```bash
test -f .env || cp .env.example .env
```

For the gateway test flow, verify `.env` contains at minimum:
- `DATABASE_URL` = Supabase pooler URL
- `DIRECT_URL` = Supabase direct URL

If you also plan to run the interactive setup script or the full local stack later, also verify:
- `JWT_SECRET`
- `BOT_TOKEN_ENC_KEY`
- `E2B_TEMPLATE_ID`
- `LLM_API_KEY`

Expected: local `.env` remains intact when already configured, and missing setups can still be bootstrapped from `.env.example`.

- [ ] **Step 2: Ensure Prisma can see the repo root `.env`**

Run:
```bash
test -L packages/db/.env && [ "$(readlink packages/db/.env)" = "../../.env" ] || ln -sfn ../../.env packages/db/.env
```

Expected: `packages/db/.env` is a symlink to `../../.env`.

- [ ] **Step 3: Apply migrations against Supabase**

Run:
```bash
pnpm --filter @aaas/db migrate:deploy
```

Expected: schema is applied successfully via `DIRECT_URL`.

- [ ] **Step 4: Capture the current gateway baseline**

Run:
```bash
pnpm --filter @aaas/gateway test
```

Expected: DB-backed tests actually execute against the configured Supabase database; record current failures before changing code.

- [ ] **Step 5: Only if you need the full local app flow later, run the interactive setup script**

Run:
```bash
pnpm tsx scripts/setup.ts
```

Expected: the script prompts for a Telegram bot token on stdin, reruns migrations idempotently, and creates an `agent` / `im_config` pair. This step is **not required** for the gateway test suite itself.

---

### Task 2: Add shared error and validation helpers

**Files:**
- Create: `packages/gateway/src/http/errors.ts`
- Create: `packages/gateway/src/http/validation.ts`
- Test: `packages/gateway/tests/auth.test.ts`
- Test: `packages/gateway/tests/messages.test.ts`
- Test: `packages/gateway/tests/llm.test.ts`

- [ ] **Step 1: Write failing tests for malformed inputs**

Add tests like:

```ts
it('rejects append when messages is missing', async () => {
  const res = await request(app)
    .post('/gateway/messages/append')
    .set('Authorization', `Bearer ${dispatcherToken(CONV_ID, AGENT_ID)}`)
    .send({ expected_last_message_id: null })

  expect(res.status).toBe(400)
  expect(res.body.error.code).toBe('invalid_request')
})

it('rejects llm request when model is missing', async () => {
  const res = await request(app)
    .post('/gateway/llm')
    .set('Authorization', `Bearer ${sandboxToken()}`)
    .send({ messages: [] })

  expect(res.status).toBe(400)
  expect(res.body.error.code).toBe('invalid_request')
})
```

- [ ] **Step 2: Write a failing test for invalid JWT claim shape**

```ts
it('rejects token with invalid caller claim', () => {
  const token = jwt.sign({ conversation_id: 'conv_1', agent_id: 'agt_1', caller: 'admin' }, SECRET, { expiresIn: '24h' })
  const req = makeReq(token) as Request
  const res = makeRes() as Response

  middleware(req, res, next)

  expect(res.status).toHaveBeenCalledWith(401)
  expect(next).not.toHaveBeenCalled()
})
```

- [ ] **Step 3: Run targeted tests and verify failure**

Run:
```bash
pnpm --filter @aaas/gateway test -- tests/auth.test.ts tests/messages.test.ts tests/llm.test.ts
```
Expected: new tests fail under current implementation.

- [ ] **Step 4: Implement `packages/gateway/src/http/errors.ts`**

```ts
import type { Response } from 'express'

export function sendError(
  res: Response,
  status: number,
  code: string,
  message: string,
  retryable: boolean,
  details: Record<string, unknown> = {},
) {
  return res.status(status).json({ error: { code, message, retryable, details } })
}

export function sendInternalError(res: Response) {
  return sendError(res, 500, 'internal_error', 'Internal server error', true)
}
```

- [ ] **Step 5: Implement `packages/gateway/src/http/validation.ts`**

Include:
- `assertJwtPayload(value)`
- `parseLoadBody(body)`
- `parseAppendBody(body)`
- `parseLlmBody(body)`

Minimum behavior:
- `conversation_id` / `agent_id` must be non-empty strings
- `caller` must be `sandbox | dispatcher`
- `messages` must be a non-empty array for `/append`
- `model` must be a string and `messages` must be an array for `/llm`

- [ ] **Step 6: Re-run targeted tests and make them pass**

Run:
```bash
pnpm --filter @aaas/gateway test -- tests/auth.test.ts tests/messages.test.ts tests/llm.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add packages/gateway/src/http/errors.ts packages/gateway/src/http/validation.ts packages/gateway/tests/auth.test.ts packages/gateway/tests/messages.test.ts packages/gateway/tests/llm.test.ts
git commit -m "feat: add gateway validation and error helpers"
```

---

### Task 3: Harden JWT auth and stop leaking token parsing details

**Files:**
- Modify: `packages/gateway/src/auth.ts`
- Test: `packages/gateway/tests/auth.test.ts`

- [ ] **Step 1: Write failing tests for stable auth errors**

```ts
it('returns stable unauthorized message for malformed token', () => {
  const req = makeReq('not-a-jwt') as Request
  const res = makeRes() as Response

  middleware(req, res, next)

  expect(res.status).toHaveBeenCalledWith(401)
  expect(res.json).toHaveBeenCalledWith({
    error: {
      code: 'unauthorized',
      message: 'Invalid token',
      retryable: false,
      details: {},
    },
  })
})
```

- [ ] **Step 2: Run the auth test and verify failure**

Run:
```bash
pnpm --filter @aaas/gateway test -- tests/auth.test.ts
```

- [ ] **Step 3: Implement minimal auth hardening**

Refactor to use the new helpers:

```ts
const payload = jwt.verify(token, secret)
assertJwtPayload(payload)
req.jwtPayload = payload
```

Error behavior:
- missing token -> `401 unauthorized`, message `Missing token`
- expired token -> `401 token_expired`, message `Token expired`
- all other token/claim issues -> `401 unauthorized`, message `Invalid token`

- [ ] **Step 4: Re-run auth tests**

Run:
```bash
pnpm --filter @aaas/gateway test -- tests/auth.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/gateway/src/auth.ts packages/gateway/tests/auth.test.ts
git commit -m "fix: harden gateway auth claim validation"
```

---

### Task 4: Fix `/gateway/messages/load` so anchors cannot cross conversations

**Files:**
- Modify: `packages/gateway/src/routes/messages.ts`
- Test: `packages/gateway/tests/messages.test.ts`

- [ ] **Step 1: Write a failing integration test for cross-conversation anchors**

Before adding the new test, update the shared test fixtures so extra conversations created by this task are cleaned up. Extend `beforeEach()` / `afterAll()` in `packages/gateway/tests/messages.test.ts` to delete rows for both `CONV_ID` and `OTHER_CONV_ID`, and delete `OTHER_CONV_ID` in teardown so reruns stay idempotent.

Then add the test:

```ts
const OTHER_CONV_ID = 'conv_test02'

it('rejects after_message_id from another conversation', async () => {
  await prisma.conversation.upsert({
    where: { id: OTHER_CONV_ID },
    create: { id: OTHER_CONV_ID, agentId: AGENT_ID, channelKey: 'im:cfg_test02', externalChatId: '456' },
    update: {},
  })

  await prisma.message.create({
    data: { id: 'msg_other_01', conversationId: OTHER_CONV_ID, role: 'user', contentJson: [{ type: 'text', text: 'other' }], source: 'im' },
  })

  const res = await request(app)
    .post('/gateway/messages/load')
    .set('Authorization', `Bearer ${sandboxToken(CONV_ID, AGENT_ID)}`)
    .send({ after_message_id: 'msg_other_01' })

  expect(res.status).toBe(404)
  expect(res.body.error.code).toBe('not_found')
})
```

- [ ] **Step 2: Write a failing pagination happy-path test**

```ts
it('returns only messages after the anchor in the same conversation', async () => {
  // insert msg_page_01 and msg_page_02 in CONV_ID
  // expect only msg_page_02 to be returned
})
```

- [ ] **Step 3: Run message tests and verify failure**

Run:
```bash
pnpm --filter @aaas/gateway test -- tests/messages.test.ts
```

- [ ] **Step 4: Implement scoped anchor lookup**

Change the anchor lookup from global `id` lookup to conversation-scoped lookup:

```ts
const anchor = after_message_id
  ? await db.message.findFirst({
      where: { id: after_message_id, conversationId: conversation_id },
      select: { createdAt: true },
    })
  : null
```

If anchor not found, return:

```ts
sendError(res, 404, 'not_found', 'after_message_id not found', false)
```

- [ ] **Step 5: Make ordering deterministic**

Use:

```ts
orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
```

for history reads, and use the same ordering pattern in tests.

- [ ] **Step 6: Re-run message tests**

Run:
```bash
pnpm --filter @aaas/gateway test -- tests/messages.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add packages/gateway/src/routes/messages.ts packages/gateway/tests/messages.test.ts
git commit -m "fix: scope gateway message anchors to the conversation"
```

---

### Task 5: Make `/gateway/messages/append` atomic under concurrent writes

**Files:**
- Modify: `packages/gateway/src/routes/messages.ts`
- Test: `packages/gateway/tests/messages.test.ts`
- Read: `packages/db/prisma/schema.prisma`

- [ ] **Step 1: Write a failing concurrent append test**

```ts
it('allows only one concurrent append for the same expected_last_message_id', async () => {
  const [a, b] = await Promise.all([
    request(app)
      .post('/gateway/messages/append')
      .set('Authorization', `Bearer ${dispatcherToken(CONV_ID, AGENT_ID)}`)
      .send({
        expected_last_message_id: null,
        messages: [{ role: 'user', content: [{ type: 'text', text: 'first' }], source: 'im' }],
      }),
    request(app)
      .post('/gateway/messages/append')
      .set('Authorization', `Bearer ${dispatcherToken(CONV_ID, AGENT_ID)}`)
      .send({
        expected_last_message_id: null,
        messages: [{ role: 'user', content: [{ type: 'text', text: 'second' }], source: 'im' }],
      }),
  ])

  expect([a.status, b.status].sort()).toEqual([200, 409])
  const rows = await prisma.message.findMany({ where: { conversationId: CONV_ID } })
  expect(rows).toHaveLength(1)
})
```

- [ ] **Step 2: Write a failing test for empty message batches**

```ts
it('rejects append when messages is an empty array', async () => {
  const res = await request(app)
    .post('/gateway/messages/append')
    .set('Authorization', `Bearer ${dispatcherToken(CONV_ID, AGENT_ID)}`)
    .send({ expected_last_message_id: null, messages: [] })

  expect(res.status).toBe(400)
  expect(res.body.error.code).toBe('invalid_request')
})
```

- [ ] **Step 3: Run message tests and verify failure**

Run:
```bash
pnpm --filter @aaas/gateway test -- tests/messages.test.ts
```

- [ ] **Step 4: Implement atomic append inside one transaction**

Use an **interactive Prisma transaction** so the lock, head read, and inserts all share the same transaction/connection:

```ts
await db.$transaction(async (tx) => {
  await tx.$executeRaw`SELECT 1 FROM conversations WHERE id = ${conversation_id} FOR UPDATE`

  const head = await tx.message.findFirst({
    where: { conversationId: conversation_id },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  })

  // compare head to expected_last_message_id
  // insert messages with tx.message.create(...)
})
```

Implementation shape:
1. Parse body with `parseAppendBody(req.body)`.
2. Validate caller/source alignment on parsed messages.
3. Open interactive Prisma transaction.
4. Lock the conversation row with `FOR UPDATE`.
5. Read current head inside the same transaction.
6. Compare to `expected_last_message_id`.
7. Insert messages inside the same transaction.
8. Return `409 stale_write` if head changed.

- [ ] **Step 5: Keep response format unchanged**

Success response must still look like:

```ts
{
  conversation_id,
  appended: inserted,
  last_message_id: lastId,
}
```

- [ ] **Step 6: Re-run message tests**

Run:
```bash
pnpm --filter @aaas/gateway test -- tests/messages.test.ts
```

- [ ] **Step 7: Run the full gateway suite**

Run:
```bash
pnpm --filter @aaas/gateway test
```

- [ ] **Step 8: Commit**

```bash
git add packages/gateway/src/routes/messages.ts packages/gateway/tests/messages.test.ts
git commit -m "fix: make gateway message append atomic"
```

---

### Task 6: Harden `/gateway/llm` request parsing and provider response handling

**Files:**
- Modify: `packages/gateway/src/routes/llm.ts`
- Test: `packages/gateway/tests/llm.test.ts`

- [ ] **Step 1: Write failing tests for malformed request bodies**

```ts
it('returns 400 when messages is not an array', async () => {
  const res = await request(app)
    .post('/gateway/llm')
    .set('Authorization', `Bearer ${sandboxToken()}`)
    .send({ model: 'glm-5.1', messages: 'bad' })

  expect(res.status).toBe(400)
  expect(res.body.error.code).toBe('invalid_request')
})
```

- [ ] **Step 2: Write a failing test for malformed upstream success bodies**

```ts
it('returns provider_error when upstream success body is malformed', async () => {
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [] }) })

  const res = await request(app)
    .post('/gateway/llm')
    .set('Authorization', `Bearer ${sandboxToken()}`)
    .send({ model: 'glm-5.1', messages: [] })

  expect(res.status).toBe(502)
  expect(res.body.error.code).toBe('provider_error')
})
```

- [ ] **Step 3: Run llm tests and verify failure**

Run:
```bash
pnpm --filter @aaas/gateway test -- tests/llm.test.ts
```

- [ ] **Step 4: Implement route hardening**

Requirements:
- use `parseLlmBody(req.body)`
- keep model allowlist check
- if upstream `ok === true` but body misses `choices[0].message` or `usage`, return `502 provider_error`
- catch internal exceptions and return `500 internal_error` with a stable message
- log detailed errors internally only

- [ ] **Step 5: Re-run llm tests**

Run:
```bash
pnpm --filter @aaas/gateway test -- tests/llm.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add packages/gateway/src/routes/llm.ts packages/gateway/tests/llm.test.ts
git commit -m "fix: harden gateway llm request and response handling"
```

---

### Task 7: Update documentation and quality tracking

**Files:**
- Modify: `packages/gateway/README.md`
- Modify: `docs/QUALITY_SCORE.md`

- [ ] **Step 1: Update `packages/gateway/README.md`**

Document:
- required JWT claim shape
- `/messages/load` anchor must belong to the JWT conversation
- `/messages/append` uses optimistic concurrency and returns `409 stale_write`
- malformed request bodies return `400 invalid_request`
- internal errors are opaque to callers

- [ ] **Step 2: Update `docs/QUALITY_SCORE.md`**

Replace the old gap entry for gateway optimistic concurrency if the new concurrent test passes. Note any remaining known limitation around the lack of a dedicated message sequence field.

- [ ] **Step 3: Run the full gateway suite**

Run:
```bash
pnpm --filter @aaas/gateway test
```
Expected: all gateway tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/gateway/README.md docs/QUALITY_SCORE.md
git commit -m "docs: update gateway hardening notes and test coverage"
```

---

### Task 8: Final verification before handoff

**Files:**
- Verify: `packages/gateway/src/auth.ts`
- Verify: `packages/gateway/src/routes/messages.ts`
- Verify: `packages/gateway/src/routes/llm.ts`
- Verify: `packages/gateway/tests/auth.test.ts`
- Verify: `packages/gateway/tests/messages.test.ts`
- Verify: `packages/gateway/tests/llm.test.ts`

- [ ] **Step 1: Run the gateway suite**

```bash
pnpm --filter @aaas/gateway test
```

- [ ] **Step 2: Run type-aware build check for the package**

```bash
pnpm --filter @aaas/gateway build
```

- [ ] **Step 3: Inspect git diff**

```bash
git diff -- packages/gateway docs/QUALITY_SCORE.md
```
Expected: diff only contains the planned gateway hardening changes.

- [ ] **Step 4: Create final commit**

```bash
git add packages/gateway docs/QUALITY_SCORE.md
git commit -m "feat: harden gateway message and llm boundaries"
```

Skip if previous task-level commits already represent the final state.

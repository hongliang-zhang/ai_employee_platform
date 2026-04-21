# Fix Sandbox Ready & Message Sync — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two protocol defects between dispatcher and agent-sdk that cause sandbox restart loops and assistant message loss.

**Architecture:** Two independent fixes. Bug 1 changes agent-sdk's `/health` to guard on actual readiness. Bug 2 passes `last_message_id` through the `/chat` request from dispatcher to agent-sdk.

**Tech Stack:** TypeScript, Vitest, Express, Supertest

**Spec:** `docs/product-specs/2026-04-21-fix-sandbox-ready-and-message-sync.md`

---

### Task 1: `/health` endpoint readiness guard (Bug 1)

**Files:**
- Modify: `packages/agent-sdk/src/harness-server.ts:108-112`
- Test: `packages/agent-sdk/test/harness-server.test.ts`

- [ ] **Step 1: Write failing test — `/health` returns 503 before session is ready**

In `packages/agent-sdk/test/harness-server.test.ts`, add inside the existing `describe('HarnessServer', ...)` block:

```typescript
it('GET /health returns 503 before session init completes', async () => {
  const app = await createHarnessApp({
    systemPrompt: 'test',
    config: { mode: 'local', port: 8080 },
  })
  // Do NOT call initSession — sessionReady and fileSyncReady remain false
  const res = await request(app).get('/health')
  expect(res.status).toBe(503)
  expect(res.body).toEqual({ ok: false, reason: 'agent initializing' })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @aaas/agent-sdk test -- --run`
Expected: FAIL — `/health` returns 200

- [ ] **Step 3: Implement readiness guard on `/health`**

In `packages/agent-sdk/src/harness-server.ts`, replace the `/health` handler:

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

- [ ] **Step 4: Update existing `/health` test to expect 200 only after init**

The existing test `GET /health returns { ok: true }` creates the app but never calls `initSession`. It now needs to set the readiness flags. Change it to:

```typescript
it('GET /health returns { ok: true } after init', async () => {
  const app = await createHarnessApp({
    systemPrompt: 'test',
    config: { mode: 'local', port: 8080 },
  })
  app.locals.sessionReady = true
  app.locals.fileSyncReady = true
  const res = await request(app).get('/health')
  expect(res.status).toBe(200)
  expect(res.body).toEqual({ ok: true })
})
```

- [ ] **Step 5: Run tests to verify all pass**

Run: `pnpm --filter @aaas/agent-sdk test -- --run`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add packages/agent-sdk/src/harness-server.ts packages/agent-sdk/test/harness-server.test.ts
git commit -m "fix(agent-sdk): /health returns 503 until session and file sync are ready"
```

---

### Task 2: Pass `last_message_id` through `/chat` request (Bug 2 — dispatcher side)

**Files:**
- Modify: `packages/dispatcher/src/processor.ts:84-89`
- Test: `packages/dispatcher/tests/processor.test.ts`

- [ ] **Step 1: Write failing test — verify `/chat` request body includes `last_message_id`**

In `packages/dispatcher/tests/processor.test.ts`, inside the existing end-to-end test `'processes new message end-to-end'`, after `mockFetch` is called, add an assertion:

```typescript
// Verify /chat request carries last_message_id
expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual(
  expect.objectContaining({ last_message_id: 'msg_1' })
)
```

Note: `mockFetch` is called once for the `/chat` request. The `last_message_id` should be `'msg_1'` because `gateway.appendMessages` was mocked to return `{ last_message_id: 'msg_1' }`, and `conversation.setLastMessageId('conv_1', 'msg_1')` was called right after. `conversation.getLastMessageId('conv_1')` should return `'msg_1'`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @aaas/dispatcher test -- --run`
Expected: FAIL — `last_message_id` is not in the request body

- [ ] **Step 3: Add `last_message_id` to `/chat` request body**

In `packages/dispatcher/src/processor.ts`, change the `/chat` fetch body:

```typescript
// Before:
body: JSON.stringify({ message: msg.content.text }),

// After:
body: JSON.stringify({
  message: msg.content.text,
  last_message_id: conversation.getLastMessageId(conversationId),
}),
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `pnpm --filter @aaas/dispatcher test -- --run`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/dispatcher/src/processor.ts packages/dispatcher/tests/processor.test.ts
git commit -m "fix(dispatcher): pass last_message_id in /chat request body"
```

---

### Task 3: Accept `last_message_id` from `/chat` request (Bug 2 — agent-sdk side)

**Files:**
- Modify: `packages/agent-sdk/src/harness-server.ts:121,157`
- Test: `packages/agent-sdk/test/harness-server.test.ts`

- [ ] **Step 1: Write failing test — verify `last_message_id` from request is used in append**

In `packages/agent-sdk/test/harness-server.test.ts`, add a new test:

```typescript
it('POST /chat accepts last_message_id and passes it to gateway.appendMessages', async () => {
  const { createAgentSession } = await import('@mariozechner/pi-coding-agent')
  const mockSession = {
    prompt: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn((listener: any) => {
      setTimeout(() => {
        listener({
          type: 'message_update',
          message: { role: 'assistant', content: [{ type: 'text', text: 'Reply!' }] },
        })
        listener({ type: 'agent_end' })
      }, 0)
      return () => {}
    }),
    systemPrompt: '',
    agent: { setSystemPrompt: vi.fn() },
  }
  vi.mocked(createAgentSession).mockResolvedValueOnce({
    session: mockSession as any,
    modelFallbackMessage: undefined,
    extensionsResult: {} as any,
  })

  const mockGateway = {
    appendMessages: vi.fn().mockResolvedValue({ last_message_id: 'msg_res' }),
  }
  const app = await createHarnessApp({
    systemPrompt: 'test',
    config: { mode: 'sandbox', port: 8080, gatewayUrl: 'http://gw', sessionToken: 'tok', persistentRoot: '/tmp' } as any,
    gateway: mockGateway as any,
  })
  app.locals.sessionReady = false
  app.locals.fileSyncReady = true
  await app.locals.initSession()

  const res = await request(app)
    .post('/chat')
    .send({ message: 'hi', last_message_id: 'msg_from_dispatcher' })

  expect(res.status).toBe(200)
  // The append should use the last_message_id passed in the /chat request
  expect(mockGateway.appendMessages).toHaveBeenCalledWith(
    'msg_from_dispatcher',
    expect.arrayContaining([expect.objectContaining({ role: 'assistant' })])
  )
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @aaas/agent-sdk test -- --run`
Expected: FAIL — `appendMessages` is called with `null` instead of `'msg_from_dispatcher'`

- [ ] **Step 3: Extract and use `last_message_id` from request body**

In `packages/agent-sdk/src/harness-server.ts`, change the `/chat` handler to destructure and apply `last_message_id`:

```typescript
// Before (line ~121):
    const { message } = req.body as { message?: string }

// After:
    const { message, last_message_id } = req.body as { message?: string; last_message_id?: string }
```

And add the update before processing (right after the destructuring, before `let lastReply = ''`):

```typescript
    // Update local head from dispatcher before processing
    if (last_message_id) {
      lastMessageId = last_message_id
    }
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `pnpm --filter @aaas/agent-sdk test -- --run`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/agent-sdk/src/harness-server.ts packages/agent-sdk/test/harness-server.test.ts
git commit -m "fix(agent-sdk): accept last_message_id from /chat request for concurrency sync"
```

---

### Task 4: Run all tests and verify

- [ ] **Step 1: Run full test suite**

```bash
pnpm test
```

Expected: All tests PASS across all packages.

- [ ] **Step 2: Final commit (if any fixups needed)**

If any test adjustments were needed during verification, commit them:

```bash
git add -u
git commit -m "test: fixups from full suite verification"
```

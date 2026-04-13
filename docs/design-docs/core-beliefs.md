# Core Beliefs

Opinionated principles that guide every design decision in z-mono. These are not suggestions — they are the foundation the architecture is built on. When a new decision conflicts with these, update this document first and explain why.

---

## 1. Gateway is the single trusted chokepoint

All storage access, LLM calls, and credential use flow through gateway. No other service holds platform secrets or directly accesses the database.

**Why:** Sandboxes run arbitrary third-party agent code in an untrusted environment (e2b cloud). Any path that bypasses gateway could be exploited by a malicious or buggy agent to exfiltrate credentials or poison history.

---

## 2. Sandboxes are stateless and ephemeral

A sandbox holds no persistent state. It may be killed and recreated at any time without data loss. All state lives in PostgreSQL via gateway.

**Why:** Sandboxes have a finite idle timeout and can be lost on dispatcher restart. Designing for statelessness makes sandbox death a non-event rather than an incident.

---

## 3. Message history has a single writer per role

Dispatcher writes `source: 'im'` messages (user-side). Sandbox writes `source: 'sandbox'` messages (assistant-side). This is enforced server-side by matching the `caller` JWT claim to the allowed `source`.

**Why:** Prevents a sandbox from forging user messages or impersonating the dispatcher. The integrity of conversation history depends on source being authoritative.

---

## 4. Deduplication is infrastructure, not application logic

The `inbound_jobs` table provides exactly-once semantics for inbound IM messages. Application code (processor, sandbox) assumes each message is processed once.

**Why:** Telegram's long-polling API can deliver the same update multiple times. Handling dedup at the infrastructure level prevents double-responses and double-writes without every handler needing to be idempotent.

---

## 5. Migrations are append-only

Never modify an existing migration file. Always add a new numbered file (`002_...sql`, `003_...sql`).

**Why:** Existing migrations may have already run in production. Modifying them would cause `setup.ts` to skip them (it checks `schema_migrations`) while leaving the schema out of sync with what the file describes.

---

## 6. All errors follow a single envelope shape

Every error response has the shape:
```json
{ "error": { "code": "string", "message": "string", "retryable": boolean, "details": {} } }
```

**Why:** Agent code and dispatcher retry logic depends on being able to inspect `retryable` programmatically. A consistent shape means error handling can be written once and applied everywhere.

---

## 7. External knowledge must be encoded in the repo

Architectural decisions, API contracts, and operating principles that exist only in chat threads or people's heads do not exist to agents. If something matters, it goes in `docs/`.

**Why:** An agent working on the codebase has no access to Slack, Google Docs, or institutional memory. Encoding knowledge in the repo is the only way to ensure it influences future agent runs.

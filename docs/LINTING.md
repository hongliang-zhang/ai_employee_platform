# Linting & Architecture Rules

All rules here are mechanically enforced via ESLint (`pnpm lint`) and architecture tests (`pnpm test`). CI blocks merges on any violation.

When adding new code, follow these rules exactly. Error messages from the linter include the rule name — look it up here for context.

---

## ESLint rules (applies to all `packages/*/src` and `packages/*/tests`)

### `no-console` — error

**Rule:** Never use `console.log`, `console.error`, etc.  
**Use instead:** The pino logger imported in each package (`import { logger } from '../index.js'` in gateway; `pino()` instance in dispatcher).  
**Why:** `console.*` output is unstructured and cannot be queried. All logs must be structured JSON with an `event` field.

```ts
// BAD
console.log('sandbox started', sandboxId)

// GOOD
logger.info({ event: 'sandbox.start', sandbox_id: sandboxId })
```

### `max-lines` — warn at 200 lines (blank lines + comments excluded)

**Rule:** Source files should not exceed 200 lines.  
**Why:** Large files are harder for agents to reason about in a single context window. When a file grows beyond 200 lines, split it into focused modules.

### `@typescript-eslint/no-explicit-any` — warn

**Rule:** Avoid `any` type annotations.  
**Why:** `any` defeats TypeScript's guarantees and makes agent reasoning about types unreliable. Use `unknown` + type guards, or define an explicit interface.

### `@typescript-eslint/no-unused-vars` — error (except `_`-prefixed)

**Rule:** No unused variables. Prefix with `_` to explicitly mark intentional non-use (e.g. `_req`).

---

## Architecture boundary tests (in `tests/architecture.test.ts` per package)

These tests scan source files and fail if cross-boundary imports are detected.

### gateway must not import e2b or Telegram

```
Boundary: gateway owns storage and LLM access — it has no knowledge of sandboxes or IM channels.
```

Forbidden imports in `packages/gateway/src/`:
- `@e2b/code-interpreter` — sandbox lifecycle is dispatcher's concern
- `node-telegram-bot-api` / `telegraf` / any Telegram SDK

### dispatcher must not import LLM SDKs directly

```
Boundary: all LLM calls must go through gateway's /gateway/llm endpoint.
```

Forbidden imports in `packages/dispatcher/src/`:
- `@anthropic-ai/sdk`
- `openai`
- Any other LLM provider SDK

## Structured logging convention

Every `logger.*` call must include an `event` field as the first key. Use dot-separated `service.action` naming.

```ts
// BAD
logger.info('message received')
logger.error({ err }, 'something went wrong')

// GOOD
logger.info({ event: 'message.received', trace_id: traceId, conversation_id })
logger.error({ event: 'sandbox.error', trace_id: traceId, error: String(err) })
```

Standard event prefixes:

| Prefix | Used in | Meaning |
|--------|---------|---------|
| `dispatcher.*` | dispatcher | Dispatcher lifecycle |
| `message.*` | dispatcher | Inbound message processing |
| `sandbox.*` | dispatcher | Sandbox operations |
| `reply.*` | dispatcher | Outbound reply delivery |
| `append.*` | dispatcher/gateway | Message history append |
| `llm.*` | gateway | LLM proxy calls |

---

## Error response envelope

Every HTTP error response in gateway must use this exact shape. Do not invent new shapes.

```ts
res.status(4xx | 5xx).json({
  error: {
    code: 'snake_case_code',   // machine-readable
    message: 'human readable', // human-readable
    retryable: boolean,        // can the caller retry?
    details: {},               // optional extra context
  }
})
```

`retryable: true` → transient error, caller may retry with backoff  
`retryable: false` → permanent error (bad input, auth failure), retrying won't help

---

## Running locally

```bash
# Lint all packages
pnpm lint

# Architecture tests (included in pnpm test)
pnpm test

# Check one package with the root ESLint config
pnpm lint -- packages/gateway
```

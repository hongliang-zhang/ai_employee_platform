# Reliability

## Error handling conventions

All gateway routes return errors in the envelope:
```json
{ "error": { "code": "string", "message": "string", "retryable": boolean, "details": {} } }
```

`retryable: true` means the caller may retry with backoff. `retryable: false` means retrying will not help (bad input, auth failure, etc.).

## Retry strategy

`retryWithBackoff` in `packages/dispatcher/src/utils.ts` is used for all external calls that may have transient failures:

- gateway `appendMessages` — retried by dispatcher (transient DB errors)
- e2b `Sandbox.create` — retried by dispatcher (e2b API can have transient failures)
- sandbox `/chat` — retries transient 503 responses during ingress propagation; each request uses a fresh sandbox that is killed in `finally`

## Sandbox failure modes

| Failure | Detection | Recovery |
|---------|-----------|----------|
| Sandbox never became healthy | Health poll timeout (45 × 1s) | `Sandbox.kill()` + throw |
| Sandbox returns transient 503 | HTTP status check | Retry `/chat` for up to ~10s while AGS ingress propagates |
| Sandbox returns non-retryable error | HTTP status check | Throw; `finally` kills the sandbox |
| Sandbox unreachable / timeout | `AbortSignal.timeout(120_000)` | Throw; `finally` kills the sandbox |
| Agent needs to flush files | `/shutdown` before kill | Best-effort shutdown request with 15s timeout |

## Message delivery guarantee

- **At-least-once delivery to sandbox:** dispatcher retries failed sandbox calls
- **Deduplication:** `im_message_receipts` UNIQUE constraint on (`im_config_id`, `message_id`) prevents double-processing of the same IM message
- **Ordered history:** `messages.created_at` with 1ms offsets between batch inserts preserves insert order within a batch; optimistic concurrency (`expected_last_message_id`) prevents interleaved writes

## Known reliability gaps

See [exec-plans/tech-debt-tracker.md](./exec-plans/tech-debt-tracker.md) for TD-002 (no stale lease recovery loop) and TD-003 (`lastMessageId` cache not persisted).

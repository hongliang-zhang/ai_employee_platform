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
- sandbox `/chat` — retried up to 2 times; on 5xx, stale sandbox entry is destroyed before retry

## Sandbox failure modes

| Failure | Detection | Recovery |
|---------|-----------|----------|
| Sandbox never became healthy | Health poll timeout (30s × 1s) | `Sandbox.kill()` + throw (dispatcher retries from scratch) |
| Sandbox returns 5xx | HTTP status check | Destroy sandbox entry + retry (recreates sandbox on next attempt) |
| Sandbox unreachable / timeout | `AbortSignal.timeout(120_000)` | Same as 5xx path |
| Sandbox idle too long | `idle_timeout_ms` timer in dispatcher | `Sandbox.kill()` + entry removed from map; recreated on next message |

## Message delivery guarantee

- **At-least-once delivery to sandbox:** dispatcher retries failed sandbox calls
- **Deduplication:** `inbound_jobs` UNIQUE constraint on (channel_key, external_message_id) prevents double-processing of the same Telegram update
- **Ordered history:** `messages.created_at` with 1ms offsets between batch inserts preserves insert order within a batch; optimistic concurrency (`expected_last_message_id`) prevents interleaved writes

## Known reliability gaps

See [exec-plans/tech-debt-tracker.md](./exec-plans/tech-debt-tracker.md) for TD-001 (sandbox map lost on restart) and TD-002 (no stale lease recovery loop).

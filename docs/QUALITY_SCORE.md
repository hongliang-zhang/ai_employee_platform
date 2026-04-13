# Quality Score

Per-module assessment of test coverage and known gaps. Updated as work progresses.

Scale: ✅ Good · ⚠️ Partial · ❌ Missing

---

## gateway

| Area | Score | Notes |
|------|-------|-------|
| Auth middleware | ✅ | `tests/auth.test.ts` covers valid token, missing token, expired token |
| `POST /messages/load` | ✅ | `tests/messages.test.ts` covers load with/without `after_message_id` |
| `POST /messages/append` | ✅ | Covers happy path, stale write (409), caller/source mismatch |
| `POST /gateway/llm` | ✅ | `tests/llm.test.ts` covers proxy, model validation, upstream error |
| Optimistic concurrency under concurrent writes | ❌ | No concurrent-write test; stale_write path only tested sequentially |
| Gateway error envelope consistency | ⚠️ | Spot-checked in tests but not exhaustively asserted |

---

## dispatcher

| Area | Score | Notes |
|------|-------|-------|
| Message deduplication | ⚠️ | `inbound-jobs` unit tested but no integration test for duplicate Telegram updates |
| Sandbox getOrCreate | ❌ | No tests — e2b SDK calls are not mocked |
| Processor end-to-end | ❌ | No integration test covering the full message → reply flow |
| Retry / backoff logic | ⚠️ | `utils.ts` retryWithBackoff has tests; retry paths in processor are not independently tested |
| Stale lease recovery | ❌ | Recovery index exists but recovery loop not implemented (see TD-002) |

---

## demo-agent

| Area | Score | Notes |
|------|-------|-------|
| `/chat` endpoint | ❌ | No tests — gateway calls are not mocked |
| `/health` endpoint | ❌ | No tests |

---

## Overall gaps to address before scaling

1. Dispatcher processor integration test (mock gateway + mock Telegram)
2. Concurrent append test for gateway
3. demo-agent unit tests with mocked gateway client

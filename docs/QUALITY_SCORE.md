<!-- DOC-GARDENING-CHANGE: 2026-04-16
  - Added agent-sdk section: The agent-sdk package exists with 5 test files (environment, file-sync, gateway-client, gateway-llm-adapter, harness-server) but was not listed in QUALITY_SCORE.md
-->
# Quality Score

Per-module assessment of test coverage and known gaps. Updated as work progresses.

Scale: ✅ Good · ⚠️ Partial · ❌ Missing

---

## gateway

| Area | Score | Notes |
|------|-------|-------|
| Auth middleware | ✅ | `tests/auth.test.ts` covers valid token, missing token, expired token |
| `POST /messages/load` | ✅ | `tests/messages.integration.test.ts` covers load with/without `after_message_id` |
| `POST /messages/append` | ✅ | Covers happy path, stale write (409), caller/source mismatch |
| `POST /gateway/llm` | ✅ | `tests/llm.test.ts` covers proxy, model validation, upstream error |
| Optimistic concurrency under concurrent writes | ❌ | No concurrent-write test; stale_write path only tested sequentially |
| Gateway error envelope consistency | ⚠️ | Spot-checked in tests but not exhaustively asserted |

---

## dispatcher

| Area | Score | Notes |
|------|-------|-------|
| Message deduplication | ⚠️ | `im-message-tracker` unit/integration tests cover claim behavior, but no end-to-end duplicate IM update test |
| Per-request sandbox orchestration | ✅ | `tests/sandbox.test.ts` mocks e2b SDK calls, health polling, chat, shutdown, and kill paths |
| Processor end-to-end | ❌ | No integration test covering the full IM message → gateway append → sandbox reply → IM send flow |
| Retry / backoff logic | ⚠️ | `utils.ts` retryWithBackoff has tests; retry paths in processor are not independently tested |
| Stale lease recovery | ❌ | Recovery index exists but recovery loop not implemented (see TD-002) |

---

## agent-sdk

| Area | Score | Notes |
|------|-------|-------|
| Environment setup | ✅ | `test/environment.test.ts` covers environment variable parsing |
| File sync | ✅ | `test/file-sync.test.ts` covers file sync operations |
| Gateway client | ✅ | `test/gateway-client.test.ts` covers gateway API calls |
| LLM adapter | ✅ | `test/gateway-llm-adapter.test.ts` covers LLM integration |
| Harness server | ✅ | `test/harness-server.test.ts` covers HTTP server |

---

## Overall gaps to address before scaling

1. Dispatcher processor integration test (mock gateway + mock Telegram)
2. Concurrent append test for gateway

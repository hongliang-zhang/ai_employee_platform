# Security Model

## Trust zones

```
Trusted zone:  gateway, dispatcher (both run under our control)
Untrusted zone: e2b sandboxes (run third-party agent code)
```

## Credential isolation

| Secret | Where it lives | How sandbox gets access |
|--------|---------------|------------------------|
| `DATABASE_URL` | dispatcher + gateway env | Never reaches sandbox |
| `JWT_SECRET` | dispatcher + gateway env | Never reaches sandbox |
| `BOT_TOKEN_ENC_KEY` | dispatcher env | Never reaches sandbox |
| `LLM_API_KEY` | gateway env | Never reaches sandbox |
| `E2B_API_KEY` | dispatcher env | Never reaches sandbox |
| `SESSION_TOKEN` (scoped JWT) | generated per-conversation | Passed to sandbox at start via env var |

Sandboxes authenticate to gateway using a scoped JWT (`caller: 'sandbox'`, 24h TTL) that encodes only `conversation_id` and `agent_id`. They can only read/write their own conversation.

## JWT claims enforcement

Gateway validates caller-to-source alignment on every `/messages/append` call:

- `caller: 'dispatcher'` → may only write `source: 'im'`
- `caller: 'sandbox'` → may only write `source: 'sandbox'`

This prevents a sandbox from injecting messages that appear to come from the user.

## Bot token storage

Telegram bot tokens are stored encrypted at rest in `im_configs.bot_token_enc` using AES-256 (via `BOT_TOKEN_ENC_KEY`). The plaintext token is decrypted in dispatcher memory at startup and never logged.

## What is NOT protected (known gaps)

- **Sandbox-to-sandbox isolation:** e2b provides VM-level isolation per sandbox. We rely on e2b's guarantees; we do not add additional network policy.
- **Rate limiting:** No rate limiting on gateway routes. A runaway sandbox could exhaust LLM credits.
- **JWT revocation:** No revocation mechanism. A leaked `SESSION_TOKEN` is valid for 24h. Mitigation: short idle timeout kills the sandbox anyway.
- **Audit logging:** No separate audit log. Security events are in the application log (pino) but not shipped to a dedicated store.

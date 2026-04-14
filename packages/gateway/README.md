# Gateway

Trusted service that owns message history storage and LLM API access. All requests are authenticated via JWT.

## Responsibilities

- Persist and retrieve conversation message history (PostgreSQL)
- Proxy LLM API calls on behalf of sandboxes
- Enforce JWT authentication on all routes

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | ✅ | — | PostgreSQL connection string |
| `JWT_SECRET` | ✅ | — | Shared secret for verifying JWTs (min 32 chars). Must match dispatcher. |
| `LLM_API_KEY` | ✅ | — | API key forwarded to the LLM provider |
| `PORT` | ❌ | `3001` | Port the HTTP server listens on |
| `LLM_BASE_URL` | ❌ | `https://api.z.ai/api/coding/paas/v4/chat/completions` | LLM provider endpoint |
| `ALLOWED_MODELS` | ❌ | `glm-5.1` | 逗号分隔的模型白名单，如 `glm-5.1,glm-4` |

See root `.env.example` for example values.

## API Routes

All routes except `/health` require a valid JWT in the `Authorization: Bearer <token>` header.

### Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | None | Liveness check, returns `{ ok: true }` |

### Messages — `/gateway/messages`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/gateway/messages/load` | Required | Load message history for the conversation in the JWT. Optionally pass `after_message_id` to fetch only newer messages. |
| POST | `/gateway/messages/append` | Required | Append one or more messages. Requires `expected_last_message_id` for optimistic concurrency (returns `409 stale_write` on mismatch). |

> The conversation is identified from the JWT payload (`conversation_id`), not from the URL.

### LLM — `/gateway/llm`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/gateway/llm` | Required | Proxy a chat completion request to the LLM provider. Only `glm-5.1` is currently allowed. |

## Development

```bash
# From repo root
pnpm --filter gateway dev    # start with hot reload
pnpm --filter gateway test   # run tests
```

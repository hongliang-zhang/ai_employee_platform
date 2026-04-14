# Local Development Guide

This guide covers how to run gateway and dispatcher locally for end-to-end testing.

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 24+ | `nvm install 24 && nvm alias default 24` |
| pnpm | any | `npm i -g pnpm` |
| cloudflared | any | `brew install cloudflared` |

> **Why Node 24?** Prisma 7 requires Node 20.19+, 22.12+, or 24+. Node 23 is not supported.

---

## First-time setup

### 1. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in:

| Variable | Where to get it |
|----------|----------------|
| `DATABASE_URL` | Supabase → Project Settings → Database → Connection string (pooler, port 6543) |
| `DIRECT_URL` | Supabase → Project Settings → Database → Connection string (direct, port 5432) |
| `JWT_SECRET` | Generate: `openssl rand -hex 32` |
| `LLM_API_KEY` | Your LLM provider API key |
| `BOT_TOKEN_ENC_KEY` | Generate: `openssl rand -hex 32` — **this is an encryption key, not the bot token** |
| `HTTPS_PROXY` / `HTTP_PROXY` | Your local proxy, e.g. `http://127.0.0.1:7890` — required in China to reach Telegram API |
| `GATEWAY_URL` | Your public tunnel URL, e.g. `https://gateway.iefnaf.cc` |
| `E2B_API_KEY` | e2b.dev dashboard |
| `E2B_TEMPLATE_ID` | e2b.dev dashboard |

> **Password with special characters:** If your Supabase password contains `@` or other URL-special characters, URL-encode them (e.g. `@` → `%40`) inside the connection strings.

### 2. Install dependencies

```bash
pnpm install
```

### 3. Run database migrations

```bash
pnpm --filter @aaas/db migrate:deploy
```

This pushes the schema to your Supabase instance via `DIRECT_URL`.

### 4. Seed the database

```bash
pnpm tsx scripts/setup.ts
```

This will:
- Re-run migrations (idempotent)
- Prompt you for your Telegram bot token
- Create an `agent` and `im_config` row in the database

Output looks like:
```
Setup complete.
  agent_id:    agt_xxxx
  im_config:   cfg_xxxx
  channel_key: im:cfg_xxxx
```

> **Note:** `setup` only needs to be run once per fresh database. Running it again creates a second agent — clean up duplicates via the Supabase dashboard if needed.

---

## Starting services

Open **three separate terminal tabs** and run one command per tab. This is important — do not use background processes, as it leads to zombie processes that compete for the same Telegram polling offset.

**Tab 1 — Cloudflare tunnel** (E2B sandboxes run in the cloud and need a public URL to reach your local gateway):
```bash
cloudflared tunnel run aaas-gateway
```

**Tab 2 — Gateway:**
```bash
pnpm --filter @aaas/gateway run dev
```

Expected output:
```
INFO: gateway started  port: 3001
```

**Tab 3 — Dispatcher:**
```bash
pnpm --filter @aaas/dispatcher run dev
```

Expected output:
```
INFO: event: "dispatcher.start"  agent_id: "agt_xxx"
```

---

## Verifying the setup

**Health check:**
```bash
curl http://localhost:3001/health          # local
curl https://gateway.iefnaf.cc/health     # via tunnel (must return {"ok":true})
```

**End-to-end test:** Send any message to your Telegram bot. You should see this sequence in the dispatcher log:

```
message.received       ← Telegram message picked up
(no deduplicated log)  ← new message, not seen before
reply.delivered        ← response sent back to Telegram
```

And in the gateway log:
```
llm.request            ← sandbox called the LLM endpoint
llm.response           ← LLM returned (typically 10–30s, depending on model)
```

---

## Troubleshooting

### "服务暂时不可用" (service unavailable)

Check dispatcher logs for `event: "chat.error"` or `event: "sandbox.stale"`. Common causes:

| Symptom | Cause | Fix |
|---------|-------|-----|
| `sandbox.stale` status 500 on first message | Cloudflare tunnel not running | Start `cloudflared tunnel run aaas-gateway` |
| `polling.error: TypeError: fetch failed` | Telegram API unreachable | Set `HTTPS_PROXY=http://127.0.0.1:7890` in `.env` and restart dispatcher |
| Message is `message.deduplicated` but user got error | Multiple dispatcher instances running | Kill all and restart: see below |

### Multiple dispatcher instances (zombie processes)

Running services in the background (e.g. via `&` or a script) can leave stale processes. Multiple dispatchers compete to process the same Telegram messages — one fails and sends the error, the other deduplicates.

To clean up:
```bash
pkill -f "pnpm.*dispatcher"
pkill -f "pnpm.*gateway"
pkill -f "node.*dispatcher.*index"
pkill -f "node.*gateway.*index"
lsof -ti:3001 | xargs kill -9
```

Then restart in separate terminal tabs as described above.

### `DIRECT_URL` not found during `prisma generate`

This is expected — `generate` doesn't need a database connection. The error only matters for `migrate:deploy`. Ensure `.env` is present at the repo root and `packages/db/.env` is a symlink pointing to it:

```bash
ls -la packages/db/.env   # should show -> ../../.env
```

If the symlink is missing:
```bash
ln -s ../../.env packages/db/.env
```

### Node version errors from Prisma

Prisma 7 does not support Node 23. Use Node 24:
```bash
nvm install 24
nvm use 24
nvm alias default 24
```

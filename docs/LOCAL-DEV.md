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
| `E2B_TEMPLATE_ID` | e2b.dev dashboard — see also [Building the e2b template](#building-the-e2b-template) |

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

### Sending messages via lark-cli (Feishu)

Instead of manually opening Feishu to send test messages to the bot, you can use `lark-cli` from the terminal.

**Prerequisite:** User authorization is required (bot identity cannot DM another bot). First-time setup:

```bash
# Log in with your Feishu user identity (opens browser for QR scan)
lark-cli auth login --domain im
```

**Send a message to clawdbot:**

```bash
# The P2P chat ID with clawdbot
lark-cli im +messages-send \
  --chat-id oc_35841d6fd9ac976a90ce3889a9432060 \
  --text "hello" \
  --as user
```

Key details:
- `--as user` — sends as your user identity (required; bot identity cannot message another bot directly)
- `--chat-id oc_35841d6fd9ac976a90ce3889a9432060` — the P2P conversation with clawdbot
- Supports `--text` (plain text), `--markdown` (Markdown), `--image`, `--file` etc.
- Full help: `lark-cli im +messages-send --help`

**Useful commands for debugging:**

```bash
# Check auth status
lark-cli auth status

# List messages in the P2P chat
lark-cli im +chat-messages-list --chat-id oc_35841d6fd9ac976a90ce3889a9432060 --as user

# List messages in the test group chat
lark-cli im +chat-messages-list --chat-id oc_3c1b7fa53a2a41509e72f83e49563b14 --as user
```

---

**Telegram end-to-end test:** Send any message to your Telegram bot. You should see this sequence in the dispatcher log:

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

### Building the e2b template

#### Overview

The `demo-agent` package is deployed as an e2b sandbox template. Building and pushing the template is done with the e2b CLI from `packages/demo-agent/`.

```bash
# 1. Make sure demo-agent depends on the published SDK version
#    (currently @alexlikevibe/agent-sdk)
pnpm install

# 2. Build demo-agent with tsc
pnpm --filter @aaas/demo-agent build

# 3. Push to e2b (--no-cache ensures latest code is used)
cd packages/demo-agent
HTTPS_PROXY=http://127.0.0.1:7890 HTTP_PROXY=http://127.0.0.1:7890 \
  e2b template build --name demo-agent --no-cache
```

After a successful build, update `E2B_TEMPLATE_ID` in `.env` with the template ID printed in the output (also recorded in `packages/demo-agent/e2b.toml`).

#### Why npm package + tsc instead of esbuild?

`demo-agent` originally depended on `@aaas/agent-sdk` via `workspace:*`. That worked inside the monorepo but failed inside the Docker build because `npm install` in the container cannot resolve workspace references.

The temporary workaround was to bundle everything with esbuild, but that caused runtime issues with `pino` / `pino-pretty` (dynamic require and transport resolution problems).

The correct fix is:
- publish the SDK to npm as `@alexlikevibe/agent-sdk`
- let `demo-agent` depend on the published package
- build `demo-agent` with plain `tsc`
- let the Dockerfile run `npm install --production` normally

This keeps runtime behavior aligned with standard Node.js module resolution and avoids bundling edge cases.

#### Why HTTPS_PROXY is required

The e2b CLI (v1) builds Docker images locally using Docker BuildKit. In China, Docker BuildKit's internal network does not automatically inherit macOS system proxy settings — even if your VPN is active. You must pass the proxy explicitly via environment variables so BuildKit can reach Docker Hub to pull the `node:20-slim` base image.

Alternatively, configure Docker Desktop directly: **Settings → Resources → Proxies → Manual proxy configuration** → set both HTTP and HTTPS to `http://127.0.0.1:7890`.

#### Why --no-cache

Without `--no-cache`, Docker may reuse cached layers. In principle `COPY dist/` is content-addressed and safe, but `--no-cache` removes doubt during template updates and is recommended when you want to guarantee the latest code is used.

#### Verifying the build

Start a temporary sandbox and confirm the latest code is present:

```bash
E2B_API_KEY=<your_key> node --input-type=module << 'EOF'
import { Sandbox } from 'e2b'
const sbx = await Sandbox.create('demo-agent', { timeoutMs: 30000 })
const r = await sbx.commands.run('grep -o "You are a helpful assistant" /app/dist/agent.js | head -1')
console.log('systemPrompt:', r.stdout.trim())
const s = await sbx.commands.run('ls -lh /app/dist/agent.js')
console.log('file:', s.stdout.trim())
await sbx.kill()
EOF
```

#### Template ID changed?

If you see `404: Template not found` when building, the template ID in `e2b.toml` no longer exists in your e2b account (e.g. after switching accounts or team). Fix:

```bash
# Remove the stale template_id so e2b creates a fresh one
# Edit packages/demo-agent/e2b.toml and delete the template_id line, then:
e2b template build --name demo-agent --no-cache
```

The new template ID will be written back to `e2b.toml` automatically. Update `E2B_TEMPLATE_ID` in `.env` accordingly.

---

### Node version errors from Prisma

Prisma 7 does not support Node 23. Use Node 24:
```bash
nvm install 24
nvm use 24
nvm alias default 24
```

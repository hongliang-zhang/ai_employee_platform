# Local Development Guide

<!-- DOC-GARDENING-CHANGE: 2026-04-22
  - Updated DATABASE_URL: PostgreSQL/Supabase → MySQL/TiDB to match .env.example and schema.prisma provider
  - Removed DIRECT_URL reference (not in .env.example)
  - Updated Supabase references to generic database references
-->

This guide covers how to run gateway, actions, and dispatcher locally for end-to-end testing.

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 24+ | `nvm install 24 && nvm alias default 24` |
| pnpm | any | `npm i -g pnpm` |
| natapp | 3.x | `curl -fsSL "https://natapp.cn/get.sh?authtoken=<your-token>" \| sh` |
| Optional: lark-cli | latest | See [docs/references/cli-tools.md](./references/cli-tools.md) |

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
| `DATABASE_URL` | MySQL/TiDB connection string (e.g., TiDB Cloud, AWS RDS, or local MySQL) |
| `JWT_SECRET` | Generate: `openssl rand -hex 32` |
| `LLM_API_KEY` | Your LLM provider API key |
| `INTERNAL_API_KEY` | Generate: `openssl rand -hex 32` — shared key for trusted service-to-service calls; never expose to sandboxes |
| `ACTIONS_SERVICE_URL` | Usually `http://localhost:3002` for local development |
| `FIRECRAWL_API_KEY` | Optional unless testing `search_web` actions |
| `BOT_TOKEN_ENC_KEY` | Generate: `openssl rand -hex 32` — **this is an encryption key, not the bot token** |
| `HTTPS_PROXY` / `HTTP_PROXY` | Your local proxy, e.g. `http://127.0.0.1:7890` — required in China to reach Telegram API |
| `GATEWAY_URL` | Your NATAPP public tunnel URL, e.g. `http://s46fa5d3.natappfree.cc` |
| `E2B_API_KEY` | e2b.dev dashboard |

The sandbox template/tool ID is not a runtime environment variable. `scripts/setup.ts` prompts for it and stores it in the `agents.e2b_template_id` database column.

> **Password with special characters:** If your database password contains `@` or other URL-special characters, URL-encode them (e.g. `@` → `%40`) inside the connection string.

### 2. Install dependencies

```bash
pnpm install
```

### 3. Run database migrations

```bash
pnpm --filter @aaas/db migrate:deploy
```

This pushes the schema to your MySQL/TiDB instance.

### 4. Seed the database

```bash
pnpm tsx scripts/setup.ts
```

This will:
- Re-run migrations (idempotent)
- Prompt you for the sandbox template/tool ID
- Prompt you for your Telegram bot token or Feishu credentials
- Create an `agent` and `im_config` row in the database

Output looks like:
```
Setup complete.
  agent_id:    agt_xxxx
  im_config:   cfg_xxxx
  channel_key: im:cfg_xxxx
```

> **Note:** `setup` only needs to be run once per fresh database. Running it again creates a second agent — clean up duplicates via the database dashboard if needed.

---

## Starting services

Open **four separate terminal tabs** and run one command per tab. This is important — do not use background processes, as it leads to zombie processes that compete for the same IM polling or websocket stream.

**Tab 1 — NATAPP tunnel** (cloud sandboxes need a public URL to reach your local gateway):

Create a NATAPP **Web/HTTP** tunnel in the NATAPP dashboard with:

| Setting | Value |
|---------|-------|
| Protocol | Web / HTTP |
| Local address | `127.0.0.1` |
| Local port | `3001` |

Install NATAPP locally with your tunnel token:
```bash
curl -fsSL "https://natapp.cn/get.sh?authtoken=<your-token>" | sh
```

If the installer needs sudo and your agent shell cannot prompt for a password, install into the repo-local `.local/` directory instead:
```bash
curl -fsSL "https://natapp.cn/get.sh?authtoken=<your-token>" > /tmp/natapp-install.sh
NATAPP_INSTALL_DIR="$PWD/.local/natapp" sh /tmp/natapp-install.sh
```

Start the tunnel:
```bash
# If installed system-wide:
/opt/natapp/run_natapp.sh

# If installed repo-locally:
./.local/natapp/run_natapp.sh
```

Set `.env` to the NATAPP public URL shown in the dashboard, for example:
```env
GATEWAY_URL=http://s46fa5d3.natappfree.cc
GATEWAY_LOCAL_URL=http://localhost:3001
```

For this local development machine, the currently used NATAPP public URL is:
```env
GATEWAY_URL=http://je97f684.natappfree.cc
GATEWAY_LOCAL_URL=http://localhost:3001
```

Do **not** commit NATAPP `authtoken` values to this document or to tracked files. Treat the token as a local credential; use it only when installing or starting the tunnel.

**Tab 2 — Gateway:**
```bash
pnpm --filter @aaas/gateway run dev
```

Expected output:
```
INFO: gateway started  port: 3001
```

**Tab 3 — Actions Service:**
```bash
pnpm --filter @aaas/actions run dev
```

Expected output:
```
INFO: actions started  port: 3002
```

**Tab 4 — Dispatcher:**
```bash
pnpm --filter @aaas/dispatcher run dev
```

Expected output:
```
INFO: event: "dispatcher.start"  instance_id: "dispatcher_xxx"
INFO: event: "dispatcher.bot_started"  config_id: "cfg_xxx"
```

---

## Verifying the setup

**Health check:**
```bash
curl http://localhost:3001/health                    # gateway local
curl http://s46fa5d3.natappfree.cc/health            # gateway via NATAPP tunnel (must return {"ok":true})
```

**Actions Service check:**
```bash
curl http://localhost:3002/actions/list \
  -H "X-Internal-Key: $INTERNAL_API_KEY"
```

Expected: JSON array of available actions, including `search_web` and `get_weather`.

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

Check dispatcher logs for `event: "chat.error"`, gateway logs for `actions.*` errors, and actions logs for `action.failed`. Common causes:

| Symptom | Cause | Fix |
|---------|-------|-----|
| Gateway `/gateway/actions/*` returns `502 action_execution_failed` | Actions Service is not running or `ACTIONS_SERVICE_URL` points to the wrong URL | Start `pnpm --filter @aaas/actions run dev` and verify `curl localhost:3002/actions/list -H "X-Internal-Key: $INTERNAL_API_KEY"` |
| Actions Service returns `401 unauthorized` | `INTERNAL_API_KEY` differs between gateway and actions env | Use the same `INTERNAL_API_KEY` value for both services and restart them |
| `sandbox health check timed out` or `sandbox returned 503` | Sandbox image/tool is slow, unhealthy, or template/tool ID is wrong | Verify the external agent runtime template from agent-sub and the ID stored in `agents.e2b_template_id` |
| `polling.error: TypeError: fetch failed` | Telegram API unreachable | Set `HTTPS_PROXY=http://127.0.0.1:7890` in `.env` and restart dispatcher |
| Message is skipped/deduplicated but user got error | Multiple dispatcher instances running or a previous receipt lease is still active | Kill stale processes and wait for lease expiry if needed |

### Multiple dispatcher instances (zombie processes)

Running services in the background (e.g. via `&` or a script) can leave stale processes. Multiple dispatchers compete to process the same Telegram messages — one fails and sends the error, the other deduplicates.

To clean up:
```bash
pkill -f "pnpm.*dispatcher"
pkill -f "pnpm.*gateway"
pkill -f "pnpm.*actions"
pkill -f "node.*dispatcher.*index"
pkill -f "node.*gateway.*index"
pkill -f "node.*actions.*index"
pkill -f "natapp.*authtoken"
lsof -ti:3001 | xargs -r kill -9
lsof -ti:3002 | xargs -r kill -9
```

Then restart in separate terminal tabs as described above.

### `.env` symlink not found

Ensure `.env` is present at the repo root and `packages/db/.env` is a symlink pointing to it:

```bash
ls -la packages/db/.env   # should show -> ../../.env
```

If the symlink is missing:
```bash
ln -s ../../.env packages/db/.env
```

### Agent sandbox template

The reference `demo-agent` package has moved out of this monorepo into the agent-sub project. Build and publish sandbox templates from that project, then use the resulting template/tool ID when `scripts/setup.ts` prompts for it.

---

### Node version errors from Prisma

Prisma 7 does not support Node 23. Use Node 24:
```bash
nvm install 24
nvm use 24
nvm alias default 24
```

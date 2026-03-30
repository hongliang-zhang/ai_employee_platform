# Agent as a Service — Design Document

**Date:** 2026-03-30  
**Status:** Draft  
**Reference:** [Browser Use — How We Built Secure, Scalable Agent Sandbox Infrastructure](https://x.com/larsencc/status/2027225210412470668)

---

## 1. Overview

Agent as a Service (AaaS) is a multi-tenant SaaS platform that lets users deploy AI agents accessible through IM channels (Telegram, Feishu, Slack, etc.). Users create agent instances via a web console, configure their IM credentials, and the platform handles the rest — spinning up sandboxed agent runtimes, routing messages, and persisting conversation history.

The platform is designed to be **open**: third-party developers can build and publish their own agent types to a marketplace. Users browse the marketplace, select an agent type, configure their IM channels, and the agent goes live — no infrastructure knowledge required.

---

## 2. Goals

- Users can create and configure agents through a web console without writing code
- Agents are accessible directly through IM channels (Telegram, Feishu, Slack)
- Agent code runs in isolated sandboxes with no access to platform secrets
- Conversation history persists across sandbox restarts
- Third-party developers can publish new agent types without modifying platform code
- Adding a new agent type requires only a database entry — no engine code changes

## 3. Non-Goals

- Building a general-purpose code execution platform
- Supporting real-time streaming responses to IM (IM platforms handle this themselves)
- Self-hosted build infrastructure (external CI handles image builds, at least initially)
- Multi-region deployment (single region for v1)

---

## 4. Architecture Overview

The platform follows the **Control Plane pattern** described by Browser Use: the entire agent runs inside an isolated sandbox (micro-VM), and all external access (LLM calls, storage, message history) is mediated through a trusted control plane. The sandbox holds no credentials.

```
┌─────────────────────────────────────────────────────────────────┐
│  Trusted Zone                                                    │
│                                                                  │
│  ┌──────────┐   REST   ┌─────────────────┐   JWT secret   ┌──────────────┐  │
│  │ console  │ ◄──────► │     engine      │ ─────────────► │control plane │  │
│  └──────────┘          └────────┬────────┘                └──────┬───────┘  │
│                                 │ e2b SDK                         │          │
└─────────────────────────────────┼─────────────────────────────────┼──────────┘
                                  ↓ create / POST /chat / kill      │
┌─────────────────────────────────────────────┐                     │
│  Untrusted Zone — e2b Sandboxes             │                     │
│                                             │                     │
│  SESSION_TOKEN=<jwt>                        │                     │
│  CONTROL_PLANE_URL=https://control-plane/   │ ────────────────────┘
│  SESSION_ID=<conversation_id>               │   /cp/llm · /cp/messages · /cp/files/presign
│                                             │
└─────────────────────────────────────────────┘
                                  │
              ┌───────────────────┼───────────────────┐
              ↓                   ↓                   ↓
           LLM APIs          PostgreSQL           S3 / Redis
```

### Services

| Service | Runtime | Role |
|---|---|---|
| **console** | Next.js | Web dashboard — user management, agent configuration, marketplace UI |
| **engine** | Node.js (always-on) | IM connections, message dispatch, sandbox lifecycle management |
| **control plane** | Node.js (always-on) | Sandbox gateway — proxies all external access for sandboxes |

---

## 5. Services

### 5.1 console

A Next.js application serving as the user-facing management interface and BFF.

**Responsibilities:**
- User registration, login, account and team management
- Agent creation: select agent type from marketplace, configure parameters
- IM channel configuration: enter bot tokens (encrypted at rest)
- View conversation history, per-agent usage metrics
- Web-based test chat interface (sends messages via engine's HTTP API)
- Agent marketplace: browse, install, rate, and review published agent types
- Developer portal: submit agents, monitor build status, view earnings

**Data access:** Reads/writes directly to PostgreSQL (users, agents, im_configs, agent_types tables). Does not call control plane directly.

**Interactions:**
- Notifies engine (REST) when a new agent goes live or is deactivated
- Calls `POST /agents/:id/chat` on engine for the web test interface

---

### 5.2 engine

A long-running Node.js process that is the operational heart of the platform. It owns IM connections and sandbox lifecycle.

**Responsibilities:**

**IM connections**
- Maintains one connection per active bot token:
  - Telegram: HTTP long-polling (`getUpdates`, 30s timeout, immediately re-polled)
  - Slack: WebSocket via Socket Mode
  - Feishu / WeChat: receives inbound webhook POSTs (no persistent connection)
- On new agent activation (notified by console), establishes IM connection
- On agent deactivation, tears down connection

**Message dispatch**
- Identifies incoming message: `bot_token + chat_id → conversation_id`
- Routes to a **per-conversation serial queue** (backed by Redis)
- Ensures messages within the same conversation are processed one at a time, preventing concurrent sandbox instances from corrupting shared history

**Sandbox lifecycle**
- Reads `template_id`, `port`, `ready_probe`, `idle_timeout_ms` from `agent_types` table in DB
- Creates sandbox via e2b SDK with the agent's template
- Injects exactly three environment variables (see §7 Security Model)
- Polls the ready probe until the sandbox is healthy
- Forwards `POST /chat { message }` to the sandbox
- Waits for response, then sends it back to the IM user
- Keeps sandbox alive for `warmup_seconds` after last message; destroys on idle
- New agent types require no code changes — engine reads all configuration from DB

**Scaling note:** At large scale, multiple engine instances can run in parallel. Each instance handles a subset of bots. Redis tracks which instance owns which bot's connection. Webhook-based platforms (Feishu) are naturally stateless and distribute across instances via load balancer.

---

### 5.3 control plane

A Node.js process that acts as the sole gateway between sandboxes and the outside world. It enforces the security boundary.

**Responsibilities:**
- Validates `SESSION_TOKEN` (JWT) on every request from a sandbox
- Proxies LLM API calls using platform-held API keys
- Loads and persists conversation messages to PostgreSQL
- Issues time-limited, path-scoped S3 presigned URLs for file I/O
- Enforces per-user rate limits and tracks LLM usage for billing

**Gateway Protocol (API exposed to sandboxes):**

```
POST /cp/llm
  Body: { messages, tools, tool_choice, model }
  Auth: Bearer <SESSION_TOKEN>
  → Validates JWT → calls LLM provider with platform API key → returns response

POST /cp/messages
  Body: { action: "load" | "save", messages? }
  Auth: Bearer <SESSION_TOKEN>
  → load: returns conversation history for SESSION_ID
  → save: persists new messages for SESSION_ID

POST /cp/files/presign
  Body: { path, operation: "read" | "write" }
  Auth: Bearer <SESSION_TOKEN>
  → Returns presigned S3 URL scoped to agents/{agent_id}/ with short TTL
```

**Trust model:**
- engine and control plane share a JWT signing secret (configuration, not HTTP)
- engine signs the JWT when creating a sandbox; control plane verifies it independently
- JWT payload includes `conversation_id`, `agent_id`, `user_id`, `exp`
- JWT expires when the sandbox session ends; control plane rejects expired tokens

---

## 6. Data Model

### Key tables (PostgreSQL)

```sql
-- Users and teams
users         (id, email, password_hash, created_at)
teams         (id, name, owner_id)
team_members  (team_id, user_id, role)

-- Agent marketplace
agent_types (
  id, name, description, publisher_id,
  template_id,      -- e2b template ID, set after CI build
  port,             -- port the sandbox listens on
  ready_probe,      -- shell command to test readiness
  idle_timeout_ms,  -- sandbox killed after this idle time
  warmup_seconds,   -- sandbox kept alive after last message
  status,           -- draft | pending_review | published | deprecated
  pricing_model,    -- free | per_message | subscription
  install_count, rating, version,
  created_at, updated_at
)

-- User's agent instances
agents (
  id, team_id, agent_type_id, name,
  status,           -- active | paused | deleted
  config,           -- JSON: agent-specific parameters
  created_at
)

-- IM channel bindings (one agent can have multiple channels)
im_configs (
  id, agent_id,
  platform,         -- telegram | feishu | slack | wechat
  bot_token_enc,    -- AES-256 encrypted bot token
  chat_scope,       -- all | allowlist
  created_at
)

-- Conversations: one per (agent, chat)
conversations (
  id, agent_id,
  platform, chat_id,   -- identifies the IM chat/group
  created_at, last_message_at
)

-- Message history
messages (
  id, conversation_id,
  role,             -- user | assistant | system
  content,
  created_at
)
```

---

## 7. Security Model

### Sandbox isolation

Every sandbox receives exactly three environment variables:

```
SESSION_TOKEN       = <JWT signed by engine>
CONTROL_PLANE_URL   = https://control-plane.<domain>/
SESSION_ID          = <conversation_id>
```

The sandbox has **no** LLM API keys, no database credentials, no S3 credentials. All external access goes through the control plane, which validates the JWT on every request.

### JWT design

```json
{
  "conversation_id": "conv_abc123",
  "agent_id": "agent_xyz",
  "user_id": "user_123",
  "exp": 1234567890
}
```

- Signed with `HS256` using a secret shared between engine and control plane
- `exp` set to `now + idle_timeout_ms + buffer`; control plane rejects expired tokens
- engine and control plane never communicate over HTTP at runtime — the shared secret is configuration only

### Credential storage

- Bot tokens stored encrypted (AES-256-GCM) in `im_configs.bot_token_enc`
- Encryption key stored in engine's environment (not in DB)
- LLM API keys stored in control plane's environment only

### S3 access control

- Sandboxes never receive S3 credentials
- Control plane issues presigned URLs scoped to `s3://<bucket>/agents/<agent_id>/`
- URLs expire in 15 minutes (configurable)

---

## 8. Conversation and Concurrency Model

### Conversation identity

A conversation is uniquely identified by `(agent_id, platform, chat_id)`. The same bot added to multiple groups creates independent conversations — each with its own message history and independent sandbox instance.

### Per-conversation serial queue

Engine maintains a Redis-backed queue per `conversation_id`:

```
Conversation A queue:  [msg1] → [msg2]   ← processed serially
Conversation B queue:  [msg1] → [msg2]   ← processed serially, concurrent with A
```

This prevents two sandboxes for the same conversation loading the same history simultaneously and producing conflicting writes.

### Sandbox lifecycle

```
Message arrives
  → Acquire conversation lock (Redis)
  → If active sandbox exists: reuse it
  → If no active sandbox: create new (cold start ~5-15s)
  → POST /chat
  → Release lock, reset idle timer
  → After warmup_seconds with no new message: kill sandbox
```

Cold start latency is masked by sending a "typing..." indicator to the IM user immediately upon receiving the message.

---

## 9. IM Connection Model

| Platform | Connection type | Per-bot resource |
|---|---|---|
| Telegram | HTTP long-polling (30s timeout, immediately re-polled) | 1 persistent HTTP connection |
| Slack | WebSocket (Socket Mode) | 1 WebSocket connection |
| Feishu | Inbound HTTP webhook (no persistent connection) | None — engine is an HTTP server |
| WeChat | Inbound HTTP webhook | None |

Node.js's event-loop model handles thousands of concurrent long-polling and WebSocket connections efficiently. No threads are blocked; all connections are multiplexed on the event loop.

---

## 10. Agent Marketplace

### Developer flow

1. Developer implements an agent using `agent-sdk`:
   - Exposes `POST /chat` endpoint
   - Uses SDK to call `invoke_llm`, `load_messages`, `save_messages`, `get_presigned_url` — all proxied through control plane
2. Developer pushes to their GitHub repo
3. A GitHub Actions workflow (provided as a template by the platform) runs:
   - `e2b template build` to produce an e2b template
   - Smoke test: creates sandbox, calls `/chat`, verifies response
   - On success: calls `POST /api/marketplace/publish` with `{ template_id, metadata }`
4. Platform writes a new `agent_types` row with `status = pending_review`
5. After review (automated or manual), status changes to `published`
6. Users see the agent in the marketplace

### User flow

1. User browses marketplace in console
2. Selects an agent type, clicks "Install"
3. Console creates an `agents` row linking to `agent_types`
4. User configures IM channels (enters bot tokens)
5. Console notifies engine; engine establishes IM connections
6. First message triggers sandbox creation — no pre-warming needed

### Engine extensibility

Engine reads `template_id`, `port`, `ready_probe`, and timeout values from the `agent_types` table at runtime. **No engine code changes are required when a new agent type is published.** The marketplace is purely data-driven.

---

## 11. agent-sdk

A lightweight library (Python and TypeScript) that agent developers depend on. It wraps all control plane API calls:

```python
from agent_sdk import ControlPlane

cp = ControlPlane()
# Automatically reads SESSION_TOKEN and CONTROL_PLANE_URL from env

history = cp.load_messages()
response = cp.invoke_llm([*history, {"role": "user", "content": msg}])
cp.save_message("assistant", response.content)

url = cp.get_presigned_url("notes.md", "write")
```

The SDK also provides:
- `cp_mock`: a local mock server for development without the full platform
- A starter template (`agent-sdk init my-agent`) with a working `/chat` endpoint

---

## 12. Infrastructure

| Component | Technology | Purpose |
|---|---|---|
| PostgreSQL | Primary database | Users, agents, conversations, messages, agent_types |
| Redis | Cache + queue | Per-conversation message queues, active sandbox cache, rate limiting |
| S3 | Object storage | Agent file I/O (via presigned URLs), conversation history export |
| e2b | Sandbox provider | Isolated micro-VM execution environment |

---

## 13. Future Considerations

- **Agent marketplace pricing**: per-message billing, revenue sharing with developers
- **Multi-region**: deploy engine + control plane in multiple regions; session affinity via Redis
- **Streaming responses**: SSE from control plane to console web chat; IM platforms handle their own streaming
- **Self-hosted build pipeline**: replace GitHub Actions with an internal builder service when marketplace volume justifies it
- **Agent versioning**: pinning users to specific agent versions, gradual rollout of updates
- **MCP integration**: control plane exposes an MCP-compatible tool registry for agents to discover available tools

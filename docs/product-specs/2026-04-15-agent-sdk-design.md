<!-- DOC-GARDENING-CHANGE: 2026-04-16
  - Updated status from Approved to Completed: SDK package fully implemented with all modules (createAgent, file-sync, gateway-client, harness-server) and tests
-->
# Agent SDK Design

**Date:** 2026-04-15
**Status:** Completed

## 1. Overview

`@aaas/agent-sdk` is a TypeScript SDK for building AI agents that run on the Agent Runtime harness. It provides a complete agent loop (powered by pi-coding-agent), automatic harness convention compliance (HTTP endpoints, gateway interaction, file persistence), and local development support.

Developers configure system prompt, custom tools, and skills. The SDK handles everything else: HTTP server, LLM routing, session management, and file sync.

## 2. Design decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Language | TypeScript | Aligns with platform stack (gateway, dispatcher) |
| Encapsulation | Convenient top-level API + exported lower-level modules | Simple case: one-liner; advanced case: compose modules |
| Agent mode | Managed — full agent loop via pi-coding-agent | Developers configure, not code the LLM orchestration |
| LLM routing | Auto-switch: sandbox → gateway proxy; local → direct provider | Seamless dev-to-deploy experience |
| Code location | z-mono `packages/agent-sdk`, npm dep on pi packages | SDK evolves with platform; pi is stable upstream |
| demo-agent | Rewrite in TS using the SDK | Dogfooding + reference implementation |
| File sync | Built into SDK, in-process | One-line `createAgent()` handles everything |
| Session source of truth | Pi session files in `/persistent/conversation/`, synced to S3 via file sync | Preserves full context (tool calls, thinking, compaction) across sandbox restarts |
| Gateway messages table | Retained as audit/display layer | Dashboard, search, analytics need structured queryable data |
| CLI scaffolding | `npx @aaas/agent-sdk init` generates project template | Lowers onboarding friction for third-party developers |

## 3. Developer experience

### Minimal usage

```typescript
import { createAgent } from '@aaas/agent-sdk'

createAgent({
  systemPrompt: 'You are a helpful coding assistant.',
})
```

### With custom tools and skills

```typescript
import { createAgent } from '@aaas/agent-sdk'
import { Type } from '@sinclair/typebox'

createAgent({
  systemPrompt: 'You are a data analysis agent.',
  tools: [{
    name: 'query_db',
    description: 'Run a SQL query',
    parameters: Type.Object({ sql: Type.String() }),
    async execute(id, params, signal) {
      const result = await runQuery(params.sql)
      return { content: [{ type: 'text', text: JSON.stringify(result) }] }
    },
  }],
  skillDirs: ['./skills/'],
})
```

### Local development

```bash
# Direct LLM calls, no gateway needed
ANTHROPIC_API_KEY=sk-ant-... npx tsx my-agent.ts
# Test at http://localhost:8080/chat
```

### Sandbox execution

```bash
# Dispatcher injects env vars, SDK auto-switches
GATEWAY_URL=https://... SESSION_TOKEN=xxx SESSION_ID=yyy node my-agent.js
# Automatically routes LLM via gateway, enables file sync
```

## 4. Architecture

```
┌───────────────────────────────────────────────────────────────┐
│  createAgent()                                                │
│                                                               │
│  ┌────────────┐    ┌─────────────────────────────────────┐    │
│  │ HTTP Server │───▶│  pi-coding-agent session             │    │
│  │ GET /health │    │                                     │    │
│  │ POST /chat  │    │  Model = GatewayAdapter | DirectLLM │    │
│  └────────────┘    │  Tools = built-in + custom           │    │
│                     │  Skills = loaded from dirs           │    │
│                     │  SessionManager = /persistent/conv/  │    │
│                     └──────────────┬──────────────────────┘    │
│                                    │                           │
│  ┌────────────┐    ┌──────────────┴──────────────┐           │
│  │ FileSync    │    │ EnvironmentDetector          │           │
│  │ (in-process)│    │                              │           │
│  │             │    │ GATEWAY_URL set?              │           │
│  │ init:       │    │  yes → GatewayLLMAdapter      │           │
│  │  S3 → local │    │  no  → pi-ai getModel()       │           │
│  │ watch:      │    └─────────────────────────────┘           │
│  │  local → S3 │                                               │
│  └──────┬─────┘                                               │
│         │ presign/list via gateway                             │
└─────────┼─────────────────────────────────────────────────────┘
          ▼
    Gateway API / S3
```

## 5. Core modules

### 5.1 GatewayLLMAdapter

Implements pi-ai's `Model` interface, forwarding LLM calls to `POST /gateway/llm`.

```typescript
class GatewayLLMAdapter implements Model {
  constructor(private gatewayUrl: string, private token: string) {}
  // Implements Model interface methods
  // Internally calls POST /gateway/llm
}
```

### 5.2 GatewayClient

Encapsulates all gateway HTTP interactions:

- `appendMessages()` — persist assistant reply to audit layer
- `presignUrls()` — get S3 presigned URLs for file sync
- `listFiles()` — list S3 files under a prefix

`loadMessages()` is retained but not used by the agent loop (session restores from files).

### 5.3 FileSync

TypeScript rewrite of `file_sync.py`, runs in-process:

```typescript
class FileSync {
  constructor(private gateway: GatewayClient, private root: string) {}

  async init(): Promise<void>     // Download S3 → /persistent/
  startWatch(): void              // Poll mtime changes every 10s → upload S3
  stopWatch(): void
}
```

Same logic as Python version: init does full download, watch polls for mtime changes and uploads.

### 5.4 HarnessServer

HTTP server exposing harness-required endpoints:

- `GET /health` → `{ ok: true }`
- `POST /chat` → receives `{ message }` → drives agent loop → returns `{ reply }`

Maintains a pi agent session instance in memory, reused across `/chat` requests within the same sandbox lifecycle.

### 5.5 EnvironmentDetector

Detects runtime environment and configures behavior:

```typescript
function detectEnvironment(): 'sandbox' | 'local' {
  return (process.env.GATEWAY_URL && process.env.SESSION_TOKEN)
    ? 'sandbox'
    : 'local'
}
```

| Behavior | Sandbox mode | Local mode |
|----------|-------------|-----------|
| LLM routing | GatewayLLMAdapter | pi-ai getModel() |
| File sync | Enabled | Disabled |
| Session storage | `/persistent/conversation/` | Local temp directory |
| Message audit | Append to gateway (fire-and-forget) | Skipped |

## 6. Session management

### Source of truth

Pi session files are the agent's working memory source of truth. Gateway `messages` table is the audit/display layer.

```
/persistent/
  shared/              ← Agent business files (SOUL.md, knowledge base, etc.)
  conversation/        ← Pi session files + conversation business files
                         Synced to S3 via file sync
```

### Lifecycle

**Sandbox alive (across /chat requests):** Pi session stays in memory. Subsequent messages reuse the same session — compaction, context window management work normally. SessionManager simultaneously writes to `/persistent/conversation/` for durability.

**Sandbox restart:** File sync init downloads session files from S3 → pi SessionManager restores from `/persistent/conversation/` → agent fully recovers context.

**Message audit:** After each agent reply, SDK fire-and-forget calls `gateway.appendMessages()` to persist the record for platform observability.

### Optimistic concurrency with dispatcher

Currently the dispatcher calls `gateway.appendMessages()` for user messages and maintains a `lastMessageId` cache. After sandbox replies, it fire-and-forgets a `loadMessages()` to sync the cache. With the SDK also calling `appendMessages` for assistant messages, sequencing matters.

The existing flow already handles this correctly:
1. Dispatcher appends user message → updates its `lastMessageId` cache
2. Dispatcher calls `POST /chat` on sandbox → blocks until reply
3. SDK appends assistant message to gateway (fire-and-forget, but completes during step 2)
4. Dispatcher fire-and-forgets `loadMessages()` to sync cache with the new head

The dispatcher's post-reply sync (`loadMessages`) already accounts for the sandbox having appended messages. No change needed — the SDK's `appendMessages` call is the same role the Python demo-agent's `gw.append_messages()` played. The dispatcher's sync mechanism remains as-is.

## 7. /chat request flow

```
POST /chat { message: "Help me analyze this code" }
  │
  ├─ 1. Reuse in-memory pi session (or create on first request)
  │     - Sandbox mode: SessionManager points to /persistent/conversation/
  │     - First request + session files exist: restore from files
  │     - First request + no files: create new session
  │
  ├─ 2. session.prompt(message)
  │     Pi agent loop runs:
  │     ├─ LLM call (via GatewayAdapter or DirectLLM)
  │     ├─ Tool execution (built-in + custom)
  │     ├─ Multi-turn loop until agent finishes
  │     └─ Session files auto-updated to /persistent/conversation/
  │
  ├─ 3. Extract assistant reply text
  │
  ├─ 4. (Sandbox mode) fire-and-forget: gateway.appendMessages(assistantReply)
  │
  └─ 5. Return { reply: "The issue with this code is..." }
```

## 8. Impact on dispatcher

Dispatcher `sandbox.ts` startup sequence simplifies:

**Before (Python demo-agent):**
```
1. Sandbox.create()
2. file_sync.py init        ← dispatcher orchestrates
3. file_sync.py watch &     ← dispatcher orchestrates
4. python app.py            ← dispatcher orchestrates
5. health check
```

**After (TS SDK agent):**
```
1. Sandbox.create()
2. node my-agent.js         ← SDK internally: file sync init → watch → HTTP server
3. health check
```

Dispatcher no longer orchestrates file sync and app startup separately. `createAgent()` handles all of it internally.

Specifically, `sandbox.ts` should remove the `file_sync.py init`, `file_sync.py watch`, and `python app.py` startup steps (~40 lines of orchestration code) and replace with a single `node my-agent.js` command. The health check polling remains unchanged.

## 9. CLI scaffolding

```bash
npx @aaas/agent-sdk init my-agent
```

Generates:

```
my-agent/
  src/
    agent.ts           # createAgent() main file
    skills/            # Empty skills directory
  e2b.Dockerfile       # Node.js base image + npm install + start command
  e2b.toml             # e2b template config
  package.json         # Depends on @aaas/agent-sdk
  tsconfig.json
  README.md            # Development and deployment guide
```

## 10. Package structure

```
packages/agent-sdk/
  src/
    index.ts                  # Public API exports
    create-agent.ts           # createAgent() top-level convenience API
    gateway-client.ts         # Gateway HTTP interactions
    gateway-llm-adapter.ts    # Model interface adapter
    file-sync.ts              # TS rewrite of file sync
    harness-server.ts         # HTTP server (/health, /chat)
    environment.ts            # Environment detection + config resolution
    cli/
      init.ts                 # npx init scaffolding
      templates/              # Project template files
  test/
  package.json                # deps: @mariozechner/pi-coding-agent, @mariozechner/pi-ai
```

## 11. Risks to verify before implementation

### Critical (must verify before committing to session architecture)

The session persistence model in Section 6 depends entirely on these two capabilities. If either fails verification, the session management design must be revisited.

| Risk | Verification |
|------|-------------|
| pi `SessionManager` accepts custom directory | Check `createAgentSession` parameters for directory override to `/persistent/conversation/` |
| pi `createAgentSession` supports restoring from existing session files | Check `continueSession` mechanism — can it resume from a session dir populated by file sync? |

### Standard (verify during implementation)

| Risk | Verification |
|------|-------------|
| pi-ai `Model` interface supports custom implementations | Inspect pi-ai source code, confirm interface definition and required methods |
| Gateway `/llm` may need streaming extension | Confirm whether pi agent loop requires streaming responses; if so, gateway needs SSE support |

## 12. Out of scope (future work)

- Python SDK for Python agent developers
- Gateway `/llm` streaming support (may be needed based on risk verification)
- Multi-agent orchestration within a single sandbox
- Storage quotas and size limits for file sync
- Agent marketplace and publishing workflow

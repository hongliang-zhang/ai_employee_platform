# Sandbox Persistent File Storage

**Status:** Implemented with divergence — gateway storage routes and agent-sdk TypeScript file sync exist; older Python/demo-agent implementation details in historical plans should not be followed as-is.

> Give sandbox agents a local path (`/persistent/`) that transparently syncs to S3-compatible object storage via presigned URLs. No cloud credentials ever enter the sandbox.

## Context

Agents running in e2b sandboxes are stateless and ephemeral (core belief #2). Some agents need to persist files across sandbox lifecycles — personality files (SOUL.md), long-term memory, session-specific scratch data. Today there is no mechanism for this.

Inspired by [Browser Use's control plane architecture](https://x.com/larsencc/status/2027225210412470668), we adopt a **presigned URL** approach: the sandbox writes files locally, a background daemon syncs changes to S3 through gateway-issued presigned URLs. The sandbox never holds S3 credentials.

## Design decisions

### Two-tier storage layout

Agent-level files (shared across all conversations) and conversation-level files (private to one conversation) live under separate prefixes.

```
S3 Bucket: z-mono-agent-storage

agents/{agent_id}/
├── shared/                     ← all conversations can read/write
│   ├── SOUL.md
│   ├── memory/
│   └── knowledge/
└── conversations/
    ├── {conv_id_1}/            ← private to one conversation
    └── {conv_id_2}/
```

Inside the sandbox, the agent sees:

```
/persistent/
├── shared/          → agents/{agent_id}/shared/
└── conversation/    → agents/{agent_id}/conversations/{conv_id}/
```

The agent code does not need to know `agent_id` or `conversation_id`. The file sync daemon resolves paths internally using environment variables set by the dispatcher.

### Presigned URLs via gateway

The sandbox never holds S3 credentials. All S3 access goes through presigned URLs issued by gateway. This preserves core belief #1 (gateway is the single trusted chokepoint) and the existing security model (sandbox holds only a scoped JWT).

### S3-compatible storage, not vendor-locked

The design uses standard S3 protocol via `s3fs`-compatible endpoints. Switching between AWS S3, Cloudflare R2, or Tencent Cloud COS requires only changing the endpoint URL. The target is Tencent Cloud COS.

### Sync strategy: periodic polling

A file sync daemon polls `/persistent/` every 10 seconds for changed files (by mtime). Simple and reliable for the expected workload (small text files written infrequently).

### Cold start: full download

When a sandbox starts, the daemon downloads all existing files from S3 before the agent begins. Given the expected file sizes (markdown, small text), this adds negligible startup time.

### Concurrent write risk

Multiple active conversations can write to `shared/` simultaneously. MVP accepts last-write-wins semantics. This is a known limitation, acceptable at current scale (single agent, low concurrency).

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Sandbox (e2b)                                              │
│                                                             │
│  ┌──────────────┐    ┌───────────────────┐                  │
│  │  Agent Code   │    │  File Sync Daemon  │                  │
│  │  (app.py)     │    │  (file_sync.py)    │                  │
│  │               │    │                   │                  │
│  │  reads/writes │    │  1. init: download │                  │
│  │  /persistent/ │    │  2. watch: poll    │                  │
│  └──────┬────────┘    │     & upload       │                  │
│         │             └────────┬──────────┘                  │
│         ▼                      │                             │
│  /persistent/                  │ SESSION_TOKEN               │
│  ├── shared/                   │                             │
│  └── conversation/             │                             │
└────────────────────────────────┼─────────────────────────────┘
                                 │
                    POST /gateway/storage/presign
                    POST /gateway/storage/list
                                 │
                                 ▼
┌────────────────────────────────────────────────────┐
│  Gateway (trusted zone)                            │
│                                                    │
│  Validates JWT → extracts agent_id, conv_id        │
│  Maps relative paths to full S3 keys               │
│  Generates presigned URLs with S3 credentials      │
│  S3 credentials never leave gateway                │
└────────────────────┬───────────────────────────────┘
                     │
                     ▼
              ┌─────────────┐
              │  S3-compat   │
              │  (COS/R2/S3) │
              └─────────────┘
```

## Gateway API additions

### POST /gateway/storage/presign

Generate presigned URLs for upload or download.

**Auth:** Bearer `session_token` (caller: `sandbox`)

**Request:**
```json
{
  "operations": [
    { "action": "upload",   "path": "shared/SOUL.md" },
    { "action": "download", "path": "conversation/scratch/draft.md" }
  ]
}
```

**Path rules:**
- Must start with `shared/` or `conversation/`
- `shared/X` maps to `agents/{agent_id}/shared/X`
- `conversation/X` maps to `agents/{agent_id}/conversations/{conv_id}/X`
- Path traversal (`../`) is rejected

**Response (200):**
```json
{
  "urls": [
    { "path": "shared/SOUL.md", "url": "https://cos...?X-Amz-Signature=...", "expires_in": 3600 },
    { "path": "conversation/scratch/draft.md", "url": "https://cos...?X-Amz-Signature=...", "expires_in": 3600 }
  ]
}
```

**Errors:**
- `401 unauthorized` — invalid/expired JWT
- `400 invalid_path` — path traversal or invalid prefix
- `500 s3_error` — presign generation failed (retryable: true)

### POST /gateway/storage/list

List files under a prefix.

**Auth:** Bearer `session_token` (caller: `sandbox`)

**Request:**
```json
{
  "prefix": "shared"
}
```

`prefix` must be `"shared"` or `"conversation"`.

**Response (200):**
```json
{
  "files": [
    { "path": "shared/SOUL.md", "size": 1024, "last_modified": "2026-04-14T10:00:00Z" },
    { "path": "shared/memory/v1.md", "size": 512, "last_modified": "2026-04-14T09:00:00Z" }
  ]
}
```

## File sync daemon (file_sync.py)

A Python script packaged in the e2b template with two subcommands.

### `file_sync.py init`

1. Create `/persistent/shared/` and `/persistent/conversation/`
2. Call `POST /gateway/storage/list` for both prefixes
3. For each file: get presigned download URL via `POST /gateway/storage/presign`, download to local path
4. Record each file's mtime as the sync baseline

Runs to completion before the agent starts. If it fails (S3 unreachable, download error), sandbox startup fails.

### `file_sync.py watch`

Runs as a background process. Every 10 seconds:

1. Walk `/persistent/` recursively
2. Compare each file's mtime against the baseline
3. For changed/new files: batch `POST /gateway/storage/presign` (action: upload)
4. Upload each file to its presigned URL via HTTP PUT
5. Update baseline mtimes
6. For deleted files: no action in MVP (files remain on S3)

Errors are logged but do not crash the daemon. Failed uploads are retried next cycle.

## Sandbox startup sequence

```
Dispatcher                          Sandbox
    │                                  │
    │  1. Sandbox.create()             │
    │  2. file_sync.py init            │
    │  ─────────────────────────────▶  │  Download existing files
    │                                  │  from S3 → /persistent/
    │  3. file_sync.py watch &         │
    │  ─────────────────────────────▶  │  Start background sync
    │                                  │
    │  4. python app.py                │
    │  ─────────────────────────────▶  │  Agent ready
    │                                  │
    │  5. health check                 │
    │  ─────────────────────────────▶  │  ✓
```

The dispatcher passes `GATEWAY_URL`, `SESSION_TOKEN`, and `SESSION_ID` as before. The file sync daemon reads these from the environment.

## Security model

| Property | Status |
|----------|--------|
| S3 credentials in sandbox | ❌ Never |
| Gateway remains sole credential holder | ✅ Preserved |
| Sandbox authenticates with existing JWT | ✅ No new auth |
| Presigned URLs scoped to agent prefix | ✅ Cannot access other agents |
| Presigned URLs time-limited | ✅ 1h expiry |
| Path traversal prevention | ✅ Gateway validates paths |

## Environment variables (new)

Added to gateway:

| Variable | Description |
|----------|-------------|
| `S3_ENDPOINT` | S3-compatible endpoint URL (e.g. `https://cos.ap-guangzhou.myqcloud.com`) |
| `S3_BUCKET` | Bucket name |
| `S3_ACCESS_KEY` | Access key ID |
| `S3_SECRET_KEY` | Secret access key |
| `S3_REGION` | Region (e.g. `ap-guangzhou`) |

## Error handling

| Scenario | Handling |
|----------|----------|
| Presigned URL expired | Daemon requests new URL on next cycle |
| S3 upload failed | Retry 3× with exponential backoff, skip on failure, retry next cycle |
| S3 download failed (init) | Sandbox startup fails, dispatcher may recreate |
| Gateway unreachable | Retry 3×, log warning, skip cycle |
| Agent writes large file (>10MB) | Upload proceeds, log warning |
| Concurrent writes to shared/ | Last-write-wins (known MVP limitation) |

All gateway error responses follow the existing envelope:
```json
{ "error": { "code": "string", "message": "string", "retryable": true, "details": {} } }
```

## Components affected

| Component | Changes |
|-----------|---------|
| **gateway** | New routes: `/storage/presign`, `/storage/list`. New S3 client. New env vars. |
| **agent-sdk / external agent runtime** | SDK-managed file sync support; rebuild the sandbox runtime template/image that consumes the SDK. |
| **dispatcher** (`sandbox.ts`) | Start the agent runtime and call `/shutdown` before killing the sandbox so the runtime can flush session files. |
| **config** | `.env.example` updated with S3 vars. |
| **docs** | `ARCHITECTURE.md`, `SECURITY.md` updated. |

## Known limitations (MVP)

- **No file deletion sync:** Deleting a file locally does not delete it from S3.
- **No conflict resolution:** Concurrent writes to `shared/` use last-write-wins.
- **No size quotas:** No per-agent or per-conversation storage limits.
- **No encryption at rest:** Relies on S3 bucket-level encryption settings.
- **Sync delay:** Up to 10 seconds between file write and S3 upload.

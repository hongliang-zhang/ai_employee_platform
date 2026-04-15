# Database Schema

> Auto-generated from `migrations/`. Do not edit manually — regenerate with `pnpm tsx scripts/gen-schema.ts` (TODO: add this script).

Source of truth: [`packages/db/prisma/migrations/`](../../packages/db/prisma/migrations/)

---

## Table: `users`

Platform users (not yet wired up in MVP).

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | TEXT | PRIMARY KEY | cuid2 |
| `email` | TEXT | UNIQUE NOT NULL | |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |

---

## Table: `agents`

Agent definitions. Each agent maps to one e2b template and one set of runtime parameters.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | TEXT | PRIMARY KEY | cuid2 |
| `name` | TEXT | NOT NULL | Human-readable label |
| `status` | TEXT | CHECK IN ('active','paused','deleted') | Only one 'active' agent in MVP |
| `e2b_template_id` | TEXT | NOT NULL | Template used to spawn sandboxes |
| `port` | INT | NOT NULL DEFAULT 8080 | Port the agent Flask app listens on |
| `idle_timeout_ms` | INT | NOT NULL DEFAULT 300000 | Sandbox killed after this much idle time (5 min default) |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |

---

## Table: `im_configs`

IM channel configuration per agent. One agent may have multiple IM configs (e.g. multiple Telegram bots), but MVP uses one.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | TEXT | PRIMARY KEY | cuid2 |
| `agent_id` | TEXT | NOT NULL REFERENCES agents(id) | |
| `provider` | TEXT | NOT NULL DEFAULT 'telegram' CHECK IN ('telegram', 'feishu') | IM provider type |
| `credentials_enc` | TEXT | NOT NULL | Provider credentials as encrypted JSON (AES-256). Telegram: `{bot_token}`. Feishu: `{app_id, app_secret}` |
| `chat_scope` | TEXT | NOT NULL DEFAULT 'all' | Which chats to respond to |
| `status` | TEXT | CHECK IN ('active','paused','disabled') | |
| `lease_owner` | TEXT | | Reserved for multi-dispatcher lease (unused in MVP) |
| `lease_expires_at` | TIMESTAMPTZ | | Reserved for multi-dispatcher lease (unused in MVP) |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |

---

## Table: `conversations`

One row per unique (channel_key, external_chat_id, external_thread_key) triple. Created on first message.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | TEXT | PRIMARY KEY | cuid2 |
| `agent_id` | TEXT | NOT NULL REFERENCES agents(id) | |
| `channel_key` | TEXT | NOT NULL | Format: `im:{im_config_id}` |
| `external_chat_id` | TEXT | NOT NULL | Telegram chat ID |
| `external_thread_key` | TEXT | NOT NULL DEFAULT '' | Thread/topic ID (empty = no thread) |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |
| `last_message_at` | TIMESTAMPTZ | | Updated on each message |
| UNIQUE | | (channel_key, external_chat_id, external_thread_key) | Prevents duplicate conversations |

---

## Table: `messages`

Full conversation history. Append-only; never updated after insert.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | TEXT | PRIMARY KEY | Format: `msg_{cuid2}` |
| `conversation_id` | TEXT | NOT NULL REFERENCES conversations(id) | |
| `role` | TEXT | CHECK IN ('user','assistant','system','tool') | |
| `content_json` | JSONB | NOT NULL | OpenAI-compatible content array |
| `source` | TEXT | CHECK IN ('im','sandbox') | 'im' = written by dispatcher; 'sandbox' = written by agent |
| `external_message_id` | TEXT | | Telegram message ID (nullable for assistant messages) |
| `metadata_json` | JSONB | DEFAULT '{}' | Extensible metadata |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | Used for ordering; 1ms offset applied between batch inserts |

---

## Table: `inbound_jobs`

Deduplication and at-least-once processing for inbound IM messages.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | TEXT | PRIMARY KEY | cuid2 |
| `channel_key` | TEXT | NOT NULL | |
| `external_message_id` | TEXT | NOT NULL | Telegram update ID |
| `conversation_id` | TEXT | NOT NULL REFERENCES conversations(id) | |
| `status` | TEXT | CHECK IN ('pending','processing','done','failed') | |
| `lease_owner` | TEXT | | Dispatcher instance ID holding the processing lease |
| `lease_expires_at` | TIMESTAMPTZ | | Stale processing leases are recoverable after this time |
| `received_at` | TIMESTAMPTZ | DEFAULT now() | |
| UNIQUE | | (channel_key, external_message_id) | Core dedup constraint |

**Index:** `idx_inbound_jobs_recovery ON (status, lease_expires_at) WHERE status = 'processing'` — used for stale lease recovery queries.

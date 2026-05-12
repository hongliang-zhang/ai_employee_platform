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

## Table: `session_events`

Full session event log. Append-only; one row per user/assistant/tool result event in Pi native format.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `conversation_id` | TEXT | PRIMARY KEY (with `seq`) | Conversation owning this event |
| `seq` | BIGINT | PRIMARY KEY (with `conversation_id`) | Conversation-scoped event sequence, allocated by gateway |
| `role` | ENUM | NOT NULL; one of `user`, `assistant`, `toolResult` | Pi native role |
| `content_json` | JSON | NOT NULL | Pi native content blocks |
| `created_at` | DATETIME(3) | DEFAULT current timestamp | Insert time |

`last_event_id`, `expected_last_event_id`, and `after_event_id` use the string form of `seq` within the authenticated conversation. `seq` is not globally unique across conversations.

---

## Table: `im_message_receipts`

Deduplication and processing-state tracking for received IM messages.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | TEXT | PRIMARY KEY | cuid2 with `imsg_` prefix |
| `im_config_id` | TEXT | NOT NULL | |
| `message_id` | TEXT | NOT NULL | IM/platform message ID |
| `conversation_id` | TEXT | NOT NULL REFERENCES conversations(id) | |
| `status` | TEXT | CHECK IN ('pending','processing','done','failed') | |
| `lease_owner` | TEXT | | Dispatcher instance ID holding the processing lease |
| `lease_expires_at` | TIMESTAMPTZ | | Stale processing leases are recoverable after this time |
| `received_at` | TIMESTAMPTZ | DEFAULT now() | |
| UNIQUE | | (im_config_id, message_id) | Core dedup constraint |

**Index:** `idx_im_message_receipts_recovery ON (status, lease_expires_at)` — used for stale lease recovery queries.

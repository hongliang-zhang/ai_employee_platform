-- migrations/001_initial.sql

CREATE TABLE users (
  id          TEXT PRIMARY KEY,
  email       TEXT UNIQUE NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE agents (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('active','paused','deleted')),
  e2b_template_id TEXT NOT NULL,
  port            INT  NOT NULL DEFAULT 8080,
  idle_timeout_ms INT  NOT NULL DEFAULT 300000,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE im_configs (
  id               TEXT PRIMARY KEY,
  agent_id         TEXT NOT NULL REFERENCES agents(id),
  platform         TEXT NOT NULL DEFAULT 'telegram',
  bot_token_enc    TEXT NOT NULL,
  chat_scope       TEXT NOT NULL DEFAULT 'all',
  status           TEXT NOT NULL CHECK (status IN ('active','paused','disabled')),
  lease_owner      TEXT,
  lease_expires_at TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE conversations (
  id                  TEXT PRIMARY KEY,
  agent_id            TEXT NOT NULL REFERENCES agents(id),
  channel_key         TEXT NOT NULL,
  external_chat_id    TEXT NOT NULL,
  external_thread_key TEXT NOT NULL DEFAULT '',
  created_at          TIMESTAMPTZ DEFAULT now(),
  last_message_at     TIMESTAMPTZ,
  UNIQUE (channel_key, external_chat_id, external_thread_key)
);

CREATE TABLE messages (
  id                  TEXT PRIMARY KEY,
  conversation_id     TEXT NOT NULL REFERENCES conversations(id),
  role                TEXT NOT NULL CHECK (role IN ('user','assistant','system','tool')),
  content_json        JSONB NOT NULL,
  source              TEXT NOT NULL CHECK (source IN ('im','sandbox')),
  external_message_id TEXT,
  metadata_json       JSONB DEFAULT '{}',
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE inbound_jobs (
  id                  TEXT PRIMARY KEY,
  channel_key         TEXT NOT NULL,
  external_message_id TEXT NOT NULL,
  conversation_id     TEXT NOT NULL REFERENCES conversations(id),
  status              TEXT NOT NULL CHECK (status IN ('pending','processing','done','failed')),
  lease_owner         TEXT,
  lease_expires_at    TIMESTAMPTZ,
  received_at         TIMESTAMPTZ DEFAULT now(),
  UNIQUE (channel_key, external_message_id)
);

CREATE INDEX idx_inbound_jobs_recovery ON inbound_jobs (status, lease_expires_at)
  WHERE status = 'processing';

-- migrations/001_initial.sql (MySQL/TDSQL RocksDB)
-- No FOREIGN KEY constraints: TDSQL RocksDB engine does not support them.
-- Referential integrity is enforced at the application layer.

CREATE TABLE users (
  id          VARCHAR(191) NOT NULL PRIMARY KEY,
  email       VARCHAR(191) NOT NULL UNIQUE,
  created_at  DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3)
);

CREATE TABLE agents (
  id              VARCHAR(191) NOT NULL PRIMARY KEY,
  name            VARCHAR(191) NOT NULL,
  status          VARCHAR(191) NOT NULL,
  e2b_template_id VARCHAR(191) NOT NULL,
  port            INT          NOT NULL DEFAULT 8080,
  idle_timeout_ms INT          NOT NULL DEFAULT 300000,
  created_at      DATETIME(3)  DEFAULT CURRENT_TIMESTAMP(3)
);

CREATE TABLE im_configs (
  id               VARCHAR(191) NOT NULL PRIMARY KEY,
  agent_id         VARCHAR(191) NOT NULL,
  platform         VARCHAR(191) NOT NULL DEFAULT 'telegram',
  bot_token_enc    VARCHAR(191) NOT NULL,
  chat_scope       VARCHAR(191) NOT NULL DEFAULT 'all',
  status           VARCHAR(191) NOT NULL,
  lease_owner      VARCHAR(191),
  lease_expires_at DATETIME(3),
  created_at       DATETIME(3)  DEFAULT CURRENT_TIMESTAMP(3),
  INDEX im_configs_agent_id_idx (agent_id)
);

CREATE TABLE conversations (
  id                  VARCHAR(191) NOT NULL PRIMARY KEY,
  agent_id            VARCHAR(191) NOT NULL,
  channel_key         VARCHAR(191) NOT NULL,
  external_chat_id    VARCHAR(191) NOT NULL,
  external_thread_key VARCHAR(191) NOT NULL DEFAULT '',
  created_at          DATETIME(3)  DEFAULT CURRENT_TIMESTAMP(3),
  last_message_at     DATETIME(3),
  UNIQUE (channel_key, external_chat_id, external_thread_key),
  INDEX conversations_agent_id_idx (agent_id)
);

CREATE TABLE messages (
  id                  VARCHAR(191) NOT NULL PRIMARY KEY,
  conversation_id     VARCHAR(191) NOT NULL,
  role                VARCHAR(191) NOT NULL,
  content_json        JSON         NOT NULL,
  source              VARCHAR(191) NOT NULL,
  external_message_id VARCHAR(191),
  metadata_json       JSON         DEFAULT (JSON_OBJECT()),
  created_at          DATETIME(3)  DEFAULT CURRENT_TIMESTAMP(3),
  INDEX messages_conversation_id_idx (conversation_id)
);

CREATE TABLE inbound_jobs (
  id                  VARCHAR(191) NOT NULL PRIMARY KEY,
  channel_key         VARCHAR(191) NOT NULL,
  external_message_id VARCHAR(191) NOT NULL,
  conversation_id     VARCHAR(191) NOT NULL,
  status              VARCHAR(191) NOT NULL,
  lease_owner         VARCHAR(191),
  lease_expires_at    DATETIME(3),
  received_at         DATETIME(3)  DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE (channel_key, external_message_id),
  INDEX inbound_jobs_conversation_id_idx (conversation_id)
);

CREATE INDEX idx_inbound_jobs_recovery ON inbound_jobs (status, lease_expires_at);

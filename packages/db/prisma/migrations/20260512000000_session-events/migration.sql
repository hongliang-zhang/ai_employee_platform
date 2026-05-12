-- Redesign messages as session_events aligned with Pi agent-core native format.
-- seq is conversation-scoped: allocated in-transaction via MAX(seq)+1 to avoid
-- AUTO_INCREMENT ordering issues on TDSQL/RocksDB and global sequence hot spots.
-- No FOREIGN KEY constraints: TDSQL RocksDB engine does not support them.
-- MVP discards legacy `messages` rows; the old table only stored user text and
-- final assistant text, so backfilling would produce an incomplete event log.

DROP TABLE IF EXISTS messages;

CREATE TABLE session_events (
  conversation_id VARCHAR(191) NOT NULL,
  seq             BIGINT       NOT NULL,
  role            ENUM('user', 'assistant', 'toolResult') NOT NULL,
  content_json    JSON         NOT NULL,
  created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (conversation_id, seq)
);

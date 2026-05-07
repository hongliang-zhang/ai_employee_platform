-- Rename inbound IM message tracking table to match its responsibility.
-- The table records received IM messages for deduplication and processing status tracking.

ALTER TABLE inbound_jobs RENAME TO im_message_receipts;

ALTER TABLE im_message_receipts DROP INDEX inbound_jobs_im_config_id_message_id_key;
ALTER TABLE im_message_receipts ADD UNIQUE KEY im_message_receipts_im_config_id_message_id_key (im_config_id, message_id);

ALTER TABLE im_message_receipts DROP INDEX inbound_jobs_conversation_id_idx;
ALTER TABLE im_message_receipts ADD INDEX im_message_receipts_conversation_id_idx (conversation_id);

DROP INDEX idx_inbound_jobs_recovery ON im_message_receipts;
CREATE INDEX idx_im_message_receipts_recovery ON im_message_receipts (status, lease_expires_at);

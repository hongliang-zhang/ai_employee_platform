-- Rename columns for consistent naming convention
-- conversations table
ALTER TABLE conversations RENAME COLUMN channel_key TO im_config_id;
ALTER TABLE conversations RENAME COLUMN external_chat_id TO chat_id;
ALTER TABLE conversations RENAME COLUMN external_thread_key TO topic_id;
ALTER TABLE conversations DROP INDEX channel_key;
ALTER TABLE conversations ADD UNIQUE KEY conversations_im_config_id_chat_id_topic_id_key (im_config_id, chat_id, topic_id);

-- messages table
ALTER TABLE messages RENAME COLUMN external_message_id TO message_id;

-- inbound_jobs table
ALTER TABLE inbound_jobs RENAME COLUMN channel_key TO im_config_id;
ALTER TABLE inbound_jobs RENAME COLUMN external_message_id TO message_id;
ALTER TABLE inbound_jobs DROP INDEX channel_key;
ALTER TABLE inbound_jobs ADD UNIQUE KEY inbound_jobs_im_config_id_message_id_key (im_config_id, message_id);

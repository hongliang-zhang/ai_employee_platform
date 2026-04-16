-- AlterTable: rename columns for multi-provider support
ALTER TABLE im_configs RENAME COLUMN platform TO provider;
ALTER TABLE im_configs RENAME COLUMN bot_token_enc TO credentials_enc;

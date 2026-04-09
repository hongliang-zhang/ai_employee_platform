import { createId } from '@paralleldrive/cuid2'
import type { Db } from './db.js'

export function createInboundJobsManager(db: Db, instanceId: string) {
  return {
    /** Returns true if inserted (new message), false if duplicate. */
    async tryInsert(channelKey: string, externalMessageId: string, conversationId: string): Promise<boolean> {
      const id = 'job_' + createId()
      const result = await db`
        INSERT INTO inbound_jobs (id, channel_key, external_message_id, conversation_id, status)
        VALUES (${id}, ${channelKey}, ${externalMessageId}, ${conversationId}, 'pending')
        ON CONFLICT (channel_key, external_message_id) DO NOTHING`
      return result.count === 1
    },

    async markProcessing(channelKey: string, externalMessageId: string): Promise<void> {
      await db`
        UPDATE inbound_jobs
        SET status = 'processing', lease_owner = ${instanceId}, lease_expires_at = now() + interval '60 seconds'
        WHERE channel_key = ${channelKey} AND external_message_id = ${externalMessageId}`
    },

    async markDone(channelKey: string, externalMessageId: string): Promise<void> {
      await db`UPDATE inbound_jobs SET status = 'done' WHERE channel_key = ${channelKey} AND external_message_id = ${externalMessageId}`
    },

    async markFailed(channelKey: string, externalMessageId: string): Promise<void> {
      await db`UPDATE inbound_jobs SET status = 'failed' WHERE channel_key = ${channelKey} AND external_message_id = ${externalMessageId}`
    },
  }
}

import { createId } from '@paralleldrive/cuid2'
import type { Db } from './db.js'

export function createInboundJobsManager(db: Db, instanceId: string) {
  return {
    /** Returns true if inserted (new message), false if duplicate. */
    async tryInsert(channelKey: string, externalMessageId: string, conversationId: string): Promise<boolean> {
      const id = 'job_' + createId()
      const result = await db.inboundJob.createMany({
        data: [{ id, channelKey, externalMessageId, conversationId, status: 'pending' }],
        skipDuplicates: true,
      })
      return result.count === 1
    },

    async markProcessing(channelKey: string, externalMessageId: string): Promise<void> {
      await db.inboundJob.updateMany({
        where: { channelKey, externalMessageId },
        data: { status: 'processing', leaseOwner: instanceId, leaseExpiresAt: new Date(Date.now() + 60_000) },
      })
    },

    async markDone(channelKey: string, externalMessageId: string): Promise<void> {
      await db.inboundJob.updateMany({
        where: { channelKey, externalMessageId },
        data: { status: 'done' },
      })
    },

    async markFailed(channelKey: string, externalMessageId: string): Promise<void> {
      await db.inboundJob.updateMany({
        where: { channelKey, externalMessageId },
        data: { status: 'failed' },
      })
    },
  }
}

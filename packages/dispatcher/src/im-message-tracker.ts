import { createId } from '@paralleldrive/cuid2'
import type { Db } from './lib/db.js'

export type ClaimResult =
  | { claimed: true }
  | { claimed: false; reason: 'already_done' | 'already_processing' | 'failed' }

export function createImMessageTracker(db: Db, instanceId: string) {
  // Each processing lease is intentionally short-lived. If a dispatcher dies while
  // handling a message, another dispatcher can reclaim the receipt after this time.
  function leaseExpiresAt(): Date {
    return new Date(Date.now() + 60_000)
  }

  async function claimExisting(imConfigId: string, messageId: string, now: Date): Promise<ClaimResult> {
    // Reclaim only receipts that are safe to process now:
    // - pending: recorded but not currently owned by a dispatcher
    // - processing with expired lease: previous owner likely died or got stuck
    // The conditional update is the concurrency guard. If two dispatchers race to
    // reclaim the same receipt, only one update should affect a row.
    const result = await db.imMessageReceipt.updateMany({
      where: {
        imConfigId,
        messageId,
        OR: [
          { status: 'pending' },
          { status: 'processing', leaseExpiresAt: { lt: now } },
        ],
      },
      data: { status: 'processing', leaseOwner: instanceId, leaseExpiresAt: leaseExpiresAt() },
    })
    if (result.count === 1) return { claimed: true }

    // If reclaim failed, inspect the current terminal/active state for logging and
    // caller behavior. Missing rows are treated as actively processing because the
    // insert path already failed due to a duplicate key race.
    const existing = await db.imMessageReceipt.findUnique({
      where: { imConfigId_messageId: { imConfigId, messageId } },
      select: { status: true },
    })

    if (existing?.status === 'done') return { claimed: false, reason: 'already_done' }
    if (existing?.status === 'failed') return { claimed: false, reason: 'failed' }
    return { claimed: false, reason: 'already_processing' }
  }

  return {
    /**
     * Attempts to claim processing ownership for this IM message.
     *
     * Deduplication is based on the DB unique constraint over
     * (imConfigId, messageId), not the generated receipt id. A newly seen IM
     * message is inserted directly as `processing`; duplicates are evaluated by
     * their stored receipt status.
     */
    async tryClaim(imConfigId: string, messageId: string, conversationId: string): Promise<ClaimResult> {
      const now = new Date()

      // Fast path: first dispatcher to see this IM message inserts the receipt and
      // owns processing. `skipDuplicates` turns duplicate-key races into count=0.
      const result = await db.imMessageReceipt.createMany({
        data: [{
          id: 'imsg_' + createId(),
          imConfigId,
          messageId,
          conversationId,
          status: 'processing',
          leaseOwner: instanceId,
          leaseExpiresAt: leaseExpiresAt(),
        }],
        skipDuplicates: true,
      })
      if (result.count === 1) return { claimed: true }

      // Duplicate path: the message has a receipt already, so decide whether it is
      // claimable from status/lease instead of blindly dropping it.
      return claimExisting(imConfigId, messageId, now)
    },

    async markDone(imConfigId: string, messageId: string): Promise<void> {
      await db.imMessageReceipt.updateMany({
        where: { imConfigId, messageId },
        data: { status: 'done' },
      })
    },

    async markFailed(imConfigId: string, messageId: string): Promise<void> {
      await db.imMessageReceipt.updateMany({
        where: { imConfigId, messageId },
        data: { status: 'failed' },
      })
    },
  }
}

import { createId } from '@paralleldrive/cuid2'
import type { Db } from './db.js'

export function createConversationManager(db: Db) {
  const lastMessageIdCache = new Map<string, string | null>()

  return {
    async upsert(params: {
      agentId: string
      channelKey: string
      externalChatId: string
      externalThreadKey: string
    }): Promise<{ conversationId: string; lastMessageId: string | null }> {
      const { agentId, channelKey, externalChatId, externalThreadKey } = params
      const id = 'conv_' + createId()

      const conversation = await db.conversation.upsert({
        where: { channelKey_externalChatId_externalThreadKey: { channelKey, externalChatId, externalThreadKey } },
        create: { id, agentId, channelKey, externalChatId, externalThreadKey },
        update: { lastMessageAt: new Date() },
        select: { id: true },
      })

      const conversationId = conversation.id
      if (!lastMessageIdCache.has(conversationId)) {
        const lastMsg = await db.message.findFirst({
          where: { conversationId },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        })
        lastMessageIdCache.set(conversationId, lastMsg?.id ?? null)
      }
      return { conversationId, lastMessageId: lastMessageIdCache.get(conversationId) ?? null }
    },

    getLastMessageId(conversationId: string): string | null {
      return lastMessageIdCache.get(conversationId) ?? null
    },

    setLastMessageId(conversationId: string, messageId: string | null): void {
      lastMessageIdCache.set(conversationId, messageId)
    },
  }
}

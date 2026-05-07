import { createId } from '@paralleldrive/cuid2'
import type { Db } from './lib/db.js'

export function createConversationManager(db: Db) {
  // conversationId -> lastMessageId，dispatcher每次保存对话历史时需要带上lastMessageId
  const lastMessageIdCache = new Map<string, string | null>()

  return {
    // 根据 (imConfigId, chatId, topicId) 查conversation表；如果没有，就创建一个新纪录
    async getOrCreate(params: {
      agentId: string
      imConfigId: string
      chatId: string
      topicId: string
    }): Promise<string> {
      const { agentId, imConfigId, chatId, topicId } = params
      const id = 'conv_' + createId()

      const conversation = await db.conversation.upsert({
        where: { imConfigId_chatId_topicId: { imConfigId, chatId, topicId } },
        create: { id, agentId, imConfigId, chatId, topicId },
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
      return conversationId
    },

    getLastMessageId(conversationId: string): string | null {
      return lastMessageIdCache.get(conversationId) ?? null
    },

    setLastMessageId(conversationId: string, messageId: string | null): void {
      lastMessageIdCache.set(conversationId, messageId)
    },
  }
}

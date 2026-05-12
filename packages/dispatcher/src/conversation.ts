import { createId } from '@paralleldrive/cuid2'
import type { Db } from './lib/db.js'

export function createConversationManager(db: Db) {
  return {
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

      return conversation.id
    },
  }
}

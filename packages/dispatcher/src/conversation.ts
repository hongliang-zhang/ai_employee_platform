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

      const [row] = await db`
        INSERT INTO conversations (id, agent_id, channel_key, external_chat_id, external_thread_key)
        VALUES (${id}, ${agentId}, ${channelKey}, ${externalChatId}, ${externalThreadKey})
        ON CONFLICT (channel_key, external_chat_id, external_thread_key) DO UPDATE
          SET last_message_at = now()
        RETURNING id`

      const conversationId = row.id
      if (!lastMessageIdCache.has(conversationId)) {
        // Cache miss — could be a new conversation OR dispatcher restart with existing data.
        // Fetch actual last message ID from DB to avoid stale_write 409 on append.
        const [lastMsg] = await db`
          SELECT id FROM messages
          WHERE conversation_id = ${conversationId}
          ORDER BY created_at DESC
          LIMIT 1`
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

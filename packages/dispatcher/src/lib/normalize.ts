export interface NormalizedMessage {
  imConfigId: string       // 一条 IM 配置的唯一标识，格式固定为 im:{im_config表的主键ID}
  chatId: string           // 区分不同的聊天窗口（私聊/群组）
  topicId: string          // 区分同一个群组内的不同话题
  messageId: string        // IM 平台给每条消息分配的唯一 ID
  sender: { userId: string; displayName: string | null } // 消息发送者
  content: { type: 'text'; text: string }
}

export function normalizeTelegramUpdate(update: any, imConfigId: string): NormalizedMessage | null {
  const msg = update.message
  if (!msg || !msg.text) return null

  return {
    imConfigId,
    chatId: String(msg.chat.id),
    topicId: msg.message_thread_id ? String(msg.message_thread_id) : '',
    messageId: String(msg.message_id),
    sender: {
      userId: String(msg.from?.id ?? 'unknown'),
      displayName: msg.from?.first_name ?? null,
    },
    content: { type: 'text', text: msg.text },
  }
}

export function normalizeFeishuEvent(
  event: any,
  imConfigId: string,
  botOpenId: string
): NormalizedMessage | null {
  const { message, sender } = event

  // MVP: only handle text messages
  if (message.message_type !== 'text') return null

  // sender open_id must exist
  const senderOpenId: string | undefined = sender?.sender_id?.open_id
  if (!senderOpenId) return null

  const mentions: Array<{ key: string; id?: { open_id?: string } }> = message.mentions ?? []

  // Non-p2p (group / private etc.): must @bot
  if (message.chat_type !== 'p2p') {
    const mentioned = mentions.some(m => m.id?.open_id === botOpenId)
    if (!mentioned) return null
  }

  // Parse message text
  let text: string
  try {
    text = (JSON.parse(message.content) as { text: string }).text ?? ''
  } catch {
    return null
  }

  // Strip all mention placeholders, keep pure text
  for (const mention of mentions) {
    text = text.replace(mention.key, '').trim()
  }
  if (!text) return null

  return {
    imConfigId,
    chatId: message.chat_id,
    topicId: '',
    messageId: message.message_id,
    sender: {
      userId: senderOpenId,
      displayName: null,
    },
    content: { type: 'text', text },
  }
}

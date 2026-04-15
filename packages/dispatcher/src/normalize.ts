export interface NormalizedMessage {
  channel_key: string
  external_chat_id: string
  external_thread_key: string
  external_message_id: string
  author: { external_user_id: string; display_name: string | null }
  content: { type: 'text'; text: string }
}

export function normalizeTelegramUpdate(update: any, channelKey: string): NormalizedMessage | null {
  const msg = update.message
  if (!msg || !msg.text) return null

  return {
    channel_key: channelKey,
    external_chat_id: String(msg.chat.id),
    external_thread_key: msg.message_thread_id ? String(msg.message_thread_id) : '',
    external_message_id: String(msg.message_id),
    author: {
      external_user_id: String(msg.from?.id ?? 'unknown'),
      display_name: msg.from?.first_name ?? null,
    },
    content: { type: 'text', text: msg.text },
  }
}

export function normalizeFeishuEvent(
  event: any,
  channelKey: string,
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
    channel_key: channelKey,
    external_chat_id: message.chat_id,
    external_thread_key: '',
    external_message_id: message.message_id,
    author: {
      external_user_id: senderOpenId,
      display_name: null,
    },
    content: { type: 'text', text },
  }
}

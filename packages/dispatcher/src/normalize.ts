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

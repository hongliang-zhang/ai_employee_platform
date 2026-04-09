export function createTelegramClient(botToken: string) {
  const base = `https://api.telegram.org/bot${botToken}`

  async function call(method: string, body: object): Promise<any> {
    const res = await fetch(`${base}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return res.json()
  }

  return {
    async getUpdates(offset: number, timeout = 30): Promise<any[]> {
      const result = await call('getUpdates', { offset, timeout, allowed_updates: ['message'] })
      return result.ok ? result.result : []
    },

    async sendMessage(chatId: string, text: string): Promise<void> {
      await call('sendMessage', { chat_id: chatId, text })
    },

    async sendChatAction(chatId: string, action = 'typing'): Promise<void> {
      await call('sendChatAction', { chat_id: chatId, action })
    },
  }
}

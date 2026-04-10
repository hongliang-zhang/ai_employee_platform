import { fetch, ProxyAgent } from 'undici'

// Route Telegram API calls through a local proxy if configured (needed behind GFW)
const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY
const dispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined

export function createTelegramClient(botToken: string) {
  const base = `https://api.telegram.org/bot${botToken}`

  async function call(method: string, body: object): Promise<any> {
    const res = await fetch(`${base}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      // getUpdates uses Telegram's long-poll timeout; other calls should be fast
      signal: method === 'getUpdates' ? undefined : AbortSignal.timeout(15_000),
      dispatcher,
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

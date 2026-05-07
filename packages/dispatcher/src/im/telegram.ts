import { fetch, ProxyAgent } from 'undici'
import pino from 'pino'
import type { ChatActionContext, IMClient } from './client.js'
import type { NormalizedMessage } from '../lib/normalize.js'
import { normalizeTelegramUpdate } from '../lib/normalize.js'

const logger = pino({ transport: { target: 'pino-pretty' } })

// Route Telegram API calls through a local proxy if configured (needed behind GFW)
const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY
const proxyDispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined

export function createTelegramClient(botToken: string): {
  client: IMClient
  listen: (
    onMessage: (msg: NormalizedMessage) => Promise<void>,
    imConfigId: string
  ) => () => void
} {
  const base = `https://api.telegram.org/bot${botToken}`

  async function call(method: string, body: object, signal?: AbortSignal): Promise<any> {
    const res = await fetch(`${base}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: signal ?? (method === 'getUpdates' ? undefined : AbortSignal.timeout(15_000)),
      dispatcher: proxyDispatcher,
    })
    return res.json()
  }

  async function getUpdates(offset: number, timeout = 30, signal?: AbortSignal): Promise<any[]> {
    const result = await call('getUpdates', { offset, timeout, allowed_updates: ['message'] }, signal)
    return result.ok ? result.result : []
  }

  function sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms)
      signal.addEventListener('abort', () => {
        clearTimeout(timer)
        resolve()
      }, { once: true })
    })
  }

  const client: IMClient = {
    async sendMessage(chatId: string, text: string): Promise<void> {
      await call('sendMessage', { chat_id: chatId, text })
    },

    async sendChatAction(chatId: string, _context?: ChatActionContext): Promise<void> {
      await call('sendChatAction', { chat_id: chatId, action: 'typing' })
    },
  }

  function listen(
    onMessage: (msg: NormalizedMessage) => Promise<void>,
    imConfigId: string
  ): () => void {
    let offset = 0
    let retryDelayMs = 2_000
    const controller = new AbortController()

    ;(async function loop() {
      while (!controller.signal.aborted) {
        try {
          const updates = await getUpdates(offset, 30, controller.signal)
          retryDelayMs = 2_000
          for (const update of updates) {
            if (controller.signal.aborted) break
            offset = update.update_id + 1
            const msg = normalizeTelegramUpdate(update, imConfigId)
            if (!msg) continue
            await onMessage(msg).catch(err => logger.error({ event: 'processor.error', error: String(err) }))
          }
        } catch (err) {
          if (controller.signal.aborted) break
          logger.error({ event: 'polling.error', error: String(err) })
          await sleep(retryDelayMs, controller.signal)
          retryDelayMs = Math.min(retryDelayMs * 2, 30_000)
        }
      }
    })()

    return () => controller.abort()
  }

  return { client, listen }
}

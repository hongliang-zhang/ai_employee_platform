import pino from 'pino'
import type { NormalizedMessage } from './normalize.js'
import { normalizeTelegramUpdate } from './normalize.js'

const logger = pino({ transport: { target: 'pino-pretty' } })

export function createPollingLoop(config: {
  botToken: string
  channelKey: string
  telegram: { getUpdates: (offset: number, timeout?: number) => Promise<any[]> }
  onMessage: (msg: NormalizedMessage) => Promise<void>
}) {
  const { botToken: _botToken, channelKey, telegram, onMessage } = config
  let running = false
  let offset = 0

  return {
    start() {
      running = true
      loop()
    },
    stop() {
      running = false
    },
  }

  async function loop() {
    while (running) {
      try {
        const updates = await telegram.getUpdates(offset, 30)
        for (const update of updates) {
          offset = update.update_id + 1
          const msg = normalizeTelegramUpdate(update, channelKey)
          if (!msg) continue
          // Await each message sequentially — ensures per-conversation serial processing.
          // At MVP scale (single instance, low volume) this is sufficient.
          await onMessage(msg).catch(err => logger.error({ event: 'processor.error', error: String(err) }))
        }
      } catch (err) {
        logger.error({ event: 'polling.error', error: String(err) })
        await new Promise(r => setTimeout(r, 2000))
      }
    }
  }
}

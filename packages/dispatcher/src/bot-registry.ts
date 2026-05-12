import pino from 'pino'
import type { Prisma } from '@aaas/db'
import { createBotRunner, type BotRunner } from './bot-runner.js'
import type { Db } from './lib/db.js'
import type { SandboxOrchestrator } from './sandbox.js'

type ImConfigWithAgent = Prisma.ImConfigGetPayload<{ include: { agent: true } }>

const logger = pino({ transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined })

export function createBotRegistry(deps: {
  db: Db
  enc: ReturnType<typeof import('./lib/encrypt.js').createEncryptor>
  jwt: ReturnType<typeof import('./lib/jwt.js').createJwtSigner>
  conversation: ReturnType<typeof import('./conversation.js').createConversationManager>
  imMessageTracker: ReturnType<typeof import('./im-message-tracker.js').createImMessageTracker>
  sandbox: SandboxOrchestrator
  pollIntervalMs?: number
}) {
  const { db, pollIntervalMs = 30_000, ...sharedDeps } = deps
  const runners = new Map<string, BotRunner>()
  const failedConfigIds = new Set<string>()
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let polling = false
  let currentPollPromise: Promise<void> | null = null

  async function poll(): Promise<void> {
    let configs: ImConfigWithAgent[]
    try {
      configs = await db.imConfig.findMany({
        where: { status: 'active' },
        include: { agent: true },
      })
    } catch (err) {
      logger.warn({ event: 'registry.poll_error', error: String(err) })
      return
    }

    const active = configs.filter(c => c.agent?.status === 'active')
    const activeIds = new Set(active.map(c => c.id))
    const runningIds = new Set(runners.keys())

    for (const id of runningIds) {
      if (!activeIds.has(id)) {
        try { runners.get(id)!.stop() } catch (err) {
          logger.warn({ event: 'registry.stop_error', config_id: id, error: String(err) })
        }
        runners.delete(id)
        failedConfigIds.delete(id)  // clear failure state so it can be retried if re-activated
        logger.info({ event: 'registry.bot_removed', config_id: id })
      }
    }

    // runningIds is a snapshot taken before the stop loop above, so it correctly
    // reflects what was running at the start of this poll cycle.
    // TODO: parallelize with Promise.all if bot count grows large
    for (const cfg of active) {
      if (runningIds.has(cfg.id) || failedConfigIds.has(cfg.id)) continue
      const runner = createBotRunner({ cfg, agent: cfg.agent, ...sharedDeps })
      try {
        await runner.start()
        runners.set(cfg.id, runner)
        logger.info({ event: 'registry.bot_added', config_id: cfg.id, provider: cfg.provider })
      } catch (err) {
        logger.error({ event: 'registry.start_error', config_id: cfg.id, provider: cfg.provider, error: String(err) })
        failedConfigIds.add(cfg.id)
      }
    }
  }

  return {
    async start(): Promise<void> {
      if (pollTimer) return
      polling = true
      currentPollPromise = poll().finally(() => { polling = false; currentPollPromise = null })
      await currentPollPromise
      pollTimer = setInterval(() => {
        if (polling) return
        polling = true
        currentPollPromise = poll()
          .catch(err => logger.error({ event: 'registry.poll_unhandled', error: String(err) }))
          .finally(() => { polling = false; currentPollPromise = null })
      }, pollIntervalMs)
    },

    async stop(): Promise<void> {
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
      if (currentPollPromise) await currentPollPromise
      for (const runner of runners.values()) {
        try { runner.stop() } catch (err) {
          logger.warn({ event: 'registry.stop_error', error: String(err) })
        }
      }
      runners.clear()
      failedConfigIds.clear()
    },
  }
}

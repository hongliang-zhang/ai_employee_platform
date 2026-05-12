import pino from 'pino'
import { createDb } from './lib/db.js'
import { createJwtSigner } from './lib/jwt.js'
import { createEncryptor } from './lib/encrypt.js'
import { createConversationManager } from './conversation.js'
import { createImMessageTracker } from './im-message-tracker.js'
import { createSandboxOrchestrator } from './sandbox.js'
import { createBotRegistry } from './bot-registry.js'
import { createId } from '@paralleldrive/cuid2'

const logger = pino({ transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined })

const DATABASE_URL    = process.env.DATABASE_URL!
const JWT_SECRET      = process.env.JWT_SECRET!
const BOT_TOKEN_ENC_KEY = process.env.BOT_TOKEN_ENC_KEY!
const GATEWAY_URL     = process.env.GATEWAY_URL!
const E2B_API_KEY     = process.env.E2B_API_KEY!
const E2B_DOMAIN      = process.env.E2B_DOMAIN
const INSTANCE_ID     = process.env.POD_NAME ?? `dispatcher-${createId()}`

async function main() {
  const db               = createDb(DATABASE_URL)
  const jwt              = createJwtSigner(JWT_SECRET)
  const enc              = createEncryptor(BOT_TOKEN_ENC_KEY)
  const sandbox          = createSandboxOrchestrator({ e2bApiKey: E2B_API_KEY, e2bDomain: E2B_DOMAIN, gatewayUrl: GATEWAY_URL, instanceId: INSTANCE_ID })
  const conversation     = createConversationManager(db)
  const imMessageTracker = createImMessageTracker(db, INSTANCE_ID)

  const registry = createBotRegistry({
    db, jwt, enc, sandbox, conversation, imMessageTracker,
    pollIntervalMs: 30_000,
  })

  const shutdown = () => { registry.stop().then(() => process.exit(0)).catch(() => process.exit(1)) }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  logger.info({ event: 'dispatcher.start', instance_id: INSTANCE_ID })
  await registry.start()
}

main().catch(err => {
  logger.error({ event: 'dispatcher.fatal', error: String(err) })
  process.exit(1)
})

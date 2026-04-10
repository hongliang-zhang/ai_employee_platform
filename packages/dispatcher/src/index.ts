import pino from 'pino'
import { createDb } from './db.js'
import { createJwtSigner } from './jwt.js'
import { createEncryptor } from './encrypt.js'
import { createConversationManager } from './conversation.js'
import { createInboundJobsManager } from './inbound-jobs.js'
import { createGatewayClient } from './gateway-client.js'
import { createSandboxOrchestrator } from './sandbox.js'
import { createTelegramClient } from './telegram.js'
import { createProcessor } from './processor.js'
import { createPollingLoop } from './polling.js'
import { createId } from '@paralleldrive/cuid2'

const logger = pino({ transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined })

const DATABASE_URL = process.env.DATABASE_URL!
const JWT_SECRET = process.env.JWT_SECRET!
const BOT_TOKEN_ENC_KEY = process.env.BOT_TOKEN_ENC_KEY!
const GATEWAY_URL = process.env.GATEWAY_URL!
const GATEWAY_LOCAL_URL = process.env.GATEWAY_LOCAL_URL ?? 'http://localhost:3001'
const E2B_API_KEY = process.env.E2B_API_KEY!

const INSTANCE_ID = process.env.POD_NAME ?? `dispatcher-${createId()}`

async function main() {
  const db = createDb(DATABASE_URL)
  const jwt = createJwtSigner(JWT_SECRET)
  const enc = createEncryptor(BOT_TOKEN_ENC_KEY)

  // Load active agent and im_config from DB
  const [agent] = await db`SELECT id, e2b_template_id, port, idle_timeout_ms FROM agents WHERE status = 'active' LIMIT 1`
  if (!agent) throw new Error('No active agent found — run setup.ts first')

  const [cfg] = await db`SELECT id, bot_token_enc FROM im_configs WHERE agent_id = ${agent.id} AND status = 'active' LIMIT 1`
  if (!cfg) throw new Error('No active im_config found — run setup.ts first')

  const botToken = enc.decrypt(cfg.bot_token_enc)
  const channelKey = `im:${cfg.id}`

  const telegram = createTelegramClient(botToken)
  const conversation = createConversationManager(db)
  const jobs = createInboundJobsManager(db, INSTANCE_ID)
  const gateway = createGatewayClient(GATEWAY_LOCAL_URL)
  const sandbox = createSandboxOrchestrator({ e2bApiKey: E2B_API_KEY, gatewayUrl: GATEWAY_URL, instanceId: INSTANCE_ID })

  const processor = createProcessor({ conversation, jobs, gateway, sandbox, telegram, jwt, agent })
  const poller = createPollingLoop({ botToken, channelKey, telegram, onMessage: msg => processor.handle(msg) })

  logger.info({ event: 'dispatcher.start', agent_id: agent.id, instance_id: INSTANCE_ID })
  poller.start()
}

main().catch(err => {
  logger.error({ event: 'dispatcher.fatal', error: String(err) })
  process.exit(1)
})

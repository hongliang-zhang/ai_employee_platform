import pino from 'pino'
import * as lark from '@larksuiteoapi/node-sdk'
import { createDb } from './lib/db.js'
import { createJwtSigner } from './lib/jwt.js'
import { createEncryptor } from './lib/encrypt.js'
import { createConversationManager } from './conversation.js'
import { createImMessageTracker } from './im-message-tracker.js'
import { createGatewayClient } from './gateway-client.js'
import { createSandboxOrchestrator } from './sandbox.js'
import { createTelegramClient } from './im/telegram.js'
import { createFeishuClient } from './im/feishu.js'
import { createProcessor } from './processor.js'
import { createId } from '@paralleldrive/cuid2'

const logger = pino({ transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined })

const DATABASE_URL = process.env.DATABASE_URL!
const JWT_SECRET = process.env.JWT_SECRET!
const BOT_TOKEN_ENC_KEY = process.env.BOT_TOKEN_ENC_KEY!
const GATEWAY_URL = process.env.GATEWAY_URL!
const GATEWAY_LOCAL_URL = process.env.GATEWAY_LOCAL_URL ?? 'http://localhost:3001'
const E2B_API_KEY = process.env.E2B_API_KEY!
const E2B_DOMAIN = process.env.E2B_DOMAIN  // 可选，腾讯云: ap-beijing.tencentags.com

const INSTANCE_ID = process.env.POD_NAME ?? `dispatcher-${createId()}`

async function main() {
  const db = createDb(DATABASE_URL)
  const jwt = createJwtSigner(JWT_SECRET)
  const enc = createEncryptor(BOT_TOKEN_ENC_KEY)

  // Load active agent and im_config from DB
  const agent = await db.agent.findFirst({
    where: { status: 'active' },
    select: { id: true, e2bTemplateId: true, port: true, idleTimeoutMs: true },
  })
  if (!agent) throw new Error('No active agent found — run setup.ts first')

  const cfg = await db.imConfig.findFirst({
    where: { agentId: agent.id, status: 'active' },
    select: { id: true, provider: true, credentialsEnc: true },
  })
  if (!cfg) throw new Error('No active im_config found — run setup.ts first')

  // Decrypt credentials JSON (unified format for all providers)
  const credentials = JSON.parse(enc.decrypt(cfg.credentialsEnc)) as Record<string, string>
  const imConfigId = `im:${cfg.id}`

  const conversation = createConversationManager(db)
  const imMessageTracker = createImMessageTracker(db, INSTANCE_ID)
  const gateway = createGatewayClient(GATEWAY_LOCAL_URL)
  const sandbox = createSandboxOrchestrator({ e2bApiKey: E2B_API_KEY, e2bDomain: E2B_DOMAIN, gatewayUrl: GATEWAY_URL, instanceId: INSTANCE_ID })

  logger.info({ event: 'dispatcher.start', provider: cfg.provider, agent_id: agent.id, instance_id: INSTANCE_ID })

  if (cfg.provider === 'telegram') {
    const { client: telegramClient, listen } = createTelegramClient(credentials.bot_token)
    const processor = createProcessor({ conversation, imMessageTracker, gateway, sandbox, im: telegramClient, jwt, agent })
    listen(msg => processor.handle(msg), imConfigId)

  } else if (cfg.provider === 'feishu') {
    // Fetch bot open_id for group @mention filtering
    // API: GET /open-apis/bot/v3/info, requires im:bot permission
    const tmpClient = new lark.Client({ appId: credentials.app_id, appSecret: credentials.app_secret })
    const botInfoResp = await (tmpClient as any).request({
      method: 'GET',
      url: '/open-apis/bot/v3/info',
    }) as any
    const botOpenId: string = botInfoResp?.bot?.open_id ?? ''
    if (!botOpenId) throw new Error('Failed to fetch Feishu bot open_id — check app_id/app_secret and im:bot permission')

    logger.info({ event: 'feishu.bot_identity', bot_open_id: botOpenId })

    const { client: feishuClient, listen } = createFeishuClient(credentials.app_id, credentials.app_secret, botOpenId)
    const processor = createProcessor({ conversation, imMessageTracker, gateway, sandbox, im: feishuClient, jwt, agent })

    // listen() awaits WSClient — keeps the long connection alive, process won't exit
    await listen(msg => processor.handle(msg), imConfigId)

  } else {
    throw new Error(`Unsupported provider: ${cfg.provider}`)
  }
}

main().catch(err => {
  logger.error({ event: 'dispatcher.fatal', error: String(err) })
  process.exit(1)
})

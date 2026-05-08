import pino from 'pino'
import * as lark from '@larksuiteoapi/node-sdk'
import { createTelegramClient } from './im/telegram.js'
import { createFeishuClient } from './im/feishu.js'
import { createProcessor } from './processor.js'
import type { SandboxOrchestrator } from './sandbox.js'

const logger = pino({ transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined })

interface Agent {
  id: string
  e2bTemplateId: string
  port: number
  idleTimeoutMs: number
}

interface ImConfig {
  id: string
  provider: string
  credentialsEnc: string
}

export interface BotRunner {
  start(): Promise<void>
  stop(): void
}

export function createBotRunner(deps: {
  cfg: ImConfig
  agent: Agent
  enc: ReturnType<typeof import('./lib/encrypt.js').createEncryptor>
  conversation: ReturnType<typeof import('./conversation.js').createConversationManager>
  imMessageTracker: ReturnType<typeof import('./im-message-tracker.js').createImMessageTracker>
  gateway: ReturnType<typeof import('./gateway-client.js').createGatewayClient>
  sandbox: SandboxOrchestrator
  jwt: ReturnType<typeof import('./lib/jwt.js').createJwtSigner>
}): BotRunner {
  const { cfg, agent, enc, conversation, imMessageTracker, gateway, sandbox, jwt } = deps
  const imConfigId = `im:${cfg.id}`
  let stopFn: (() => void) | null = null

  return {
    async start(): Promise<void> {
      if (stopFn !== null) throw new Error(`BotRunner for ${cfg.id} is already running`)
      const credentials = JSON.parse(enc.decrypt(cfg.credentialsEnc)) as Record<string, string>

      if (cfg.provider === 'telegram') {
        const { client, listen } = createTelegramClient(credentials.bot_token)
        const processor = createProcessor({ conversation, imMessageTracker, gateway, sandbox, im: client, jwt, agent })
        stopFn = listen(msg => processor.handle(msg), imConfigId)

      } else if (cfg.provider === 'feishu') {
        const tmpClient = new lark.Client({ appId: credentials.app_id, appSecret: credentials.app_secret })
        const botInfoResp = await (tmpClient as any).request({ method: 'GET', url: '/open-apis/bot/v3/info' }) as any
        const botOpenId: string = botInfoResp?.bot?.open_id ?? ''
        if (!botOpenId) throw new Error('Failed to fetch Feishu bot open_id — check app_id/app_secret and im:bot permission')
        logger.info({ event: 'feishu.bot_identity', config_id: cfg.id, bot_open_id: botOpenId })

        const { client, listen } = createFeishuClient(credentials.app_id, credentials.app_secret, botOpenId)
        const processor = createProcessor({ conversation, imMessageTracker, gateway, sandbox, im: client, jwt, agent })
        stopFn = await listen(msg => processor.handle(msg), imConfigId)

      } else {
        throw new Error(`Unsupported provider: ${cfg.provider}`)
      }

      logger.info({ event: 'dispatcher.bot_started', config_id: cfg.id, provider: cfg.provider, agent_id: agent.id })
    },

    stop(): void {
      if (!stopFn) return
      try {
        stopFn()
      } catch (err) {
        logger.warn({ event: 'dispatcher.bot_stop_error', config_id: cfg.id, error: String(err) })
      }
      stopFn = null
      logger.info({ event: 'dispatcher.bot_stopped', config_id: cfg.id })
    },
  }
}

import {
  AuthStorage,
  createAgentSession,
  type CreateAgentSessionOptions,
  ModelRegistry,
  SessionManager,
  type ToolDefinition,
} from '@mariozechner/pi-coding-agent'
import express, { type Application } from 'express'
import { join } from 'path'
import { createGatewayLlmProvider } from './gateway-llm-adapter.js'
import type { Model } from '@mariozechner/pi-ai'
import type { GatewayClient } from './gateway-client.js'
import type { ResolvedConfig, SandboxConfig } from './environment.js'
import { logger } from './logger.js'

export interface HarnessServerOptions {
  systemPrompt: string
  tools?: ToolDefinition[]
  skillDirs?: string[]
  config: ResolvedConfig
  gateway?: GatewayClient
}

// Note: /chat requests are processed serially by the pi agent session.
// Concurrent requests are not supported in MVP — the dispatcher ensures
// one request at a time per conversation (sandbox-per-conversation model).
export async function createHarnessApp(options: HarnessServerOptions): Promise<Application> {
  const { config, systemPrompt, tools = [], gateway } = options
  const app = express()
  app.use(express.json())

  // Register gateway LLM provider in sandbox mode
  if (config.mode === 'sandbox' && gateway) {
    const provider = createGatewayLlmProvider(config.gatewayUrl, config.sessionToken)
    try {
      const { registerApiProvider } = await import('@mariozechner/pi-ai')
      registerApiProvider(provider, 'aaas-gateway')
    } catch (e) {
      logger.warn({ event: 'harness.provider_register_failed', error: String(e) })
    }
  }

  // Resolve session directory
  const sessionDir = config.mode === 'sandbox'
    ? join((config as SandboxConfig).persistentRoot, 'conversation')
    : undefined

  // SessionManager: use continueRecent in sandbox, or inMemory in local dev
  const sessionManager = sessionDir
    ? SessionManager.continueRecent(process.cwd(), sessionDir)
    : SessionManager.inMemory()

  // In sandbox mode, construct a Model pointing to gateway-llm provider and a
  // ModelRegistry that knows the 'gateway' provider's API key (= sessionToken).
  // pi-coding-agent calls getApiKey(model.provider) before each LLM request;
  // without a registered key it throws "No API key found for gateway".
  let gatewayModel: Model<any> | undefined
  let modelRegistry: ModelRegistry | undefined
  if (config.mode === 'sandbox') {
    const sandboxConfig = config as SandboxConfig
    gatewayModel = {
      id: process.env.LLM_MODEL ?? 'glm-5.1',
      name: 'Gateway LLM',
      api: 'gateway-llm',
      provider: 'gateway',
      baseUrl: sandboxConfig.gatewayUrl,
      reasoning: false,
      input: ['text'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128000,
      maxTokens: 4096,
    }
    modelRegistry = new ModelRegistry(AuthStorage.inMemory(), undefined)
    modelRegistry.registerProvider('gateway', { apiKey: sandboxConfig.sessionToken })
  }

  const sessionOptions: CreateAgentSessionOptions = {
    sessionManager,
    customTools: tools,
    ...(gatewayModel && { model: gatewayModel }),
    ...(modelRegistry && { modelRegistry }),
  }

  const { session } = await createAgentSession(sessionOptions)
  let lastMessageId: string | null = null

  if (systemPrompt) {
    session.agent.setSystemPrompt(systemPrompt)
  }

  app.get('/health', (_req, res) => {
    res.json({ ok: true })
  })

  app.post('/chat', async (req, res) => {
    const { message } = req.body as { message?: string }
    if (!message) {
      res.status(400).json({ error: 'missing message' })
      return
    }

    let lastReply = ''

    try {
      await new Promise<void>((resolve, reject) => {
        const unsubscribe = session.subscribe((event: any) => {
          if (event.type === 'message_update') {
            const content = event.message?.content
            if (Array.isArray(content) && event.message?.role === 'assistant') {
              for (const block of content) {
                if (block.type === 'text' && block.text) {
                  lastReply = block.text
                }
              }
            }
          }
          if (event.type === 'agent_end') {
            unsubscribe()
            resolve()
          }
        })
        session.prompt(message).catch((err: unknown) => {
          unsubscribe()
          reject(err)
        })
      })
    } catch (err) {
      logger.error({ event: 'harness.agent_error', error: String(err) })
      res.status(500).json({ error: 'agent error' })
      return
    }

    // Fire-and-forget: persist assistant reply to gateway audit log in sandbox mode
    if (config.mode === 'sandbox' && gateway && lastReply) {
      gateway.appendMessages(lastMessageId, [{
        role: 'assistant',
        content: [{ type: 'text', text: lastReply }],
        source: 'sandbox',
      }]).then((result) => {
        lastMessageId = result.last_message_id
      }).catch((err) => logger.warn({ event: 'harness.append_messages_failed', error: String(err) }))
    }

    res.json({ reply: lastReply })
  })

  return app
}

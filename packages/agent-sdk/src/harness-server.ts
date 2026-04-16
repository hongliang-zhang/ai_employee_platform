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
export function createHarnessApp(options: HarnessServerOptions): Application {
  const { config, systemPrompt, tools = [], gateway } = options
  const app = express()
  app.use(express.json())

  // Session is initialized asynchronously after the server starts listening.
  // /health returns 200 immediately; /chat returns 503 until session is ready.
  let session: Awaited<ReturnType<typeof createAgentSession>>['session'] | null = null
  let lastMessageId: string | null = null

  // Kick off session init in the background — caller triggers this after listen()
  app.locals.initSession = async () => {
    const initStart = Date.now()

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

    const sessionDir = config.mode === 'sandbox'
      ? join((config as SandboxConfig).persistentRoot, 'conversation')
      : undefined

    const sessionManager = sessionDir
      ? SessionManager.continueRecent(process.cwd(), sessionDir)
      : SessionManager.inMemory()

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

    const result = await createAgentSession(sessionOptions)
    session = result.session

    if (systemPrompt) {
      session.agent.setSystemPrompt(systemPrompt)
    }

    logger.info({ event: 'agent.session_ready', duration_ms: Date.now() - initStart })
    app.locals.sessionReady = true
  }

  // /health is always 200 — dispatcher polls this to detect agent startup.
  // Returns OK as soon as the HTTP server is listening, before session init.
  app.get('/health', (_req, res) => {
    res.json({ ok: true })
  })

  app.post('/chat', async (req, res) => {
    // Return 503 if session or file sync init is still in progress
    if (app.locals.sessionInitError) {
      res.status(500).json({ error: 'agent init failed' })
      return
    }
    if (!app.locals.sessionReady || !app.locals.fileSyncReady) {
      res.status(503).json({ error: 'agent initializing' })
      return
    }

    const { message } = req.body as { message?: string }
    if (!message) {
      res.status(400).json({ error: 'missing message' })
      return
    }

    let lastReply = ''

    try {
      await new Promise<void>((resolve, reject) => {
        const unsubscribe = session!.subscribe((event: any) => {
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
        session!.prompt(message).catch((err: unknown) => {
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

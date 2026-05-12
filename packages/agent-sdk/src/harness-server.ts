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
import type { GatewayClient, PiContentBlock, SessionEvent } from './gateway-client.js'
import type { ResolvedConfig, SandboxConfig } from './environment.js'
import { logger } from './logger.js'

const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL_SERVER_ERROR: 500,
} as const

export interface HarnessServerOptions {
  systemPrompt: string
  tools?: ToolDefinition[]
  skillDirs?: string[]
  config: ResolvedConfig
  gateway?: GatewayClient
  /** Called by POST /shutdown (triggered by dispatcher before sandbox kill) to flush session files. */
  onShutdown?: () => Promise<void>
}

function isTextBlock(value: unknown): value is PiContentBlock {
  return typeof value === 'object' && value !== null && (value as any).type === 'text' && typeof (value as any).text === 'string'
}

function isPiContentBlock(value: unknown): value is PiContentBlock {
  if (isTextBlock(value)) return true
  if (typeof value !== 'object' || value === null) return false

  const block = value as any
  if (block.type === 'toolCall') {
    return typeof block.name === 'string' && typeof block.id === 'string' && 'input' in block
  }
  if (block.type === 'toolResult') {
    return typeof block.toolUseId === 'string'
      && Array.isArray(block.content)
      && block.content.every(isTextBlock)
  }
  return false
}

function asPiContentBlocks(value: unknown): PiContentBlock[] | null {
  return Array.isArray(value) && value.length > 0 && value.every(isPiContentBlock) ? value : null
}

// Extracts Pi-native session events from a turn_end event.
// turn_end carries: message (assistant, may contain toolCall blocks) + toolResults array.
function buildEventsFromTurn(event: any): SessionEvent[] {
  const events: SessionEvent[] = []
  const assistantContent = asPiContentBlocks(event.message?.content)
  if (assistantContent) {
    events.push({ role: 'assistant', content: assistantContent })
  } else if (event.message?.content !== undefined) {
    throw new Error('invalid assistant content in turn_end')
  }

  for (const tr of event.toolResults ?? []) {
    const toolResultContent = asPiContentBlocks(tr.content)
    if (toolResultContent) {
      events.push({ role: 'toolResult', content: toolResultContent })
    } else if (tr.content !== undefined) {
      throw new Error('invalid toolResult content in turn_end')
    }
  }
  return events
}

// Note: /chat requests are processed serially by the pi agent session.
// Concurrent requests are not supported in MVP — the dispatcher ensures
// one request at a time per conversation (sandbox-per-conversation model).
export function createHarnessApp(options: HarnessServerOptions): Application {
  const { config, systemPrompt, tools = [], gateway, onShutdown } = options
  const app = express()
  app.use(express.json())

  // Session is initialized asynchronously after the server starts listening.
  // While session or file sync is still initializing, /health and /chat return 503.
  // If session initialization fails, /chat returns 500 and /health remains unhealthy.
  let session: Awaited<ReturnType<typeof createAgentSession>>['session'] | null = null
  let lastEventId: string | null = null

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

    // Sync lastEventId from gateway so OCC is correct after sandbox restarts
    if (gateway) {
      try {
        const current = await gateway.listEvents()
        lastEventId = current.last_event_id
      } catch (err) {
        logger.warn({ event: 'harness.list_events_init_failed', error: String(err) })
      }
    }

    logger.info({ event: 'agent.session_ready', duration_ms: Date.now() - initStart })
    app.locals.sessionReady = true
  }

  app.get('/health', (_req, res) => {
    if (!app.locals.sessionReady || !app.locals.fileSyncReady) {
      res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({ ok: false, reason: 'agent initializing' })
      return
    }
    res.json({ ok: true })
  })

  app.post('/chat', async (req, res) => {
    // Return 503 if session or file sync init is still in progress
    if (app.locals.sessionInitError) {
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'agent init failed' })
      return
    }
    if (!app.locals.sessionReady || !app.locals.fileSyncReady) {
      res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({ error: 'agent initializing' })
      return
    }

    const { message } = req.body as { message?: string }
    if (!message) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'missing message' })
      return
    }

    // Write user message to gateway before starting agent loop
    if (config.mode === 'sandbox' && gateway) {
      try {
        const result = await gateway.emitEvents(lastEventId, [{
          role: 'user',
          content: [{ type: 'text', text: message }],
        }])
        lastEventId = result.last_event_id
      } catch (err) {
        logger.error({ event: 'harness.emit_user_message_failed', error: String(err) })
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'gateway write failed' })
        return
      }
    }

    let lastReply = ''

    try {
      await new Promise<void>((resolve, reject) => {
        // Chain turn_end emits sequentially to preserve OCC ordering
        let emitChain: Promise<void> = Promise.resolve()

        const unsubscribe = session!.subscribe((event: any) => {
          try {
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

            if (event.type === 'turn_end' && config.mode === 'sandbox' && gateway) {
              const eventsToEmit = buildEventsFromTurn(event)
              if (eventsToEmit.length > 0) {
                emitChain = emitChain.then(async () => {
                  const result = await gateway.emitEvents(lastEventId, eventsToEmit)
                  lastEventId = result.last_event_id
                }).catch(async (err) => {
                  logger.warn({ event: 'harness.emit_turn_failed', error: String(err) })
                  try {
                    const current = await gateway.listEvents()
                    lastEventId = current.last_event_id
                  } catch (syncErr) {
                    logger.warn({ event: 'harness.list_events_after_emit_failed', error: String(syncErr) })
                  }
                  throw err
                })
              }
            }

            if (event.type === 'agent_end') {
              unsubscribe()
              // Wait for any in-flight turn_end emits before resolving
              emitChain.then(resolve).catch(reject)
            }
          } catch (err) {
            unsubscribe()
            reject(err)
          }
        })

        session!.prompt(message).catch((err: unknown) => {
          unsubscribe()
          reject(err)
        })
      })
    } catch (err) {
      logger.error({ event: 'harness.agent_error', error: String(err) })
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'agent error' })
      return
    }

    res.json({ reply: lastReply })
  })

  // Dispatcher calls POST /shutdown after receiving the chat reply, before instance.kill().
  // This gives the agent a chance to flush session files to COS reliably, without
  // blocking the chat response. SIGTERM cannot be used because the agent runs as a
  // backgrounded process (nohup ... &) inside the e2b container and may not receive it.
  app.post('/shutdown', async (_req, res) => {
    if (onShutdown) {
      await onShutdown().catch((err) =>
        logger.warn({ event: 'harness.shutdown_flush_failed', error: String(err) })
      )
    }
    res.json({ ok: true })
  })

  return app
}

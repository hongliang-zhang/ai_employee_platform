import {
  createAgentSession,
  type CreateAgentSessionOptions,
  SessionManager,
  type ToolDefinition,
} from '@mariozechner/pi-coding-agent'
import express, { type Application } from 'express'
import { join } from 'path'
import { createGatewayLlmProvider } from './gateway-llm-adapter.js'
import type { GatewayClient } from './gateway-client.js'
import type { ResolvedConfig, SandboxConfig } from './environment.js'

export interface HarnessServerOptions {
  systemPrompt: string
  tools?: ToolDefinition[]
  skillDirs?: string[]
  config: ResolvedConfig
  gateway?: GatewayClient
}

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
      console.warn('[harness] could not register gateway LLM provider:', e)
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

  // In sandbox mode, construct a Model pointing to gateway-llm provider
  let gatewayModel: any | undefined
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
  }

  const sessionOptions: CreateAgentSessionOptions = {
    sessionManager,
    customTools: tools,
    ...(gatewayModel && { model: gatewayModel }),
  }

  const { session } = await createAgentSession(sessionOptions)

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

    await new Promise<void>((resolve) => {
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
      session.prompt(message)
    })

    // Fire-and-forget: persist assistant reply to gateway audit log in sandbox mode
    if (config.mode === 'sandbox' && gateway && lastReply) {
      gateway.appendMessages(null, [{
        role: 'assistant',
        content: [{ type: 'text', text: lastReply }],
        source: 'sandbox',
      }]).catch((err) => console.warn('[harness] appendMessages failed:', err))
    }

    res.json({ reply: lastReply })
  })

  return app
}

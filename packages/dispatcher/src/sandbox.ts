import { Sandbox } from '@e2b/code-interpreter'
import pino from 'pino'
import { retryWithBackoff } from './lib/utils.js'

const logger = pino({ transport: { target: 'pino-pretty' } })

const SANDBOX = {
  healthPollAttempts: 10,
  healthPollIntervalMs: 100,
  healthPollTimeoutMs: 500,
  agentStartTimeoutMs: 5_000,
  chatTimeoutMs: 120_000,
} as const

interface ChatParams {
  conversationId: string
  templateId: string
  port: number
  sessionToken: string
  message: string
  lastMessageId: string | null
  traceId: string
}

export interface SandboxOrchestrator {
  chat(params: ChatParams): Promise<string>
}

// Each chat() call spawns a fresh sandbox and destroys it when done.
// One sandbox per request keeps lifecycle simple and avoids stale-sandbox detection.
export function createSandboxOrchestrator(config: {
  e2bApiKey: string
  e2bDomain?: string  // omit to use the default e2b.app domain
  gatewayUrl: string
  instanceId: string
}) {
  // /health returns 503 until the agent session and file sync are both ready,
  // so a 200 here guarantees /chat is also ready.
  async function pollHealth(chatUrl: string): Promise<boolean> {
    for (let i = 0; i < SANDBOX.healthPollAttempts; i++) {
      try {
        const res = await fetch(`${chatUrl}/health`, { signal: AbortSignal.timeout(SANDBOX.healthPollTimeoutMs) })
        if (res.ok) return true
      } catch { /* not ready yet, retry */ }
      await new Promise(r => setTimeout(r, SANDBOX.healthPollIntervalMs))
    }
    return false
  }

  async function spawnSandbox(params: ChatParams): Promise<{ instance: Sandbox; chatUrl: string }> {
    const createStart = Date.now()
    const sandbox = await retryWithBackoff(() =>
      Sandbox.create(params.templateId, {
        apiKey: config.e2bApiKey,
        ...(config.e2bDomain && { domain: config.e2bDomain }),
        secure: false,  // port auth is disabled; the gateway session token is the auth boundary
      })
    )
    logger.info({ event: 'sandbox.created', conversation_id: params.conversationId, sandbox_id: sandbox.sandboxId, duration_ms: Date.now() - createStart })

    const envPrefix = `GATEWAY_URL=${config.gatewayUrl} SESSION_TOKEN=${params.sessionToken} SESSION_ID=${params.conversationId}`
    // nohup + & detaches the agent from the envd shell session so it outlives the command
    await sandbox.commands.run(
      `nohup bash -c '${envPrefix} node /app/dist/agent.js' > /tmp/agent.log 2>&1 &`,
      { timeoutMs: SANDBOX.agentStartTimeoutMs }
    )

    const chatUrl = `https://${params.port}-${sandbox.sandboxId}.${sandbox.sandboxDomain}`
    const ready = await pollHealth(chatUrl)
    if (!ready) {
      await sandbox.kill().catch(() => {})
      throw new Error('sandbox health check timed out')
    }
    logger.info({ event: 'sandbox.ready', conversation_id: params.conversationId, sandbox_id: sandbox.sandboxId, total_ms: Date.now() - createStart })

    return { instance: sandbox, chatUrl }
  }

  return {
    async chat(params: ChatParams): Promise<string> {
      const { instance, chatUrl } = await spawnSandbox(params)
      try {
        const chatStart = Date.now()
        const res = await fetch(`${chatUrl}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Trace-Id': params.traceId },
          body: JSON.stringify({ message: params.message, last_message_id: params.lastMessageId }),
          signal: AbortSignal.timeout(SANDBOX.chatTimeoutMs),
        })
        if (!res.ok) throw new Error(`sandbox returned ${res.status}`)
        logger.info({ event: 'sandbox.chat', trace_id: params.traceId, conversation_id: params.conversationId, duration_ms: Date.now() - chatStart })
        return ((await res.json()) as { reply: string }).reply
      } finally {
        // suppress kill errors so they don't mask the original chat error
        await instance.kill().catch(() => {})
      }
    },
  }
}

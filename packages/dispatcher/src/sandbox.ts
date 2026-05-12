import { Sandbox } from '@e2b/code-interpreter'
import pino from 'pino'
import { retryWithBackoff } from './lib/utils.js'

const logger = pino({ transport: { target: 'pino-pretty' } })

const SANDBOX = {
  // AGS cold starts usually expose the port within a few seconds, but allow a
  // larger startup budget for image pulls, slow scheduling, and first-time boot.
  healthPollAttempts: 45,
  healthPollIntervalMs: 1_000,
  healthPollTimeoutMs: 1_000,

  // commands.run only launches the detached agent process; it should return
  // quickly, but AGS envd can occasionally be slow to accept the command.
  agentStartTimeoutMs: 10_000,

  // Once /health is ready, /chat may still see a short AGS ingress propagation
  // window. Retry transient 503s for up to ~10s before surfacing failure.
  chatRetryAttempts: 10,
  chatRetryIntervalMs: 1_000,
  chatTimeoutMs: 120_000,

  // Budget for the agent to flush session files to COS before the sandbox is killed.
  shutdownTimeoutMs: 15_000,
} as const

interface ChatParams {
  conversationId: string
  templateId: string
  port: number
  sessionToken: string
  message: string
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

  async function shutdownAgent(chatUrl: string): Promise<void> {
    try {
      await fetch(`${chatUrl}/shutdown`, {
        method: 'POST',
        signal: AbortSignal.timeout(SANDBOX.shutdownTimeoutMs),
      })
    } catch (err) {
      logger.warn({ event: 'sandbox.shutdown_failed', error: String(err) })
    }
  }

  return {
    async chat(params: ChatParams): Promise<string> {
      const { instance, chatUrl } = await spawnSandbox(params)
      try {
        const chatStart = Date.now()
        for (let attempt = 1; attempt <= SANDBOX.chatRetryAttempts; attempt++) {
          const res = await fetch(`${chatUrl}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Trace-Id': params.traceId },
            body: JSON.stringify({ message: params.message }),
            signal: AbortSignal.timeout(SANDBOX.chatTimeoutMs),
          })
          if (res.ok) {
            logger.info({ event: 'sandbox.chat', trace_id: params.traceId, conversation_id: params.conversationId, duration_ms: Date.now() - chatStart })
            const reply = ((await res.json()) as { reply: string }).reply
            // Flush session files to COS before killing the sandbox. Must happen here
            // (not on SIGTERM) because the agent runs as a background process inside
            // the e2b container and may not receive the signal when instance.kill() fires.
            await shutdownAgent(chatUrl)
            return reply
          }
          if (res.status !== 503 || attempt === SANDBOX.chatRetryAttempts) {
            throw new Error(`sandbox returned ${res.status}`)
          }
          await new Promise(r => setTimeout(r, SANDBOX.chatRetryIntervalMs))
        }
        throw new Error('sandbox chat retry exhausted')
      } finally {
        // suppress kill errors so they don't mask the original chat error
        await instance.kill().catch(() => {})
      }
    },
  }
}

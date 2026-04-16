import { Sandbox } from '@e2b/code-interpreter'
import pino from 'pino'
import { retryWithBackoff } from './utils.js'

const logger = pino({ transport: { target: 'pino-pretty' } })

interface SandboxEntry {
  sandboxId: string
  instance: Sandbox
  chatUrl: string
}

export function createSandboxOrchestrator(config: {
  e2bApiKey: string
  gatewayUrl: string
  instanceId: string
}) {
  const sandboxMap = new Map<string, SandboxEntry>()
  const timerMap = new Map<string, NodeJS.Timeout>()

  async function pollHealth(chatUrl: string, maxAttempts = 150): Promise<boolean> {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const res = await fetch(`${chatUrl}/health`, { signal: AbortSignal.timeout(5_000) })
        if (res.ok) return true
      } catch { /* health check not ready yet, retry */ }
      await new Promise(r => setTimeout(r, 200))
    }
    return false
  }

  function resetIdleTimer(conversationId: string, idleTimeoutMs: number) {
    const existing = timerMap.get(conversationId)
    if (existing) clearTimeout(existing)
    const timer = setTimeout(async () => {
      const entry = sandboxMap.get(conversationId)
      if (entry) {
        await entry.instance.kill().catch(() => {})
        sandboxMap.delete(conversationId)
      }
      timerMap.delete(conversationId)
    }, idleTimeoutMs)
    timerMap.set(conversationId, timer)
  }

  return {
    async getOrCreate(
      conversationId: string,
      templateId: string,
      port: number,
      sessionToken: string,
      idleTimeoutMs: number
    ): Promise<SandboxEntry> {
      const existing = sandboxMap.get(conversationId)
      if (existing) {
        resetIdleTimer(conversationId, idleTimeoutMs)
        return existing
      }

      // e2b API can have transient failures — retry up to 3 times
      const createStart = Date.now()
      const sandbox = await retryWithBackoff(() =>
        Sandbox.create(templateId, { apiKey: config.e2bApiKey })
      )
      const createMs = Date.now() - createStart
      logger.info({ event: 'sandbox.created', conversation_id: conversationId, sandbox_id: sandbox.sandboxId, duration_ms: createMs })

      const envPrefix = `GATEWAY_URL=${config.gatewayUrl} SESSION_TOKEN=${sessionToken} SESSION_ID=${conversationId}`

      // Start Node.js agent (SDK handles file sync init, watch, and HTTP server internally)
      const agentStart = Date.now()
      await sandbox.commands.run(
        `nohup bash -c '${envPrefix} node /app/dist/agent.js' > /tmp/agent.log 2>&1 &`,
        { timeoutMs: 10000 }
      )
      logger.info({ event: 'sandbox.agent_started', conversation_id: conversationId, sandbox_id: sandbox.sandboxId, duration_ms: Date.now() - agentStart })

      const chatUrl = `https://8080-${sandbox.sandboxId}.${sandbox.sandboxDomain}`
      const healthStart = Date.now()
      const ready = await pollHealth(chatUrl)
      if (!ready) {
        await sandbox.kill().catch(() => {})
        throw new Error('sandbox health check timed out')
      }
      logger.info({ event: 'sandbox.ready', conversation_id: conversationId, sandbox_id: sandbox.sandboxId, health_ms: Date.now() - healthStart, total_ms: Date.now() - createStart })

      const entry: SandboxEntry = { sandboxId: sandbox.sandboxId, instance: sandbox, chatUrl }
      sandboxMap.set(conversationId, entry)
      resetIdleTimer(conversationId, idleTimeoutMs)
      return entry
    },

    async destroy(conversationId: string): Promise<void> {
      const entry = sandboxMap.get(conversationId)
      if (entry) {
        await entry.instance.kill().catch(() => {})
        sandboxMap.delete(conversationId)
      }
      const timer = timerMap.get(conversationId)
      if (timer) {
        clearTimeout(timer)
        timerMap.delete(conversationId)
      }
    },
  }
}

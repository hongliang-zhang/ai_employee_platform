import { Sandbox } from '@e2b/code-interpreter'
import { retryWithBackoff } from './utils.js'

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

  async function pollHealth(chatUrl: string, maxAttempts = 30): Promise<boolean> {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const res = await fetch(`${chatUrl}/health`, { signal: AbortSignal.timeout(5_000) })
        if (res.ok) return true
      } catch {}
      await new Promise(r => setTimeout(r, 1000))
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
      const sandbox = await retryWithBackoff(() =>
        Sandbox.create(templateId, { apiKey: config.e2bApiKey })
      )

      // Start Flask app with env vars via nohup — e2b start command does not receive envs
      const startCmd = `nohup bash -c 'GATEWAY_URL=${config.gatewayUrl} SESSION_TOKEN=${sessionToken} SESSION_ID=${conversationId} python /app/app.py' > /tmp/flask.log 2>&1 &`
      await sandbox.commands.run(startCmd, { timeoutMs: 10000 })

      const chatUrl = `https://8080-${sandbox.sandboxId}.${sandbox.sandboxDomain}`
      const ready = await pollHealth(chatUrl)
      if (!ready) {
        await sandbox.kill().catch(() => {})
        throw new Error('sandbox health check timed out')
      }

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

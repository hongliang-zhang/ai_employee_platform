import { createServer } from 'http'
import type { ToolDefinition } from '@mariozechner/pi-coding-agent'
import { resolveConfig } from './environment.js'
import { FileSync } from './file-sync.js'
import { GatewayClient } from './gateway-client.js'
import { createHarnessApp } from './harness-server.js'
import { logger } from './logger.js'

export interface CreateAgentOptions {
  /** System prompt for the agent */
  systemPrompt?: string
  /** Custom tools to register */
  tools?: ToolDefinition[]
  /** Directories to load skills from */
  skillDirs?: string[]
}

export async function createAgent(options: CreateAgentOptions = {}): Promise<void> {
  const { systemPrompt = 'You are a helpful assistant.', tools, skillDirs } = options
  const config = resolveConfig()

  let gateway: GatewayClient | undefined
  let fileSync: FileSync | undefined

  if (config.mode === 'sandbox') {
    gateway = new GatewayClient(config.gatewayUrl, config.sessionToken)
    fileSync = new FileSync(gateway, config.persistentRoot)
  } else {
    logger.info({ event: 'agent.start', mode: 'local' })
  }

  // Build the express app synchronously (no async init yet — just mounts routes).
  // /health is available as soon as server.listen() is called.
  const app = createHarnessApp({
    systemPrompt,
    tools,
    skillDirs,
    config,
    gateway,
    onShutdown: fileSync ? () => fileSync!.flush() : undefined,
  })

  // Mark flags as false so /chat returns 503 until both are ready
  app.locals.sessionReady = false
  app.locals.fileSyncReady = config.mode !== 'sandbox' // local: no file sync needed

  const server = createServer(app)

  await new Promise<void>((resolve) => server.listen(config.port, () => {
    logger.info({ event: 'agent.listening', port: config.port, mode: config.mode })
    resolve()
  }))

  // In sandbox mode, file sync must complete before session init so that
  // existing session history is downloaded from COS before SessionManager
  // looks for it. Running them concurrently would cause SessionManager to
  // find an empty conversation/ dir and start a fresh session every time.
  const fileSyncPromise = fileSync
    ? (() => {
        const initStart = Date.now()
        logger.info({ event: 'agent.file_sync_init', mode: 'sandbox' })
        return fileSync!.init()
          .then(() => {
            fileSync!.startWatch()
            logger.info({ event: 'agent.file_sync_started', duration_ms: Date.now() - initStart })
          })
          .catch((err) => {
            logger.error({ event: 'agent.file_sync_failed', error: String(err) })
          })
          .finally(() => { app.locals.fileSyncReady = true })
      })()
    : Promise.resolve()

  // Session init runs after file sync (files must be present before SessionManager looks for them).
  // While either is still initializing, /health and /chat return 503.
  // If session initialization fails, /chat returns 500 and /health remains unhealthy.
  fileSyncPromise
    .then(() => app.locals.initSession())
    .catch((err: unknown) => {
      logger.error({ event: 'agent.session_init_failed', error: String(err) })
      app.locals.sessionInitError = String(err)
    })

}

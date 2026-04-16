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

    logger.info({ event: 'agent.file_sync_init', mode: 'sandbox' })
    await fileSync.init()
    fileSync.startWatch()
    logger.info({ event: 'agent.file_sync_started' })
  } else {
    logger.info({ event: 'agent.start', mode: 'local' })
  }

  const app = await createHarnessApp({ systemPrompt, tools, skillDirs, config, gateway })

  const server = createServer(app)
  server.listen(config.port, () => {
    logger.info({ event: 'agent.listening', port: config.port, mode: config.mode })
  })

  // Graceful shutdown
  process.on('SIGTERM', () => {
    fileSync?.stopWatch()
    server.close(() => process.exit(0))
  })
}

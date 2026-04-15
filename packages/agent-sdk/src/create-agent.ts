import { createServer } from 'http'
import type { ToolDefinition } from '@mariozechner/pi-coding-agent'
import { resolveConfig } from './environment.js'
import { FileSync } from './file-sync.js'
import { GatewayClient } from './gateway-client.js'
import { createHarnessApp } from './harness-server.js'

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

    console.log('[agent-sdk] Sandbox mode: initializing file sync...')
    await fileSync.init()
    fileSync.startWatch()
    console.log('[agent-sdk] File sync started.')
  } else {
    console.log('[agent-sdk] Local mode: skipping file sync.')
  }

  const app = await createHarnessApp({ systemPrompt, tools, skillDirs, config, gateway })

  const server = createServer(app)
  server.listen(config.port, () => {
    console.log(`[agent-sdk] Agent listening on port ${config.port} (${config.mode} mode)`)
  })

  // Graceful shutdown
  process.on('SIGTERM', () => {
    fileSync?.stopWatch()
    server.close(() => process.exit(0))
  })
}

import { logger } from './logger.js'

export type Environment = 'sandbox' | 'local'

export interface SandboxConfig {
  mode: 'sandbox'
  gatewayUrl: string
  sessionToken: string
  sessionId: string
  port: number
  persistentRoot: string
}

export interface LocalConfig {
  mode: 'local'
  port: number
}

export type ResolvedConfig = SandboxConfig | LocalConfig

export function detectEnvironment(): Environment {
  const hasGateway = Boolean(process.env.GATEWAY_URL)
  const hasToken = Boolean(process.env.SESSION_TOKEN)
  return hasGateway && hasToken ? 'sandbox' : 'local'
}

export function resolveConfig(): ResolvedConfig {
  const port = parseInt(process.env.PORT ?? '8080', 10)

  if (detectEnvironment() === 'sandbox') {
    const gatewayUrl = process.env.GATEWAY_URL!.replace(/\/$/, '')
    const sessionToken = process.env.SESSION_TOKEN!
    const sessionId = process.env.SESSION_ID ?? ''
    if (!sessionId) {
      logger.warn({ event: 'env.session_id_missing' }, 'SESSION_ID is not set — gateway audit writes may fail')
    }
    const persistentRoot = process.env.PERSISTENT_ROOT ?? '/persistent'
    return { mode: 'sandbox', gatewayUrl, sessionToken, sessionId, port, persistentRoot }
  }

  return { mode: 'local', port }
}

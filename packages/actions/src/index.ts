import express, { Request, Response, NextFunction } from 'express'
import pino from 'pino'
import { registry } from './registry.js'

export const logger = pino({ transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined })

const PORT = parseInt(process.env.PORT ?? '3002')
const ACTIONS_INTERNAL_KEY = process.env.ACTIONS_INTERNAL_KEY
if (!ACTIONS_INTERNAL_KEY) {
  logger.error('ACTIONS_INTERNAL_KEY is not set — refusing to start')
  process.exit(1)
}

const app = express()
app.use(express.json())

function internalKeyMiddleware(req: Request, res: Response, next: NextFunction): void {
  const key = req.headers['x-internal-key']
  if (key !== ACTIONS_INTERNAL_KEY) {
    res.status(401).json({ error: { code: 'unauthorized', message: 'Invalid or missing X-Internal-Key', retryable: false, details: {} } })
    return
  }
  next()
}

app.get('/actions/list', internalKeyMiddleware, (_req, res) => {
  const actions = Array.from(registry.values()).map(({ name, description, inputSchema }) => ({
    name,
    description,
    inputSchema,
  }))
  res.json(actions)
})

app.post('/actions/invoke', internalKeyMiddleware, async (req, res) => {
  const { action, input, agentId, conversationId } = req.body as {
    action: string
    input: unknown
    agentId: string
    conversationId: string
  }

  const actionDef = registry.get(action)
  if (!actionDef) {
    res.status(400).json({ error: { code: 'action_not_found', message: `Unknown action: ${action}`, retryable: false, details: {} } })
    return
  }

  const required = actionDef.inputSchema.required ?? []
  const inputObj = input as Record<string, unknown>
  for (const field of required) {
    if (inputObj == null || !(field in inputObj)) {
      res.status(400).json({ error: { code: 'action_input_invalid', message: `Missing required field: ${field}`, retryable: false, details: {} } })
      return
    }
  }

  const start = Date.now()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 25_000)

  try {
    const resultPromise = actionDef.execute(input, { agentId, conversationId })
    const result = await Promise.race([
      resultPromise,
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener('abort', () => reject(new Error('timeout')))
      }),
    ])
    clearTimeout(timeout)
    const duration_ms = Date.now() - start
    logger.info({ event: 'action.success', action, agent_id: agentId, conversation_id: conversationId, duration_ms })
    res.json({ result })
  } catch (err: unknown) {
    clearTimeout(timeout)
    const duration_ms = Date.now() - start
    const isTimeout = err instanceof Error && err.message === 'timeout'
    if (isTimeout) {
      const error_code = 'action_timeout'
      logger.error({ event: 'action.failed', action, agent_id: agentId, conversation_id: conversationId, duration_ms, error_code, error: err })
      res.status(504).json({ error: { code: error_code, message: 'Action timed out after 25 seconds', retryable: true, details: {} } })
    } else {
      const error_code = 'action_execution_failed'
      logger.error({ event: 'action.failed', action, agent_id: agentId, conversation_id: conversationId, duration_ms, error_code, error: err })
      res.status(502).json({ error: { code: error_code, message: err instanceof Error ? err.message : 'Action execution failed', retryable: true, details: {} } })
    }
  }
})

if (process.env.VITEST === undefined) {
  app.listen(PORT, () => logger.info({ port: PORT }, 'actions started'))
}

export default app

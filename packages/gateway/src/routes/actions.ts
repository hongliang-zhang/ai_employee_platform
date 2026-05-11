import { Router } from 'express'
import { logger } from '../index.js'

export function createActionsRouter(actionsUrl: string, internalKey: string) {
  const router = Router()

  router.get('/list', async (req, res) => {
    const { caller, agent_id, conversation_id } = req.jwtPayload

    if (caller !== 'sandbox') {
      res.status(403).json({ error: { code: 'forbidden', message: 'only sandbox tokens can access actions', retryable: false, details: {} } })
      return
    }

    logger.info({ event: 'actions.list', agent_id, conversation_id })

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 30_000)

    try {
      const upstream = await fetch(`${actionsUrl}/actions/list`, {
        method: 'GET',
        headers: { 'X-Internal-Key': internalKey },
        signal: controller.signal,
      })
      clearTimeout(timer)
      res.status(upstream.status).json(await upstream.json())
    } catch (err: any) {
      clearTimeout(timer)
      const event = err.name === 'AbortError' ? 'actions.list.timeout' : 'actions.list.error'
      logger.error({ event, agent_id, conversation_id, err: String(err) })
      res.status(502).json({ error: { code: 'action_execution_failed', message: 'actions service unavailable', retryable: true, details: {} } })
    }
  })

  router.post('/invoke', async (req, res) => {
    const { caller, agent_id, conversation_id } = req.jwtPayload

    if (caller !== 'sandbox') {
      res.status(403).json({ error: { code: 'forbidden', message: 'only sandbox tokens can access actions', retryable: false, details: {} } })
      return
    }

    const { action, input } = req.body

    if (!action || input === undefined || input === null) {
      res.status(400).json({ error: { code: 'invalid_request', message: 'action and input are required', retryable: false, details: {} } })
      return
    }

    logger.info({ event: 'actions.invoke', action, agent_id, conversation_id })

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 30_000)

    try {
      const upstream = await fetch(`${actionsUrl}/actions/invoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Internal-Key': internalKey },
        body: JSON.stringify({ action, input, agentId: agent_id, conversationId: conversation_id }),
        signal: controller.signal,
      })
      clearTimeout(timer)
      res.status(upstream.status).json(await upstream.json())
    } catch (err: any) {
      clearTimeout(timer)
      if (err.name === 'AbortError') {
        logger.error({ event: 'actions.invoke.timeout', action, agent_id, conversation_id })
        res.status(504).json({ error: { code: 'action_timeout', message: 'actions service timed out', retryable: true, details: {} } })
      } else {
        logger.error({ event: 'actions.invoke.error', action, agent_id, conversation_id, err: String(err) })
        res.status(502).json({ error: { code: 'action_execution_failed', message: 'actions service unreachable', retryable: true, details: {} } })
      }
    }
  })

  return router
}

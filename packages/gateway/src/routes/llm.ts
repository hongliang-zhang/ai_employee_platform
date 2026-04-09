import { Router } from 'express'
import { logger } from '../index.js'

const LLM_API_URL = process.env.LLM_API_URL ?? 'https://api.z.ai/api/coding/paas/v4/chat/completions'
const ALLOWED_MODELS = ['glm-5.1']

export function createLlmRouter(apiKey: string) {
  const router = Router()

  router.post('/', async (req, res) => {
    const { conversation_id, agent_id } = req.jwtPayload
    const { model, messages, tools, tool_choice } = req.body

    if (!ALLOWED_MODELS.includes(model)) {
      res.status(400).json({ error: { code: 'invalid_request', message: `model '${model}' not allowed`, retryable: false, details: {} } })
      return
    }

    const start = Date.now()
    logger.info({ event: 'llm.request', model, conversation_id, agent_id })

    try {
      const upstream = await fetch(LLM_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages, ...(tools ? { tools } : {}), ...(tool_choice ? { tool_choice } : {}) }),
      })

      if (!upstream.ok) {
        const body = await upstream.json().catch(() => ({}))
        logger.error({ event: 'llm.error', status: upstream.status, conversation_id })
        res.status(502).json({ error: { code: 'provider_error', message: body?.error?.message ?? 'upstream error', retryable: upstream.status === 429, details: {} } })
        return
      }

      const data: any = await upstream.json()
      const msg = data.choices[0].message
      const usage = data.usage

      logger.info({ event: 'llm.response', model, conversation_id, duration_ms: Date.now() - start, input_tokens: usage.prompt_tokens, output_tokens: usage.completion_tokens })

      res.json({
        message: { role: msg.role, content: typeof msg.content === 'string' ? [{ type: 'text', text: msg.content }] : msg.content, tool_calls: msg.tool_calls ?? [] },
        usage: { input_tokens: usage.prompt_tokens, output_tokens: usage.completion_tokens, total_tokens: usage.total_tokens },
      })
    } catch (err) {
      res.status(500).json({ error: { code: 'internal_error', message: String(err), retryable: true, details: {} } })
    }
  })

  return router
}

import { Router } from 'express'
import { createId } from '@paralleldrive/cuid2'
import type { Db } from '../db.js'

export function createMessagesRouter(db: Db) {
  const router = Router()

  router.post('/load', async (req, res) => {
    const { conversation_id } = req.jwtPayload
    const { after_message_id } = req.body ?? {}
    try {
      let rows
      if (after_message_id) {
        const anchor = await db.message.findUnique({
          where: { id: after_message_id },
          select: { createdAt: true },
        })
        if (!anchor) {
          res.status(404).json({ error: { code: 'not_found', message: 'after_message_id not found', retryable: false, details: {} } })
          return
        }
        rows = await db.message.findMany({
          where: { conversationId: conversation_id, createdAt: { gt: anchor.createdAt } },
          orderBy: { createdAt: 'asc' },
        })
      } else {
        rows = await db.message.findMany({
          where: { conversationId: conversation_id },
          orderBy: { createdAt: 'asc' },
        })
      }

      const formatted = rows.map(r => ({
        id: r.id,
        role: r.role,
        content: r.contentJson,
        source: r.source,
        message_id: r.messageId,
        metadata: r.metadataJson,
        created_at: r.createdAt,
      }))
      const last = formatted.length > 0 ? formatted[formatted.length - 1].id : null
      res.json({ conversation_id, messages: formatted, last_message_id: last })
    } catch (err) {
      res.status(500).json({ error: { code: 'internal_error', message: String(err), retryable: true, details: {} } })
    }
  })

  router.post('/append', async (req, res) => {
    const { conversation_id, caller } = req.jwtPayload
    const { expected_last_message_id, messages } = req.body

    // Validate caller/source alignment
    const allowedSource = caller === 'dispatcher' ? 'im' : 'sandbox'
    for (const m of messages) {
      if (m.source !== allowedSource) {
        res.status(400).json({ error: { code: 'invalid_request', message: `caller '${caller}' must use source '${allowedSource}'`, retryable: false, details: {} } })
        return
      }
    }

    try {
      // Check current head
      const head = await db.message.findFirst({
        where: { conversationId: conversation_id },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      })
      const actualHead = head?.id ?? null

      if (actualHead !== (expected_last_message_id ?? null)) {
        res.status(409).json({
          error: {
            code: 'stale_write',
            message: 'expected_last_message_id does not match current history head',
            retryable: false,
            details: { actual_last_message_id: actualHead },
          },
        })
        return
      }

      // Insert messages sequentially to preserve order
      const now = new Date()
      const inserted = []
      for (const m of messages) {
        const id = 'msg_' + createId()
        await db.message.create({
          data: {
            id,
            conversationId: conversation_id,
            role: m.role,
            contentJson: m.content,
            source: m.source,
            messageId: m.message_id ?? null,
            metadataJson: m.metadata ?? {},
            createdAt: new Date(now),
          },
        })
        inserted.push({ id, role: m.role, created_at: now.toISOString() })
        now.setMilliseconds(now.getMilliseconds() + 1)
      }

      const lastId = inserted[inserted.length - 1].id
      res.json({ conversation_id, appended: inserted, last_message_id: lastId })
    } catch (err) {
      res.status(500).json({ error: { code: 'internal_error', message: String(err), retryable: true, details: {} } })
    }
  })

  return router
}

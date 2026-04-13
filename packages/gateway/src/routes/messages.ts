import { Router } from 'express'
import { createId } from '@paralleldrive/cuid2'
import type { Db } from '../db.js'

export function createMessagesRouter(db: Db) {
  const router = Router()

  router.post('/load', async (req, res) => {
    const { conversation_id } = req.jwtPayload
    const { after_message_id } = req.body ?? {}
    try {
      const rows = after_message_id
        ? await db`
            SELECT id, role, content_json as content, source, external_message_id, metadata_json as metadata, created_at
            FROM messages
            WHERE conversation_id = ${conversation_id}
              AND created_at > (SELECT created_at FROM messages WHERE id = ${after_message_id})
            ORDER BY created_at ASC`
        : await db`
            SELECT id, role, content_json as content, source, external_message_id, metadata_json as metadata, created_at
            FROM messages
            WHERE conversation_id = ${conversation_id}
            ORDER BY created_at ASC`

      const last = rows.length > 0 ? rows[rows.length - 1].id : null
      res.json({ conversation_id, messages: rows, last_message_id: last })
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
      const [head] = await db`
        SELECT id FROM messages
        WHERE conversation_id = ${conversation_id}
        ORDER BY created_at DESC
        LIMIT 1`
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

      // Insert messages
      const now = new Date()
      const inserted = []
      for (const m of messages) {
        const id = 'msg_' + createId()
        await db`
          INSERT INTO messages (id, conversation_id, role, content_json, source, external_message_id, metadata_json, created_at)
          VALUES (${id}, ${conversation_id}, ${m.role}, ${db.json(m.content)}, ${m.source}, ${m.external_message_id ?? null}, ${db.json(m.metadata ?? {})}, ${now})`
        inserted.push({ id, role: m.role, created_at: now.toISOString() })
        // Advance timestamp to preserve insert order
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

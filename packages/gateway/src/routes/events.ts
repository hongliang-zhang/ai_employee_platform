import { Router } from 'express'
import type { Db } from '../db.js'

class StaleWriteError extends Error {
  constructor(public actualHead: string | null) {
    super('expected_last_event_id does not match current head')
  }
}

export function createEventsRouter(db: Db) {
  const router = Router()

  router.post('/list', async (req, res) => {
    const { conversation_id } = req.jwtPayload
    const { after_event_id } = req.body ?? {}

    try {
      const rows = await db.sessionEvent.findMany({
        where: {
          conversationId: conversation_id,
          ...(after_event_id ? { seq: { gt: BigInt(after_event_id) } } : {}),
        },
        orderBy: { seq: 'asc' },
      })

      const events = rows.map(r => ({
        seq: r.seq.toString(),
        role: r.role,
        content: r.contentJson,
        created_at: r.createdAt,
      }))
      const lastEventId = rows.length > 0 ? rows[rows.length - 1].seq.toString() : null
      res.json({ conversation_id, events, last_event_id: lastEventId })
    } catch (err) {
      res.status(500).json({ error: { code: 'internal_error', message: String(err), retryable: true, details: {} } })
    }
  })

  router.post('/emit', async (req, res) => {
    const { conversation_id, caller } = req.jwtPayload

    if (caller !== 'sandbox') {
      res.status(400).json({ error: { code: 'invalid_request', message: `caller '${caller}' is not allowed to emit events`, retryable: false, details: {} } })
      return
    }

    const { expected_last_event_id, events } = req.body

    const VALID_ROLES = new Set(['user', 'assistant', 'toolResult'])
    if (!Array.isArray(events) || events.length === 0) {
      res.status(400).json({ error: { code: 'invalid_request', message: 'events must be a non-empty array', retryable: false, details: {} } })
      return
    }
    const invalidRole = events.find((e: any) => !VALID_ROLES.has(e?.role))
    if (invalidRole !== undefined) {
      res.status(400).json({ error: { code: 'invalid_request', message: `invalid role: ${(invalidRole as any)?.role}`, retryable: false, details: {} } })
      return
    }

    try {
      const result = await db.$transaction(async (tx) => {
        // FOR UPDATE serializes concurrent emits to the same conversation.
        // When no rows exist the lock is on a gap; in practice this is safe because
        // the sandbox-per-conversation model guarantees a single writer per conversation.
        // A race between two writers on an empty conversation would produce a PK conflict
        // (500) rather than a stale_write (409) — acceptable given the architectural guarantee.
        const [head] = await tx.$queryRaw<{ seq: bigint }[]>`
          SELECT seq
          FROM session_events
          WHERE conversation_id = ${conversation_id}
          ORDER BY seq DESC
          LIMIT 1
          FOR UPDATE
        `
        const actualHead = head ? head.seq.toString() : null

        if (actualHead !== (expected_last_event_id ?? null)) {
          throw new StaleWriteError(actualHead)
        }

        const firstSeq = (head?.seq ?? 0n) + 1n
        const rows = []
        for (let i = 0; i < events.length; i++) {
          const e = events[i]
          const row = await tx.sessionEvent.create({
            data: {
              seq: firstSeq + BigInt(i),
              conversationId: conversation_id,
              role: e.role,
              contentJson: e.content,
            },
          })
          rows.push({ seq: row.seq.toString(), role: row.role, created_at: row.createdAt.toISOString() })
        }

        return { inserted: rows, lastEventId: rows[rows.length - 1].seq }
      })

      res.json({ conversation_id, appended: result.inserted, last_event_id: result.lastEventId })
    } catch (err) {
      if (err instanceof StaleWriteError) {
        res.status(409).json({
          error: {
            code: 'stale_write',
            message: err.message,
            retryable: false,
            details: { actual_last_event_id: err.actualHead },
          },
        })
        return
      }
      res.status(500).json({ error: { code: 'internal_error', message: String(err), retryable: true, details: {} } })
    }
  })

  return router
}

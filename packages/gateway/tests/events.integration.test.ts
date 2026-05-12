import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { createPrismaClient } from '@aaas/db'
import app from '../src/index.js'

const SECRET = process.env.JWT_SECRET ?? 'test-secret-32-chars-minimum-len'
const DB_URL = process.env.DATABASE_URL ?? 'mysql://aaas:aaas@localhost:4000/aaas'

const prisma = createPrismaClient(DB_URL)

function sandboxToken(convId: string, agentId: string) {
  return jwt.sign({ conversation_id: convId, agent_id: agentId, caller: 'sandbox' }, SECRET, { expiresIn: '24h' })
}
function dispatcherToken(convId: string, agentId: string) {
  return jwt.sign({ conversation_id: convId, agent_id: agentId, caller: 'dispatcher' }, SECRET, { expiresIn: '60s' })
}

const AGENT_ID = 'agt_evt_test01'
const CONV_ID  = 'conv_evt_test01'
const OTHER_CONV_ID = 'conv_evt_test02'
const CFG_ID   = 'cfg_evt_test01'

beforeAll(async () => {
  await prisma.agent.upsert({
    where: { id: AGENT_ID },
    create: { id: AGENT_ID, name: 'test', status: 'active', e2bTemplateId: 'tpl_x' },
    update: {},
  })
  await prisma.conversation.upsert({
    where: { id: CONV_ID },
    create: { id: CONV_ID, agentId: AGENT_ID, imConfigId: `im:${CFG_ID}`, chatId: '999' },
    update: {},
  })
  await prisma.conversation.upsert({
    where: { id: OTHER_CONV_ID },
    create: { id: OTHER_CONV_ID, agentId: AGENT_ID, imConfigId: `im:${CFG_ID}`, chatId: '1000' },
    update: {},
  })
})

afterAll(async () => {
  await prisma.sessionEvent.deleteMany({ where: { conversationId: { in: [CONV_ID, OTHER_CONV_ID] } } })
  await prisma.conversation.deleteMany({ where: { id: { in: [CONV_ID, OTHER_CONV_ID] } } })
  await prisma.agent.deleteMany({ where: { id: AGENT_ID } })
  await prisma.$disconnect()
})

beforeEach(async () => {
  await prisma.sessionEvent.deleteMany({ where: { conversationId: { in: [CONV_ID, OTHER_CONV_ID] } } })
})

describe('POST /gateway/events/list', () => {
  it('returns empty list for new conversation', async () => {
    const res = await request(app)
      .post('/gateway/events/list')
      .set('Authorization', `Bearer ${sandboxToken(CONV_ID, AGENT_ID)}`)
      .send({})
    expect(res.status).toBe(200)
    expect(res.body.events).toEqual([])
    expect(res.body.last_event_id).toBeNull()
  })

  it('returns events in seq order', async () => {
    await prisma.sessionEvent.create({
      data: { seq: 1n, conversationId: CONV_ID, role: 'user', contentJson: [{ type: 'text', text: 'hello' }] },
    })
    await prisma.sessionEvent.create({
      data: { seq: 2n, conversationId: CONV_ID, role: 'assistant', contentJson: [{ type: 'text', text: 'hi' }] },
    })
    const res = await request(app)
      .post('/gateway/events/list')
      .set('Authorization', `Bearer ${sandboxToken(CONV_ID, AGENT_ID)}`)
      .send({})
    expect(res.status).toBe(200)
    expect(res.body.events).toHaveLength(2)
    expect(res.body.events[0].role).toBe('user')
    expect(res.body.events[1].role).toBe('assistant')
    expect(Number(res.body.last_event_id)).toBeGreaterThan(0)
  })

  it('returns only events after after_event_id', async () => {
    const first = await prisma.sessionEvent.create({
      data: { seq: 1n, conversationId: CONV_ID, role: 'user', contentJson: [{ type: 'text', text: 'msg1' }] },
    })
    await prisma.sessionEvent.create({
      data: { seq: 2n, conversationId: CONV_ID, role: 'assistant', contentJson: [{ type: 'text', text: 'msg2' }] },
    })
    const res = await request(app)
      .post('/gateway/events/list')
      .set('Authorization', `Bearer ${sandboxToken(CONV_ID, AGENT_ID)}`)
      .send({ after_event_id: first.seq.toString() })
    expect(res.status).toBe(200)
    expect(res.body.events).toHaveLength(1)
    expect(res.body.events[0].role).toBe('assistant')
  })
})

describe('POST /gateway/events/emit', () => {
  it('appends events with null expected_last_event_id for empty history', async () => {
    const res = await request(app)
      .post('/gateway/events/emit')
      .set('Authorization', `Bearer ${sandboxToken(CONV_ID, AGENT_ID)}`)
      .send({
        expected_last_event_id: null,
        events: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
      })
    expect(res.status).toBe(200)
    expect(res.body.appended).toHaveLength(1)
    expect(res.body.appended[0].role).toBe('user')
    expect(res.body.appended[0].seq).toBe('1')
    expect(res.body.last_event_id).toBe('1')
  })

  it('returns 409 on stale_write when expected_last_event_id does not match head', async () => {
    await prisma.sessionEvent.create({
      data: { seq: 1n, conversationId: CONV_ID, role: 'user', contentJson: [{ type: 'text', text: 'hi' }] },
    })
    const res = await request(app)
      .post('/gateway/events/emit')
      .set('Authorization', `Bearer ${sandboxToken(CONV_ID, AGENT_ID)}`)
      .send({
        expected_last_event_id: '99999',
        events: [{ role: 'assistant', content: [{ type: 'text', text: 'hey' }] }],
      })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('stale_write')
    expect(res.body.error.details.actual_last_event_id).toBeTruthy()
  })

  it('allocates seq independently per conversation', async () => {
    const first = await request(app)
      .post('/gateway/events/emit')
      .set('Authorization', `Bearer ${sandboxToken(CONV_ID, AGENT_ID)}`)
      .send({
        expected_last_event_id: null,
        events: [{ role: 'user', content: [{ type: 'text', text: 'first conversation' }] }],
      })
    expect(first.status).toBe(200)
    expect(first.body.last_event_id).toBe('1')

    const second = await request(app)
      .post('/gateway/events/emit')
      .set('Authorization', `Bearer ${sandboxToken(OTHER_CONV_ID, AGENT_ID)}`)
      .send({
        expected_last_event_id: null,
        events: [{ role: 'user', content: [{ type: 'text', text: 'second conversation' }] }],
      })
    expect(second.status).toBe(200)
    expect(second.body.last_event_id).toBe('1')
  })

  it('returns 400 when events is missing', async () => {
    const res = await request(app)
      .post('/gateway/events/emit')
      .set('Authorization', `Bearer ${sandboxToken(CONV_ID, AGENT_ID)}`)
      .send({ expected_last_event_id: null })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('invalid_request')
  })

  it('returns 400 when events is an empty array', async () => {
    const res = await request(app)
      .post('/gateway/events/emit')
      .set('Authorization', `Bearer ${sandboxToken(CONV_ID, AGENT_ID)}`)
      .send({ expected_last_event_id: null, events: [] })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('invalid_request')
  })

  it('returns 400 when an event has an invalid role', async () => {
    const res = await request(app)
      .post('/gateway/events/emit')
      .set('Authorization', `Bearer ${sandboxToken(CONV_ID, AGENT_ID)}`)
      .send({
        expected_last_event_id: null,
        events: [{ role: 'system', content: [{ type: 'text', text: 'oops' }] }],
      })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('invalid_request')
  })

  it('returns 400 when caller is not sandbox', async () => {
    const res = await request(app)
      .post('/gateway/events/emit')
      .set('Authorization', `Bearer ${dispatcherToken(CONV_ID, AGENT_ID)}`)
      .send({
        expected_last_event_id: null,
        events: [{ role: 'user', content: [{ type: 'text', text: 'oops' }] }],
      })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('invalid_request')
  })

  it('full flow: emit user + assistant + toolResult, then list returns all three', async () => {
    // Emit user message
    const r1 = await request(app)
      .post('/gateway/events/emit')
      .set('Authorization', `Bearer ${sandboxToken(CONV_ID, AGENT_ID)}`)
      .send({
        expected_last_event_id: null,
        events: [{ role: 'user', content: [{ type: 'text', text: 'search something' }] }],
      })
    expect(r1.status).toBe(200)
    const afterUser = r1.body.last_event_id

    // Emit assistant (with toolCall) + toolResult
    const r2 = await request(app)
      .post('/gateway/events/emit')
      .set('Authorization', `Bearer ${sandboxToken(CONV_ID, AGENT_ID)}`)
      .send({
        expected_last_event_id: afterUser,
        events: [
          { role: 'assistant', content: [{ type: 'toolCall', name: 'kb_search', id: 'tc_1', input: { q: 'foo' } }] },
          { role: 'toolResult', content: [{ type: 'toolResult', toolUseId: 'tc_1', content: [{ type: 'text', text: 'result' }] }] },
        ],
      })
    expect(r2.status).toBe(200)
    expect(BigInt(r2.body.appended[0].seq)).toBe(BigInt(afterUser) + 1n)
    expect(BigInt(r2.body.appended[1].seq)).toBe(BigInt(afterUser) + 2n)

    const incrementalRes = await request(app)
      .post('/gateway/events/list')
      .set('Authorization', `Bearer ${sandboxToken(CONV_ID, AGENT_ID)}`)
      .send({ after_event_id: afterUser })
    expect(incrementalRes.status).toBe(200)
    expect(incrementalRes.body.events).toHaveLength(2)

    // List all
    const listRes = await request(app)
      .post('/gateway/events/list')
      .set('Authorization', `Bearer ${sandboxToken(CONV_ID, AGENT_ID)}`)
      .send({})
    expect(listRes.status).toBe(200)
    const events = listRes.body.events
    expect(events).toHaveLength(3)
    expect(events[0].role).toBe('user')
    expect(events[1].role).toBe('assistant')
    expect(events[2].role).toBe('toolResult')
  })
})

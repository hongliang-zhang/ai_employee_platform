import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { createPrismaClient } from '@aaas/db'
import app from '../src/index.js'

// These are integration tests — require DATABASE_URL to point at a reachable
// PostgreSQL instance. In local development we use the Supabase-backed setup
// documented in docs/LOCAL-DEV.md; the localhost fallback is only a last-resort
// default for isolated environments.
const SECRET = process.env.JWT_SECRET ?? 'test-secret-32-chars-minimum-len'
const DB_URL = process.env.DATABASE_URL ?? 'mysql://aaas:aaas@localhost:4000/aaas'

const prisma = createPrismaClient(DB_URL)

function sandboxToken(convId: string, agentId: string) {
  return jwt.sign({ conversation_id: convId, agent_id: agentId, caller: 'sandbox' }, SECRET, { expiresIn: '24h' })
}
function dispatcherToken(convId: string, agentId: string) {
  return jwt.sign({ conversation_id: convId, agent_id: agentId, caller: 'dispatcher' }, SECRET, { expiresIn: '60s' })
}

const AGENT_ID = 'agt_test01'
const CONV_ID = 'conv_test01'
const CFG_ID = 'cfg_test01'

beforeAll(async () => {
  await prisma.agent.upsert({
    where: { id: AGENT_ID },
    create: { id: AGENT_ID, name: 'test', status: 'active', e2bTemplateId: 'tpl_x' },
    update: {},
  })
  await prisma.conversation.upsert({
    where: { id: CONV_ID },
    create: { id: CONV_ID, agentId: AGENT_ID, channelKey: `im:${CFG_ID}`, externalChatId: '123' },
    update: {},
  })
})

afterAll(async () => {
  await prisma.message.deleteMany({ where: { conversationId: CONV_ID } })
  await prisma.conversation.deleteMany({ where: { id: CONV_ID } })
  await prisma.agent.deleteMany({ where: { id: AGENT_ID } })
  await prisma.$disconnect()
})

beforeEach(async () => {
  await prisma.message.deleteMany({ where: { conversationId: CONV_ID } })
})

describe('POST /gateway/messages/load', () => {
  it('returns empty list for new conversation', async () => {
    const res = await request(app)
      .post('/gateway/messages/load')
      .set('Authorization', `Bearer ${sandboxToken(CONV_ID, AGENT_ID)}`)
      .send({})
    expect(res.status).toBe(200)
    expect(res.body.messages).toEqual([])
    expect(res.body.last_message_id).toBeNull()
  })

  it('returns messages in order', async () => {
    const MSG_ID = 'msg_test01'
    await prisma.message.create({
      data: { id: MSG_ID, conversationId: CONV_ID, role: 'user', contentJson: [{ type: 'text', text: 'hello' }], source: 'im' },
    })
    const res = await request(app)
      .post('/gateway/messages/load')
      .set('Authorization', `Bearer ${sandboxToken(CONV_ID, AGENT_ID)}`)
      .send({})
    expect(res.status).toBe(200)
    expect(res.body.messages).toHaveLength(1)
    expect(res.body.messages[0].role).toBe('user')
    expect(res.body.last_message_id).toBe(MSG_ID)
  })
})

describe('POST /gateway/messages/append', () => {
  it('appends a message with null expected_last_message_id for empty history', async () => {
    const res = await request(app)
      .post('/gateway/messages/append')
      .set('Authorization', `Bearer ${dispatcherToken(CONV_ID, AGENT_ID)}`)
      .send({
        expected_last_message_id: null,
        messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }], source: 'im' }],
      })
    expect(res.status).toBe(200)
    expect(res.body.appended).toHaveLength(1)
    expect(res.body.last_message_id).toBeTruthy()
  })

  it('returns 409 on stale_write', async () => {
    const MSG_ID = 'msg_stale01'
    await prisma.message.create({
      data: { id: MSG_ID, conversationId: CONV_ID, role: 'user', contentJson: [{ type: 'text', text: 'hi' }], source: 'im' },
    })
    const res = await request(app)
      .post('/gateway/messages/append')
      .set('Authorization', `Bearer ${sandboxToken(CONV_ID, AGENT_ID)}`)
      .send({
        expected_last_message_id: 'msg_wrong_id',
        messages: [{ role: 'assistant', content: [{ type: 'text', text: 'hey' }], source: 'sandbox' }],
      })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('stale_write')
  })

  it('returns 400 when caller=dispatcher uses source=sandbox', async () => {
    const res = await request(app)
      .post('/gateway/messages/append')
      .set('Authorization', `Bearer ${dispatcherToken(CONV_ID, AGENT_ID)}`)
      .send({
        expected_last_message_id: null,
        messages: [{ role: 'assistant', content: [{ type: 'text', text: 'oops' }], source: 'sandbox' }],
      })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('invalid_request')
  })
})

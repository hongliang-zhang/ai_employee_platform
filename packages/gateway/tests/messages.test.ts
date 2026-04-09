import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import postgres from 'postgres'
import app from '../src/index.js'

// These are integration tests — require postgres running via docker compose
const SECRET = process.env.JWT_SECRET ?? 'test-secret-32-chars-minimum-len'
const DB_URL = process.env.DATABASE_URL ?? 'postgres://aaas:aaas@localhost:5432/aaas'

const sql = postgres(DB_URL)

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
  await sql`INSERT INTO agents (id, name, status, e2b_template_id) VALUES (${AGENT_ID}, 'test', 'active', 'tpl_x') ON CONFLICT DO NOTHING`
  await sql`INSERT INTO conversations (id, agent_id, channel_key, external_chat_id) VALUES (${CONV_ID}, ${AGENT_ID}, ${'im:' + CFG_ID}, '123') ON CONFLICT DO NOTHING`
})

afterAll(async () => {
  await sql`DELETE FROM messages WHERE conversation_id = ${CONV_ID}`
  await sql`DELETE FROM conversations WHERE id = ${CONV_ID}`
  await sql`DELETE FROM agents WHERE id = ${AGENT_ID}`
  await sql.end()
})

beforeEach(async () => {
  await sql`DELETE FROM messages WHERE conversation_id = ${CONV_ID}`
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
    await sql`INSERT INTO messages (id, conversation_id, role, content_json, source) VALUES (${MSG_ID}, ${CONV_ID}, 'user', ${sql.json([{ type: 'text', text: 'hello' }])}, 'im')`
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
    await sql`INSERT INTO messages (id, conversation_id, role, content_json, source) VALUES (${MSG_ID}, ${CONV_ID}, 'user', ${sql.json([{ type: 'text', text: 'hi' }])}, 'im')`
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

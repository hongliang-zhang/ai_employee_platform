import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import postgres from 'postgres'
import { createConversationManager } from '../src/conversation.js'

const DB_URL = process.env.DATABASE_URL ?? 'postgres://aaas:aaas@localhost:5432/aaas'
const sql = postgres(DB_URL)
const AGENT_ID = 'agt_convtest'
const CFG_ID = 'cfg_convtest'

beforeAll(async () => {
  await sql`INSERT INTO agents (id, name, status, e2b_template_id) VALUES (${AGENT_ID}, 'test', 'active', 'tpl_x') ON CONFLICT DO NOTHING`
})
afterAll(async () => {
  await sql`DELETE FROM conversations WHERE agent_id = ${AGENT_ID}`
  await sql`DELETE FROM agents WHERE id = ${AGENT_ID}`
  await sql.end()
})

describe('ConversationManager', () => {
  it('creates a new conversation and returns id with null lastMessageId', async () => {
    const mgr = createConversationManager(sql)
    const channelKey = `im:${CFG_ID}`
    const result = await mgr.upsert({ agentId: AGENT_ID, channelKey, externalChatId: '111', externalThreadKey: '' })
    expect(result.conversationId).toMatch(/^conv_/)
    expect(result.lastMessageId).toBeNull()
  })

  it('returns same conversation id on second upsert', async () => {
    const mgr = createConversationManager(sql)
    const channelKey = `im:${CFG_ID}`
    const r1 = await mgr.upsert({ agentId: AGENT_ID, channelKey, externalChatId: '222', externalThreadKey: '' })
    const r2 = await mgr.upsert({ agentId: AGENT_ID, channelKey, externalChatId: '222', externalThreadKey: '' })
    expect(r1.conversationId).toBe(r2.conversationId)
  })

  it('updates lastMessageId cache after setLastMessageId', async () => {
    const mgr = createConversationManager(sql)
    const channelKey = `im:${CFG_ID}`
    const { conversationId } = await mgr.upsert({ agentId: AGENT_ID, channelKey, externalChatId: '333', externalThreadKey: '' })
    mgr.setLastMessageId(conversationId, 'msg_xyz')
    expect(mgr.getLastMessageId(conversationId)).toBe('msg_xyz')
  })

  it('seeds lastMessageId from DB on cache miss (simulates dispatcher restart)', async () => {
    // Create conversation + insert a message directly into DB
    const channelKey = `im:${CFG_ID}`
    const mgr1 = createConversationManager(sql)
    const { conversationId } = await mgr1.upsert({ agentId: AGENT_ID, channelKey, externalChatId: '444', externalThreadKey: '' })
    const MSG_ID = 'msg_restart01'
    await sql`INSERT INTO messages (id, conversation_id, role, content_json, source) VALUES (${MSG_ID}, ${conversationId}, 'user', ${sql.json([{ type: 'text', text: 'hi' }])}, 'im')`

    // Simulate restart: new manager with cold cache
    const mgr2 = createConversationManager(sql)
    const result = await mgr2.upsert({ agentId: AGENT_ID, channelKey, externalChatId: '444', externalThreadKey: '' })
    expect(result.lastMessageId).toBe(MSG_ID)

    // Cleanup
    await sql`DELETE FROM messages WHERE id = ${MSG_ID}`
  })
})

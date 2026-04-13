import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createPrismaClient } from '@aaas/db'
import { createConversationManager } from '../src/conversation.js'

const DB_URL = process.env.DATABASE_URL ?? 'postgres://aaas:aaas@localhost:5432/aaas'
const prisma = createPrismaClient(DB_URL)
const AGENT_ID = 'agt_convtest'
const CFG_ID = 'cfg_convtest'

beforeAll(async () => {
  await prisma.agent.upsert({
    where: { id: AGENT_ID },
    create: { id: AGENT_ID, name: 'test', status: 'active', e2bTemplateId: 'tpl_x' },
    update: {},
  })
})
afterAll(async () => {
  await prisma.conversation.deleteMany({ where: { agentId: AGENT_ID } })
  await prisma.agent.deleteMany({ where: { id: AGENT_ID } })
  await prisma.$disconnect()
})

describe('ConversationManager', () => {
  it('creates a new conversation and returns id with null lastMessageId', async () => {
    const mgr = createConversationManager(prisma)
    const result = await mgr.upsert({ agentId: AGENT_ID, channelKey: `im:${CFG_ID}`, externalChatId: '111', externalThreadKey: '' })
    expect(result.conversationId).toMatch(/^conv_/)
    expect(result.lastMessageId).toBeNull()
  })

  it('returns same conversation id on second upsert', async () => {
    const mgr = createConversationManager(prisma)
    const r1 = await mgr.upsert({ agentId: AGENT_ID, channelKey: `im:${CFG_ID}`, externalChatId: '222', externalThreadKey: '' })
    const r2 = await mgr.upsert({ agentId: AGENT_ID, channelKey: `im:${CFG_ID}`, externalChatId: '222', externalThreadKey: '' })
    expect(r1.conversationId).toBe(r2.conversationId)
  })

  it('updates lastMessageId cache after setLastMessageId', async () => {
    const mgr = createConversationManager(prisma)
    const { conversationId } = await mgr.upsert({ agentId: AGENT_ID, channelKey: `im:${CFG_ID}`, externalChatId: '333', externalThreadKey: '' })
    mgr.setLastMessageId(conversationId, 'msg_xyz')
    expect(mgr.getLastMessageId(conversationId)).toBe('msg_xyz')
  })

  it('seeds lastMessageId from DB on cache miss (simulates dispatcher restart)', async () => {
    const mgr1 = createConversationManager(prisma)
    const { conversationId } = await mgr1.upsert({ agentId: AGENT_ID, channelKey: `im:${CFG_ID}`, externalChatId: '444', externalThreadKey: '' })
    const MSG_ID = 'msg_restart01'
    await prisma.message.create({
      data: { id: MSG_ID, conversationId, role: 'user', contentJson: [{ type: 'text', text: 'hi' }], source: 'im' },
    })

    const mgr2 = createConversationManager(prisma)
    const result = await mgr2.upsert({ agentId: AGENT_ID, channelKey: `im:${CFG_ID}`, externalChatId: '444', externalThreadKey: '' })
    expect(result.lastMessageId).toBe(MSG_ID)

    await prisma.message.delete({ where: { id: MSG_ID } })
  })
})

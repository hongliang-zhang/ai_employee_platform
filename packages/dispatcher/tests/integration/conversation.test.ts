import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createPrismaClient } from '@aaas/db'
import { createConversationManager } from '../../src/conversation.js'

const DB_URL = process.env.DATABASE_URL ?? 'mysql://aaas:aaas@localhost:4000/aaas'
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
  await prisma.message.deleteMany({ where: { conversation: { agentId: AGENT_ID } } })
  await prisma.imMessageReceipt.deleteMany({ where: { conversation: { agentId: AGENT_ID } } })
  await prisma.conversation.deleteMany({ where: { agentId: AGENT_ID } })
  await prisma.agent.deleteMany({ where: { id: AGENT_ID } })
  await prisma.$disconnect()
})

describe('ConversationManager', () => {
  it('creates a new conversation and returns its id', async () => {
    const mgr = createConversationManager(prisma)
    const conversationId = await mgr.getOrCreate({ agentId: AGENT_ID, imConfigId: `im:${CFG_ID}`, chatId: '111', topicId: '' })
    expect(conversationId).toMatch(/^conv_/)
    expect(mgr.getLastMessageId(conversationId)).toBeNull()
  })

  it('returns same conversation id on second upsert', async () => {
    const mgr = createConversationManager(prisma)
    const r1 = await mgr.getOrCreate({ agentId: AGENT_ID, imConfigId: `im:${CFG_ID}`, chatId: '222', topicId: '' })
    const r2 = await mgr.getOrCreate({ agentId: AGENT_ID, imConfigId: `im:${CFG_ID}`, chatId: '222', topicId: '' })
    expect(r1).toBe(r2)
  })

  it('updates lastMessageId cache after setLastMessageId', async () => {
    const mgr = createConversationManager(prisma)
    const conversationId = await mgr.getOrCreate({ agentId: AGENT_ID, imConfigId: `im:${CFG_ID}`, chatId: '333', topicId: '' })
    mgr.setLastMessageId(conversationId, 'msg_xyz')
    expect(mgr.getLastMessageId(conversationId)).toBe('msg_xyz')
  })

  it('seeds lastMessageId from DB on cache miss (simulates dispatcher restart)', async () => {
    const mgr1 = createConversationManager(prisma)
    const conversationId = await mgr1.getOrCreate({ agentId: AGENT_ID, imConfigId: `im:${CFG_ID}`, chatId: '444', topicId: '' })
    const MSG_ID = 'msg_restart01'
    await prisma.message.create({
      data: { id: MSG_ID, conversationId, role: 'user', contentJson: [{ type: 'text', text: 'hi' }], source: 'im' },
    })

    const mgr2 = createConversationManager(prisma)
    const reloadedConversationId = await mgr2.getOrCreate({ agentId: AGENT_ID, imConfigId: `im:${CFG_ID}`, chatId: '444', topicId: '' })
    expect(reloadedConversationId).toBe(conversationId)
    expect(mgr2.getLastMessageId(reloadedConversationId)).toBe(MSG_ID)

    await prisma.message.delete({ where: { id: MSG_ID } })
  })
})

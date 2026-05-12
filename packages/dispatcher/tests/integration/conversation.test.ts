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
  })

  it('returns same conversation id on second upsert', async () => {
    const mgr = createConversationManager(prisma)
    const r1 = await mgr.getOrCreate({ agentId: AGENT_ID, imConfigId: `im:${CFG_ID}`, chatId: '222', topicId: '' })
    const r2 = await mgr.getOrCreate({ agentId: AGENT_ID, imConfigId: `im:${CFG_ID}`, chatId: '222', topicId: '' })
    expect(r1).toBe(r2)
  })
})

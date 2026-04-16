import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createPrismaClient } from '@aaas/db'
import { createInboundJobsManager } from '../src/inbound-jobs.js'

const DB_URL = process.env.DATABASE_URL ?? 'mysql://aaas:aaas@localhost:4000/aaas'
const prisma = createPrismaClient(DB_URL)
const AGENT_ID = 'agt_jobtest'
const CFG_ID = 'cfg_jobtest'
const CONV_ID = 'conv_jobtest'
const INSTANCE_ID = 'dispatcher-test-01'

beforeAll(async () => {
  await prisma.agent.upsert({
    where: { id: AGENT_ID },
    create: { id: AGENT_ID, name: 'test', status: 'active', e2bTemplateId: 'tpl_x' },
    update: {},
  })
  await prisma.conversation.upsert({
    where: { id: CONV_ID },
    create: { id: CONV_ID, agentId: AGENT_ID, channelKey: `im:${CFG_ID}`, externalChatId: '456' },
    update: {},
  })
})
afterAll(async () => {
  await prisma.inboundJob.deleteMany({ where: { conversationId: CONV_ID } })
  await prisma.conversation.deleteMany({ where: { id: CONV_ID } })
  await prisma.agent.deleteMany({ where: { id: AGENT_ID } })
  await prisma.$disconnect()
})
beforeEach(async () => {
  await prisma.inboundJob.deleteMany({ where: { conversationId: CONV_ID } })
})

describe('InboundJobsManager', () => {
  it('inserts a new job and returns true', async () => {
    const mgr = createInboundJobsManager(prisma, INSTANCE_ID)
    expect(await mgr.tryInsert(`im:${CFG_ID}`, 'ext_msg_1', CONV_ID)).toBe(true)
  })

  it('returns false on duplicate (dedup)', async () => {
    const mgr = createInboundJobsManager(prisma, INSTANCE_ID)
    await mgr.tryInsert(`im:${CFG_ID}`, 'ext_msg_2', CONV_ID)
    expect(await mgr.tryInsert(`im:${CFG_ID}`, 'ext_msg_2', CONV_ID)).toBe(false)
  })

  it('marks job as processing', async () => {
    const mgr = createInboundJobsManager(prisma, INSTANCE_ID)
    await mgr.tryInsert(`im:${CFG_ID}`, 'ext_msg_3', CONV_ID)
    await mgr.markProcessing(`im:${CFG_ID}`, 'ext_msg_3')
    const row = await prisma.inboundJob.findFirst({ where: { channelKey: `im:${CFG_ID}`, externalMessageId: 'ext_msg_3' } })
    expect(row?.status).toBe('processing')
  })

  it('marks job as done', async () => {
    const mgr = createInboundJobsManager(prisma, INSTANCE_ID)
    await mgr.tryInsert(`im:${CFG_ID}`, 'ext_msg_4', CONV_ID)
    await mgr.markDone(`im:${CFG_ID}`, 'ext_msg_4')
    const row = await prisma.inboundJob.findFirst({ where: { channelKey: `im:${CFG_ID}`, externalMessageId: 'ext_msg_4' } })
    expect(row?.status).toBe('done')
  })

  it('marks job as failed', async () => {
    const mgr = createInboundJobsManager(prisma, INSTANCE_ID)
    await mgr.tryInsert(`im:${CFG_ID}`, 'ext_msg_5', CONV_ID)
    await mgr.markFailed(`im:${CFG_ID}`, 'ext_msg_5')
    const row = await prisma.inboundJob.findFirst({ where: { channelKey: `im:${CFG_ID}`, externalMessageId: 'ext_msg_5' } })
    expect(row?.status).toBe('failed')
  })
})

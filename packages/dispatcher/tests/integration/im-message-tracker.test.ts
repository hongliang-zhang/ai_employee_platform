import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createPrismaClient } from '@aaas/db'
import { createImMessageTracker } from '../../src/im-message-tracker.js'

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
    create: { id: CONV_ID, agentId: AGENT_ID, imConfigId: `im:${CFG_ID}`, chatId: '456' },
    update: {},
  })
})
afterAll(async () => {
  await prisma.imMessageReceipt.deleteMany({ where: { conversationId: CONV_ID } })
  await prisma.conversation.deleteMany({ where: { id: CONV_ID } })
  await prisma.agent.deleteMany({ where: { id: AGENT_ID } })
  await prisma.$disconnect()
})
beforeEach(async () => {
  await prisma.imMessageReceipt.deleteMany({ where: { conversationId: CONV_ID } })
})

describe('ImMessageTracker', () => {
  it('claims a new IM message by inserting a processing receipt', async () => {
    const mgr = createImMessageTracker(prisma, INSTANCE_ID)

    expect(await mgr.tryClaim(`im:${CFG_ID}`, 'ext_msg_1', CONV_ID)).toEqual({ claimed: true })

    const row = await prisma.imMessageReceipt.findFirst({ where: { imConfigId: `im:${CFG_ID}`, messageId: 'ext_msg_1' } })
    expect(row?.id).toMatch(/^imsg_/)
    expect(row?.status).toBe('processing')
    expect(row?.leaseOwner).toBe(INSTANCE_ID)
    expect(row?.leaseExpiresAt?.getTime()).toBeGreaterThan(Date.now())
  })

  it('does not claim a done message', async () => {
    const mgr = createImMessageTracker(prisma, INSTANCE_ID)
    await mgr.tryClaim(`im:${CFG_ID}`, 'ext_msg_2', CONV_ID)
    await mgr.markDone(`im:${CFG_ID}`, 'ext_msg_2')

    expect(await mgr.tryClaim(`im:${CFG_ID}`, 'ext_msg_2', CONV_ID)).toEqual({ claimed: false, reason: 'already_done' })
  })

  it('does not claim an actively processing message', async () => {
    const mgr = createImMessageTracker(prisma, INSTANCE_ID)
    await mgr.tryClaim(`im:${CFG_ID}`, 'ext_msg_3', CONV_ID)

    expect(await mgr.tryClaim(`im:${CFG_ID}`, 'ext_msg_3', CONV_ID)).toEqual({ claimed: false, reason: 'already_processing' })
  })

  it('reclaims an expired processing message', async () => {
    const mgr = createImMessageTracker(prisma, INSTANCE_ID)
    await prisma.imMessageReceipt.create({
      data: {
        id: 'imsg_expired',
        imConfigId: `im:${CFG_ID}`,
        messageId: 'ext_msg_4',
        conversationId: CONV_ID,
        status: 'processing',
        leaseOwner: 'dead-dispatcher',
        leaseExpiresAt: new Date(Date.now() - 1_000),
      },
    })

    expect(await mgr.tryClaim(`im:${CFG_ID}`, 'ext_msg_4', CONV_ID)).toEqual({ claimed: true })

    const row = await prisma.imMessageReceipt.findFirst({ where: { imConfigId: `im:${CFG_ID}`, messageId: 'ext_msg_4' } })
    expect(row?.leaseOwner).toBe(INSTANCE_ID)
    expect(row?.leaseExpiresAt?.getTime()).toBeGreaterThan(Date.now())
  })

  it('claims a pending message', async () => {
    const mgr = createImMessageTracker(prisma, INSTANCE_ID)
    await prisma.imMessageReceipt.create({
      data: {
        id: 'imsg_pending',
        imConfigId: `im:${CFG_ID}`,
        messageId: 'ext_msg_5',
        conversationId: CONV_ID,
        status: 'pending',
      },
    })

    expect(await mgr.tryClaim(`im:${CFG_ID}`, 'ext_msg_5', CONV_ID)).toEqual({ claimed: true })

    const row = await prisma.imMessageReceipt.findFirst({ where: { imConfigId: `im:${CFG_ID}`, messageId: 'ext_msg_5' } })
    expect(row?.status).toBe('processing')
    expect(row?.leaseOwner).toBe(INSTANCE_ID)
  })

  it('does not claim a failed message', async () => {
    const mgr = createImMessageTracker(prisma, INSTANCE_ID)
    await mgr.tryClaim(`im:${CFG_ID}`, 'ext_msg_6', CONV_ID)
    await mgr.markFailed(`im:${CFG_ID}`, 'ext_msg_6')

    expect(await mgr.tryClaim(`im:${CFG_ID}`, 'ext_msg_6', CONV_ID)).toEqual({ claimed: false, reason: 'failed' })
  })

  it('marks claimed message as done', async () => {
    const mgr = createImMessageTracker(prisma, INSTANCE_ID)
    await mgr.tryClaim(`im:${CFG_ID}`, 'ext_msg_7', CONV_ID)
    await mgr.markDone(`im:${CFG_ID}`, 'ext_msg_7')
    const row = await prisma.imMessageReceipt.findFirst({ where: { imConfigId: `im:${CFG_ID}`, messageId: 'ext_msg_7' } })
    expect(row?.status).toBe('done')
  })
})

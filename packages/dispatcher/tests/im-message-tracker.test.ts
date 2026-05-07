import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createImMessageTracker } from '../src/im-message-tracker.js'

const createMany = vi.fn()
const updateMany = vi.fn()
const findUnique = vi.fn()

const db = {
  imMessageReceipt: { createMany, updateMany, findUnique },
} as any

beforeEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('ImMessageTracker', () => {
  it('claims a new message by inserting a processing receipt', async () => {
    createMany.mockResolvedValueOnce({ count: 1 })
    const tracker = createImMessageTracker(db, 'dispatcher-1')

    await expect(tracker.tryClaim('im:cfg_1', 'msg_1', 'conv_1')).resolves.toEqual({ claimed: true })

    expect(createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        id: expect.stringMatching(/^imsg_/),
        imConfigId: 'im:cfg_1',
        messageId: 'msg_1',
        conversationId: 'conv_1',
        status: 'processing',
        leaseOwner: 'dispatcher-1',
        leaseExpiresAt: expect.any(Date),
      })],
      skipDuplicates: true,
    })
    expect(updateMany).not.toHaveBeenCalled()
  })

  it('skips a done message', async () => {
    createMany.mockResolvedValueOnce({ count: 0 })
    updateMany.mockResolvedValueOnce({ count: 0 })
    findUnique.mockResolvedValueOnce({ status: 'done' })
    const tracker = createImMessageTracker(db, 'dispatcher-1')

    await expect(tracker.tryClaim('im:cfg_1', 'msg_1', 'conv_1')).resolves.toEqual({ claimed: false, reason: 'already_done' })
  })

  it('skips a failed message', async () => {
    createMany.mockResolvedValueOnce({ count: 0 })
    updateMany.mockResolvedValueOnce({ count: 0 })
    findUnique.mockResolvedValueOnce({ status: 'failed' })
    const tracker = createImMessageTracker(db, 'dispatcher-1')

    await expect(tracker.tryClaim('im:cfg_1', 'msg_1', 'conv_1')).resolves.toEqual({ claimed: false, reason: 'failed' })
  })

  it('skips an actively processing message', async () => {
    createMany.mockResolvedValueOnce({ count: 0 })
    updateMany.mockResolvedValueOnce({ count: 0 })
    findUnique.mockResolvedValueOnce({ status: 'processing' })
    const tracker = createImMessageTracker(db, 'dispatcher-1')

    await expect(tracker.tryClaim('im:cfg_1', 'msg_1', 'conv_1')).resolves.toEqual({ claimed: false, reason: 'already_processing' })
  })

  it('claims a pending or expired processing message by updating it to processing', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-06T00:00:00.000Z'))
    createMany.mockResolvedValueOnce({ count: 0 })
    updateMany.mockResolvedValueOnce({ count: 1 })
    const tracker = createImMessageTracker(db, 'dispatcher-1')

    await expect(tracker.tryClaim('im:cfg_1', 'msg_1', 'conv_1')).resolves.toEqual({ claimed: true })

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        imConfigId: 'im:cfg_1',
        messageId: 'msg_1',
        OR: [
          { status: 'pending' },
          { status: 'processing', leaseExpiresAt: { lt: new Date('2026-05-06T00:00:00.000Z') } },
        ],
      },
      data: {
        status: 'processing',
        leaseOwner: 'dispatcher-1',
        leaseExpiresAt: new Date('2026-05-06T00:01:00.000Z'),
      },
    })
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFeishuClient } from '../src/im/feishu.js'

const reactionCreateMock = vi.hoisted(() => vi.fn())
const messageCreateMock = vi.hoisted(() => vi.fn())

vi.mock('@larksuiteoapi/node-sdk', () => ({
  Client: vi.fn(() => ({
    im: {
      message: { create: messageCreateMock },
      messageReaction: { create: reactionCreateMock },
    },
  })),
  WSClient: vi.fn(),
  EventDispatcher: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
  reactionCreateMock.mockResolvedValue({ data: { reaction_id: 'react_1' } })
})

describe('createFeishuClient', () => {
  it('does not send a reaction as a chat action when messageId is available', async () => {
    const { client } = createFeishuClient('app_id', 'app_secret', 'bot_open_id')

    await (client.sendChatAction as any)('chat_1', { messageId: 'om_msg_1' })

    expect(reactionCreateMock).not.toHaveBeenCalled()
  })

  it('does nothing when messageId is missing', async () => {
    const { client } = createFeishuClient('app_id', 'app_secret', 'bot_open_id')

    await client.sendChatAction('chat_1')

    expect(reactionCreateMock).not.toHaveBeenCalled()
  })

  it('does not require Feishu typing support to resolve', async () => {
    reactionCreateMock.mockRejectedValueOnce(new Error('rate limited'))
    const { client } = createFeishuClient('app_id', 'app_secret', 'bot_open_id')

    await expect((client.sendChatAction as any)('chat_1', { messageId: 'om_msg_1' })).resolves.toBeUndefined()
    expect(reactionCreateMock).not.toHaveBeenCalled()
  })
})

describe('createFeishuClient - listen', () => {
  it('listen() resolves to a callable stop function', async () => {
    const mockClose = vi.fn()
    const mockWsStart = vi.fn().mockResolvedValue(undefined)
    const { WSClient, EventDispatcher } = await import('@larksuiteoapi/node-sdk')
    vi.mocked(WSClient).mockImplementation(() => ({ start: mockWsStart, close: mockClose }) as any)
    vi.mocked(EventDispatcher).mockImplementation(() => ({ register: vi.fn().mockReturnThis() }) as any)

    const { listen } = createFeishuClient('app_id', 'app_secret', 'bot_open_id')
    const stop = await listen(vi.fn(), 'im:cfg_1')

    expect(typeof stop).toBe('function')
    expect(mockWsStart).toHaveBeenCalledOnce()
    stop()
    expect(mockClose).toHaveBeenCalledOnce()
  })
})

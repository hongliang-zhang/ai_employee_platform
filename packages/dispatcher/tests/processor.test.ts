import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createProcessor } from '../src/processor.js'

const mockConversation = { getOrCreate: vi.fn() }
const mockImMessageTracker = { tryClaim: vi.fn(), markDone: vi.fn(), markFailed: vi.fn() }
const mockSandbox = { chat: vi.fn() }
const mockIm = { sendMessage: vi.fn(), sendChatAction: vi.fn() }
const mockJwt = { signSandboxToken: vi.fn(), signDispatcherToken: vi.fn() }

const AGENT = { id: 'agt_1', e2bTemplateId: 'tpl_1', port: 8080, idleTimeoutMs: 300000 }

beforeEach(() => vi.resetAllMocks())

const processor = createProcessor({
  conversation: mockConversation as any,
  imMessageTracker: mockImMessageTracker as any,
  sandbox: mockSandbox as any,
  im: mockIm as any,
  jwt: mockJwt as any,
  agent: AGENT,
})

const normalizedMsg = {
  imConfigId: 'im:cfg_1',
  chatId: '123',
  topicId: '',
  messageId: 'ext_1',
  sender: { userId: '999', displayName: 'Bob' },
  content: { type: 'text' as const, text: 'hello' },
}

describe('processor.handle', () => {
  it('skips messages that are not claimable', async () => {
    mockConversation.getOrCreate.mockResolvedValueOnce('conv_1')
    mockImMessageTracker.tryClaim.mockResolvedValueOnce({ claimed: false, reason: 'already_done' })

    await processor.handle(normalizedMsg)

    expect(mockSandbox.chat).not.toHaveBeenCalled()
  })

  it('processes new message end-to-end', async () => {
    mockConversation.getOrCreate.mockResolvedValueOnce('conv_1')
    mockImMessageTracker.tryClaim.mockResolvedValueOnce({ claimed: true })
    mockJwt.signSandboxToken.mockReturnValueOnce('sandbox-jwt')
    mockSandbox.chat.mockResolvedValueOnce('Hi!')

    await processor.handle(normalizedMsg)

    expect(mockSandbox.chat).toHaveBeenCalledWith({
      conversationId: 'conv_1',
      templateId: 'tpl_1',
      port: 8080,
      sessionToken: 'sandbox-jwt',
      message: 'hello',
      traceId: expect.stringMatching(/^tr_/),
    })
    expect(mockIm.sendMessage).toHaveBeenCalledWith('123', 'Hi!')
    expect(mockImMessageTracker.markDone).toHaveBeenCalledOnce()
  })

  it('marks job failed and notifies user if sandbox chat fails', async () => {
    mockConversation.getOrCreate.mockResolvedValueOnce('conv_1')
    mockImMessageTracker.tryClaim.mockResolvedValueOnce({ claimed: true })
    mockJwt.signSandboxToken.mockReturnValueOnce('sandbox-jwt')
    mockSandbox.chat.mockRejectedValueOnce(new Error('sandbox health check timed out'))

    await processor.handle(normalizedMsg)

    expect(mockImMessageTracker.markFailed).toHaveBeenCalledOnce()
    expect(mockIm.sendMessage).toHaveBeenCalledWith('123', expect.stringContaining('不可用'))
  })

  it('does not pass lastMessageId to sandbox.chat', async () => {
    mockConversation.getOrCreate.mockResolvedValueOnce('conv_1')
    mockImMessageTracker.tryClaim.mockResolvedValueOnce({ claimed: true })
    mockJwt.signSandboxToken.mockReturnValueOnce('tok')
    mockSandbox.chat.mockResolvedValueOnce('ok')

    await processor.handle(normalizedMsg)

    const chatCall = mockSandbox.chat.mock.calls[0][0]
    expect(chatCall).not.toHaveProperty('lastMessageId')
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createProcessor } from '../src/processor.js'

// All external dependencies mocked
const mockConversation = { upsert: vi.fn(), getLastMessageId: vi.fn(), setLastMessageId: vi.fn() }
const mockJobs = { tryInsert: vi.fn(), markProcessing: vi.fn(), markDone: vi.fn(), markFailed: vi.fn() }
const mockGateway = { appendMessages: vi.fn(), loadMessages: vi.fn() }
const mockSandbox = { getOrCreate: vi.fn(), destroy: vi.fn() }
const mockIm = { sendMessage: vi.fn(), sendChatAction: vi.fn() }
const mockJwt = { signSandboxToken: vi.fn(), signDispatcherToken: vi.fn() }

const AGENT = { id: 'agt_1', e2bTemplateId: 'tpl_1', port: 8080, idleTimeoutMs: 300000 }

beforeEach(() => vi.resetAllMocks())

const processor = createProcessor({
  conversation: mockConversation as any,
  jobs: mockJobs as any,
  gateway: mockGateway as any,
  sandbox: mockSandbox as any,
  im: mockIm as any,
  jwt: mockJwt as any,
  agent: AGENT,
})

const normalizedMsg = {
  channel_key: 'im:cfg_1',
  external_chat_id: '123',
  external_thread_key: '',
  external_message_id: 'ext_1',
  author: { external_user_id: '999', display_name: 'Bob' },
  content: { type: 'text' as const, text: 'hello' },
}

describe('processor.handle', () => {
  it('deduplicates already-seen messages', async () => {
    mockConversation.upsert.mockResolvedValueOnce({ conversationId: 'conv_1', lastMessageId: null })
    mockJobs.tryInsert.mockResolvedValueOnce(false) // duplicate

    await processor.handle(normalizedMsg)

    expect(mockGateway.appendMessages).not.toHaveBeenCalled()
    expect(mockSandbox.getOrCreate).not.toHaveBeenCalled()
  })

  it('processes new message end-to-end', async () => {
    mockConversation.upsert.mockResolvedValueOnce({ conversationId: 'conv_1', lastMessageId: null })
    mockJobs.tryInsert.mockResolvedValueOnce(true)
    mockGateway.appendMessages.mockResolvedValueOnce({ last_message_id: 'msg_1' })
    mockConversation.getLastMessageId
      .mockReturnValueOnce(null)         // before append: no prior messages
      .mockReturnValueOnce('msg_1')      // before /chat: after setLastMessageId('msg_1')
    mockJwt.signSandboxToken.mockReturnValueOnce('sandbox-jwt')
    mockJwt.signDispatcherToken.mockReturnValueOnce('dispatcher-jwt')
    mockSandbox.getOrCreate.mockResolvedValueOnce({
      sandboxId: 'sb_1',
      chatUrl: 'http://sandbox',
      instance: {},
    })
    mockGateway.loadMessages.mockResolvedValueOnce({ last_message_id: 'msg_2' })
    const mockFetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ reply: 'Hi!' }) })
    vi.stubGlobal('fetch', mockFetch)

    await processor.handle(normalizedMsg)

    expect(mockGateway.appendMessages).toHaveBeenCalledOnce()
    expect(mockSandbox.getOrCreate).toHaveBeenCalledOnce()
    expect(mockIm.sendMessage).toHaveBeenCalledWith('123', 'Hi!')
    expect(mockJobs.markDone).toHaveBeenCalledOnce()
    expect(mockConversation.setLastMessageId).toHaveBeenCalled()
    // Verify /chat request carries last_message_id from the append result
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual(
      expect.objectContaining({ last_message_id: 'msg_1' })
    )
  })

  it('retries transient 503 from an initializing sandbox without destroying it', async () => {
    mockConversation.upsert.mockResolvedValueOnce({ conversationId: 'conv_1', lastMessageId: null })
    mockJobs.tryInsert.mockResolvedValueOnce(true)
    mockGateway.appendMessages.mockResolvedValueOnce({ last_message_id: 'msg_1' })
    mockConversation.getLastMessageId.mockReturnValue('msg_1')
    mockJwt.signSandboxToken.mockReturnValueOnce('sandbox-jwt')
    mockJwt.signDispatcherToken.mockReturnValueOnce('dispatcher-jwt')
    mockSandbox.getOrCreate.mockResolvedValue({
      sandboxId: 'sb_1',
      chatUrl: 'http://sandbox',
      instance: {},
    })
    mockGateway.loadMessages.mockResolvedValueOnce({ last_message_id: 'msg_2' })
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ reply: 'Hi after init' }) })
    vi.stubGlobal('fetch', mockFetch)

    await processor.handle(normalizedMsg)

    expect(mockFetch).toHaveBeenCalledTimes(3)
    expect(mockSandbox.getOrCreate).toHaveBeenCalledOnce()
    expect(mockSandbox.destroy).not.toHaveBeenCalled()
    expect(mockIm.sendMessage).toHaveBeenCalledWith('123', 'Hi after init')
    expect(mockJobs.markDone).toHaveBeenCalledOnce()
  })

  it('does not recreate sandbox when 503 initialization retries are exhausted', async () => {
    vi.useFakeTimers()
    try {
      mockConversation.upsert.mockResolvedValueOnce({ conversationId: 'conv_1', lastMessageId: null })
      mockJobs.tryInsert.mockResolvedValueOnce(true)
      mockGateway.appendMessages.mockResolvedValueOnce({ last_message_id: 'msg_1' })
      mockConversation.getLastMessageId.mockReturnValue('msg_1')
      mockJwt.signSandboxToken.mockReturnValueOnce('sandbox-jwt')
      mockJwt.signDispatcherToken.mockReturnValueOnce('dispatcher-jwt')
      mockSandbox.getOrCreate.mockResolvedValue({
        sandboxId: 'sb_1',
        chatUrl: 'http://sandbox',
        instance: {},
      })
      const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 503 })
      vi.stubGlobal('fetch', mockFetch)

      const handlePromise = processor.handle(normalizedMsg)
      await vi.runAllTimersAsync()
      await handlePromise

      expect(mockFetch).toHaveBeenCalledTimes(6)
      expect(mockSandbox.getOrCreate).toHaveBeenCalledOnce()
      expect(mockSandbox.destroy).not.toHaveBeenCalled()
      expect(mockJobs.markFailed).toHaveBeenCalledOnce()
      expect(mockIm.sendMessage).toHaveBeenCalledWith('123', expect.stringContaining('不可用'))
    } finally {
      vi.useRealTimers()
    }
  })

  it('recreates stale sandbox when chat endpoint returns 404', async () => {
    mockConversation.upsert.mockResolvedValueOnce({ conversationId: 'conv_1', lastMessageId: null })
    mockJobs.tryInsert.mockResolvedValueOnce(true)
    mockGateway.appendMessages.mockResolvedValueOnce({ last_message_id: 'msg_1' })
    mockConversation.getLastMessageId.mockReturnValue('msg_1')
    mockJwt.signSandboxToken.mockReturnValueOnce('sandbox-jwt')
    mockJwt.signDispatcherToken.mockReturnValueOnce('dispatcher-jwt')
    mockSandbox.getOrCreate
      .mockResolvedValueOnce({ sandboxId: 'old_sb', chatUrl: 'http://old-sandbox', instance: {} })
      .mockResolvedValueOnce({ sandboxId: 'new_sb', chatUrl: 'http://new-sandbox', instance: {} })
    mockGateway.loadMessages.mockResolvedValueOnce({ last_message_id: 'msg_2' })
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ reply: 'Hi from new sandbox' }) })
    vi.stubGlobal('fetch', mockFetch)

    await processor.handle(normalizedMsg)

    expect(mockSandbox.destroy).toHaveBeenCalledWith('conv_1')
    expect(mockSandbox.getOrCreate).toHaveBeenCalledTimes(2)
    expect(mockFetch.mock.calls[0][0]).toBe('http://old-sandbox/chat')
    expect(mockFetch.mock.calls[1][0]).toBe('http://new-sandbox/chat')
    expect(mockIm.sendMessage).toHaveBeenCalledWith('123', 'Hi from new sandbox')
  })

  it('marks job failed and notifies user if sandbox creation throws', async () => {
    mockConversation.upsert.mockResolvedValueOnce({ conversationId: 'conv_1', lastMessageId: null })
    mockJobs.tryInsert.mockResolvedValueOnce(true)
    mockGateway.appendMessages.mockResolvedValueOnce({ last_message_id: 'msg_1' })
    mockJwt.signSandboxToken.mockReturnValueOnce('tok')
    mockJwt.signDispatcherToken.mockReturnValueOnce('tok')
    mockSandbox.getOrCreate.mockRejectedValueOnce(new Error('sandbox health check timed out'))

    await processor.handle(normalizedMsg)

    expect(mockJobs.markFailed).toHaveBeenCalledOnce()
    expect(mockIm.sendMessage).toHaveBeenCalledWith('123', expect.stringContaining('不可用'))
  })
})

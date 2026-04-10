import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createGatewayClient } from '../src/gateway-client.js'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

beforeEach(() => vi.clearAllMocks())

describe('GatewayClient', () => {
  const client = createGatewayClient('http://gateway:3001', 'test-token')

  it('appendMessages sends correct payload and returns last_message_id', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ conversation_id: 'conv_1', appended: [{ id: 'msg_1' }], last_message_id: 'msg_1' }),
    })
    const result = await client.appendMessages('conv_1', null, [{ role: 'user', content: [{ type: 'text', text: 'hi' }], source: 'im' }], 'dispatcher-token')
    expect(result.last_message_id).toBe('msg_1')
    const [url, opts] = mockFetch.mock.calls[0]
    expect(url).toBe('http://gateway:3001/gateway/messages/append')
    expect(JSON.parse(opts.body).expected_last_message_id).toBeNull()
  })

  it('loadMessages returns messages array', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ conversation_id: 'conv_1', messages: [{ id: 'msg_1', role: 'user' }], last_message_id: 'msg_1' }),
    })
    const result = await client.loadMessages('conv_1', null, 'sandbox-token')
    expect(result.messages).toHaveLength(1)
  })

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ error: { code: 'stale_write' } }) })
    await expect(client.appendMessages('conv_1', 'msg_wrong', [], 'tok')).rejects.toThrow('stale_write')
  })
})

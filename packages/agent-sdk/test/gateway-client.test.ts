import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GatewayClient } from '../src/gateway-client.js'

const fetchMock = vi.fn()
global.fetch = fetchMock

describe('GatewayClient', () => {
  let client: GatewayClient

  beforeEach(() => {
    client = new GatewayClient('https://gw.example.com', 'tok_abc')
    fetchMock.mockReset()
  })

  it('appendMessages sends correct payload', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ last_message_id: 'msg_2' }),
    })
    const result = await client.appendMessages('msg_1', [
      { role: 'assistant', content: [{ type: 'text', text: 'hello' }], source: 'sandbox' },
    ])
    expect(result.last_message_id).toBe('msg_2')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://gw.example.com/gateway/messages/append',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer tok_abc' }),
      })
    )
  })

  it('appendMessages throws on non-ok response', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ error: { code: 'stale_write', message: 'stale', retryable: true, details: {} } }),
    })
    await expect(client.appendMessages('msg_old', [])).rejects.toThrow('stale_write')
  })

  it('presignUrls returns url list', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        urls: [{ path: 'shared/SOUL.md', url: 'https://s3/presigned', expires_in: 3600 }],
      }),
    })
    const result = await client.presignUrls([{ action: 'upload', path: 'shared/SOUL.md' }])
    expect(result).toHaveLength(1)
    expect(result[0].path).toBe('shared/SOUL.md')
  })

  it('listFiles returns file list', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        files: [{ path: 'shared/SOUL.md', size: 100, last_modified: '2026-01-01T00:00:00Z' }],
      }),
    })
    const result = await client.listFiles('shared')
    expect(result).toHaveLength(1)
    expect(result[0].path).toBe('shared/SOUL.md')
  })
})

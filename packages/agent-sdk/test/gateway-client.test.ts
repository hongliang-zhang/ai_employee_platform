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

  // get() tests
  it('get() returns parsed JSON on ok response', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ actions: [] }),
    })
    const result = await client.listActions()
    expect(result).toEqual([])
    expect(fetchMock).toHaveBeenCalledWith(
      'https://gw.example.com/gateway/actions/list',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer tok_abc' }),
      })
    )
  })

  it('get() throws on non-ok response', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ error: { code: 'forbidden' } }),
    })
    await expect(client.listActions()).rejects.toThrow('forbidden')
  })

  // invokeAction() tests
  it('invokeAction() returns result on success', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: { foo: 'bar' } }),
    })
    const result = await client.invokeAction('search_web', { query: 'hello' })
    expect(result).toEqual({ foo: 'bar' })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://gw.example.com/gateway/actions/invoke',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer tok_abc' }),
      })
    )
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body).toEqual({ action: 'search_web', input: { query: 'hello' } })
  })

  it('invokeAction() throws on non-ok response', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: { code: 'internal_error' } }),
    })
    await expect(client.invokeAction('search_web', {})).rejects.toThrow('internal_error')
  })

  // listActions() tests
  it('listActions() returns action definitions on success', async () => {
    const mockAction = {
      name: 'search_web',
      description: 'Search the web',
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string', description: 'Search query' } },
        required: ['query'],
      },
    }
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ actions: [mockAction] }),
    })
    const result = await client.listActions()
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('search_web')
    expect(result[0].description).toBe('Search the web')
    expect(result[0].inputSchema.required).toEqual(['query'])
  })

  it('listActions() throws on non-ok response', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({ error: { code: 'service_unavailable' } }),
    })
    await expect(client.listActions()).rejects.toThrow('service_unavailable')
  })
})

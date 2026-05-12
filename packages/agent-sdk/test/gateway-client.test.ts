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

  describe('emitEvents', () => {
    it('sends correct payload and returns last_event_id', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ conversation_id: 'conv_1', appended: [{ seq: '2', role: 'user', created_at: '' }], last_event_id: '2' }),
      })
      const result = await client.emitEvents('1', [
        { role: 'user', content: [{ type: 'text', text: 'hello' }] },
      ])
      expect(result.last_event_id).toBe('2')
      expect(fetchMock).toHaveBeenCalledWith(
        'https://gw.example.com/gateway/events/emit',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: 'Bearer tok_abc' }),
        })
      )
      const body = JSON.parse(fetchMock.mock.calls[0][1].body)
      expect(body.expected_last_event_id).toBe('1')
      expect(body.events[0].role).toBe('user')
    })

    it('sends null expected_last_event_id for first emit', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ conversation_id: 'conv_1', appended: [{ seq: '1', role: 'user', created_at: '' }], last_event_id: '1' }),
      })
      await client.emitEvents(null, [{ role: 'user', content: [] }])
      const body = JSON.parse(fetchMock.mock.calls[0][1].body)
      expect(body.expected_last_event_id).toBeNull()
    })

    it('throws on stale_write (409)', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({ error: { code: 'stale_write', message: 'stale', retryable: false, details: {} } }),
      })
      await expect(client.emitEvents('old_id', [])).rejects.toThrow('stale_write')
    })
  })

  describe('listEvents', () => {
    it('returns events and last_event_id', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          conversation_id: 'conv_1',
          events: [
            { seq: '1', role: 'user', content: [{ type: 'text', text: 'hi' }], created_at: '' },
            { seq: '2', role: 'assistant', content: [{ type: 'text', text: 'hello' }], created_at: '' },
          ],
          last_event_id: '2',
        }),
      })
      const result = await client.listEvents()
      expect(result.events).toHaveLength(2)
      expect(result.last_event_id).toBe('2')
      expect(fetchMock).toHaveBeenCalledWith(
        'https://gw.example.com/gateway/events/list',
        expect.objectContaining({ method: 'POST' })
      )
    })

    it('returns null last_event_id for empty conversation', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ conversation_id: 'conv_1', events: [], last_event_id: null }),
      })
      const result = await client.listEvents()
      expect(result.events).toHaveLength(0)
      expect(result.last_event_id).toBeNull()
    })

    it('sends after_event_id when provided', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ conversation_id: 'conv_1', events: [], last_event_id: null }),
      })
      await client.listEvents('5')
      const body = JSON.parse(fetchMock.mock.calls[0][1].body)
      expect(body.after_event_id).toBe('5')
    })
  })

  describe('presignUrls', () => {
    it('returns url list', async () => {
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
  })

  describe('listActions', () => {
    it('returns action definitions', async () => {
      const mockAction = {
        name: 'search_web',
        description: 'Search the web',
        inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
      }
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ actions: [mockAction] }),
      })
      const result = await client.listActions()
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('search_web')
    })

    it('throws on non-ok response', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ error: { code: 'forbidden' } }),
      })
      await expect(client.listActions()).rejects.toThrow('forbidden')
    })
  })

  describe('invokeAction', () => {
    it('returns result on success', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: { foo: 'bar' } }),
      })
      const result = await client.invokeAction('search_web', { query: 'hello' })
      expect(result).toEqual({ foo: 'bar' })
    })

    it('throws on non-ok response', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { code: 'internal_error' } }),
      })
      await expect(client.invokeAction('search_web', {})).rejects.toThrow('internal_error')
    })
  })
})

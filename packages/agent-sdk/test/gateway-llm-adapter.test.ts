import { describe, expect, it, vi } from 'vitest'
import { createGatewayLlmProvider } from '../src/gateway-llm-adapter.js'

const fetchMock = vi.fn()
global.fetch = fetchMock

describe('createGatewayLlmProvider', () => {
  it('returns an ApiProvider with api = gateway-llm', () => {
    const provider = createGatewayLlmProvider('https://gw.example.com', 'tok')
    expect(provider.api).toBe('gateway-llm')
    expect(typeof provider.stream).toBe('function')
    expect(typeof provider.streamSimple).toBe('function')
  })

  it('streamSimple calls POST /gateway/llm and emits text content', async () => {
    fetchMock.mockReset()
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'hello world' }],
          tool_calls: [],
        },
        usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
      }),
    })

    const provider = createGatewayLlmProvider('https://gw.example.com', 'tok')
    const fakeModel = { id: 'glm-5.1', api: 'gateway-llm' } as any
    const fakeContext = {
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    } as any

    const stream = provider.streamSimple(fakeModel, fakeContext, {})
    const events: any[] = []
    for await (const event of stream) {
      events.push(event)
    }

    expect(fetchMock).toHaveBeenCalledWith(
      'https://gw.example.com/gateway/llm',
      expect.objectContaining({ method: 'POST' })
    )
    expect(events.some((e) => e.type === 'done')).toBe(true)
  })
})

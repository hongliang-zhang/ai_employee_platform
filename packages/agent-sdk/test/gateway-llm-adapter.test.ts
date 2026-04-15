import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createGatewayLlmProvider } from '../src/gateway-llm-adapter.js'

const fetchMock = vi.fn()
global.fetch = fetchMock

describe('createGatewayLlmProvider', () => {
  beforeEach(() => {
    fetchMock.mockReset()
  })

  it('returns an ApiProvider with api = gateway-llm', () => {
    const provider = createGatewayLlmProvider('https://gw.example.com', 'tok')
    expect(provider.api).toBe('gateway-llm')
    expect(typeof provider.stream).toBe('function')
    expect(typeof provider.streamSimple).toBe('function')
  })

  it('streamSimple emits start → text_start → text_delta → text_end → done in order', async () => {
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
    // 验证完整的 event 顺序
    expect(events.map((e) => e.type)).toEqual(['start', 'text_start', 'text_delta', 'text_end', 'done'])
    // 验证 text_delta 包含正确文本
    const delta = events.find((e) => e.type === 'text_delta')
    expect(delta?.delta).toBe('hello world')
  })

  it('streamSimple emits start → error on non-ok response', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: { message: 'internal error' } }),
    })

    const provider = createGatewayLlmProvider('https://gw.example.com', 'tok')
    const fakeModel = { id: 'glm-5.1', api: 'gateway-llm' } as any
    const fakeContext = { messages: [] } as any

    const stream = provider.streamSimple(fakeModel, fakeContext, {})
    const events: any[] = []
    for await (const event of stream) {
      events.push(event)
    }

    expect(events.map((e) => e.type)).toEqual(['start', 'error'])
    expect(events[1].reason).toBe('error')
  })
})

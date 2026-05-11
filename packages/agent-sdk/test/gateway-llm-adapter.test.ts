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

  it('streamSimple forwards tools to gateway and emits toolcall_end + done(toolUse) on tool_calls response', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        message: {
          role: 'assistant',
          content: [],
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: { name: 'search_web', arguments: '{"query":"ai news"}' },
            },
          ],
        },
        usage: { input_tokens: 20, output_tokens: 10, total_tokens: 30 },
      }),
    })

    const provider = createGatewayLlmProvider('https://gw.example.com', 'tok')
    const fakeModel = { id: 'glm-5.1', api: 'gateway-llm' } as any
    const fakeContext = {
      messages: [{ role: 'user', content: [{ type: 'text', text: 'search for me' }] }],
      tools: [{ name: 'search_web', description: 'Search the web', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } }],
    } as any

    const stream = provider.streamSimple(fakeModel, fakeContext, {})
    const events: any[] = []
    for await (const event of stream) {
      events.push(event)
    }

    // tools must be forwarded to gateway
    const [, fetchOptions] = fetchMock.mock.calls[0]
    const body = JSON.parse(fetchOptions.body)
    expect(body.tools).toEqual([{
      type: 'function',
      function: { name: 'search_web', description: 'Search the web', parameters: expect.any(Object) },
    }])

    // event sequence: start → toolcall_end → done
    expect(events.map((e) => e.type)).toEqual(['start', 'toolcall_end', 'done'])

    const toolcallEnd = events.find((e) => e.type === 'toolcall_end')
    expect(toolcallEnd.toolCall).toEqual({
      type: 'toolCall',
      id: 'call_1',
      name: 'search_web',
      arguments: { query: 'ai news' },
    })

    const done = events.find((e) => e.type === 'done')
    expect(done.reason).toBe('toolUse')
  })

  it('streamSimple parses tool_call arguments as JSON string', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        message: {
          role: 'assistant',
          content: [],
          tool_calls: [
            {
              id: 'call_2',
              type: 'function',
              function: { name: 'get_weather', arguments: '{"location":"Beijing"}' },
            },
          ],
        },
        usage: { input_tokens: 5, output_tokens: 5, total_tokens: 10 },
      }),
    })

    const provider = createGatewayLlmProvider('https://gw.example.com', 'tok')
    const stream = provider.streamSimple(
      { id: 'glm-5.1', api: 'gateway-llm' } as any,
      { messages: [] } as any,
      {}
    )
    const events: any[] = []
    for await (const event of stream) events.push(event)

    const toolcallEnd = events.find((e) => e.type === 'toolcall_end')
    expect(toolcallEnd.toolCall.arguments).toEqual({ location: 'Beijing' })
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

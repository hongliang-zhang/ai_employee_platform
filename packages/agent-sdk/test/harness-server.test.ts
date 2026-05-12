import { describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { createHarnessApp } from '../src/harness-server.js'

vi.mock('@mariozechner/pi-coding-agent', () => ({
  createAgentSession: vi.fn().mockResolvedValue({
    session: {
      prompt: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn().mockReturnValue(() => {}),
      systemPrompt: 'You are a helpful assistant.',
      agent: { setSystemPrompt: vi.fn() },
    },
    modelFallbackMessage: undefined,
    extensionsResult: {},
  }),
  SessionManager: {
    continueRecent: vi.fn().mockReturnValue({}),
    create: vi.fn().mockReturnValue({}),
    inMemory: vi.fn().mockReturnValue({}),
  },
  ModelRegistry: vi.fn().mockImplementation(() => ({
    registerProvider: vi.fn(),
  })),
  AuthStorage: {
    inMemory: vi.fn().mockReturnValue({}),
  },
}))

function sandboxConfig() {
  return { mode: 'sandbox' as const, port: 8080, gatewayUrl: 'http://gw', sessionToken: 'tok', persistentRoot: '/tmp' }
}

function makeGatewayMock(overrides: Record<string, any> = {}) {
  return {
    listEvents: vi.fn().mockResolvedValue({ events: [], last_event_id: null }),
    emitEvents: vi.fn().mockResolvedValue({ last_event_id: '1' }),
    ...overrides,
  }
}

function makeSessionMock(events: any[]) {
  return {
    prompt: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn((listener: any) => {
      setTimeout(() => {
        for (const e of events) listener(e)
      }, 0)
      return () => {}
    }),
    agent: { setSystemPrompt: vi.fn() },
  }
}

describe('HarnessServer', () => {
  it('GET /health returns 503 before session init completes', async () => {
    const app = await createHarnessApp({
      systemPrompt: 'test',
      config: { mode: 'local', port: 8080 },
    })
    const res = await request(app).get('/health')
    expect(res.status).toBe(503)
    expect(res.body).toEqual({ ok: false, reason: 'agent initializing' })
  })

  it('GET /health returns { ok: true } after init', async () => {
    const app = await createHarnessApp({
      systemPrompt: 'test',
      config: { mode: 'local', port: 8080 },
    })
    app.locals.sessionReady = true
    app.locals.fileSyncReady = true
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
  })

  it('POST /chat with missing message returns 400', async () => {
    const app = await createHarnessApp({
      systemPrompt: 'test',
      config: { mode: 'local', port: 8080 },
    })
    app.locals.fileSyncReady = true
    await app.locals.initSession()
    const res = await request(app).post('/chat').send({})
    expect(res.status).toBe(400)
  })

  it('POST /chat returns reply from agent_end event', async () => {
    const { createAgentSession } = await import('@mariozechner/pi-coding-agent')
    vi.mocked(createAgentSession).mockResolvedValueOnce({
      session: makeSessionMock([
        { type: 'message_update', message: { role: 'assistant', content: [{ type: 'text', text: 'Hello!' }] } },
        { type: 'agent_end' },
      ]) as any,
      modelFallbackMessage: undefined,
      extensionsResult: {} as any,
    })

    const app = await createHarnessApp({
      systemPrompt: 'test',
      config: { mode: 'local', port: 8080 },
    })
    app.locals.fileSyncReady = true
    await app.locals.initSession()
    const res = await request(app).post('/chat').send({ message: 'hi' })
    expect(res.status).toBe(200)
    expect(res.body.reply).toBe('Hello!')
  })

  it('POST /shutdown calls onShutdown and returns { ok: true }', async () => {
    const onShutdown = vi.fn().mockResolvedValue(undefined)
    const app = await createHarnessApp({
      systemPrompt: 'test',
      config: { mode: 'local', port: 8080 },
      onShutdown,
    })
    const res = await request(app).post('/shutdown')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
    expect(onShutdown).toHaveBeenCalledOnce()
  })

  it('POST /shutdown returns { ok: true } even when onShutdown throws', async () => {
    const onShutdown = vi.fn().mockRejectedValue(new Error('flush failed'))
    const app = await createHarnessApp({
      systemPrompt: 'test',
      config: { mode: 'local', port: 8080 },
      onShutdown,
    })
    const res = await request(app).post('/shutdown')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
  })

  describe('sandbox mode with gateway', () => {
    it('initSession calls listEvents to initialize lastEventId', async () => {
      const { createAgentSession } = await import('@mariozechner/pi-coding-agent')
      vi.mocked(createAgentSession).mockResolvedValueOnce({
        session: makeSessionMock([]) as any,
        modelFallbackMessage: undefined,
        extensionsResult: {} as any,
      })

      const gateway = makeGatewayMock({ listEvents: vi.fn().mockResolvedValue({ events: [], last_event_id: '42' }) })
      const app = await createHarnessApp({
        systemPrompt: 'test',
        config: sandboxConfig(),
        gateway: gateway as any,
      })
      app.locals.fileSyncReady = true
      await app.locals.initSession()

      expect(gateway.listEvents).toHaveBeenCalledOnce()
    })

    it('POST /chat uses lastEventId from initSession as expectedLastEventId on first emit', async () => {
      const { createAgentSession } = await import('@mariozechner/pi-coding-agent')
      vi.mocked(createAgentSession).mockResolvedValueOnce({
        session: makeSessionMock([{ type: 'agent_end' }]) as any,
        modelFallbackMessage: undefined,
        extensionsResult: {} as any,
      })

      const gateway = makeGatewayMock({
        listEvents: vi.fn().mockResolvedValue({ events: [], last_event_id: '42' }),
        emitEvents: vi.fn().mockResolvedValue({ last_event_id: '43' }),
      })
      const app = await createHarnessApp({
        systemPrompt: 'test',
        config: sandboxConfig(),
        gateway: gateway as any,
      })
      app.locals.fileSyncReady = true
      await app.locals.initSession()
      await request(app).post('/chat').send({ message: 'hello' })

      // First emit (user message) must use '42' — the lastEventId restored from gateway
      expect(gateway.emitEvents).toHaveBeenCalledWith('42', expect.any(Array))
    })

    it('POST /chat emits user message before agent loop', async () => {
      const { createAgentSession } = await import('@mariozechner/pi-coding-agent')
      vi.mocked(createAgentSession).mockResolvedValueOnce({
        session: makeSessionMock([
          { type: 'message_update', message: { role: 'assistant', content: [{ type: 'text', text: 'ok' }] } },
          { type: 'agent_end' },
        ]) as any,
        modelFallbackMessage: undefined,
        extensionsResult: {} as any,
      })

      const gateway = makeGatewayMock()
      const app = await createHarnessApp({
        systemPrompt: 'test',
        config: sandboxConfig(),
        gateway: gateway as any,
      })
      app.locals.fileSyncReady = true
      await app.locals.initSession()
      await request(app).post('/chat').send({ message: 'hello from user' })

      expect(gateway.emitEvents).toHaveBeenCalledWith(
        null,
        expect.arrayContaining([expect.objectContaining({ role: 'user', content: [{ type: 'text', text: 'hello from user' }] })])
      )
    })

    it('POST /chat emits assistant and toolResult events on turn_end', async () => {
      const { createAgentSession } = await import('@mariozechner/pi-coding-agent')
      const turnEndEvent = {
        type: 'turn_end',
        message: {
          role: 'assistant',
          content: [{ type: 'toolCall', name: 'kb_search', id: 'tc_1', input: { q: 'foo' } }],
        },
        toolResults: [
          { content: [{ type: 'toolResult', toolUseId: 'tc_1', content: [{ type: 'text', text: 'result' }] }] },
        ],
      }
      vi.mocked(createAgentSession).mockResolvedValueOnce({
        session: makeSessionMock([turnEndEvent, { type: 'agent_end' }]) as any,
        modelFallbackMessage: undefined,
        extensionsResult: {} as any,
      })

      let emitCallCount = 0
      const gateway = makeGatewayMock({
        emitEvents: vi.fn().mockImplementation(() => {
          emitCallCount++
          return Promise.resolve({ last_event_id: String(emitCallCount) })
        }),
      })
      const app = await createHarnessApp({
        systemPrompt: 'test',
        config: sandboxConfig(),
        gateway: gateway as any,
      })
      app.locals.fileSyncReady = true
      await app.locals.initSession()
      await request(app).post('/chat').send({ message: 'search something' })

      // Call 1: user message. Call 2: turn_end (assistant + toolResult)
      expect(gateway.emitEvents).toHaveBeenCalledTimes(2)

      const turnEndCall = gateway.emitEvents.mock.calls[1]
      const emittedEvents = turnEndCall[1]
      expect(emittedEvents.some((e: any) => e.role === 'assistant')).toBe(true)
      expect(emittedEvents.some((e: any) => e.role === 'toolResult')).toBe(true)
    })

    it('POST /chat returns 500 and skips agent loop if user message emit fails', async () => {
      const { createAgentSession } = await import('@mariozechner/pi-coding-agent')
      const mockPrompt = vi.fn()
      vi.mocked(createAgentSession).mockResolvedValueOnce({
        session: { ...makeSessionMock([]), prompt: mockPrompt } as any,
        modelFallbackMessage: undefined,
        extensionsResult: {} as any,
      })

      const gateway = makeGatewayMock({
        emitEvents: vi.fn().mockRejectedValue(new Error('gateway_down')),
      })
      const app = await createHarnessApp({
        systemPrompt: 'test',
        config: sandboxConfig(),
        gateway: gateway as any,
      })
      app.locals.fileSyncReady = true
      await app.locals.initSession()
      const res = await request(app).post('/chat').send({ message: 'hi' })

      expect(res.status).toBe(500)
      expect(mockPrompt).not.toHaveBeenCalled()
    })

    it('POST /chat returns 500 when turn_end emit fails', async () => {
      const { createAgentSession } = await import('@mariozechner/pi-coding-agent')
      vi.mocked(createAgentSession).mockResolvedValueOnce({
        session: makeSessionMock([
          { type: 'turn_end', message: { role: 'assistant', content: [{ type: 'text', text: 'a' }] }, toolResults: [] },
          { type: 'agent_end' },
        ]) as any,
        modelFallbackMessage: undefined,
        extensionsResult: {} as any,
      })

      const gateway = makeGatewayMock({
        emitEvents: vi.fn()
          .mockResolvedValueOnce({ last_event_id: '1' })
          .mockRejectedValueOnce(new Error('gateway_down')),
        listEvents: vi.fn()
          .mockResolvedValueOnce({ events: [], last_event_id: null })
          .mockResolvedValueOnce({ events: [], last_event_id: '1' }),
      })
      const app = await createHarnessApp({
        systemPrompt: 'test',
        config: sandboxConfig(),
        gateway: gateway as any,
      })
      app.locals.fileSyncReady = true
      await app.locals.initSession()
      const res = await request(app).post('/chat').send({ message: 'hi' })

      expect(res.status).toBe(500)
      expect(gateway.listEvents).toHaveBeenCalledTimes(2)
    })

    it('POST /chat rejects invalid turn_end content instead of persisting malformed events', async () => {
      const { createAgentSession } = await import('@mariozechner/pi-coding-agent')
      vi.mocked(createAgentSession).mockResolvedValueOnce({
        session: makeSessionMock([
          { type: 'turn_end', message: { role: 'assistant', content: [{ type: 'unknown' }] }, toolResults: [] },
          { type: 'agent_end' },
        ]) as any,
        modelFallbackMessage: undefined,
        extensionsResult: {} as any,
      })

      const gateway = makeGatewayMock({
        emitEvents: vi.fn().mockResolvedValue({ last_event_id: '1' }),
      })
      const app = await createHarnessApp({
        systemPrompt: 'test',
        config: sandboxConfig(),
        gateway: gateway as any,
      })
      app.locals.fileSyncReady = true
      await app.locals.initSession()
      const res = await request(app).post('/chat').send({ message: 'hi' })

      expect(res.status).toBe(500)
      expect(gateway.emitEvents).toHaveBeenCalledTimes(1)
    })

    it('turn_end emits use updated lastEventId from previous emit', async () => {
      const { createAgentSession } = await import('@mariozechner/pi-coding-agent')
      vi.mocked(createAgentSession).mockResolvedValueOnce({
        session: makeSessionMock([
          { type: 'turn_end', message: { role: 'assistant', content: [{ type: 'text', text: 'a' }] }, toolResults: [] },
          { type: 'turn_end', message: { role: 'assistant', content: [{ type: 'text', text: 'b' }] }, toolResults: [] },
          { type: 'agent_end' },
        ]) as any,
        modelFallbackMessage: undefined,
        extensionsResult: {} as any,
      })

      const seqCounter = { n: 0 }
      const gateway = makeGatewayMock({
        emitEvents: vi.fn().mockImplementation(() => {
          seqCounter.n++
          return Promise.resolve({ last_event_id: String(seqCounter.n) })
        }),
      })
      const app = await createHarnessApp({
        systemPrompt: 'test',
        config: sandboxConfig(),
        gateway: gateway as any,
      })
      app.locals.fileSyncReady = true
      await app.locals.initSession()
      await request(app).post('/chat').send({ message: 'hi' })

      // user emit → '1', turn_end 1 emit → '2', turn_end 2 emit → '3'
      const calls = gateway.emitEvents.mock.calls
      expect(calls[0][0]).toBeNull()     // user: no prior events
      expect(calls[1][0]).toBe('1')      // first turn_end: after user emit
      expect(calls[2][0]).toBe('2')      // second turn_end: after first turn_end emit
    })
  })
})

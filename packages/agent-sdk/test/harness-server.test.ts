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

describe('HarnessServer', () => {
  it('GET /health returns 503 before session init completes', async () => {
    const app = await createHarnessApp({
      systemPrompt: 'test',
      config: { mode: 'local', port: 8080 },
    })
    // Do NOT call initSession — sessionReady and fileSyncReady remain false
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

  it('POST /chat with missing message returns 400 after initSession is ready', async () => {
    const app = await createHarnessApp({
      systemPrompt: 'test',
      config: { mode: 'local', port: 8080 },
    })
    app.locals.sessionReady = false
    app.locals.fileSyncReady = true // local mode: no file sync needed
    await app.locals.initSession()
    const res = await request(app).post('/chat').send({})
    expect(res.status).toBe(400)
  })

  it('POST /chat returns reply from agent_end event after initSession is ready', async () => {
    const { createAgentSession } = await import('@mariozechner/pi-coding-agent')
    const mockSession = {
      prompt: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn((listener: any) => {
        setTimeout(() => {
          listener({
            type: 'message_update',
            message: { role: 'assistant', content: [{ type: 'text', text: 'Hello!' }] },
          })
          listener({ type: 'agent_end' })
        }, 0)
        return () => {}
      }),
      systemPrompt: '',
      agent: { setSystemPrompt: vi.fn() },
    }
    vi.mocked(createAgentSession).mockResolvedValueOnce({
      session: mockSession as any,
      modelFallbackMessage: undefined,
      extensionsResult: {} as any,
    })

    const app = await createHarnessApp({
      systemPrompt: 'test',
      config: { mode: 'local', port: 8080 },
    })
    app.locals.sessionReady = false
    app.locals.fileSyncReady = true // local mode: no file sync needed
    await app.locals.initSession()
    const res = await request(app).post('/chat').send({ message: 'hi' })
    expect(res.status).toBe(200)
    expect(res.body.reply).toBe('Hello!')
  })

  it('POST /chat accepts last_message_id and passes it to gateway.appendMessages', async () => {
    const { createAgentSession } = await import('@mariozechner/pi-coding-agent')
    const mockSession = {
      prompt: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn((listener: any) => {
        setTimeout(() => {
          listener({
            type: 'message_update',
            message: { role: 'assistant', content: [{ type: 'text', text: 'Reply!' }] },
          })
          listener({ type: 'agent_end' })
        }, 0)
        return () => {}
      }),
      systemPrompt: '',
      agent: { setSystemPrompt: vi.fn() },
    }
    vi.mocked(createAgentSession).mockResolvedValueOnce({
      session: mockSession as any,
      modelFallbackMessage: undefined,
      extensionsResult: {} as any,
    })

    const mockGateway = {
      appendMessages: vi.fn().mockResolvedValue({ last_message_id: 'msg_res' }),
    }
    const app = await createHarnessApp({
      systemPrompt: 'test',
      config: { mode: 'sandbox', port: 8080, gatewayUrl: 'http://gw', sessionToken: 'tok', persistentRoot: '/tmp' } as any,
      gateway: mockGateway as any,
    })
    app.locals.sessionReady = false
    app.locals.fileSyncReady = true
    await app.locals.initSession()

    const res = await request(app)
      .post('/chat')
      .send({ message: 'hi', last_message_id: 'msg_from_dispatcher' })

    expect(res.status).toBe(200)
    expect(mockGateway.appendMessages).toHaveBeenCalledWith(
      'msg_from_dispatcher',
      expect.arrayContaining([expect.objectContaining({ role: 'assistant' })])
    )
  })
})

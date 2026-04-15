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
}))

describe('HarnessServer', () => {
  it('GET /health returns { ok: true }', async () => {
    const app = await createHarnessApp({
      systemPrompt: 'test',
      config: { mode: 'local', port: 8080 },
    })
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
  })

  it('POST /chat with missing message returns 400', async () => {
    const app = await createHarnessApp({
      systemPrompt: 'test',
      config: { mode: 'local', port: 8080 },
    })
    const res = await request(app).post('/chat').send({})
    expect(res.status).toBe(400)
  })

  it('POST /chat returns reply from agent_end event', async () => {
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
    const res = await request(app).post('/chat').send({ message: 'hi' })
    expect(res.status).toBe(200)
    expect(res.body.reply).toBe('Hello!')
  })
})

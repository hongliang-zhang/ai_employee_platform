import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import app from '../src/index.js'

const SECRET = process.env.JWT_SECRET ?? 'test-secret-32-chars-minimum-len'

function sandboxToken() {
  return jwt.sign({ conversation_id: 'conv_1', agent_id: 'agt_1', caller: 'sandbox' }, SECRET, { expiresIn: '24h' })
}

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

beforeEach(() => { vi.clearAllMocks() })

describe('POST /gateway/llm', () => {
  it('proxies request to OpenAI and returns normalized response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { role: 'assistant', content: 'Hello!' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
    })

    const res = await request(app)
      .post('/gateway/llm')
      .set('Authorization', `Bearer ${sandboxToken()}`)
      .send({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
      })

    expect(res.status).toBe(200)
    expect(res.body.message.role).toBe('assistant')
    expect(res.body.usage.input_tokens).toBe(10)
    expect(mockFetch).toHaveBeenCalledOnce()
  })

  it('returns 502 if upstream fails', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({ error: { message: 'rate limited' } }) })
    const res = await request(app)
      .post('/gateway/llm')
      .set('Authorization', `Bearer ${sandboxToken()}`)
      .send({ model: 'gpt-4o-mini', messages: [] })
    expect(res.status).toBe(502)
    expect(res.body.error.code).toBe('provider_error')
  })

  it('returns 401 without token', async () => {
    const res = await request(app).post('/gateway/llm').send({ model: 'gpt-4o-mini', messages: [] })
    expect(res.status).toBe(401)
  })
})

import { describe, it, expect, vi } from 'vitest'
import request from 'supertest'

// Mock Firecrawl before any module loads so search-web.ts uses the mock
vi.mock('@mendable/firecrawl-js', () => {
  const mockSearch = vi.fn().mockResolvedValue({
    success: true,
    data: [
      { title: 'Result 1', url: 'https://example.com/1', description: 'First result' },
    ],
  })
  return { default: vi.fn().mockImplementation(() => ({ search: mockSearch })) }
})

process.env.INTERNAL_API_KEY = 'test-key'

const { default: app } = await import('../src/index.js')

const KEY = 'test-key'

describe('GET /actions/list', () => {
  it('returns 401 with no X-Internal-Key', async () => {
    const res = await request(app).get('/actions/list')
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('unauthorized')
  })

  it('returns 401 with wrong X-Internal-Key', async () => {
    const res = await request(app).get('/actions/list').set('X-Internal-Key', 'wrong-key')
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('unauthorized')
  })

  it('returns actions array with correct key, no execute field', async () => {
    const res = await request(app).get('/actions/list').set('X-Internal-Key', KEY)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    const names = res.body.map((a: { name: string }) => a.name)
    expect(names).toContain('search_web')
    expect(names).toContain('get_weather')
    expect(names).toContain('kb_search')
    expect(names).toContain('tianyancha_enrich')
    expect(names).toContain('fxiaoke_create_lead')
    expect(names).toContain('fxiaoke_query_lead')
    expect(names).toHaveLength(6)
    for (const action of res.body) {
      expect(action).not.toHaveProperty('execute')
      expect(action).toHaveProperty('name')
      expect(action).toHaveProperty('description')
      expect(action).toHaveProperty('inputSchema')
    }
  })
})

describe('POST /actions/invoke', () => {
  it('returns 401 with no X-Internal-Key', async () => {
    const res = await request(app).post('/actions/invoke').send({ action: 'search_web', input: { query: 'test' }, agentId: 'a1', conversationId: 'c1' })
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('unauthorized')
  })

  it('returns 400 action_not_found for unknown action', async () => {
    const res = await request(app)
      .post('/actions/invoke')
      .set('X-Internal-Key', KEY)
      .send({ action: 'nonexistent', input: {}, agentId: 'a1', conversationId: 'c1' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('action_not_found')
  })

  it('returns 400 action_input_invalid when required field missing', async () => {
    const res = await request(app)
      .post('/actions/invoke')
      .set('X-Internal-Key', KEY)
      .send({ action: 'search_web', input: {}, agentId: 'a1', conversationId: 'c1' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('action_input_invalid')
  })

  it('returns 200 with result for valid search_web invocation', async () => {
    const res = await request(app)
      .post('/actions/invoke')
      .set('X-Internal-Key', KEY)
      .send({ action: 'search_web', input: { query: 'hello world' }, agentId: 'a1', conversationId: 'c1' })
    expect(res.status).toBe(200)
    expect(res.body.result.query).toBe('hello world')
    expect(Array.isArray(res.body.result.results)).toBe(true)
    expect(res.body.result.results[0]).toMatchObject({ title: 'Result 1', url: 'https://example.com/1' })
  })

  it('returns 502 action_execution_failed when execute throws', async () => {
    const { registry } = await import('../src/registry.js')
    const original = registry.get('search_web')!
    registry.set('search_web', { ...original, execute: vi.fn().mockRejectedValue(new Error('api error')) })

    let res: any
    try {
      res = await request(app)
        .post('/actions/invoke')
        .set('X-Internal-Key', KEY)
        .send({ action: 'search_web', input: { query: 'test' }, agentId: 'a1', conversationId: 'c1' })
    } finally {
      registry.set('search_web', original)
    }

    expect(res.status).toBe(502)
    expect(res.body.error.code).toBe('action_execution_failed')
    expect(res.body.error.retryable).toBe(true)
  })
})

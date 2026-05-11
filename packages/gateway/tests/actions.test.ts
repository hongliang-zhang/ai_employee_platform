import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import app from '../src/index.js'

const SECRET = process.env.JWT_SECRET ?? 'test-secret-32-chars-minimum-len'

function sandboxToken() {
  return jwt.sign({ conversation_id: 'conv_1', agent_id: 'agt_1', caller: 'sandbox' }, SECRET, { expiresIn: '24h' })
}

function dispatcherToken() {
  return jwt.sign({ conversation_id: 'conv_1', agent_id: 'agt_1', caller: 'dispatcher' }, SECRET, { expiresIn: '24h' })
}

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

beforeEach(() => { vi.clearAllMocks() })

describe('GET /gateway/actions/list', () => {
  it('returns 403 for dispatcher token', async () => {
    const res = await request(app)
      .get('/gateway/actions/list')
      .set('Authorization', `Bearer ${dispatcherToken()}`)

    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('forbidden')
  })

  it('proxies actions list response for sandbox token', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 200,
      json: async () => ({ actions: [{ name: 'search_web', description: 'Search the web' }] }),
    })

    const res = await request(app)
      .get('/gateway/actions/list')
      .set('Authorization', `Bearer ${sandboxToken()}`)

    expect(res.status).toBe(200)
    expect(res.body.actions).toBeDefined()
    expect(res.body.actions[0].name).toBe('search_web')
    expect(mockFetch).toHaveBeenCalledOnce()
  })

  it('returns 502 action_execution_failed when Actions Service is unreachable', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'))

    const res = await request(app)
      .get('/gateway/actions/list')
      .set('Authorization', `Bearer ${sandboxToken()}`)

    expect(res.status).toBe(502)
    expect(res.body.error.code).toBe('action_execution_failed')
    expect(res.body.error.retryable).toBe(true)
  })
})

describe('POST /gateway/actions/invoke', () => {
  it('returns 403 for dispatcher token', async () => {
    const res = await request(app)
      .post('/gateway/actions/invoke')
      .set('Authorization', `Bearer ${dispatcherToken()}`)
      .send({ action: 'search_web', input: { query: 'ai' } })

    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('forbidden')
  })

  it('forwards request with agentId and conversationId for sandbox token', async () => {
    let capturedBody: any

    mockFetch.mockImplementationOnce(async (_url: string, opts: any) => {
      capturedBody = JSON.parse(opts.body)
      return {
        status: 200,
        json: async () => ({ result: { query: 'ai', results: [] } }),
      }
    })

    const res = await request(app)
      .post('/gateway/actions/invoke')
      .set('Authorization', `Bearer ${sandboxToken()}`)
      .send({ action: 'search_web', input: { query: 'ai' } })

    expect(res.status).toBe(200)
    expect(res.body.result).toBeDefined()
    expect(capturedBody.agentId).toBe('agt_1')
    expect(capturedBody.conversationId).toBe('conv_1')
    expect(capturedBody.action).toBe('search_web')
  })

  it('returns 400 invalid_request when action field is missing', async () => {
    const res = await request(app)
      .post('/gateway/actions/invoke')
      .set('Authorization', `Bearer ${sandboxToken()}`)
      .send({ input: { query: 'ai' } })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('invalid_request')
  })

  it('returns 504 action_timeout when Actions Service times out', async () => {
    const abortErr = new Error('The operation was aborted')
    abortErr.name = 'AbortError'
    mockFetch.mockRejectedValueOnce(abortErr)

    const res = await request(app)
      .post('/gateway/actions/invoke')
      .set('Authorization', `Bearer ${sandboxToken()}`)
      .send({ action: 'search_web', input: { query: 'ai' } })

    expect(res.status).toBe(504)
    expect(res.body.error.code).toBe('action_timeout')
    expect(res.body.error.retryable).toBe(true)
  })
})

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { createAuthMiddleware } from '../src/auth.js'

const SECRET = 'test-secret-32-chars-minimum-len'

function makeReq(token?: string): Partial<Request> {
  return {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  }
}

function makeRes(): { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> } & Partial<Response> {
  const res = { json: vi.fn(), status: vi.fn() } as any
  res.status.mockReturnValue(res)
  return res
}

describe('createAuthMiddleware', () => {
  const middleware = createAuthMiddleware(SECRET)
  const next = vi.fn() as unknown as NextFunction

  beforeEach(() => { vi.clearAllMocks() })

  it('rejects missing token with 401', () => {
    const req = makeReq() as Request
    const res = makeRes() as Response
    middleware(req, res, next)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('rejects expired token with 401', () => {
    const token = jwt.sign({ conversation_id: 'conv_1', agent_id: 'agt_1', caller: 'sandbox' }, SECRET, { expiresIn: -1 })
    const req = makeReq(token) as Request
    const res = makeRes() as Response
    middleware(req, res, next)
    expect(res.status).toHaveBeenCalledWith(401)
  })

  it('accepts valid sandbox token and sets req.jwtPayload', () => {
    const token = jwt.sign({ conversation_id: 'conv_1', agent_id: 'agt_1', caller: 'sandbox' }, SECRET, { expiresIn: '24h' })
    const req = makeReq(token) as Request
    const res = makeRes() as Response
    middleware(req, res, next)
    expect(next).toHaveBeenCalled()
    expect((req as any).jwtPayload.conversation_id).toBe('conv_1')
    expect((req as any).jwtPayload.caller).toBe('sandbox')
  })

  it('accepts valid dispatcher token', () => {
    const token = jwt.sign({ conversation_id: 'conv_1', agent_id: 'agt_1', caller: 'dispatcher' }, SECRET, { expiresIn: '60s' })
    const req = makeReq(token) as Request
    const res = makeRes() as Response
    middleware(req, res, next)
    expect(next).toHaveBeenCalled()
    expect((req as any).jwtPayload.caller).toBe('dispatcher')
  })
})

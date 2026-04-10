import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

export interface JwtPayload {
  conversation_id: string
  agent_id: string
  caller: 'sandbox' | 'dispatcher'
  exp: number
}

declare global {
  namespace Express {
    interface Request {
      jwtPayload: JwtPayload
    }
  }
}

export function createAuthMiddleware(secret: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: { code: 'unauthorized', message: 'Missing token', retryable: false, details: {} } })
      return
    }
    const token = authHeader.slice(7)
    try {
      const payload = jwt.verify(token, secret) as JwtPayload
      req.jwtPayload = payload
      next()
    } catch (err: any) {
      const code = err.name === 'TokenExpiredError' ? 'token_expired' : 'unauthorized'
      res.status(401).json({ error: { code, message: err.message, retryable: false, details: {} } })
    }
  }
}

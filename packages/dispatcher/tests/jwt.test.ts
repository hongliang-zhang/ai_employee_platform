import { describe, it, expect } from 'vitest'
import jwt from 'jsonwebtoken'
import { createJwtSigner } from '../src/jwt.js'

const SECRET = 'test-secret-32-chars-minimum-len'
const signer = createJwtSigner(SECRET)

describe('createJwtSigner', () => {
  it('signs sandbox token with 24h expiry and caller=sandbox', () => {
    const token = signer.signSandboxToken('conv_1', 'agt_1')
    const payload = jwt.verify(token, SECRET) as any
    expect(payload.conversation_id).toBe('conv_1')
    expect(payload.agent_id).toBe('agt_1')
    expect(payload.caller).toBe('sandbox')
    // exp should be ~24h from now
    expect(payload.exp - payload.iat).toBeGreaterThan(86000)
  })

  it('signs dispatcher token with 60s expiry and caller=dispatcher', () => {
    const token = signer.signDispatcherToken('conv_1', 'agt_1')
    const payload = jwt.verify(token, SECRET) as any
    expect(payload.caller).toBe('dispatcher')
    expect(payload.exp - payload.iat).toBeLessThanOrEqual(61)
  })
})

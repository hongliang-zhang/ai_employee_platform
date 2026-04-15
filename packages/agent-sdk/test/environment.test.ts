import { afterEach, describe, expect, it } from 'vitest'
import { detectEnvironment, resolveConfig, type SandboxConfig } from '../src/environment.js'

describe('detectEnvironment', () => {
  const original = { ...process.env }

  afterEach(() => {
    for (const key of ['GATEWAY_URL', 'SESSION_TOKEN', 'SESSION_ID']) {
      if (original[key] === undefined) delete process.env[key]
      else process.env[key] = original[key]
    }
  })

  it('returns "local" when env vars are absent', () => {
    delete process.env.GATEWAY_URL
    delete process.env.SESSION_TOKEN
    expect(detectEnvironment()).toBe('local')
  })

  it('returns "sandbox" when GATEWAY_URL and SESSION_TOKEN are set', () => {
    process.env.GATEWAY_URL = 'https://gw.example.com'
    process.env.SESSION_TOKEN = 'tok_abc'
    process.env.SESSION_ID = 'conv_123'
    expect(detectEnvironment()).toBe('sandbox')
  })

  it('returns "local" when only GATEWAY_URL is set (SESSION_TOKEN missing)', () => {
    process.env.GATEWAY_URL = 'https://gw.example.com'
    delete process.env.SESSION_TOKEN
    expect(detectEnvironment()).toBe('local')
  })
})

describe('resolveConfig', () => {
  afterEach(() => {
    for (const key of ['GATEWAY_URL', 'SESSION_TOKEN', 'SESSION_ID', 'PORT']) {
      delete process.env[key]
    }
  })

  it('returns sandbox config when env vars present', () => {
    process.env.GATEWAY_URL = 'https://gw.example.com'
    process.env.SESSION_TOKEN = 'tok_abc'
    process.env.SESSION_ID = 'conv_123'
    const config = resolveConfig()
    expect(config.mode).toBe('sandbox')
    if (config.mode === 'sandbox') {
      expect(config.gatewayUrl).toBe('https://gw.example.com')
      expect(config.sessionToken).toBe('tok_abc')
      expect(config.sessionId).toBe('conv_123')
      expect(config.port).toBe(8080)
      expect(config.persistentRoot).toBe('/persistent')
    }
  })

  it('returns local config when env vars absent', () => {
    const config = resolveConfig()
    expect(config.mode).toBe('local')
  })

  it('respects PORT env var', () => {
    process.env.GATEWAY_URL = 'https://gw.example.com'
    process.env.SESSION_TOKEN = 'tok'
    process.env.SESSION_ID = 'conv'
    process.env.PORT = '9090'
    const config = resolveConfig()
    expect(config.port).toBe(9090)
  })
})

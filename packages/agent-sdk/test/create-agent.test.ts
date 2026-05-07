// Regression for: initSession() and fileSync.init() ran concurrently, so
// SessionManager.continueRecent() found an empty conversation/ dir (files not yet
// downloaded from COS) and started a fresh session every time — losing all memory.
import { afterEach, describe, expect, it, vi } from 'vitest'
import express from 'express'

vi.mock('http', () => ({
  createServer: vi.fn().mockReturnValue({
    listen: vi.fn().mockImplementation((_port: any, cb: () => void) => cb()),
    close: vi.fn().mockImplementation((cb?: () => void) => cb?.()),
  }),
}))

vi.mock('../src/environment.js', () => ({
  resolveConfig: vi.fn(),
}))

vi.mock('../src/gateway-client.js', () => ({
  GatewayClient: vi.fn().mockReturnValue({}),
}))

vi.mock('../src/file-sync.js', () => ({
  FileSync: vi.fn(),
}))

vi.mock('../src/harness-server.js', () => ({
  createHarnessApp: vi.fn(),
}))

vi.mock('../src/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

describe('createAgent', () => {
  afterEach(() => {
    vi.clearAllMocks()
    process.removeAllListeners('SIGTERM')
  })

  it('sandbox: session init runs only after fileSync.init() resolves', async () => {
    const { createAgent } = await import('../src/create-agent.js')
    const { FileSync } = await import('../src/file-sync.js')
    const { createHarnessApp } = await import('../src/harness-server.js')
    const { resolveConfig } = await import('../src/environment.js')

    let resolveFileSyncInit!: () => void
    vi.mocked(FileSync).mockImplementation(() => ({
      init: vi.fn().mockReturnValue(new Promise<void>((resolve) => { resolveFileSyncInit = resolve })),
      startWatch: vi.fn(),
      stopWatch: vi.fn(),
      flush: vi.fn().mockResolvedValue(undefined),
    }) as any)

    const initSessionMock = vi.fn().mockResolvedValue(undefined)
    vi.mocked(createHarnessApp).mockImplementation((() => {
      const app = express()
      app.locals.initSession = initSessionMock
      return app
    }) as any)

    vi.mocked(resolveConfig).mockReturnValue({
      mode: 'sandbox',
      port: 0,
      gatewayUrl: 'http://gw',
      sessionToken: 'tok',
      sessionId: 'sid',
      persistentRoot: '/tmp',
    } as any)

    await createAgent()

    // fileSync.init() is still pending — initSession must NOT have been called yet.
    // The old (buggy) code ran initSession concurrently, so it would already be called here.
    expect(initSessionMock).not.toHaveBeenCalled()

    // Resolve fileSync.init() — this unblocks the .then() chain in createAgent
    resolveFileSyncInit()
    await new Promise((r) => setTimeout(r, 10)) // let promise microtasks flush

    // Now initSession must have been called exactly once
    expect(initSessionMock).toHaveBeenCalledOnce()
  })
})

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

describe('createAgent — actions option', () => {
  afterEach(() => {
    vi.clearAllMocks()
    process.removeAllListeners('SIGTERM')
  })

  /** Shared helper: set up sandbox mode mocks and return the key mock functions */
  async function setupSandboxMocks() {
    const { FileSync } = await import('../src/file-sync.js')
    const { GatewayClient } = await import('../src/gateway-client.js')
    const { createHarnessApp } = await import('../src/harness-server.js')
    const { resolveConfig } = await import('../src/environment.js')

    vi.mocked(FileSync).mockImplementation(() => ({
      init: vi.fn().mockResolvedValue(undefined),
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

    return { GatewayClient, createHarnessApp, initSessionMock }
  }

  it('listActions failure → warn log, agent starts without action tools, no error thrown', async () => {
    const { createAgent } = await import('../src/create-agent.js')
    const { GatewayClient, createHarnessApp } = await setupSandboxMocks()
    const { logger } = await import('../src/logger.js')

    const listActionsMock = vi.fn().mockRejectedValue(new Error('gateway_unavailable'))
    vi.mocked(GatewayClient).mockImplementation(() => ({
      listActions: listActionsMock,
      invokeAction: vi.fn(),
      appendMessages: vi.fn(),
      presignUrls: vi.fn(),
      listFiles: vi.fn(),
    }) as any)

    // Should NOT throw even though listActions failed
    await expect(createAgent({ actions: ['search_web'] })).resolves.toBeUndefined()

    // warn must include the failure event
    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'agent.actions_list_failed' }),
    )

    // createHarnessApp should still be called (agent starts up)
    expect(vi.mocked(createHarnessApp)).toHaveBeenCalledOnce()
  })

  it('unknown action names → warn log, only known actions registered', async () => {
    const { createAgent } = await import('../src/create-agent.js')
    const { GatewayClient, createHarnessApp } = await setupSandboxMocks()
    const { logger } = await import('../src/logger.js')

    const knownAction = {
      name: 'search_web',
      description: 'Search the web',
      inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    }
    vi.mocked(GatewayClient).mockImplementation(() => ({
      listActions: vi.fn().mockResolvedValue([knownAction]),
      invokeAction: vi.fn(),
      appendMessages: vi.fn(),
      presignUrls: vi.fn(),
      listFiles: vi.fn(),
    }) as any)

    await createAgent({ actions: ['search_web', 'nonexistent_action'] })

    // warn for unknown names
    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'agent.actions_unknown', names: ['nonexistent_action'] }),
    )

    // createHarnessApp must receive tools containing only search_web
    const appCall = vi.mocked(createHarnessApp).mock.calls[0][0]
    const toolNames = (appCall.tools ?? []).map((t: any) => t.name)
    expect(toolNames).toContain('search_web')
    expect(toolNames).not.toContain('nonexistent_action')
  })

  it('normal path → action tool registered, execute forwards to invokeAction', async () => {
    const { createAgent } = await import('../src/create-agent.js')
    const { GatewayClient, createHarnessApp } = await setupSandboxMocks()

    const invokeActionMock = vi.fn().mockResolvedValue({ result: 'ok' })
    const knownAction = {
      name: 'search_web',
      description: 'Search the web',
      inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    }
    vi.mocked(GatewayClient).mockImplementation(() => ({
      listActions: vi.fn().mockResolvedValue([knownAction]),
      invokeAction: invokeActionMock,
      appendMessages: vi.fn(),
      presignUrls: vi.fn(),
      listFiles: vi.fn(),
    }) as any)

    await createAgent({ actions: ['search_web'] })

    // createHarnessApp receives tools with search_web
    const appCall = vi.mocked(createHarnessApp).mock.calls[0][0]
    const tools: any[] = appCall.tools ?? []
    const searchTool = tools.find((t: any) => t.name === 'search_web')
    expect(searchTool).toBeDefined()
    expect(searchTool.description).toBe('Search the web')
    expect(searchTool.parameters).toEqual(knownAction.inputSchema)

    // Calling execute must forward the call to invokeAction
    const fakeInput = { query: 'hello' }
    await searchTool.execute('call-1', fakeInput)
    expect(invokeActionMock).toHaveBeenCalledWith('search_web', fakeInput)
  })
})

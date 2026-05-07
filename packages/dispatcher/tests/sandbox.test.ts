import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSandboxOrchestrator } from '../src/sandbox.js'

const mockCreate = vi.fn()
vi.mock('@e2b/code-interpreter', () => ({
  Sandbox: { create: (...args: any[]) => mockCreate(...args) },
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

beforeEach(() => vi.clearAllMocks())

function fakeSandbox(id: string, domain = 'e2b.app', kill = vi.fn().mockResolvedValue(undefined)) {
  return {
    sandboxId: id,
    sandboxDomain: domain,
    commands: { run: vi.fn().mockResolvedValue({ stdout: '', stderr: '' }) },
    kill,
  }
}

function okJson(data: unknown) {
  return { ok: true, json: async () => data }
}

function baseParams(overrides = {}) {
  return {
    conversationId: 'conv_1',
    templateId: 'tpl_x',
    port: 8080,
    sessionToken: 'tok',
    message: 'hi',
    lastMessageId: null,
    traceId: 'tr_1',
    ...overrides,
  }
}

describe('SandboxOrchestrator', () => {
  it('creates a fresh sandbox for each request', async () => {
    const orch = createSandboxOrchestrator({ e2bApiKey: 'key', gatewayUrl: 'http://gw', instanceId: 'test' })
    mockCreate
      .mockResolvedValueOnce(fakeSandbox('sb_1'))
      .mockResolvedValueOnce(fakeSandbox('sb_2'))
    mockFetch.mockResolvedValue(okJson({ reply: 'hello' }))

    await orch.chat(baseParams({ message: 'first' }))
    await orch.chat(baseParams({ message: 'second' }))

    expect(mockCreate).toHaveBeenCalledTimes(2)
  })

  it('kills sandbox after successful chat', async () => {
    const orch = createSandboxOrchestrator({ e2bApiKey: 'key', gatewayUrl: 'http://gw', instanceId: 'test' })
    const kill = vi.fn().mockResolvedValue(undefined)
    mockCreate.mockResolvedValueOnce(fakeSandbox('sb_1', 'e2b.app', kill))
    mockFetch.mockResolvedValue(okJson({ reply: 'hello' }))

    await orch.chat(baseParams())

    expect(kill).toHaveBeenCalledOnce()
  })

  it('kills sandbox after failed chat', async () => {
    const orch = createSandboxOrchestrator({ e2bApiKey: 'key', gatewayUrl: 'http://gw', instanceId: 'test' })
    const kill = vi.fn().mockResolvedValue(undefined)
    mockCreate.mockResolvedValueOnce(fakeSandbox('sb_1', 'e2b.app', kill))
    mockFetch
      .mockResolvedValueOnce({ ok: true })           // /health
      .mockResolvedValueOnce({ ok: false, status: 500 }) // /chat

    await expect(orch.chat(baseParams())).rejects.toThrow('sandbox returned 500')
    expect(kill).toHaveBeenCalledOnce()
  })

  it('retries transient 503 chat responses after health is ready', async () => {
    vi.useFakeTimers()
    try {
      const orch = createSandboxOrchestrator({ e2bApiKey: 'key', gatewayUrl: 'http://gw', instanceId: 'test' })
      const kill = vi.fn().mockResolvedValue(undefined)
      mockCreate.mockResolvedValueOnce(fakeSandbox('sb_1', 'e2b.app', kill))
      mockFetch
        .mockResolvedValueOnce({ ok: true }) // /health
        .mockResolvedValueOnce({ ok: false, status: 503 }) // /chat transient
        .mockResolvedValueOnce(okJson({ reply: 'hello after retry' })) // /chat success
        .mockResolvedValueOnce({ ok: true }) // /shutdown

      const chatPromise = orch.chat(baseParams())
      await vi.runAllTimersAsync()

      await expect(chatPromise).resolves.toBe('hello after retry')
      expect(kill).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

  it('passes correct options to Sandbox.create without domain', async () => {
    const orch = createSandboxOrchestrator({ e2bApiKey: 'key', gatewayUrl: 'http://gw', instanceId: 'test' })
    mockCreate.mockResolvedValueOnce(fakeSandbox('sb_1'))
    mockFetch.mockResolvedValue(okJson({ reply: 'ok' }))

    await orch.chat(baseParams())

    expect(mockCreate).toHaveBeenCalledWith('tpl_x', { apiKey: 'key', secure: false })
  })

  it('passes domain to Sandbox.create when configured', async () => {
    const orch = createSandboxOrchestrator({ e2bApiKey: 'key', e2bDomain: 'ap-beijing.tencentags.com', gatewayUrl: 'http://gw', instanceId: 'test' })
    mockCreate.mockResolvedValueOnce(fakeSandbox('sb_1', 'ap-beijing.tencentags.com'))
    mockFetch.mockResolvedValue(okJson({ reply: 'ok' }))

    await orch.chat(baseParams())

    expect(mockCreate).toHaveBeenCalledWith('tpl_x', { apiKey: 'key', domain: 'ap-beijing.tencentags.com', secure: false })
  })

  it('constructs chat URL from sandbox id, port, and domain', async () => {
    const orch = createSandboxOrchestrator({ e2bApiKey: 'key', e2bDomain: 'ap-beijing.tencentags.com', gatewayUrl: 'http://gw', instanceId: 'test' })
    mockCreate.mockResolvedValueOnce(fakeSandbox('sb_1', 'ap-beijing.tencentags.com'))
    mockFetch.mockResolvedValue(okJson({ reply: 'ok' }))

    await orch.chat(baseParams())

    expect(mockFetch).toHaveBeenCalledWith(
      'https://8080-sb_1.ap-beijing.tencentags.com/chat',
      expect.any(Object)
    )
  })

  it('waits long enough for AGS health endpoint to become ready', async () => {
    vi.useFakeTimers()
    try {
      const orch = createSandboxOrchestrator({ e2bApiKey: 'key', e2bDomain: 'ap-beijing.tencentags.com', gatewayUrl: 'http://gw', instanceId: 'test' })
      const kill = vi.fn().mockResolvedValue(undefined)
      mockCreate.mockResolvedValueOnce(fakeSandbox('sb_1', 'ap-beijing.tencentags.com', kill))
      for (let i = 0; i < 20; i++) mockFetch.mockResolvedValueOnce({ ok: false, status: 404 })
      mockFetch
        .mockResolvedValueOnce({ ok: true })              // /health (finally ready)
        .mockResolvedValueOnce(okJson({ reply: 'ready' })) // /chat
        .mockResolvedValueOnce({ ok: true })              // /shutdown

      const chatPromise = orch.chat(baseParams())
      await vi.runAllTimersAsync()

      await expect(chatPromise).resolves.toBe('ready')
      expect(kill).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

  it('calls /shutdown before killing sandbox after successful chat', async () => {
    const killOrder: string[] = []
    const kill = vi.fn().mockImplementation(async () => { killOrder.push('kill') })
    mockCreate.mockResolvedValueOnce(fakeSandbox('sb_1', 'e2b.app', kill))

    const shutdownOrder: string[] = []
    mockFetch.mockImplementation(async (url: string) => {
      if ((url as string).endsWith('/shutdown')) shutdownOrder.push('shutdown')
      return okJson({ reply: 'hello' })
    })

    const orch = createSandboxOrchestrator({ e2bApiKey: 'key', gatewayUrl: 'http://gw', instanceId: 'test' })
    await orch.chat(baseParams())

    expect(shutdownOrder).toEqual(['shutdown'])
    expect(killOrder).toEqual(['kill'])
    // shutdown resolved before kill because kill is in the finally block
    expect(kill).toHaveBeenCalledOnce()
  })

  it('does not call /shutdown when chat fails; still kills sandbox', async () => {
    const orch = createSandboxOrchestrator({ e2bApiKey: 'key', gatewayUrl: 'http://gw', instanceId: 'test' })
    const kill = vi.fn().mockResolvedValue(undefined)
    mockCreate.mockResolvedValueOnce(fakeSandbox('sb_1', 'e2b.app', kill))
    mockFetch
      .mockResolvedValueOnce({ ok: true }) // /health
      .mockResolvedValueOnce({ ok: false, status: 500 }) // /chat fails

    await expect(orch.chat(baseParams())).rejects.toThrow('sandbox returned 500')

    const calls = mockFetch.mock.calls.map((c) => c[0] as string)
    expect(calls.some((url) => url.endsWith('/shutdown'))).toBe(false)
    expect(kill).toHaveBeenCalledOnce()
  })

  it('kills sandbox and throws when health check times out', async () => {
    vi.useFakeTimers()
    try {
      const orch = createSandboxOrchestrator({ e2bApiKey: 'key', gatewayUrl: 'http://gw', instanceId: 'test' })
      const kill = vi.fn().mockResolvedValue(undefined)
      mockCreate.mockResolvedValueOnce(fakeSandbox('sb_1', 'e2b.app', kill))
      mockFetch.mockResolvedValue({ ok: false, status: 503 }) // health always fails

      const chatPromise = orch.chat(baseParams())
      chatPromise.catch(() => {}) // prevent unhandled rejection before .rejects attaches
      await vi.runAllTimersAsync()

      await expect(chatPromise).rejects.toThrow('sandbox health check timed out')
      expect(kill).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })
})

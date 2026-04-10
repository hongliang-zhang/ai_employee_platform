import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSandboxOrchestrator } from '../src/sandbox.js'

// Mock e2b Sandbox
const mockCreate = vi.fn()
const mockKill = vi.fn()
vi.mock('@e2b/code-interpreter', () => ({
  Sandbox: { create: (...args: any[]) => mockCreate(...args) },
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

beforeEach(() => vi.clearAllMocks())

describe('SandboxOrchestrator', () => {
  it('returns existing sandbox on reuse', async () => {
    const orch = createSandboxOrchestrator({ e2bApiKey: 'key', gatewayUrl: 'http://gw', instanceId: 'test' })
    const fakeCommands = { run: vi.fn().mockResolvedValue({ stdout: '', stderr: '' }) }
    const fakeSandbox = { sandboxId: 'sb_1', sandboxDomain: 'e2b.app', commands: fakeCommands }
    mockCreate.mockResolvedValueOnce(fakeSandbox)
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })

    const r1 = await orch.getOrCreate('conv_1', 'tpl_x', 8080, 'tok', 300000)
    const r2 = await orch.getOrCreate('conv_1', 'tpl_x', 8080, 'tok', 300000)
    expect(mockCreate).toHaveBeenCalledOnce()
    expect(r1.sandboxId).toBe(r2.sandboxId)
  })

  it('creates new sandbox when none exists', async () => {
    const orch = createSandboxOrchestrator({ e2bApiKey: 'key', gatewayUrl: 'http://gw', instanceId: 'test' })
    const fakeCommands = { run: vi.fn().mockResolvedValue({ stdout: '', stderr: '' }) }
    const fakeSandbox = { sandboxId: 'sb_2', sandboxDomain: 'e2b.app', commands: fakeCommands }
    mockCreate.mockResolvedValueOnce(fakeSandbox)
    mockFetch.mockResolvedValue({ ok: true })
    const result = await orch.getOrCreate('conv_2', 'tpl_x', 8080, 'tok', 300000)
    expect(result.sandboxId).toBe('sb_2')
    expect(mockCreate).toHaveBeenCalled()
  })

  it('removes sandbox from map after destroy', async () => {
    const orch = createSandboxOrchestrator({ e2bApiKey: 'key', gatewayUrl: 'http://gw', instanceId: 'test' })
    const fakeKill = vi.fn().mockResolvedValue(undefined)
    const fakeCommands = { run: vi.fn().mockResolvedValue({ stdout: '', stderr: '' }) }
    const fakeSandbox = { sandboxId: 'sb_3', sandboxDomain: 'e2b.app', commands: fakeCommands, kill: fakeKill }
    mockCreate.mockResolvedValueOnce(fakeSandbox)
    mockFetch.mockResolvedValue({ ok: true })
    await orch.getOrCreate('conv_3', 'tpl_x', 8080, 'tok', 300000)
    expect(fakeKill).not.toHaveBeenCalled()
    await orch.destroy('conv_3')
    expect(fakeKill).toHaveBeenCalled()
  })
})

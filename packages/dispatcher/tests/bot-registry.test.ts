import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createBotRegistry } from '../src/bot-registry.js'

// ── mock createBotRunner ──────────────────────────────────────────────────────
const mockStart = vi.fn().mockResolvedValue(undefined)
const mockStop = vi.fn()

vi.mock('../src/bot-runner.js', () => ({
  createBotRunner: vi.fn(() => ({ start: mockStart, stop: mockStop })),
}))

// ── mock DB ───────────────────────────────────────────────────────────────────
const mockFindMany = vi.fn()
const mockDb = { imConfig: { findMany: mockFindMany } }

// ── shared deps (opaque to registry) ─────────────────────────────────────────
const DEPS = {
  db: mockDb as any,
  enc: {} as any,
  jwt: {} as any,
  conversation: {} as any,
  imMessageTracker: {} as any,
  gateway: {} as any,
  sandbox: {} as any,
}

const ACTIVE_AGENT = { id: 'agt_1', status: 'active', e2bTemplateId: 'tpl_1', port: 8080, idleTimeoutMs: 300_000 }

function makeCfg(id: string, provider = 'telegram') {
  return { id, provider, credentialsEnc: 'enc', agent: ACTIVE_AGENT }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

// ── start / initial poll ──────────────────────────────────────────────────────
describe('BotRegistry - initial poll on start()', () => {
  it('starts a runner for each active im_config', async () => {
    mockFindMany.mockResolvedValue([makeCfg('cfg_1'), makeCfg('cfg_2')])

    const registry = createBotRegistry({ ...DEPS, pollIntervalMs: 60_000 })
    await registry.start()

    expect(mockStart).toHaveBeenCalledTimes(2)
    await registry.stop()
  })

  it('skips configs whose agent is not active', async () => {
    mockFindMany.mockResolvedValue([
      { ...makeCfg('cfg_1'), agent: { ...ACTIVE_AGENT, status: 'inactive' } },
    ])

    const registry = createBotRegistry({ ...DEPS, pollIntervalMs: 60_000 })
    await registry.start()

    expect(mockStart).not.toHaveBeenCalled()
    await registry.stop()
  })

  it('does not double-start a bot already in the registry', async () => {
    mockFindMany.mockResolvedValue([makeCfg('cfg_1')])

    const registry = createBotRegistry({ ...DEPS, pollIntervalMs: 60_000 })
    await registry.start()

    // Manually trigger a second poll by advancing the timer
    await vi.advanceTimersByTimeAsync(60_000)

    expect(mockStart).toHaveBeenCalledTimes(1)
    await registry.stop()
  })
})

// ── polling diff ─────────────────────────────────────────────────────────────
describe('BotRegistry - polling diff', () => {
  it('stops a runner when its config disappears from DB', async () => {
    mockFindMany
      .mockResolvedValueOnce([makeCfg('cfg_1')])  // first poll
      .mockResolvedValueOnce([])                   // second poll: cfg_1 gone

    const registry = createBotRegistry({ ...DEPS, pollIntervalMs: 1_000 })
    await registry.start()

    expect(mockStop).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1_000)

    expect(mockStop).toHaveBeenCalledOnce()
    await registry.stop()
  })

  it('starts a runner when a new config appears in DB', async () => {
    mockFindMany
      .mockResolvedValueOnce([])               // first poll: empty
      .mockResolvedValueOnce([makeCfg('cfg_1')]) // second poll: cfg_1 added

    const registry = createBotRegistry({ ...DEPS, pollIntervalMs: 1_000 })
    await registry.start()

    expect(mockStart).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1_000)

    expect(mockStart).toHaveBeenCalledOnce()
    await registry.stop()
  })

  it('swallows DB errors and retries on next interval', async () => {
    mockFindMany
      .mockResolvedValueOnce([makeCfg('cfg_1')])
      .mockRejectedValueOnce(new Error('db gone'))
      .mockResolvedValueOnce([makeCfg('cfg_1')])

    const registry = createBotRegistry({ ...DEPS, pollIntervalMs: 1_000 })
    await registry.start()

    // DB error on second poll — cfg_1 must still be running (stop not called)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(mockStop).not.toHaveBeenCalled()

    // Third poll succeeds — cfg_1 still running, no duplicate start
    await vi.advanceTimersByTimeAsync(1_000)
    expect(mockStart).toHaveBeenCalledTimes(1)

    await registry.stop()
  })

  it('starts remaining bots even when one runner.start() fails', async () => {
    mockFindMany.mockResolvedValue([makeCfg('cfg_1'), makeCfg('cfg_2')])
    mockStart
      .mockRejectedValueOnce(new Error('bad credentials'))  // cfg_1 fails
      .mockResolvedValueOnce(undefined)                      // cfg_2 succeeds

    const registry = createBotRegistry({ ...DEPS, pollIntervalMs: 60_000 })
    await registry.start()

    expect(mockStart).toHaveBeenCalledTimes(2)
    await registry.stop()
  })
})

// ── stop ─────────────────────────────────────────────────────────────────────
describe('BotRegistry - stop()', () => {
  it('stops all running runners', async () => {
    mockFindMany.mockResolvedValue([makeCfg('cfg_1'), makeCfg('cfg_2')])

    const registry = createBotRegistry({ ...DEPS, pollIntervalMs: 60_000 })
    await registry.start()
    await registry.stop()

    expect(mockStop).toHaveBeenCalledTimes(2)
  })

  it('cancels the polling interval', async () => {
    mockFindMany.mockResolvedValue([])

    const registry = createBotRegistry({ ...DEPS, pollIntervalMs: 1_000 })
    await registry.start()
    await registry.stop()

    await vi.advanceTimersByTimeAsync(5_000)

    // Only the initial poll should have fired (1 call), not subsequent interval polls
    expect(mockFindMany).toHaveBeenCalledTimes(1)
  })
})

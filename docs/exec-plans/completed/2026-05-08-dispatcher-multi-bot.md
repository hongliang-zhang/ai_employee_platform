# Dispatcher Multi-Bot Implementation Plan

<!-- DOC-GARDENING-FLAG: This appears implemented in packages/dispatcher/src/bot-runner.ts and bot-registry.ts, but checklist state was not updated. Verify and move to completed/ instead of executing from scratch. -->

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable a single dispatcher process to manage multiple bots across multiple agents, with hot-loading via 30-second DB polling.

**Architecture:** Two new files — `bot-runner.ts` (one bot's lifecycle) and `bot-registry.ts` (all runners + polling diff loop). Feishu `listen()` gains a stop function. `index.ts` shrinks to shared-dep assembly + `registry.start()`.

**Tech Stack:** TypeScript, Vitest, `@larksuiteoapi/node-sdk` v1.60.0, existing dispatcher deps.

**Spec:** `docs/product-specs/2026-05-08-dispatcher-multi-bot-design.md`

---

## File Map

```
packages/dispatcher/
  src/
    bot-runner.ts        NEW — BotRunner: start/stop one im_config connection
    bot-registry.ts      NEW — BotRegistry: Map<configId, BotRunner> + poll loop
    im/feishu.ts         MODIFY — listen() returns Promise<() => void> instead of Promise<void>
    index.ts             MODIFY — replace single-bot logic with BotRegistry
  tests/
    bot-runner.test.ts   NEW — unit tests for BotRunner
    bot-registry.test.ts NEW — unit tests for BotRegistry
    feishu.test.ts       ADD — one new test for listen() stop fn (existing tests untouched)
```

---

## Task 1: Update Feishu listen() to return stop function

**Files:**
- Modify: `packages/dispatcher/src/im/feishu.ts`
- Modify: `packages/dispatcher/tests/feishu.test.ts` (add one test, existing tests unchanged)

- [ ] **Step 1: Add a failing test for listen() returning a stop function**

Open `packages/dispatcher/tests/feishu.test.ts` and append this new `describe` block at the bottom (after the existing `describe('createFeishuClient', ...)` block):

```ts
describe('createFeishuClient - listen', () => {
  it('listen() resolves to a callable stop function', async () => {
    const mockClose = vi.fn()
    const mockWsStart = vi.fn().mockResolvedValue(undefined)
    const { WSClient, EventDispatcher } = await import('@larksuiteoapi/node-sdk')
    vi.mocked(WSClient).mockImplementation(() => ({ start: mockWsStart, close: mockClose }) as any)
    vi.mocked(EventDispatcher).mockImplementation(() => ({ register: vi.fn().mockReturnThis() }) as any)

    const { listen } = createFeishuClient('app_id', 'app_secret', 'bot_open_id')
    const stop = await listen(vi.fn(), 'im:cfg_1')

    expect(typeof stop).toBe('function')
    stop()
    expect(mockClose).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @aaas/dispatcher test tests/feishu.test.ts
```

Expected: FAIL — the test will error because `listen()` currently returns `Promise<void>`, so `stop` is `undefined`.

- [ ] **Step 3: Update feishu.ts listen() return type**

In `packages/dispatcher/src/im/feishu.ts`, change the `listen` function signature and body:

```ts
// Before
async function listen(
  onMessage: (msg: NormalizedMessage) => Promise<void>,
  imConfigId: string
): Promise<void> {
  const wsClient = new lark.WSClient({ appId, appSecret })
  await wsClient.start({
    eventDispatcher: new lark.EventDispatcher({}).register({
      'im.message.receive_v1': async (data: any) => {
        const msg = normalizeFeishuEvent(data, imConfigId, botOpenId)
        if (!msg) return
        await onMessage(msg).catch(err =>
          logger.error({ event: 'feishu.processor.error', error: String(err) })
        )
      },
    }),
  })
}

// After
async function listen(
  onMessage: (msg: NormalizedMessage) => Promise<void>,
  imConfigId: string
): Promise<() => void> {
  const wsClient = new lark.WSClient({ appId, appSecret })
  await wsClient.start({
    eventDispatcher: new lark.EventDispatcher({}).register({
      'im.message.receive_v1': async (data: any) => {
        const msg = normalizeFeishuEvent(data, imConfigId, botOpenId)
        if (!msg) return
        await onMessage(msg).catch(err =>
          logger.error({ event: 'feishu.processor.error', error: String(err) })
        )
      },
    }),
  })
  return () => wsClient.close()
}
```

Also update the return type in the `createFeishuClient` return object declaration:

```ts
// Before (in the return value)
listen: (
  onMessage: (msg: NormalizedMessage) => Promise<void>,
  imConfigId: string
) => Promise<void>

// After
listen: (
  onMessage: (msg: NormalizedMessage) => Promise<void>,
  imConfigId: string
) => Promise<() => void>
```

- [ ] **Step 4: Run all dispatcher tests to verify pass**

```bash
pnpm --filter @aaas/dispatcher test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/dispatcher/src/im/feishu.ts packages/dispatcher/tests/feishu.test.ts
git commit -m "feat(dispatcher): feishu listen() returns stop function via wsClient.close()"
```

---

## Task 2: Create bot-runner.ts (TDD)

**Files:**
- Create: `packages/dispatcher/tests/bot-runner.test.ts`
- Create: `packages/dispatcher/src/bot-runner.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/dispatcher/tests/bot-runner.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createBotRunner } from '../src/bot-runner.js'

// ── mock IM clients ───────────────────────────────────────────────────────────
const mockTelegramStopFn = vi.fn()
const mockFeishuStopFn = vi.fn()
const mockTelegramListen = vi.fn().mockReturnValue(mockTelegramStopFn)
const mockFeishuListen = vi.fn().mockResolvedValue(mockFeishuStopFn)
const mockTelegramClient = { sendMessage: vi.fn(), sendChatAction: vi.fn() }
const mockFeishuClient = { sendMessage: vi.fn(), sendChatAction: vi.fn() }

vi.mock('../src/im/telegram.js', () => ({
  createTelegramClient: vi.fn(() => ({ client: mockTelegramClient, listen: mockTelegramListen })),
}))
vi.mock('../src/im/feishu.js', () => ({
  createFeishuClient: vi.fn(() => ({ client: mockFeishuClient, listen: mockFeishuListen })),
}))
vi.mock('../src/processor.js', () => ({
  createProcessor: vi.fn(() => ({ handle: vi.fn() })),
}))

// ── mock lark Client for botOpenId fetch ──────────────────────────────────────
const mockLarkRequest = vi.fn()
vi.mock('@larksuiteoapi/node-sdk', () => ({
  Client: vi.fn(() => ({ request: mockLarkRequest })),
  WSClient: vi.fn(),
  EventDispatcher: vi.fn(),
}))

// ── shared deps ───────────────────────────────────────────────────────────────
const mockEnc = { decrypt: vi.fn(), encrypt: vi.fn() }
const SHARED_DEPS = {
  enc: mockEnc as any,
  conversation: { getOrCreate: vi.fn(), getLastMessageId: vi.fn(), setLastMessageId: vi.fn() } as any,
  imMessageTracker: { tryClaim: vi.fn(), markDone: vi.fn(), markFailed: vi.fn() } as any,
  gateway: { appendMessages: vi.fn(), loadMessages: vi.fn() } as any,
  sandbox: { chat: vi.fn() } as any,
  jwt: { signSandboxToken: vi.fn(), signDispatcherToken: vi.fn() } as any,
}
const AGENT = { id: 'agt_1', e2bTemplateId: 'tpl_1', port: 8080, idleTimeoutMs: 300_000 }

beforeEach(() => vi.clearAllMocks())

// ── Telegram ──────────────────────────────────────────────────────────────────
describe('BotRunner - telegram', () => {
  const cfg = { id: 'cfg_1', provider: 'telegram', credentialsEnc: 'enc_tg' }

  beforeEach(() => {
    mockEnc.decrypt.mockReturnValue(JSON.stringify({ bot_token: 'tg_token' }))
  })

  it('start() calls telegram listen()', async () => {
    const runner = createBotRunner({ cfg, agent: AGENT, ...SHARED_DEPS })
    await runner.start()
    expect(mockTelegramListen).toHaveBeenCalledOnce()
  })

  it('stop() calls the stop fn returned by listen()', async () => {
    const runner = createBotRunner({ cfg, agent: AGENT, ...SHARED_DEPS })
    await runner.start()
    runner.stop()
    expect(mockTelegramStopFn).toHaveBeenCalledOnce()
  })

  it('stop() is safe to call before start()', () => {
    const runner = createBotRunner({ cfg, agent: AGENT, ...SHARED_DEPS })
    expect(() => runner.stop()).not.toThrow()
  })

  it('stop() is idempotent', async () => {
    const runner = createBotRunner({ cfg, agent: AGENT, ...SHARED_DEPS })
    await runner.start()
    runner.stop()
    runner.stop()
    expect(mockTelegramStopFn).toHaveBeenCalledOnce()
  })
})

// ── Feishu ────────────────────────────────────────────────────────────────────
describe('BotRunner - feishu', () => {
  const cfg = { id: 'cfg_2', provider: 'feishu', credentialsEnc: 'enc_fs' }

  beforeEach(() => {
    mockEnc.decrypt.mockReturnValue(JSON.stringify({ app_id: 'app_1', app_secret: 'secret_1' }))
    mockLarkRequest.mockResolvedValue({ bot: { open_id: 'bot_open_1' } })
  })

  it('start() fetches botOpenId and awaits feishu listen()', async () => {
    const runner = createBotRunner({ cfg, agent: AGENT, ...SHARED_DEPS })
    await runner.start()
    expect(mockLarkRequest).toHaveBeenCalledWith({ method: 'GET', url: '/open-apis/bot/v3/info' })
    expect(mockFeishuListen).toHaveBeenCalledOnce()
  })

  it('start() throws when botOpenId cannot be fetched', async () => {
    mockLarkRequest.mockResolvedValue({ bot: {} })
    const runner = createBotRunner({ cfg, agent: AGENT, ...SHARED_DEPS })
    await expect(runner.start()).rejects.toThrow('open_id')
  })

  it('stop() calls the stop fn returned by feishu listen()', async () => {
    const runner = createBotRunner({ cfg, agent: AGENT, ...SHARED_DEPS })
    await runner.start()
    runner.stop()
    expect(mockFeishuStopFn).toHaveBeenCalledOnce()
  })
})

// ── Unknown provider ──────────────────────────────────────────────────────────
describe('BotRunner - unsupported provider', () => {
  it('start() throws for an unknown provider', async () => {
    mockEnc.decrypt.mockReturnValue(JSON.stringify({}))
    const cfg = { id: 'cfg_3', provider: 'whatsapp', credentialsEnc: 'enc' }
    const runner = createBotRunner({ cfg, agent: AGENT, ...SHARED_DEPS })
    await expect(runner.start()).rejects.toThrow('Unsupported provider')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @aaas/dispatcher test tests/bot-runner.test.ts
```

Expected: FAIL with "Cannot find module '../src/bot-runner.js'".

- [ ] **Step 3: Implement bot-runner.ts**

Create `packages/dispatcher/src/bot-runner.ts`:

```ts
import pino from 'pino'
import * as lark from '@larksuiteoapi/node-sdk'
import { createTelegramClient } from './im/telegram.js'
import { createFeishuClient } from './im/feishu.js'
import { createProcessor } from './processor.js'
import type { SandboxOrchestrator } from './sandbox.js'
import type { Db } from './lib/db.js'

const logger = pino({ transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined })

interface Agent {
  id: string
  e2bTemplateId: string
  port: number
  idleTimeoutMs: number
}

interface ImConfig {
  id: string
  provider: string
  credentialsEnc: string
}

export interface BotRunner {
  start(): Promise<void>
  stop(): void
}

export function createBotRunner(deps: {
  cfg: ImConfig
  agent: Agent
  enc: ReturnType<typeof import('./lib/encrypt.js').createEncryptor>
  conversation: ReturnType<typeof import('./conversation.js').createConversationManager>
  imMessageTracker: ReturnType<typeof import('./im-message-tracker.js').createImMessageTracker>
  gateway: ReturnType<typeof import('./gateway-client.js').createGatewayClient>
  sandbox: SandboxOrchestrator
  jwt: ReturnType<typeof import('./lib/jwt.js').createJwtSigner>
}): BotRunner {
  const { cfg, agent, enc, conversation, imMessageTracker, gateway, sandbox, jwt } = deps
  const imConfigId = `im:${cfg.id}`
  let stopFn: (() => void) | null = null

  return {
    async start(): Promise<void> {
      const credentials = JSON.parse(enc.decrypt(cfg.credentialsEnc)) as Record<string, string>

      if (cfg.provider === 'telegram') {
        const { client, listen } = createTelegramClient(credentials.bot_token)
        const processor = createProcessor({ conversation, imMessageTracker, gateway, sandbox, im: client, jwt, agent })
        stopFn = listen(msg => processor.handle(msg), imConfigId)

      } else if (cfg.provider === 'feishu') {
        const tmpClient = new lark.Client({ appId: credentials.app_id, appSecret: credentials.app_secret })
        const botInfoResp = await (tmpClient as any).request({ method: 'GET', url: '/open-apis/bot/v3/info' }) as any
        const botOpenId: string = botInfoResp?.bot?.open_id ?? ''
        if (!botOpenId) throw new Error('Failed to fetch Feishu bot open_id — check app_id/app_secret and im:bot permission')

        const { client, listen } = createFeishuClient(credentials.app_id, credentials.app_secret, botOpenId)
        const processor = createProcessor({ conversation, imMessageTracker, gateway, sandbox, im: client, jwt, agent })
        stopFn = await listen(msg => processor.handle(msg), imConfigId)

      } else {
        throw new Error(`Unsupported provider: ${cfg.provider}`)
      }

      logger.info({ event: 'dispatcher.bot_started', config_id: cfg.id, provider: cfg.provider, agent_id: agent.id })
    },

    stop(): void {
      if (!stopFn) return
      try {
        stopFn()
      } catch (err) {
        logger.warn({ event: 'dispatcher.bot_stop_error', config_id: cfg.id, error: String(err) })
      }
      stopFn = null
      logger.info({ event: 'dispatcher.bot_stopped', config_id: cfg.id })
    },
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @aaas/dispatcher test tests/bot-runner.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/dispatcher/src/bot-runner.ts packages/dispatcher/tests/bot-runner.test.ts
git commit -m "feat(dispatcher): add BotRunner — manages one bot connection lifecycle"
```

---

## Task 3: Create bot-registry.ts (TDD)

**Files:**
- Create: `packages/dispatcher/tests/bot-registry.test.ts`
- Create: `packages/dispatcher/src/bot-registry.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/dispatcher/tests/bot-registry.test.ts`:

```ts
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
    registry.stop()
  })

  it('skips configs whose agent is not active', async () => {
    mockFindMany.mockResolvedValue([
      { ...makeCfg('cfg_1'), agent: { ...ACTIVE_AGENT, status: 'inactive' } },
    ])

    const registry = createBotRegistry({ ...DEPS, pollIntervalMs: 60_000 })
    await registry.start()

    expect(mockStart).not.toHaveBeenCalled()
    registry.stop()
  })

  it('does not double-start a bot already in the registry', async () => {
    mockFindMany.mockResolvedValue([makeCfg('cfg_1')])

    const registry = createBotRegistry({ ...DEPS, pollIntervalMs: 60_000 })
    await registry.start()

    // Manually trigger a second poll by advancing the timer
    await vi.advanceTimersByTimeAsync(60_000)

    expect(mockStart).toHaveBeenCalledTimes(1)
    registry.stop()
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
    registry.stop()
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
    registry.stop()
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

    registry.stop()
  })

  it('starts remaining bots even when one runner.start() fails', async () => {
    mockFindMany.mockResolvedValue([makeCfg('cfg_1'), makeCfg('cfg_2')])
    mockStart
      .mockRejectedValueOnce(new Error('bad credentials'))  // cfg_1 fails
      .mockResolvedValueOnce(undefined)                      // cfg_2 succeeds

    const registry = createBotRegistry({ ...DEPS, pollIntervalMs: 60_000 })
    await registry.start()

    expect(mockStart).toHaveBeenCalledTimes(2)
    registry.stop()
  })
})

// ── stop ─────────────────────────────────────────────────────────────────────
describe('BotRegistry - stop()', () => {
  it('stops all running runners', async () => {
    mockFindMany.mockResolvedValue([makeCfg('cfg_1'), makeCfg('cfg_2')])

    const registry = createBotRegistry({ ...DEPS, pollIntervalMs: 60_000 })
    await registry.start()
    registry.stop()

    expect(mockStop).toHaveBeenCalledTimes(2)
  })

  it('cancels the polling interval', async () => {
    mockFindMany.mockResolvedValue([])

    const registry = createBotRegistry({ ...DEPS, pollIntervalMs: 1_000 })
    await registry.start()
    registry.stop()

    await vi.advanceTimersByTimeAsync(5_000)

    // Only the initial poll should have fired (1 call), not subsequent interval polls
    expect(mockFindMany).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @aaas/dispatcher test tests/bot-registry.test.ts
```

Expected: FAIL with "Cannot find module '../src/bot-registry.js'".

- [ ] **Step 3: Implement bot-registry.ts**

Create `packages/dispatcher/src/bot-registry.ts`:

```ts
import pino from 'pino'
import { createBotRunner, type BotRunner } from './bot-runner.js'
import type { Db } from './lib/db.js'
import type { SandboxOrchestrator } from './sandbox.js'

const logger = pino({ transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined })

export function createBotRegistry(deps: {
  db: Db
  enc: ReturnType<typeof import('./lib/encrypt.js').createEncryptor>
  jwt: ReturnType<typeof import('./lib/jwt.js').createJwtSigner>
  conversation: ReturnType<typeof import('./conversation.js').createConversationManager>
  imMessageTracker: ReturnType<typeof import('./im-message-tracker.js').createImMessageTracker>
  gateway: ReturnType<typeof import('./gateway-client.js').createGatewayClient>
  sandbox: SandboxOrchestrator
  pollIntervalMs?: number
}) {
  const { db, pollIntervalMs = 30_000, ...sharedDeps } = deps
  const runners = new Map<string, BotRunner>()
  let pollTimer: ReturnType<typeof setInterval> | null = null

  async function poll(): Promise<void> {
    let configs: any[]
    try {
      configs = await db.imConfig.findMany({
        where: { status: 'active' },
        include: { agent: true },
      })
    } catch (err) {
      logger.warn({ event: 'registry.poll_error', error: String(err) })
      return
    }

    const active = configs.filter((c: any) => c.agent?.status === 'active')
    const activeIds = new Set(active.map((c: any) => c.id as string))
    const runningIds = new Set(runners.keys())

    for (const id of runningIds) {
      if (!activeIds.has(id)) {
        try { runners.get(id)!.stop() } catch (err) {
          logger.warn({ event: 'registry.stop_error', config_id: id, error: String(err) })
        }
        runners.delete(id)
        logger.info({ event: 'registry.bot_removed', config_id: id })
      }
    }

    // runningIds is a snapshot taken before the stop loop above, so it correctly
    // reflects what was running at the start of this poll cycle.
    // TODO: parallelize with Promise.all if bot count grows large
    for (const cfg of active) {
      if (runningIds.has(cfg.id)) continue
      const runner = createBotRunner({ cfg, agent: cfg.agent, ...sharedDeps })
      try {
        await runner.start()
        runners.set(cfg.id, runner)
        logger.info({ event: 'registry.bot_added', config_id: cfg.id, provider: cfg.provider })
      } catch (err) {
        logger.error({ event: 'registry.start_error', config_id: cfg.id, error: String(err) })
      }
    }
  }

  return {
    async start(): Promise<void> {
      await poll()
      pollTimer = setInterval(() => { poll().catch(err => logger.error({ event: 'registry.poll_unhandled', error: String(err) })) }, pollIntervalMs)
    },

    stop(): void {
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
      for (const runner of runners.values()) {
        try { runner.stop() } catch (err) {
          logger.warn({ event: 'registry.stop_error', error: String(err) })
        }
      }
      runners.clear()
    },
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @aaas/dispatcher test tests/bot-registry.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Run the full test suite**

```bash
pnpm --filter @aaas/dispatcher test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/dispatcher/src/bot-registry.ts packages/dispatcher/tests/bot-registry.test.ts
git commit -m "feat(dispatcher): add BotRegistry — multi-bot polling registry with hot-load"
```

---

## Task 4: Wire up index.ts

**Files:**
- Modify: `packages/dispatcher/src/index.ts`

- [ ] **Step 1: Replace index.ts with BotRegistry wiring**

Overwrite `packages/dispatcher/src/index.ts` with:

```ts
import pino from 'pino'
import { createDb } from './lib/db.js'
import { createJwtSigner } from './lib/jwt.js'
import { createEncryptor } from './lib/encrypt.js'
import { createConversationManager } from './conversation.js'
import { createImMessageTracker } from './im-message-tracker.js'
import { createGatewayClient } from './gateway-client.js'
import { createSandboxOrchestrator } from './sandbox.js'
import { createBotRegistry } from './bot-registry.js'
import { createId } from '@paralleldrive/cuid2'

const logger = pino({ transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined })

const DATABASE_URL    = process.env.DATABASE_URL!
const JWT_SECRET      = process.env.JWT_SECRET!
const BOT_TOKEN_ENC_KEY = process.env.BOT_TOKEN_ENC_KEY!
const GATEWAY_URL     = process.env.GATEWAY_URL!
const GATEWAY_LOCAL_URL = process.env.GATEWAY_LOCAL_URL ?? 'http://localhost:3001'
const E2B_API_KEY     = process.env.E2B_API_KEY!
const E2B_DOMAIN      = process.env.E2B_DOMAIN
const INSTANCE_ID     = process.env.POD_NAME ?? `dispatcher-${createId()}`

async function main() {
  const db               = createDb(DATABASE_URL)
  const jwt              = createJwtSigner(JWT_SECRET)
  const enc              = createEncryptor(BOT_TOKEN_ENC_KEY)
  const gateway          = createGatewayClient(GATEWAY_LOCAL_URL)
  const sandbox          = createSandboxOrchestrator({ e2bApiKey: E2B_API_KEY, e2bDomain: E2B_DOMAIN, gatewayUrl: GATEWAY_URL, instanceId: INSTANCE_ID })
  const conversation     = createConversationManager(db)
  const imMessageTracker = createImMessageTracker(db, INSTANCE_ID)

  const registry = createBotRegistry({
    db, jwt, enc, gateway, sandbox, conversation, imMessageTracker,
    pollIntervalMs: 30_000,
  })

  const shutdown = () => { registry.stop(); process.exit(0) }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  logger.info({ event: 'dispatcher.start', instance_id: INSTANCE_ID })
  await registry.start()
}

main().catch(err => {
  logger.error({ event: 'dispatcher.fatal', error: String(err) })
  process.exit(1)
})
```

- [ ] **Step 2: Run the full test suite**

```bash
pnpm --filter @aaas/dispatcher test
```

Expected: all tests pass.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm --filter @aaas/dispatcher build
```

Expected: exits 0, no type errors.

- [ ] **Step 4: Commit**

```bash
git add packages/dispatcher/src/index.ts
git commit -m "feat(dispatcher): wire BotRegistry into index — replace single-bot startup"
```

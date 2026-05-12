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
  conversation: { getOrCreate: vi.fn() } as any,
  imMessageTracker: { tryClaim: vi.fn(), markDone: vi.fn(), markFailed: vi.fn() } as any,
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

  it('stop() does not throw when the underlying stop fn throws', async () => {
    mockEnc.decrypt.mockReturnValue(JSON.stringify({ bot_token: 'tg_token' }))
    mockTelegramStopFn.mockImplementationOnce(() => { throw new Error('ws closed') })
    const runner = createBotRunner({ cfg, agent: AGENT, ...SHARED_DEPS })
    await runner.start()
    expect(() => runner.stop()).not.toThrow()
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

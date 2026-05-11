# Dispatcher Multi-Bot Design

**Date:** 2026-05-08
**Branch:** feature/dispatcher-multi-bot
**Status:** Completed — implemented in dispatcher bot runner/registry

## Problem

The current dispatcher process is hard-coded to load exactly one `agent` and one `im_config` from the database, then start a single IM listener. This means:

- One dispatcher process = one bot connection
- Adding a new bot requires deploying a new dispatcher process
- No runtime reconfiguration without restart

The target state is a single dispatcher process that manages **all active bots across all active agents**, with the ability to add or remove bots at runtime without restarting the process.

## Goals

1. Single dispatcher process supports multiple agents, each with multiple IM bots (`im_configs`)
2. Failed bot connections retry independently — one bot's failure does not affect others
3. Hot-loading: new bots are picked up and removed bots are stopped without a process restart
4. No changes to processor, sandbox, conversation, gateway-client, or im-message-tracker

## Non-Goals

- Horizontal scaling / multi-container deployment (addressed separately via Telegram webhook migration)
- Runtime credential updates without deactivating the old `im_config` record
- Per-bot polling interval configuration

## Architecture

### Component Overview

```
index.ts
  └── BotRegistry (bot-registry.ts)
        ├── poll() every 30s
        │     └── DB diff → start/stop BotRunners
        └── Map<configId, BotRunner> (bot-runner.ts)
              ├── BotRunner(telegram, bot_A) → Processor → shared deps
              ├── BotRunner(feishu,   bot_B) → Processor → shared deps
              └── BotRunner(telegram, bot_C) → Processor → shared deps
```

**Shared (process-level, unchanged):** `SandboxOrchestrator`, `GatewayClient`, `ConversationManager`, `ImMessageTracker`, `JwtSigner`

### New Files

| File | Responsibility |
|------|----------------|
| `src/bot-runner.ts` | Lifecycle of one bot connection (start/stop) |
| `src/bot-registry.ts` | Registry of all BotRunners + polling loop |

### Modified Files

| File | Change |
|------|--------|
| `src/im/feishu.ts` | `listen()` returns `Promise<() => void>` instead of `Promise<void>` |
| `src/index.ts` | Replaced with shared-dep setup + `registry.start()` |

### Unchanged Files

`processor.ts`, `sandbox.ts`, `conversation.ts`, `im-message-tracker.ts`, `gateway-client.ts`, `im/telegram.ts`, `im/client.ts`

---

## BotRunner

Each `BotRunner` corresponds to one `im_config` row and manages the full lifecycle of that bot connection.

### Interface

```ts
interface BotRunner {
  start(): Promise<void>
  stop(): void
}
```

### start() flow

```
1. Decrypt credentials (enc.decrypt)
2. Feishu only: call /open-apis/bot/v3/info to fetch botOpenId
3. createIMClient(provider, credentials, botOpenId?)
4. createProcessor({ conversation, imMessageTracker, gateway, sandbox, im, jwt, agent })
5. Call listen(onMessage, imConfigId):
     Telegram → sync, returns stop fn, background loop self-starts
     Feishu   → await WS connection established, returns stop fn
6. Store stop fn, log dispatcher.bot_started
```

### stop() flow

```
1. Call stored stop fn:
     Telegram → controller.abort() → polling loop exits
     Feishu   → wsClient.stop() → WS disconnects
2. Log dispatcher.bot_stopped
```

### Retry strategy

Retry is handled inside each provider, not in BotRunner:

- **Telegram** (`im/telegram.ts`): exponential backoff 2 s → 30 s on `getUpdates` failure; loop continues until `controller.signal.aborted`
- **Feishu** (`lark.WSClient`): SDK-internal auto-reconnect and heartbeat keepalive

BotRunner has no additional retry layer.

---

## BotRegistry

### Registry state

```ts
const runners = new Map<string, BotRunner>()  // key = im_config.id
```

### start()

1. Call `poll()` immediately to load all current active bots
2. Start `setInterval(poll, pollIntervalMs)` (default 30 000 ms)

### poll() — diff and reconcile

```ts
const configs = await db.imConfig.findMany({
  where: { status: 'active' },
  include: { agent: true },
})
// filter out configs whose agent is not active
const active = configs.filter(c => c.agent.status === 'active')

const activeIds  = new Set(active.map(c => c.id))
const runningIds = new Set(runners.keys())

// Stop removed bots
for (const id of runningIds) {
  if (!activeIds.has(id)) {
    runners.get(id)!.stop()
    runners.delete(id)
    logger.info({ event: 'registry.bot_removed', config_id: id })
  }
}

// Start new bots
for (const cfg of active) {
  if (!runningIds.has(cfg.id)) {
    const runner = createBotRunner({ cfg, agent: cfg.agent, ...sharedDeps })
    await runner.start()
    runners.set(cfg.id, runner)
    logger.info({ event: 'registry.bot_added', config_id: cfg.id, provider: cfg.provider })
  }
}
```

### Change detection scope

Only `configId` membership is diffed. If credentials or agent parameters change, the operator marks the old `im_config` as `inactive` and creates a new `active` record. The registry naturally stops the old runner and starts a new one on the next poll.

### stop()

```ts
clearInterval(pollTimer)
for (const runner of runners.values()) runner.stop()
runners.clear()
```

---

## Feishu listen() Change

### Current signature

```ts
// im/feishu.ts
listen(onMessage, imConfigId): Promise<void>   // no stop mechanism
```

### New signature

```ts
listen(onMessage, imConfigId): Promise<() => void>   // returns stop fn after WS connects
```

### Implementation

```ts
async function listen(onMessage, imConfigId): Promise<() => void> {
  const wsClient = new lark.WSClient({ appId, appSecret })
  await wsClient.start({
    eventDispatcher: new lark.EventDispatcher({}).register({
      'im.message.receive_v1': async (data) => { ... },
    }),
  })
  return () => wsClient.close()
}
```

> `lark.WSClient` exposes `close(params?: { force?: boolean }): void` (confirmed in SDK v1.60.0 type definitions). Use `wsClient.close()` — no `stop()` method exists.

---

## index.ts After Change

```ts
async function main() {
  const db          = createDb(DATABASE_URL)
  const jwt         = createJwtSigner(JWT_SECRET)
  const enc         = createEncryptor(BOT_TOKEN_ENC_KEY)
  const gateway     = createGatewayClient(GATEWAY_LOCAL_URL)
  const sandbox     = createSandboxOrchestrator({ e2bApiKey: E2B_API_KEY, e2bDomain: E2B_DOMAIN, gatewayUrl: GATEWAY_URL, instanceId: INSTANCE_ID })
  const conversation     = createConversationManager(db)
  const imMessageTracker = createImMessageTracker(db, INSTANCE_ID)

  const registry = createBotRegistry({
    db, jwt, enc, gateway, sandbox, conversation, imMessageTracker,
    pollIntervalMs: 30_000,
  })

  // Graceful shutdown: stop all bot listeners before process exits
  const shutdown = () => { registry.stop(); process.exit(0) }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  await registry.start()
}
```

All agent/config loading, credential decryption, and provider branching move into `BotRunner`. `index.ts` only assembles shared dependencies.

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| `poll()` DB query fails | Log warning, skip this poll cycle, retry on next interval |
| `runner.start()` fails (e.g. invalid credentials, Feishu botOpenId fetch fails) | Log error, do not add to registry; will retry on next poll if config is still active |
| Telegram polling error at runtime | `telegram.ts` retry loop handles it; BotRunner stays in registry |
| Feishu WS disconnects at runtime | `lark.WSClient` auto-reconnects; BotRunner stays in registry |
| `runner.stop()` throws | Log warning, remove from registry anyway |

---

## Testing

- **Unit:** `BotRegistry` diff logic with mock runners — cover add, remove, no-change cases
- **Unit:** `BotRunner` start/stop with mock IM clients
- **Existing tests unchanged:** `processor.test.ts`, `sandbox.test.ts`, `feishu.test.ts`, `telegram.test.ts` require no modification
- **Integration:** existing `conversation.test.ts` and `im-message-tracker.test.ts` unaffected

---

## Open Questions

1. Should `poll()` errors be surfaced to an alerting system, or is log-and-skip sufficient for MVP?

## Implementation Notes

- **`lark.WSClient.close()`** confirmed in SDK v1.60.0 — use this for Feishu stop.
- **Sequential bot startup in `poll()`**: `await runner.start()` inside the loop means a slow Feishu `botOpenId` fetch for one config delays subsequent configs in the same cycle. Acceptable for MVP (small number of bots). If parallelism is needed later, replace with `Promise.all`.
- **SIGTERM/SIGINT** handlers added to `index.ts` to ensure bot listeners are cleanly stopped on container shutdown.

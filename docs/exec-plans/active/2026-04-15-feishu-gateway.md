# 飞书 Gateway 接入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 dispatcher 中新增飞书（Feishu/Lark）WebSocket 长连接接入，支持私聊和群聊（群聊须 @机器人），与 Telegram 并行运行，互不影响。

**Architecture:** dispatcher 根据 `im_configs.provider` 字段分支启动：`'telegram'` 走现有 long-polling，`'feishu'` 走 `@larksuiteoapi/node-sdk` 的 WSClient。消息经 `normalizeFeishuEvent()` 规范化为 `NormalizedMessage` 后进入现有 `processor.handle()` 流水线，发送回复通过 `IMClient` 接口抽象，两个平台实现相同接口。凭证统一以加密 JSON 存储在 `im_configs.credentials_enc`。

**Tech Stack:** TypeScript/ESM, `@larksuiteoapi/node-sdk ^1.60.0`, Prisma 7, Vitest, PostgreSQL

**Spec:** `docs/product-specs/2026-04-15-feishu-gateway-design.md`

---

## File Map

| 文件 | 操作 | 职责 |
|------|------|------|
| `packages/db/prisma/schema.prisma` | 修改 | 重命名 `botTokenEnc`→`credentialsEnc`，`platform`→`provider` |
| `packages/db/prisma/migrations/20260415000000_feishu/migration.sql` | 新增（Prisma 自动生成） | ALTER TABLE 重命名列，添加 CHECK 约束 |
| `packages/dispatcher/src/im-client.ts` | 新增 | `IMClient` 接口定义 |
| `packages/dispatcher/src/feishu.ts` | 新增 | `createFeishuClient()`：`IMClient` 实现 + WSClient 启动 |
| `packages/dispatcher/src/normalize.ts` | 修改 | 新增 `normalizeFeishuEvent()` |
| `packages/dispatcher/src/processor.ts` | 修改 | `telegram: ...` → `im: IMClient` |
| `packages/dispatcher/src/index.ts` | 修改 | 按 `provider` 分支启动，读取 `credentialsEnc` |
| `packages/dispatcher/package.json` | 修改 | 新增 `@larksuiteoapi/node-sdk` 依赖 |
| `packages/dispatcher/tests/normalize.test.ts` | 修改 | 新增飞书规范化用例 |
| `packages/dispatcher/tests/processor.test.ts` | 修改 | `telegram` mock → `im` mock |
| `scripts/setup.ts` | 修改 | 支持 `provider` 选择，写 `credentialsEnc` JSON |

---

## Task 1: DB Schema — 重命名字段，添加 CHECK 约束

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Auto-generated: `packages/db/prisma/migrations/20260415000000_feishu/migration.sql`

- [ ] **Step 1: 修改 `schema.prisma`**

  打开 `packages/db/prisma/schema.prisma`，在 `ImConfig` model 中做如下修改：

  ```prisma
  model ImConfig {
    id             String    @id
    agentId        String    @map("agent_id")
    provider       String    @default("telegram")    // 原字段名 platform
    credentialsEnc String    @map("credentials_enc") // 原字段名 botTokenEnc，原 @map("bot_token_enc")
    chatScope      String    @default("all") @map("chat_scope")
    status         String
    leaseOwner     String?   @map("lease_owner")
    leaseExpiresAt DateTime? @map("lease_expires_at") @db.Timestamptz()
    createdAt      DateTime  @default(now()) @map("created_at") @db.Timestamptz()

    agent Agent @relation(fields: [agentId], references: [id])

    @@map("im_configs")
  }
  ```

  要点：
  - `platform` → `provider`（TypeScript 字段名变化，`@map` 对应 DB 列名）
  - `botTokenEnc` → `credentialsEnc`，`@map("bot_token_enc")` → `@map("credentials_enc")`
  - Prisma 不支持在 schema 内定义 CHECK 约束，CHECK 约束将在 migration SQL 中手动追加

- [ ] **Step 2: 创建并应用 migration**

  ```bash
  cd packages/db
  pnpm migrate:dev --name feishu
  ```

  Prisma 会检测 schema diff（列重命名），可能询问是否为 rename（而非 drop+create）——选 **yes**。

  migration 会在 `prisma/migrations/` 下自动生成一个带时间戳的目录，里面有 `migration.sql`。

- [ ] **Step 3: 手动追加 CHECK 约束到生成的 migration.sql**

  找到刚生成的 migration 目录（如 `20260415xxxxxx_feishu/migration.sql`），在文件末尾追加：

  ```sql
  ALTER TABLE im_configs ADD CONSTRAINT im_configs_provider_check
    CHECK (provider IN ('telegram', 'feishu'));
  ```

  保存后重新执行 apply（Prisma 已应用该文件，追加后需手动在 DB 执行，或重建 DB）：

  ```bash
  # 本地开发环境：直接在 DB 执行追加的 ALTER TABLE
  # 或重建 DB（推荐，因为是本地 dev）：
  # 重置并重新 apply 所有 migrations:
  pnpm migrate:dev --name feishu  # 若已应用则跳过；如需重置先 prisma migrate reset
  ```

  > **本地 dev 建议**：直接 `prisma migrate reset`（会清空数据），然后重新 `setup.ts` 写入数据，最干净。

- [ ] **Step 4: 重新生成 Prisma client**

  ```bash
  pnpm generate
  ```

  验证 `src/generated/index.d.ts` 中 `ImConfig` 类型已包含 `provider` 和 `credentialsEnc` 字段（不再有 `platform`/`botTokenEnc`）。

- [ ] **Step 5: Commit**

  ```bash
  git add packages/db/prisma/schema.prisma packages/db/prisma/migrations/
  git commit -m "feat(db): rename im_configs columns for multi-provider support"
  ```

---

## Task 2: `im-client.ts` — 定义 IMClient 接口

**Files:**
- Create: `packages/dispatcher/src/im-client.ts`

- [ ] **Step 1: 创建接口文件**

  ```ts
  // packages/dispatcher/src/im-client.ts
  export interface IMClient {
    sendMessage(chatId: string, text: string): Promise<void>
    sendChatAction(chatId: string): Promise<void>
  }
  ```

  > `createTelegramClient()` 的返回值已满足此接口（duck typing），无需改动 `telegram.ts`。

- [ ] **Step 2: Commit**

  ```bash
  git add packages/dispatcher/src/im-client.ts
  git commit -m "feat(dispatcher): add IMClient interface for platform abstraction"
  ```

---

## Task 3: `processor.ts` — 将 `telegram` 替换为 `im: IMClient`

**Files:**
- Modify: `packages/dispatcher/src/processor.ts`
- Modify: `packages/dispatcher/tests/processor.test.ts`

先改测试，再改实现（TDD 红-绿流程）。

- [ ] **Step 1: 更新测试文件**

  打开 `packages/dispatcher/tests/processor.test.ts`，做以下替换：

  1. 将 `mockTelegram` 重命名为 `mockIm`：
     ```ts
     // 前
     const mockTelegram = { sendMessage: vi.fn(), sendChatAction: vi.fn() }
     // 后
     const mockIm = { sendMessage: vi.fn(), sendChatAction: vi.fn() }
     ```

  2. `createProcessor` 调用中将 `telegram: mockTelegram` 改为 `im: mockIm as any`：
     ```ts
     const processor = createProcessor({
       conversation: mockConversation as any,
       jobs: mockJobs as any,
       gateway: mockGateway as any,
       sandbox: mockSandbox as any,
       im: mockIm as any,   // 原 telegram: mockTelegram as any
       jwt: mockJwt as any,
       agent: AGENT,
     })
     ```

  3. 所有 `mockTelegram.sendMessage` → `mockIm.sendMessage`，`mockTelegram.sendChatAction` → `mockIm.sendChatAction`。

- [ ] **Step 2: 运行测试，确认红（因为 processor.ts 还没改）**

  ```bash
  pnpm --filter @aaas/dispatcher test
  ```

  预期：TypeScript 编译报错或测试失败，提示 `processor.ts` 中没有 `im` 参数。

- [ ] **Step 3: 更新 `processor.ts`**

  打开 `packages/dispatcher/src/processor.ts`，修改 deps 类型签名：

  ```ts
  // 在文件顶部添加 import
  import type { IMClient } from './im-client.js'

  // createProcessor 的 deps 参数类型，删除 telegram，添加 im：
  export function createProcessor(deps: {
    conversation: ReturnType<typeof import('./conversation.js').createConversationManager>
    jobs: ReturnType<typeof import('./inbound-jobs.js').createInboundJobsManager>
    gateway: ReturnType<typeof import('./gateway-client.js').createGatewayClient>
    sandbox: ReturnType<typeof import('./sandbox.js').createSandboxOrchestrator>
    im: IMClient    // 原 telegram: ReturnType<typeof import('./telegram.js').createTelegramClient>
    jwt: ReturnType<typeof import('./jwt.js').createJwtSigner>
    agent: Agent
  }) {
    const { conversation, jobs, gateway, sandbox, im, jwt, agent } = deps  // 原 ...telegram...
    // ...
  ```

  函数体内所有 `telegram.sendMessage` → `im.sendMessage`，`telegram.sendChatAction` → `im.sendChatAction`。

- [ ] **Step 4: 运行测试，确认绿**

  ```bash
  pnpm --filter @aaas/dispatcher test
  ```

  预期：所有测试通过。

- [ ] **Step 5: Commit**

  ```bash
  git add packages/dispatcher/src/processor.ts packages/dispatcher/tests/processor.test.ts
  git commit -m "refactor(dispatcher): replace telegram with IMClient interface in processor"
  ```

---

## Task 4: `normalize.ts` — 新增 `normalizeFeishuEvent()`

**Files:**
- Modify: `packages/dispatcher/src/normalize.ts`
- Modify: `packages/dispatcher/tests/normalize.test.ts`

- [ ] **Step 1: 先写飞书规范化测试**

  在 `packages/dispatcher/tests/normalize.test.ts` 末尾追加：

  ```ts
  import { normalizeFeishuEvent } from '../src/normalize.js'

  // 构造一个最小的飞书 im.message.receive_v1 事件对象的辅助函数
  function makeFeishuEvent(overrides: {
    chatType?: string
    messageType?: string
    content?: string
    mentions?: Array<{ key: string; id?: { open_id?: string }; name?: string }>
    senderOpenId?: string | null
  } = {}) {
    return {
      message: {
        message_id: 'om_msg_001',
        chat_id: 'oc_chat_abc',
        chat_type: overrides.chatType ?? 'p2p',
        message_type: overrides.messageType ?? 'text',
        content: overrides.content ?? JSON.stringify({ text: 'hello' }),
        mentions: overrides.mentions ?? [],
      },
      sender: {
        sender_id: overrides.senderOpenId === null
          ? {}                                    // open_id 缺失
          : { open_id: overrides.senderOpenId ?? 'ou_sender_001' },
      },
    }
  }

  const BOT_OPEN_ID = 'ou_bot_xyz'
  const CHANNEL_KEY = 'im:cfg_feishu'

  describe('normalizeFeishuEvent', () => {
    it('normalizes a DM text message', () => {
      const result = normalizeFeishuEvent(makeFeishuEvent(), CHANNEL_KEY, BOT_OPEN_ID)
      expect(result).toEqual({
        channel_key: CHANNEL_KEY,
        external_chat_id: 'oc_chat_abc',
        external_thread_key: '',
        external_message_id: 'om_msg_001',
        author: { external_user_id: 'ou_sender_001', display_name: null },
        content: { type: 'text', text: 'hello' },
      })
    })

    it('strips bot mention placeholder from group message text', () => {
      const result = normalizeFeishuEvent(
        makeFeishuEvent({
          chatType: 'group',
          content: JSON.stringify({ text: '@_bot_1 what is 2+2?' }),
          mentions: [{ key: '@_bot_1', id: { open_id: BOT_OPEN_ID }, name: 'Bot' }],
        }),
        CHANNEL_KEY,
        BOT_OPEN_ID
      )
      expect(result).not.toBeNull()
      expect(result!.content.text).toBe('what is 2+2?')
    })

    it('returns null for group message without @bot mention', () => {
      const result = normalizeFeishuEvent(
        makeFeishuEvent({
          chatType: 'group',
          content: JSON.stringify({ text: 'just chatting' }),
          mentions: [],
        }),
        CHANNEL_KEY,
        BOT_OPEN_ID
      )
      expect(result).toBeNull()
    })

    it('returns null for non-text message type', () => {
      const result = normalizeFeishuEvent(
        makeFeishuEvent({ messageType: 'image' }),
        CHANNEL_KEY,
        BOT_OPEN_ID
      )
      expect(result).toBeNull()
    })

    it('returns null when sender open_id is missing', () => {
      const result = normalizeFeishuEvent(
        makeFeishuEvent({ senderOpenId: null }),
        CHANNEL_KEY,
        BOT_OPEN_ID
      )
      expect(result).toBeNull()
    })

    it('treats chat_type "private" as group — requires @bot mention', () => {
      // "private" is a non-p2p chat type, should require @mention just like "group"
      const withoutMention = normalizeFeishuEvent(
        makeFeishuEvent({ chatType: 'private', mentions: [] }),
        CHANNEL_KEY,
        BOT_OPEN_ID
      )
      expect(withoutMention).toBeNull()

      const withMention = normalizeFeishuEvent(
        makeFeishuEvent({
          chatType: 'private',
          content: JSON.stringify({ text: '@_bot_1 hello' }),
          mentions: [{ key: '@_bot_1', id: { open_id: BOT_OPEN_ID }, name: 'Bot' }],
        }),
        CHANNEL_KEY,
        BOT_OPEN_ID
      )
      expect(withMention).not.toBeNull()
    })
  })
  ```

- [ ] **Step 2: 运行测试，确认红**

  ```bash
  pnpm --filter @aaas/dispatcher test
  ```

  预期：`normalizeFeishuEvent` is not exported / not defined 错误。

- [ ] **Step 3: 实现 `normalizeFeishuEvent()` in `normalize.ts`**

  在 `packages/dispatcher/src/normalize.ts` 末尾追加（不修改现有 `normalizeTelegramUpdate`）：

  ```ts
  export function normalizeFeishuEvent(
    event: any,
    channelKey: string,
    botOpenId: string
  ): NormalizedMessage | null {
    const { message, sender } = event

    // MVP：只处理文本消息
    if (message.message_type !== 'text') return null

    // sender open_id 必须存在（bot-to-bot 消息等场景可能缺失）
    const senderOpenId: string | undefined = sender?.sender_id?.open_id
    if (!senderOpenId) return null

    const mentions: Array<{ key: string; id?: { open_id?: string } }> = message.mentions ?? []

    // 非私聊（group / private 等）：必须 @机器人
    if (message.chat_type !== 'p2p') {
      const mentioned = mentions.some(m => m.id?.open_id === botOpenId)
      if (!mentioned) return null
    }

    // 解析消息文本
    let text: string
    try {
      text = (JSON.parse(message.content) as { text: string }).text ?? ''
    } catch {
      return null
    }

    // 清除所有 mention 占位符（@_bot_N、@_user_N 等），保留纯文字
    // 使用 mentions[].key 做精确字符串替换，避免 regex 误伤
    for (const mention of mentions) {
      text = text.replace(mention.key, '').trim()
    }
    if (!text) return null

    return {
      channel_key: channelKey,
      // 飞书 p2p 和 group 的 chat_id 始终不同，external_thread_key 统一为空字符串
      // MVP 同一 chat_id 下所有消息共享一个 conversation
      external_chat_id: message.chat_id,
      external_thread_key: '',
      external_message_id: message.message_id,
      author: {
        external_user_id: senderOpenId,
        display_name: null,
      },
      content: { type: 'text', text },
    }
  }
  ```

- [ ] **Step 4: 运行测试，确认绿**

  ```bash
  pnpm --filter @aaas/dispatcher test
  ```

  预期：所有测试通过，包括原有 Telegram 用例和新增飞书用例。

- [ ] **Step 5: Commit**

  ```bash
  git add packages/dispatcher/src/normalize.ts packages/dispatcher/tests/normalize.test.ts
  git commit -m "feat(dispatcher): add normalizeFeishuEvent for Feishu message handling"
  ```

---

## Task 5: `feishu.ts` — 创建飞书客户端

**Files:**
- Create: `packages/dispatcher/src/feishu.ts`
- Modify: `packages/dispatcher/package.json`

- [ ] **Step 1: 在 `dispatcher/package.json` 添加 SDK 依赖**

  在 `packages/dispatcher/package.json` 的 `dependencies` 中添加：

  ```json
  "@larksuiteoapi/node-sdk": "^1.60.0"
  ```

  然后在 monorepo 根目录安装（pnpm workspace 会从已有缓存复用，速度很快）：

  ```bash
  pnpm install
  ```

- [ ] **Step 2: 创建 `feishu.ts`**

  ```ts
  // packages/dispatcher/src/feishu.ts
  import * as lark from '@larksuiteoapi/node-sdk'
  import pino from 'pino'
  import type { IMClient } from './im-client.js'
  import type { NormalizedMessage } from './normalize.js'
  import { normalizeFeishuEvent } from './normalize.js'

  const logger = pino({ transport: { target: 'pino-pretty' } })

  export function createFeishuClient(
    appId: string,
    appSecret: string,
    botOpenId: string
  ): {
    client: IMClient
    start: (
      onMessage: (msg: NormalizedMessage) => Promise<void>,
      channelKey: string
    ) => Promise<void>
  } {
    const larkClient = new lark.Client({ appId, appSecret })

    const client: IMClient = {
      async sendMessage(chatId: string, text: string): Promise<void> {
        await larkClient.im.message.create({
          params: { receive_id_type: 'chat_id' },
          data: {
            receive_id: chatId,
            msg_type: 'text',
            content: JSON.stringify({ text }),
          },
        })
      },

      async sendChatAction(_chatId: string): Promise<void> {
        // 飞书无 typing indicator，no-op
      },
    }

    async function start(
      onMessage: (msg: NormalizedMessage) => Promise<void>,
      channelKey: string
    ): Promise<void> {
      const wsClient = new lark.WSClient({ appId, appSecret })

      // await 确保连接失败时抛出错误使进程退出，而不是静默挂起
      await wsClient.start({
        eventDispatcher: new lark.EventDispatcher({}).register({
          'im.message.receive_v1': async (data: any) => {
            const msg = normalizeFeishuEvent(data, channelKey, botOpenId)
            if (!msg) return
            await onMessage(msg).catch(err =>
              logger.error({ event: 'feishu.processor.error', error: String(err) })
            )
          },
        }),
      })
    }

    return { client, start }
  }
  ```

- [ ] **Step 3: 验证 TypeScript 编译通过**

  ```bash
  pnpm --filter @aaas/dispatcher build
  ```

  预期：无编译错误。（WSClient 的网络行为不做单元测试，连接正确性在手动集成测试中验证。）

- [ ] **Step 4: Commit**

  ```bash
  git add packages/dispatcher/src/feishu.ts packages/dispatcher/package.json pnpm-lock.yaml
  git commit -m "feat(dispatcher): add createFeishuClient with WSClient and IMClient impl"
  ```

---

## Task 6: `index.ts` — 按 provider 分支启动

**Files:**
- Modify: `packages/dispatcher/src/index.ts`

- [ ] **Step 1: 更新 `index.ts`**

  完整替换 `packages/dispatcher/src/index.ts` 内容如下（相对于原文件，主要改动在凭证读取和底部分支逻辑）：

  ```ts
  import pino from 'pino'
  import * as lark from '@larksuiteoapi/node-sdk'
  import { createDb } from './db.js'
  import { createJwtSigner } from './jwt.js'
  import { createEncryptor } from './encrypt.js'
  import { createConversationManager } from './conversation.js'
  import { createInboundJobsManager } from './inbound-jobs.js'
  import { createGatewayClient } from './gateway-client.js'
  import { createSandboxOrchestrator } from './sandbox.js'
  import { createTelegramClient } from './telegram.js'
  import { createFeishuClient } from './feishu.js'
  import { createProcessor } from './processor.js'
  import { createPollingLoop } from './polling.js'
  import { createId } from '@paralleldrive/cuid2'

  const logger = pino({ transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined })

  const DATABASE_URL = process.env.DATABASE_URL!
  const JWT_SECRET = process.env.JWT_SECRET!
  const BOT_TOKEN_ENC_KEY = process.env.BOT_TOKEN_ENC_KEY!
  const GATEWAY_URL = process.env.GATEWAY_URL!
  const GATEWAY_LOCAL_URL = process.env.GATEWAY_LOCAL_URL ?? 'http://localhost:3001'
  const E2B_API_KEY = process.env.E2B_API_KEY!

  const INSTANCE_ID = process.env.POD_NAME ?? `dispatcher-${createId()}`

  async function main() {
    const db = createDb(DATABASE_URL)
    const jwt = createJwtSigner(JWT_SECRET)
    const enc = createEncryptor(BOT_TOKEN_ENC_KEY)

    // Load active agent and im_config from DB
    const agent = await db.agent.findFirst({
      where: { status: 'active' },
      select: { id: true, e2bTemplateId: true, port: true, idleTimeoutMs: true },
    })
    if (!agent) throw new Error('No active agent found — run setup.ts first')

    const cfg = await db.imConfig.findFirst({
      where: { agentId: agent.id, status: 'active' },
      select: { id: true, provider: true, credentialsEnc: true },  // 原 platform / botTokenEnc
    })
    if (!cfg) throw new Error('No active im_config found — run setup.ts first')

    // 解密凭证 JSON（所有 provider 统一格式）
    const credentials = JSON.parse(enc.decrypt(cfg.credentialsEnc)) as Record<string, string>
    const channelKey = `im:${cfg.id}`

    const conversation = createConversationManager(db)
    const jobs = createInboundJobsManager(db, INSTANCE_ID)
    const gateway = createGatewayClient(GATEWAY_LOCAL_URL)
    const sandbox = createSandboxOrchestrator({ e2bApiKey: E2B_API_KEY, gatewayUrl: GATEWAY_URL, instanceId: INSTANCE_ID })

    logger.info({ event: 'dispatcher.start', provider: cfg.provider, agent_id: agent.id, instance_id: INSTANCE_ID })

    if (cfg.provider === 'telegram') {
      const telegram = createTelegramClient(credentials.bot_token)
      const processor = createProcessor({ conversation, jobs, gateway, sandbox, im: telegram, jwt, agent })
      const poller = createPollingLoop({ botToken: credentials.bot_token, channelKey, telegram, onMessage: msg => processor.handle(msg) })
      poller.start()

    } else if (cfg.provider === 'feishu') {
      // 获取 bot open_id，用于群聊 @mention 过滤
      // API: GET /open-apis/bot/v3/info，需要 im:bot 权限
      const tmpClient = new lark.Client({ appId: credentials.app_id, appSecret: credentials.app_secret })
      const botInfoResp = await (tmpClient as any).request({
        method: 'GET',
        url: '/open-apis/bot/v3/info',
      }) as any
      const botOpenId: string = botInfoResp?.bot?.open_id ?? ''
      if (!botOpenId) throw new Error('Failed to fetch Feishu bot open_id — check app_id/app_secret and im:bot permission')

      logger.info({ event: 'feishu.bot_identity', bot_open_id: botOpenId })

      const { client: feishuClient, start } = createFeishuClient(credentials.app_id, credentials.app_secret, botOpenId)
      const processor = createProcessor({ conversation, jobs, gateway, sandbox, im: feishuClient, jwt, agent })

      // start() awaits WSClient — 保持长连接，进程不退出
      await start(msg => processor.handle(msg), channelKey)

    } else {
      throw new Error(`Unsupported provider: ${cfg.provider}`)
    }
  }

  main().catch(err => {
    logger.error({ event: 'dispatcher.fatal', error: String(err) })
    process.exit(1)
  })
  ```

- [ ] **Step 2: 验证编译通过**

  ```bash
  pnpm --filter @aaas/dispatcher build
  ```

  预期：无编译错误。

- [ ] **Step 3: 运行全量测试，确认无回归**

  ```bash
  pnpm --filter @aaas/dispatcher test
  ```

  预期：所有测试通过。

- [ ] **Step 4: Commit**

  ```bash
  git add packages/dispatcher/src/index.ts
  git commit -m "feat(dispatcher): add provider-based branching for Telegram and Feishu startup"
  ```

---

## Task 7: `setup.ts` — 支持飞书凭证写入

**Files:**
- Modify: `scripts/setup.ts`

- [ ] **Step 1: 更新 `setup.ts`**

  完整替换 `scripts/setup.ts` 内容：

  ```ts
  import { execSync } from 'child_process'
  import { createInterface } from 'readline'
  import { createId } from '@paralleldrive/cuid2'
  import { createPrismaClient } from '@aaas/db'
  import { createEncryptor } from '../packages/dispatcher/src/encrypt.js'

  const DATABASE_URL = process.env.DATABASE_URL!
  const BOT_TOKEN_ENC_KEY = process.env.BOT_TOKEN_ENC_KEY!
  const E2B_TEMPLATE_ID = process.env.E2B_TEMPLATE_ID!

  if (!DATABASE_URL || !BOT_TOKEN_ENC_KEY || !E2B_TEMPLATE_ID) {
    console.error('Required env vars: DATABASE_URL, BOT_TOKEN_ENC_KEY, E2B_TEMPLATE_ID')
    process.exit(1)
  }

  const enc = createEncryptor(BOT_TOKEN_ENC_KEY)

  // Run Prisma migrations
  console.log('Running migrations...')
  execSync(`pnpm --filter @aaas/db migrate:deploy`, { stdio: 'inherit' })
  console.log('Migrations complete.')

  const rl = createInterface({ input: process.stdin, output: process.stderr })
  const ask = (q: string): Promise<string> =>
    new Promise(resolve => rl.question(q, answer => resolve(answer.trim())))

  // Select provider
  const provider = await ask('Provider [telegram/feishu]: ')
  if (provider !== 'telegram' && provider !== 'feishu') {
    console.error(`Unknown provider: ${provider}`)
    process.exit(1)
  }

  let credentials: Record<string, string>

  if (provider === 'telegram') {
    const botToken = await ask('Enter Telegram bot token: ')
    credentials = { bot_token: botToken }

  } else {
    const appId = await ask('Enter Feishu App ID (cli_xxx): ')
    const appSecret = await ask('Enter Feishu App Secret: ')
    credentials = { app_id: appId, app_secret: appSecret }
  }

  rl.close()

  const credentialsEnc = enc.encrypt(JSON.stringify(credentials))

  const prisma = createPrismaClient(DATABASE_URL)
  const agentId = 'agt_' + createId()
  const cfgId = 'cfg_' + createId()

  await prisma.agent.create({
    data: { id: agentId, name: 'Demo Agent', status: 'active', e2bTemplateId: E2B_TEMPLATE_ID, port: 8080, idleTimeoutMs: 300000 },
  })

  await prisma.imConfig.create({
    data: { id: cfgId, agentId, provider, credentialsEnc, chatScope: 'all', status: 'active' },
  })

  await prisma.$disconnect()

  console.log(`\nSetup complete.`)
  console.log(`  provider:    ${provider}`)
  console.log(`  agent_id:    ${agentId}`)
  console.log(`  im_config:   ${cfgId}`)
  console.log(`  channel_key: im:${cfgId}`)
  console.log('\nStart dispatcher and gateway to go live.')
  ```

  > **注意**：`setup.ts` 直接 import `createEncryptor` 复用加密逻辑，避免重复实现。原 `setup.ts` 中有内联的 `encrypt()` 函数，现在删除。

- [ ] **Step 2: 运行全量测试，最终确认**

  ```bash
  pnpm --filter @aaas/dispatcher test
  ```

  预期：所有测试通过。

- [ ] **Step 3: 更新 `docs/generated/db-schema.md`**

  打开 `docs/generated/db-schema.md`，在 `im_configs` 表的说明中更新字段名：
  - `platform` → `provider`（说明扩展为 `'telegram' | 'feishu'`）
  - `bot_token_enc` → `credentials_enc`（说明更新为"各平台凭证的加密 JSON"）

  同时更新 `ARCHITECTURE.md` 中 `Current limitations` 一节：
  - 删除 `Telegram only (im_configs.platform is always 'telegram')` 这条限制

- [ ] **Step 4: Commit**

  ```bash
  git add scripts/setup.ts docs/generated/db-schema.md ARCHITECTURE.md
  git commit -m "feat(setup): support feishu provider in setup wizard, unify credentials_enc"
  ```

---

## 验证清单（手动集成测试）

完成所有 Task 后，在本地手动验证：

**前置条件**：
- 已在飞书开放平台创建应用，开启"机器人"能力
- 已订阅 `im.message.receive_v1` 事件
- 已开启 WebSocket 长连接模式
- 已授权 `im:bot` 权限范围（用于 `/bot/v3/info`）

**验证步骤**：
1. `prisma migrate reset && pnpm tsx scripts/setup.ts`，选 `feishu`，输入 App ID/Secret
2. 启动 gateway：`pnpm --filter @aaas/gateway dev`
3. 启动 dispatcher：`pnpm --filter @aaas/dispatcher dev`
4. 在飞书私聊机器人发送消息 → 应收到 agent 回复
5. 在飞书群组中 @机器人 发送消息 → 应收到回复
6. 在群组中不 @机器人 发送消息 → 应静默忽略

---

## 常见问题

**Q: `prisma migrate dev` 询问 rename 时找不到提示？**  
A: 若在 CI 或非 TTY 环境，Prisma 会把 rename 拆为 drop+create。本地 dev 直接 `prisma migrate reset` 重建最省事。

**Q: `GET /open-apis/bot/v3/info` 返回 `botOpenId` 为空？**  
A: 检查飞书应用是否已授权 `im:bot` 权限范围，并已发布版本。

**Q: WSClient 启动后断连？**  
A: 确认飞书开放平台已开启"长连接"模式（控制台 → 事件订阅 → 接收事件方式 → 长连接）。

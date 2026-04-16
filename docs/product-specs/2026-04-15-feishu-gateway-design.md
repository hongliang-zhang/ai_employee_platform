<!-- DOC-GARDENING-CHANGE: 2026-04-16
  - Updated status from 待实现 to Completed: Feishu WebSocket client implemented in dispatcher, schema migration applied (provider/credentials_enc renaming), IMClient abstraction in place
-->
# 飞书 Gateway 接入设计

**日期**：2026-04-15
**状态**：Completed
**范围**：`packages/dispatcher`（主要）、`packages/db`（schema 变更）

---

## 背景

当前 dispatcher 仅支持 Telegram（long-polling），`im_configs.platform` 字段硬编码为 `'telegram'`。本设计描述如何以最小改动将飞书（Feishu/Lark）作为第二个 IM provider 接入，同时为未来更多平台奠定可扩展基础。

---

## 目标

- dispatcher 支持飞书 WebSocket 长连接模式接收消息
- 支持私聊（DM）和群聊（群聊仅响应 @机器人 的文本消息）
- MVP 仅处理文本消息，与现有 Telegram 实现对齐
- Telegram 现有逻辑零破坏性改动
- 凭证存储统一化，为未来 IM provider 扩展预留空间

## 非目标

- 图片、文件、语音等富媒体消息（留待后续）
- Webhook 接入模式（WebSocket 为默认且足够）
- 群聊消息的线程回复（MVP 直接回复到 chat，不做线程）
- 多飞书应用同时接入（单 im_config 记录）

---

## 技术选型

**SDK**：`@larksuiteoapi/node-sdk`（openclaw 已在 monorepo 中使用 `^1.60.0`，直接复用）  
**连接模式**：WebSocket 长连接（`WSClient`）——飞书服务器主动建连，无需公网 endpoint，与 Telegram long-polling 行为对等

---

## 数据库变更

### 字段重命名与语义升级

| 字段 | 变更 | 说明 |
|------|------|------|
| `bot_token_enc` | → `credentials_enc` | 重命名，语义从"Telegram bot token"升级为"任意平台凭证" |
| `platform` | → `provider` | 重命名，避免与代码中其他 platform 概念混淆 |

### `credentials_enc` 存储规范

字段类型 `TEXT`，内容为 AES-256 加密后的 JSON 字符串（使用现有 `BOT_TOKEN_ENC_KEY` 环境变量，**名称保持不变**，避免已有部署受影响）：

| provider | 解密后 JSON 结构 |
|----------|----------------|
| `telegram` | `{"bot_token": "..."}` |
| `feishu` | `{"app_id": "...", "app_secret": "..."}` |
| 未来平台 | 各自 JSON 结构，无需改 schema |

### `provider` CHECK 约束

未来新增 provider 时扩展此约束。

### Migration SQL

```sql
ALTER TABLE im_configs RENAME COLUMN bot_token_enc TO credentials_enc;
ALTER TABLE im_configs RENAME COLUMN platform TO provider;
ALTER TABLE im_configs ADD CONSTRAINT im_configs_provider_check
  CHECK (provider IN ('telegram', 'feishu'));
-- credentials_enc 内容需由 setup.ts 重新写入（本地开发环境直接重建 DB）
```

### Prisma Schema 变更

```prisma
model ImConfig {
  id             String    @id
  agentId        String    @map("agent_id")
  provider       String    @default("telegram")       // 原 platform
  credentialsEnc String    @map("credentials_enc")    // 原 botTokenEnc
  chatScope      String    @default("all") @map("chat_scope")
  status         String
  leaseOwner     String?   @map("lease_owner")
  leaseExpiresAt DateTime? @map("lease_expires_at") @db.Timestamptz()
  createdAt      DateTime  @default(now()) @map("created_at") @db.Timestamptz()

  agent Agent @relation(fields: [agentId], references: [id])

  @@map("im_configs")
}
```

---

## 代码变更

### 文件清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `packages/db/prisma/schema.prisma` | 修改 | 字段重命名 |
| `packages/db/prisma/migrations/xxx_feishu.sql` | 新增 | ALTER TABLE |
| `packages/dispatcher/src/im-client.ts` | 新增 | `IMClient` 接口 |
| `packages/dispatcher/src/feishu.ts` | 新增 | 飞书客户端实现（`IMClient` 实现 + `start()`） |
| `packages/dispatcher/src/normalize.ts` | 修改 | 新增 `normalizeFeishuEvent()` |
| `packages/dispatcher/src/processor.ts` | 修改 | `telegram` → `im: IMClient` |
| `packages/dispatcher/src/index.ts` | 修改 | 按 `provider` 分支启动 |
| `scripts/setup.ts` | 修改 | 支持飞书凭证写入，统一 `credentialsEnc` |
| `packages/dispatcher/package.json` | 修改 | 新增 `@larksuiteoapi/node-sdk` 依赖声明 |

### `im-client.ts`（新增）

```ts
export interface IMClient {
  sendMessage(chatId: string, text: string): Promise<void>
  sendChatAction(chatId: string): Promise<void>
}
```

`createTelegramClient()` 的返回值已满足此接口（duck typing），无需改动 `telegram.ts`。

### `feishu.ts`（新增）

`createFeishuClient()` 返回两个独立部分：实现 `IMClient` 接口的 `client` 对象，以及独立的 `start()` 函数——避免把启动逻辑混入接口类型。

```ts
import * as lark from '@larksuiteoapi/node-sdk'
import type { IMClient } from './im-client.js'
import type { NormalizedMessage } from './normalize.js'
import { normalizeFeishuEvent } from './normalize.js'

export function createFeishuClient(appId: string, appSecret: string, botOpenId: string): {
  client: IMClient
  start: (onMessage: (msg: NormalizedMessage) => Promise<void>, channelKey: string) => Promise<void>
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
    // await 启动，确保连接失败时能抛出错误而不是静默退出
    await wsClient.start({
      eventDispatcher: new lark.EventDispatcher({}).register({
        'im.message.receive_v1': async (data) => {
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

**获取 `botOpenId`**：在 `index.ts` 中通过 Feishu REST API 获取，见下方 `index.ts` 说明。

### `normalize.ts`（新增函数）

**飞书文本消息事件结构**（`im.message.receive_v1`）：
```ts
{
  message: {
    message_id: string
    chat_id: string
    // 'p2p' = 私聊, 'group' = 群聊, 'private' = 私有群（较少见）
    chat_type: 'p2p' | 'group' | 'private'
    message_type: string   // 仅处理 'text'
    content: string        // JSON string, e.g. '{"text":"@_bot_1 hello"}'
    mentions?: Array<{
      key: string          // 消息内的占位符，如 "@_bot_1"、"@_user_2"
      id: { open_id?: string }
      name: string
    }>
  }
  sender: {
    sender_id: { open_id?: string; user_id?: string; union_id?: string }
  }
}
```

**Mention 处理说明**：  
飞书在消息 `content.text` 中用位置占位符（如 `@_bot_1`、`@_user_2`）替代实际用户名，`mentions[]` 数组提供占位符到 `open_id` 的映射。机器人的 mention 占位符格式为 `@_bot_N`（不是 `@_user_N`），需通过 `mentions[].id.open_id === botOpenId` 匹配，再用 `mentions[].key` 在 text 中找到对应占位符并删除。其他用户的 mention 占位符（`@_user_N`）一并清除，只保留实际文字内容。

```ts
export function normalizeFeishuEvent(
  event: any,
  channelKey: string,
  botOpenId: string
): NormalizedMessage | null {
  const { message, sender } = event

  // MVP：只处理文本消息
  if (message.message_type !== 'text') return null

  // sender open_id 是必须字段；缺失时（如 bot-to-bot 消息）丢弃
  const senderOpenId = sender?.sender_id?.open_id
  if (!senderOpenId) return null

  const mentions: Array<{ key: string; id?: { open_id?: string } }> = message.mentions ?? []

  // 群聊（group / private）：必须 @机器人；p2p 私聊无需过滤
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

  // 清除所有 mention 占位符（机器人 @_bot_N 和其他用户 @_user_N），保留纯文字
  for (const mention of mentions) {
    // mention.key 是占位符原文，如 "@_bot_1" 或 "@_user_2"
    text = text.replace(mention.key, '').trim()
  }
  if (!text) return null

  return {
    channel_key: channelKey,
    external_chat_id: message.chat_id,
    // 飞书私聊和群聊的 chat_id 始终不同，external_thread_key 统一为空字符串
    // MVP 不区分线程，同一 chat_id 下所有消息共享一个 conversation
    external_thread_key: '',
    external_message_id: message.message_id,
    author: {
      external_user_id: senderOpenId,
      display_name: null,  // 飞书事件中不直接携带发送者名字，MVP 暂不额外请求
    },
    content: { type: 'text', text },
  }
}
```

### `processor.ts`（修改）

将 `telegram` 依赖替换为 `im: IMClient`：

```ts
// 前
telegram: ReturnType<typeof import('./telegram.js').createTelegramClient>

// 后
im: IMClient
```

函数体内所有 `telegram.sendMessage` / `telegram.sendChatAction` → `im.sendMessage` / `im.sendChatAction`。

### `index.ts`（修改）

```ts
import * as lark from '@larksuiteoapi/node-sdk'

const credentials = JSON.parse(enc.decrypt(cfg.credentialsEnc))

if (cfg.provider === 'telegram') {
  const telegram = createTelegramClient(credentials.bot_token)
  const processor = createProcessor({ ..., im: telegram })
  const poller = createPollingLoop({ ..., onMessage: msg => processor.handle(msg) })
  poller.start()

} else if (cfg.provider === 'feishu') {
  // 获取 bot open_id，用于群聊 @mention 过滤
  // 使用标准 Feishu REST API: GET /open-apis/bot/v3/info
  const tmpClient = new lark.Client({ appId: credentials.app_id, appSecret: credentials.app_secret })
  const botInfoResp = await tmpClient.request({
    method: 'GET',
    url: '/open-apis/bot/v3/info',
  }) as any
  const botOpenId: string = botInfoResp?.bot?.open_id ?? ''
  if (!botOpenId) throw new Error('Failed to fetch Feishu bot open_id — check app_id/app_secret')

  const { client: feishuClient, start } = createFeishuClient(credentials.app_id, credentials.app_secret, botOpenId)
  const processor = createProcessor({ ..., im: feishuClient })
  // start() 会 await WSClient 连接，连接失败时抛出错误使进程退出
  await start(msg => processor.handle(msg), channelKey)
}
```

### `setup.ts`（修改）

交互提示新增 `provider` 选择，飞书分支：

```
provider: telegram | feishu

[飞书] App ID: cli_xxx
[飞书] App Secret: xxx

→ credentials_enc = encrypt(JSON.stringify({ app_id, app_secret }))
→ db.imConfig.create({ provider: 'feishu', credentialsEnc, ... })
```

Telegram 分支同步更新为 JSON 格式：

```
→ credentials_enc = encrypt(JSON.stringify({ bot_token }))
→ db.imConfig.create({ provider: 'telegram', credentialsEnc, ... })
```

### `packages/dispatcher/package.json`（修改）

在 `dependencies` 中显式声明：

```json
"@larksuiteoapi/node-sdk": "^1.60.0"
```

pnpm workspace 中 openclaw 已锁定此版本，无需重新下载，但 dispatcher 的 `package.json` 须显式声明以保证严格模式下的依赖解析。

---

## 数据流

```
飞书服务器
   │  WebSocket 长连接（lark WSClient）
   ▼
dispatcher
  index.ts
    └─ 读 im_configs.provider
         ├─ 'telegram' → createTelegramClient + createPollingLoop
         └─ 'feishu'  → GET /bot/v3/info 取 botOpenId
                         createFeishuClient → { client, start }
                         await start()（阻塞，保持长连接）

  normalizeFeishuEvent()
    ├─ 非 text → null（丢弃）
    ├─ sender open_id 缺失 → null（丢弃）
    ├─ 非私聊且未 @bot → null（丢弃）
    └─ 清除所有 mention 占位符 → NormalizedMessage

  processor.handle(NormalizedMessage)
    ├─ conversation.upsert()
    ├─ jobs.tryInsert()（dedup）
    ├─ gateway.appendMessages()
    ├─ im.sendChatAction()（飞书 no-op）
    ├─ sandbox.getOrCreate() → /chat
    └─ im.sendMessage(chatId, reply)
```

---

## 测试要点

- `normalizeFeishuEvent()`：单元测试覆盖：
  - 私聊文本消息（正常处理）
  - 群聊 @bot 消息（正常处理，占位符被清除）
  - 群聊未 @bot（返回 null）
  - 非文本消息（返回 null）
  - `sender.sender_id.open_id` 缺失（返回 null）
  - `message.chat_type === 'private'` 群聊（需 @bot）
- `normalize.test.ts`：在现有 `normalizeTelegramUpdate` 测试旁新增飞书用例
- `processor.ts`：现有测试中 `telegram` mock 替换为 `IMClient` mock（接口不变，改动最小）
- 集成测试：WSClient 连接不做单测（依赖外部服务），在本地 dev 环境手动验证

---

## 新增依赖

```
@larksuiteoapi/node-sdk ^1.60.0
```

openclaw 在 monorepo 中已使用同版本，pnpm workspace 可直接共享。`packages/dispatcher/package.json` 须显式声明此依赖。

---

## 待确认事项（部署前）

- 飞书 App 需在飞书开放平台配置"接收消息"事件订阅（`im.message.receive_v1`）
- 需开通"机器人"能力及 WebSocket 长连接模式（开放平台控制台启用）
- `GET /open-apis/bot/v3/info` 需要 `im:bot` 权限范围

# 飞书 Gateway 接入设计

**日期**：2026-04-15  
**状态**：待实现  
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

字段类型 `TEXT`，内容为 AES-256 加密后的 JSON 字符串（使用现有 `BOT_TOKEN_ENC_KEY`）：

| provider | 解密后 JSON 结构 |
|----------|----------------|
| `telegram` | `{"bot_token": "..."}` |
| `feishu` | `{"app_id": "...", "app_secret": "..."}` |
| 未来平台 | 各自 JSON 结构，无需改 schema |

### `provider` CHECK 约束

```sql
CHECK (provider IN ('telegram', 'feishu'))
```

未来新增 provider 时扩展此约束。

### Migration SQL

```sql
ALTER TABLE im_configs RENAME COLUMN bot_token_enc TO credentials_enc;
ALTER TABLE im_configs RENAME COLUMN platform TO provider;
-- 更新现有 Telegram 记录的 provider 值（原 'telegram' 值不变）
-- credentials_enc 内容需由 setup.ts 重新写入（本地开发环境直接重建）
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
| `packages/dispatcher/src/feishu.ts` | 新增 | 飞书客户端实现 |
| `packages/dispatcher/src/normalize.ts` | 修改 | 新增 `normalizeFeishuEvent()` |
| `packages/dispatcher/src/processor.ts` | 修改 | `telegram` → `im: IMClient` |
| `packages/dispatcher/src/index.ts` | 修改 | 按 `provider` 分支启动 |
| `scripts/setup.ts` | 修改 | 支持飞书凭证写入，统一 `credentialsEnc` |

### `im-client.ts`（新增）

```ts
export interface IMClient {
  sendMessage(chatId: string, text: string): Promise<void>
  sendChatAction(chatId: string): Promise<void>
}
```

`createTelegramClient()` 的返回值已满足此接口（duck typing），无需改动 `telegram.ts`。

### `feishu.ts`（新增）

```ts
import * as lark from '@larksuiteoapi/node-sdk'
import type { IMClient } from './im-client.js'
import type { NormalizedMessage } from './normalize.js'
import { normalizeFeishuEvent } from './normalize.js'

export function createFeishuClient(appId: string, appSecret: string, botOpenId: string) {
  const client = new lark.Client({ appId, appSecret })

  return {
    // 启动 WebSocket 长连接，注册消息事件处理器
    async start(onMessage: (msg: NormalizedMessage) => Promise<void>, channelKey: string): Promise<void> {
      const wsClient = new lark.WSClient({ appId, appSecret })
      wsClient.start({
        eventDispatcher: new lark.EventDispatcher({}).register({
          'im.message.receive_v1': async (data) => {
            const msg = normalizeFeishuEvent(data, channelKey, botOpenId)
            if (!msg) return
            await onMessage(msg).catch(err =>
              console.error({ event: 'feishu.processor.error', error: String(err) })
            )
          },
        }),
      })
    },

    // 实现 IMClient 接口
    async sendMessage(chatId: string, text: string): Promise<void> {
      await client.im.message.create({
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
  } satisfies IMClient & { start: unknown }
}
```

**启动时获取 `botOpenId`**：在 `index.ts` 中调用 `client.bot.get()` 拿到 bot 的 `open_id`，传入 `createFeishuClient()`，用于群聊 @mention 过滤。

### `normalize.ts`（新增函数）

```ts
export function normalizeFeishuEvent(
  event: any,
  channelKey: string,
  botOpenId: string
): NormalizedMessage | null {
  const { message, sender } = event

  // MVP：只处理文本消息
  if (message.message_type !== 'text') return null

  // 群聊：必须 @机器人
  if (message.chat_type === 'group') {
    const mentioned = (message.mentions ?? []).some(
      (m: any) => m.id?.open_id === botOpenId
    )
    if (!mentioned) return null
  }

  // 解析消息内容，清除 @mention 标记
  let text: string
  try {
    text = (JSON.parse(message.content) as { text: string }).text ?? ''
  } catch {
    return null
  }
  // 去掉飞书 @mention 占位符（格式：@_user_1 等）
  text = text.replace(/@_user_\d+\s*/g, '').trim()
  if (!text) return null

  return {
    channel_key: channelKey,
    external_chat_id: message.chat_id,
    external_thread_key: '',  // MVP 不区分线程
    external_message_id: message.message_id,
    author: {
      external_user_id: sender.sender_id.open_id,
      display_name: null,  // 飞书事件中不直接携带名字，MVP 暂不获取
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
const credentials = JSON.parse(enc.decrypt(cfg.credentialsEnc))

if (cfg.provider === 'telegram') {
  const telegram = createTelegramClient(credentials.bot_token)
  const processor = createProcessor({ ..., im: telegram })
  const poller = createPollingLoop({ ..., onMessage: msg => processor.handle(msg) })
  poller.start()

} else if (cfg.provider === 'feishu') {
  // 获取 bot open_id 用于群聊 @mention 过滤
  const tmpClient = new lark.Client({ appId: credentials.app_id, appSecret: credentials.app_secret })
  const botInfo = await tmpClient.bot.get({})
  const botOpenId = botInfo.data?.bot?.open_id ?? ''

  const feishu = createFeishuClient(credentials.app_id, credentials.app_secret, botOpenId)
  const processor = createProcessor({ ..., im: feishu })
  await feishu.start(msg => processor.handle(msg), channelKey)
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

Telegram 分支同步更新：

```
→ credentials_enc = encrypt(JSON.stringify({ bot_token }))
→ db.imConfig.create({ provider: 'telegram', credentialsEnc, ... })
```

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
         └─ 'feishu'  → createFeishuClient + feishu.start()

  normalizeFeishuEvent()
    ├─ 非 text → null（丢弃）
    ├─ 群聊未 @bot → null（丢弃）
    └─ → NormalizedMessage

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

- `normalizeFeishuEvent()`：单元测试覆盖私聊文本、群聊 @bot、群聊未 @bot、非文本消息四种情况
- `normalize.test.ts`：在现有 `normalizeTelegramUpdate` 测试旁新增飞书用例
- `processor.ts`：现有测试中 `telegram` mock 替换为 `IMClient` mock（接口不变，改动最小）
- 集成测试：WSClient 连接不做单测（依赖外部服务），在本地 dev 环境手动验证

---

## 新增依赖

```
@larksuiteoapi/node-sdk ^1.60.0
```

openclaw 在 monorepo 中已使用同版本，pnpm workspace 可直接共享，无需额外安装。

---

## 待确认事项

- 飞书 App 需在飞书开放平台配置"接收消息"权限（`im:message:receive_v1` 事件订阅）
- WebSocket 长连接需要飞书 App 开通"长连接"能力（开放平台控制台启用）

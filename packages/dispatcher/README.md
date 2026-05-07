# Dispatcher

Dispatcher 是系统的 **IM 消息接入层**，负责把来自即时通讯平台（Telegram、飞书等）的用户消息转化为 AI 对话请求，并将 Agent 的回复发回给用户。

## 在整体架构中的位置

```
用户 (Telegram / 飞书)
        │  收发消息
        ▼
  [ Dispatcher ]          ← 本包
    │          │
    │          │ 写入对话历史
    │          ▼
    │      [ Gateway ]    — 会话消息持久化 & 权限校验
    │
    │ 按需创建沙箱
    ▼
  [ E2B Sandbox ]         — 每次请求独立启动一个沙箱
      └── Agent 进程      — 读取 Gateway 历史，调用 LLM，写回回复
```

Dispatcher 处于整个链路的**最前端**，是 IM 平台与 AI 后端之间唯一的桥梁。它不直接调用 LLM，也不存储对话内容，而是把这两件事分别委托给 E2B Sandbox（运行 Agent）和 Gateway（持久化消息历史）。

## 核心职责

### 1. IM 消息接入与规范化
将各平台的原始事件（Telegram Update、飞书 IM 事件）统一规范化为内部的 `NormalizedMessage` 结构，屏蔽平台差异。飞书群聊场景下会过滤掉未 @ 机器人的消息。

### 2. 幂等消息处理（`im-message-tracker`）
通过数据库的 `im_message_receipt` 表对每条 IM 消息做**分布式抢占（claim）**：
- 多个 Dispatcher 实例并发收到同一条消息时，只有第一个成功 `INSERT` 的实例才会处理；
- 使用 60 秒的租约（lease）机制：若某实例在持有租约期间崩溃，超期后其他实例可以重新认领，避免消息永久丢失。

### 3. 会话管理（`conversation`）
以 `(imConfigId, chatId, topicId)` 为唯一键维护会话记录，并在内存中缓存每个会话的 `lastMessageId`，用于向 Gateway 写消息时的**乐观并发控制**。

### 4. 沙箱编排（`sandbox`）
每次处理请求时按需创建一个全新的 E2B 沙箱（`Sandbox.create`），在沙箱内启动 Agent 进程，通过 HTTP `/chat` 接口获取回复，完成后立即销毁沙箱。每请求一个沙箱的设计简化了生命周期管理，无需检测沙箱是否过期或状态是否一致。

### 5. JWT 鉴权传递
为每次请求签发两种短期 JWT：
- **dispatcherToken**：用于向 Gateway 写入用户消息；
- **sandboxToken**：注入到沙箱进程的环境变量中，Agent 凭此访问 Gateway 读写对话历史。

## 关键流程

```
收到 IM 消息
  → 抢占消息（claimMessage）         — 幂等保证，多副本安全
  → 向 Gateway 追加用户消息           — 记录历史，供 Agent 读取
  → 发送"正在输入"提示到 IM          — 提升用户体验
  → 创建沙箱 → 启动 Agent → /chat   — 调用 AI
  → 将 Agent 回复发送到 IM           — 回复用户
  → 标记消息为 done                   — 释放幂等锁
  → 异步同步 lastMessageId            — 更新本地缓存
```

## 环境变量

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | PostgreSQL 连接串 |
| `JWT_SECRET` | 签发 dispatcher/sandbox token 的密钥 |
| `BOT_TOKEN_ENC_KEY` | IM bot token 的加密密钥 |
| `GATEWAY_URL` | Gateway 的公网地址（注入到沙箱供 Agent 使用） |
| `GATEWAY_LOCAL_URL` | Dispatcher 本地访问 Gateway 的地址，默认 `http://localhost:3001` |
| `E2B_API_KEY` | E2B 平台 API Key |
| `E2B_DOMAIN` | （可选）自定义 E2B 域名，腾讯云场景填 `ap-beijing.tencentags.com` |
| `POD_NAME` | 实例唯一标识，未设置时自动生成，用于 lease 归属追踪 |

## 本地开发

```bash
# 在 monorepo 根目录有 .env 文件的情况下
pnpm --filter @aaas/dispatcher dev

# 运行单元测试
pnpm --filter @aaas/dispatcher test
```

# Dispatcher ↔ Gateway Authentication Model

## Current design

Dispatcher 签发两种 JWT，gateway 统一通过 `auth.ts` 中间件验证：

| Token | 签发方法 | 持有者 | 过期时间 | `caller` | 允许写的 `source` |
|---|---|---|---|---|---|
| Sandbox JWT | `signSandboxToken()` | e2b 沙箱进程（不可信） | 24h | `sandbox` | `sandbox` |
| Dispatcher JWT | `signDispatcherToken()` | Dispatcher 自身（可信） | 60s | `dispatcher` | `im` |

Gateway 在 `messages.ts` 中根据 `caller` 做权限隔离：

```js
const allowedSource = caller === 'dispatcher' ? 'im' : 'sandbox'
```

### 信任模型

```
┌─────────────┐         ┌──────────┐         ┌─────────────┐
│ Dispatcher  │ ──HTTP──▶│ Gateway  │◀──HTTP──│   Sandbox   │
│  (可信)     │         │  (可信)  │         │  (不可信)    │
└─────────────┘         └──────────┘         └─────────────┘
```

- **Dispatcher → Gateway**：可信服务之间的通信。Dispatcher 自己签 token 给自己用（左口袋签条子给右口袋看）。
- **Sandbox → Gateway**：不可信方访问可信服务。JWT 的 `conversation_id` + `caller` scoping 是核心安全机制，防止沙箱越权访问其他会话或伪造用户消息。

## 问题

`signDispatcherToken` 存在**设计与信任模型不匹配**的问题：

1. **自签自验无意义** — Dispatcher 和 gateway 共享 `JWT_SECRET`，dispatcher 想签什么 payload 就签什么，60s 过期没有约束力。
2. **JWT 的安全属性对可信方无效** — `conversation_id` 的 scoping 是防 sandbox 越权的，对 dispatcher 无约束（它自己填的值）。
3. **增加不必要的复杂度** — 每次调 gateway 都要签一个 token，processor 代码多了 `dispatcherToken` 变量的生命周期管理。

## 建议方案

**Dispatcher ↔ Gateway 改用静态共享密钥认证，JWT 只用于约束 sandbox。**

具体做法：

1. 新增环境变量 `GATEWAY_INTERNAL_KEY`（随机字符串，dispatcher 和 gateway 共享）
2. Gateway `auth.ts` 支持两种认证方式：
   - `Authorization: Bearer <JWT>` — sandbox 请求，走现有的 `jwt.verify` + `caller` + `conversation_id` 校验
   - `X-Internal-Key: <key>` — dispatcher 请求，简单比对共享密钥
3. 删除 `signDispatcherToken()`，dispatcher 调 gateway 时用 `X-Internal-Key` header
4. 保留 `signSandboxToken()` 不变——JWT 的安全属性恰好对齐不可信方的约束需求

这样信任模型和认证机制是对齐的：不可信方用 JWT 做细粒度授权，可信方用简单的共享密钥做身份认证。

## 影响范围

- `packages/dispatcher/src/jwt.ts` — 删除 `signDispatcherToken`
- `packages/dispatcher/src/gateway-client.ts` — header 改为 `X-Internal-Key`
- `packages/dispatcher/src/processor.ts` — 不再需要签发 `dispatcherToken`
- `packages/gateway/src/auth.ts` — 支持双认证模式
- 新增 `GATEWAY_INTERNAL_KEY` 环境变量（`.env.example` + 两端配置）

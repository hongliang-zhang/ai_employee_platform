# 腾讯云沙箱迁移设计

**日期：** 2026-04-21
**状态：** 待审阅
**分支：** `feature/migrate-tencent-sandbox`（基于 `origin/master`）

---

## 1. 背景与目标

当前 AaaS 平台的沙箱使用 e2b 官方云服务（`e2b.app`）。需要切换到腾讯云提供的兼容 e2b 的沙箱服务（`ap-beijing.tencentags.com`）。

**核心发现：** 腾讯云实现了兼容 e2b 的服务端协议（腾讯云文档仅展示了 Python SDK 用法）。Node.js 端的 `@e2b/code-interpreter` SDK 内部通过 `E2B_DOMAIN` 环境变量控制 API 端点和沙箱连接域名，设置该变量即可路由到腾讯云后端。因此这是一个**配置切换**，不是 SDK 替换。

SDK 源码确认：
```js
// e2b@1.13.2 — ConnectionConfig
static get domain() {
  return getEnvVar("E2B_DOMAIN") || "e2b.app";
}
```

## 2. 改动范围

### 2.1 核心迁移（配置切换）

| # | 文件 | 改动类型 | 说明 |
|---|------|----------|------|
| 1 | `.env.example` | 修改 | 新增 `E2B_DOMAIN`，更新注释 |
| 2 | `packages/dispatcher/src/index.ts` | 修改 | 读取 `E2B_DOMAIN` 环境变量 |
| 3 | `packages/dispatcher/src/sandbox.ts` | 修改 | `createSandboxOrchestrator` 接收 `domain` 参数，传给 `Sandbox.create` |
| 4 | `packages/dispatcher/tests/sandbox.test.ts` | 修改 | 更新 mock 匹配新参数 |
| 5 | DB Schema (`schema.prisma`) | **不改** | `e2b_template_id` 字段名保持不变，只是存值从 e2b template ID 变为腾讯云沙箱工具名称 |
| 6 | `scripts/setup.ts` | **不改** | `E2B_TEMPLATE_ID` 环境变量含义变为腾讯云沙箱工具名称，代码无需改 |

### 2.2 迁移必需的配套改动

| # | 文件 | 改动类型 | 说明 |
|---|------|----------|------|
| 7 | `packages/dispatcher/src/sandbox.ts` | 修改 | `secure: false` — 腾讯云 AGS 使用 VPC 网络隔离，不需要 E2B SDK 的公共端口认证 |
| 8 | `packages/dispatcher/src/processor.ts` | 修改 | 新增 503 重试逻辑 — AGS 沙箱启动较慢，创建后短时间内 `/chat` 可能返回 503 |
| 9 | `packages/agent-sdk/src/gateway-llm-adapter.ts` | 重构 | 改用 `@mariozechner/pi-ai` 的 `createAssistantMessageEventStream()`，消除重复实现 |
| 10 | `packages/sandbox-base/` | 新增 | Dockerfile + s6-overlay 进程管理，适配腾讯云 AGS 的沙箱运行时基础镜像 |
| 11 | `packages/demo-agent/Dockerfile` | 重构 | 改为基于 sandbox-base 镜像构建，使用 s6-overlay 管理进程 |

## 3. 详细设计

### 3.1 环境变量

`.env.example` 新增：

```bash
# 沙箱后端域名。腾讯云: ap-beijing.tencentags.com，e2b 官方: e2b.app（默认）
E2B_DOMAIN=ap-beijing.tencentags.com

# 沙箱 API Key（腾讯云控制台创建）
E2B_API_KEY=ark_xxxx

# 沙箱工具名称（腾讯云控制台创建，对应原 e2b template ID）
E2B_TEMPLATE_ID=code-xxx
```

### 3.2 `packages/dispatcher/src/index.ts`

新增读取 `E2B_DOMAIN`：

```ts
const E2B_API_KEY = process.env.E2B_API_KEY!
const E2B_DOMAIN = process.env.E2B_DOMAIN  // 可选，SDK 默认 e2b.app

// ...

const sandbox = createSandboxOrchestrator({
  e2bApiKey: E2B_API_KEY,
  e2bDomain: E2B_DOMAIN,
  gatewayUrl: GATEWAY_URL,
  instanceId: INSTANCE_ID,
})
```

### 3.3 `packages/dispatcher/src/sandbox.ts`

`createSandboxOrchestrator` config 新增 `e2bDomain` 字段：

```ts
export function createSandboxOrchestrator(config: {
  e2bApiKey: string
  e2bDomain?: string    // 新增
  gatewayUrl: string
  instanceId: string
})
```

在 `Sandbox.create` 调用处传入 `domain`：

```ts
const sandbox = await retryWithBackoff(() =>
  Sandbox.create(templateId, {
    apiKey: config.e2bApiKey,
    ...(config.e2bDomain && { domain: config.e2bDomain }),
  })
)
```

**为什么显式传参而非仅依赖环境变量？**
- 代码可测试性：单元测试可以验证 domain 参数传递正确
- 配置可见性：在 `index.ts` 入口处集中声明所有环境变量依赖，容易发现缺失
- 不依赖 SDK 的隐式环境变量读取行为

### 3.4 `packages/dispatcher/tests/sandbox.test.ts`

更新 `createSandboxOrchestrator` 调用以传入 `e2bDomain`，验证 `Sandbox.create` 的 mock 收到正确参数。

## 4. 不改动的部分

| 项目 | 原因 |
|------|------|
| `@e2b/code-interpreter` 依赖版本 | 腾讯云使用同一 SDK，无需换包 |
| DB migration / schema | `e2b_template_id` 字段名虽带有 "e2b" 前缀，但语义兼容。避免不必要的 migration |
| `scripts/setup.ts` | `E2B_TEMPLATE_ID` 值改为腾讯云工具名即可，代码无需改 |
| `packages/agent-sdk/` | 不涉及沙箱创建 |
| `packages/gateway/` | 不涉及沙箱 |
| `packages/demo-agent/` | 运行在沙箱内部，不创建沙箱 |
| `sandboxDomain` URL 拼接 | SDK 从服务端响应获取 `sandboxDomain`（`res.data.domain`），腾讯云会返回自己的域名，无需改动 URL 拼接逻辑 |

## 5. 验证计划

1. **单元测试**：`pnpm --filter @aaas/dispatcher test` — sandbox.test.ts 更新后通过
2. **手动集成测试**：
   - 在腾讯云控制台创建 API Key 和沙箱工具
   - 配置 `.env` 中的 `E2B_DOMAIN`、`E2B_API_KEY`、`E2B_TEMPLATE_ID`
   - 运行 `setup.ts` 初始化 agent
   - 启动 dispatcher + gateway，通过 Telegram 发送消息验证端到端流程

## 6. 风险与注意事项

- **沙箱工具名称**：腾讯云控制台创建的沙箱工具名称（如 `code-xxx`）替代原来的 e2b template ID，需在 `setup.ts` 交互时输入正确的值
- **API Key 格式**：腾讯云 API Key 格式为 `ark_xxxx`，与 e2b 官方的 `e2b_` 前缀不同，代码无需区分
- **超时时间**：腾讯云文档建议通过 `timeout` 参数指定运行时间，当前代码使用 SDK 默认值。如果需要更长运行时间，可在后续迭代中加入

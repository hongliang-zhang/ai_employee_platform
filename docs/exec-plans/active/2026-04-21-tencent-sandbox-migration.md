# 腾讯云沙箱迁移 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将沙箱后端从 e2b 官方（`e2b.app`）切换到腾讯云兼容服务（`ap-beijing.tencentags.com`），通过新增 `E2B_DOMAIN` 配置项实现。

**Architecture:** 腾讯云实现了兼容 e2b 的服务端协议（腾讯云文档仅展示了 Python SDK 用法）。e2b 的 Node.js SDK（`@e2b/code-interpreter` → `e2b`）内部通过 `E2B_DOMAIN` 环境变量控制 API 端点（`https://api.${domain}`）和沙箱连接域名（从服务端响应 `res.data.domain` 获取），设置该变量即可将请求路由到腾讯云后端。改动集中在 dispatcher 包的沙箱编排层：在 `index.ts` 读取 `E2B_DOMAIN` 环境变量，透传到 `sandbox.ts` 的 `Sandbox.create` 调用。不涉及 SDK 替换或 DB schema 变更。

**Scope notes — additional changes in this MR beyond the core domain switch:**

1. **`sandbox.ts`: `secure: false`** — 腾讯云 AGS 沙箱环境使用自身的 VPC 网络隔离，不需要 E2B SDK 的公共端口认证（`secure` 模式）。`secure: false` 禁用该认证是迁移的必要配置，不影响安全性——AGS 沙箱间的隔离由腾讯云基础设施保证。

2. **`processor.ts`: 503 重试** — 腾讯云 AGS 沙箱启动时间比 e2b 官方更长，创建后短时间内 `/chat` 端点可能返回 503（服务尚未就绪）。新增的 503 重试逻辑（最多 6 次，每次间隔 1s）是确保沙箱在腾讯云环境下稳定工作所必需的。

3. **`agent-sdk`: `AssistantMessageEventStream` 重构** — 原实现使用手写的 async generator 包装事件流。迁移到 `@mariozechner/pi-ai` 导出的 `createAssistantMessageEventStream()` 统一了事件流 API，消除了 agent-sdk 中的重复实现。行为完全兼容——新 `AssistantMessageEventStream` 类实现了相同的 `AsyncIterable<AssistantMessageEvent>` 接口。这是在此 MR 中一并完成的原因：新的 sandbox-base 镜像运行 agent-sdk，需要确保事件流在 AGS 环境下工作正常。

4. **`sandbox-base` + `demo-agent` Dockerfile 重构** — e2b 官方沙箱镜像与腾讯云 AGS 不兼容。新建 `sandbox-base` 包（Dockerfile + s6-overlay 进程管理）作为统一的沙箱运行时基础镜像，`demo-agent` 改为基于此镜像构建。这是迁移的前置依赖——没有适配腾讯云的镜像就无法在 AGS 上运行 agent。

**Tech Stack:** TypeScript, `@e2b/code-interpreter@1.5.1`, Vitest

**Spec:** `docs/product-specs/2026-04-21-tencent-sandbox-migration.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `packages/dispatcher/src/index.ts` | 读取 `E2B_DOMAIN` 环境变量，传入 orchestrator |
| Modify | `packages/dispatcher/src/sandbox.ts` | config 接收 `e2bDomain`，`Sandbox.create` 时传入 `domain` |
| Modify | `packages/dispatcher/tests/sandbox.test.ts` | 验证 `domain` 参数正确传递 |
| Modify | `.env.example` | 新增 `E2B_DOMAIN`，更新注释 |

---

### Task 1: sandbox.ts — 接收并传递 domain 参数

**Files:**
- Modify: `packages/dispatcher/src/sandbox.ts`

- [ ] **Step 1: 更新 `createSandboxOrchestrator` config 类型，新增 `e2bDomain` 可选字段**

在 `sandbox.ts` 的 config 接口中新增：

```ts
export function createSandboxOrchestrator(config: {
  e2bApiKey: string
  e2bDomain?: string      // 新增：腾讯云 ap-beijing.tencentags.com，留空则用 SDK 默认 e2b.app
  gatewayUrl: string
  instanceId: string
})
```

- [ ] **Step 2: 更新 `Sandbox.create` 调用，传入 domain**

将：
```ts
const sandbox = await retryWithBackoff(() =>
  Sandbox.create(templateId, { apiKey: config.e2bApiKey })
)
```

改为：
```ts
const sandbox = await retryWithBackoff(() =>
  Sandbox.create(templateId, {
    apiKey: config.e2bApiKey,
    ...(config.e2bDomain && { domain: config.e2bDomain }),
  })
)
```

- [ ] **Step 3: 验证 TypeScript 编译通过**

Run: `cd packages/dispatcher && npx tsc --noEmit`
Expected: 无错误

---

### Task 2: sandbox.test.ts — 补充 domain 传递的测试

**Files:**
- Modify: `packages/dispatcher/tests/sandbox.test.ts`

- [ ] **Step 1: 新增测试 — 验证 Sandbox.create 收到 domain 参数**

在现有测试套件中新增一个测试用例：

```ts
it('passes domain to Sandbox.create when provided', async () => {
  const orch = createSandboxOrchestrator({ e2bApiKey: 'key', e2bDomain: 'ap-beijing.tencentags.com', gatewayUrl: 'http://gw', instanceId: 'test' })
  const fakeCommands = { run: vi.fn().mockResolvedValue({ stdout: '', stderr: '' }) }
  const fakeSandbox = { sandboxId: 'sb_domain', sandboxDomain: 'ap-beijing.tencentags.com', commands: fakeCommands }
  mockCreate.mockResolvedValueOnce(fakeSandbox)
  mockFetch.mockResolvedValue({ ok: true })

  const result = await orch.getOrCreate('conv_domain', 'tpl_x', 8080, 'tok', 300000)
  expect(mockCreate).toHaveBeenCalledWith('tpl_x', {
    apiKey: 'key',
    domain: 'ap-beijing.tencentags.com',
  })
  expect(result.chatUrl).toBe('https://8080-sb_domain.ap-beijing.tencentags.com')
})
```

- [ ] **Step 2: 更新已有测试，传入 e2bDomain（保持兼容）**

已有 3 个测试用例的 `createSandboxOrchestrator` 调用不需要改——`e2bDomain` 是可选参数，不传时 `Sandbox.create` 不会收到 `domain` 字段。但需要验证 `mockCreate` 的调用参数匹配。检查现有测试中 `mockCreate` 的断言是否需要更新。

当前测试没有对 `mockCreate` 的参数做详细断言（只检查了 `toHaveBeenCalled` 和 `toHaveBeenCalledOnce`），所以**不需要修改已有测试**。

- [ ] **Step 3: 运行测试确认全部通过**

Run: `cd packages/dispatcher && npx vitest run tests/sandbox.test.ts`
Expected: 4 个测试全部通过（3 existing + 1 new）

- [ ] **Step 4: Commit**

```bash
git add packages/dispatcher/src/sandbox.ts packages/dispatcher/tests/sandbox.test.ts
git commit -m "feat(dispatcher): support E2B_DOMAIN for Tencent Cloud sandbox backend"
```

---

### Task 3: index.ts — 读取 E2B_DOMAIN 环境变量

**Files:**
- Modify: `packages/dispatcher/src/index.ts`

- [ ] **Step 1: 新增 E2B_DOMAIN 环境变量读取**

在 `const E2B_API_KEY = process.env.E2B_API_KEY!` 之后新增：

```ts
const E2B_DOMAIN = process.env.E2B_DOMAIN  // 可选，腾讯云: ap-beijing.tencentags.com
```

- [ ] **Step 2: 传入 createSandboxOrchestrator**

将：
```ts
const sandbox = createSandboxOrchestrator({ e2bApiKey: E2B_API_KEY, gatewayUrl: GATEWAY_URL, instanceId: INSTANCE_ID })
```

改为：
```ts
const sandbox = createSandboxOrchestrator({ e2bApiKey: E2B_API_KEY, e2bDomain: E2B_DOMAIN, gatewayUrl: GATEWAY_URL, instanceId: INSTANCE_ID })
```

- [ ] **Step 3: 验证 TypeScript 编译通过**

Run: `cd packages/dispatcher && npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 4: Commit**

```bash
git add packages/dispatcher/src/index.ts
git commit -m "feat(dispatcher): read E2B_DOMAIN env var for sandbox backend selection"
```

---

### Task 4: .env.example — 更新文档

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: 新增 E2B_DOMAIN，更新注释**

将 Dispatcher 区块中的：
```
E2B_API_KEY=e2b_...
E2B_TEMPLATE_ID=...
```

改为：
```
# 沙箱 API Key
E2B_API_KEY=e2b_...

# 沙箱后端域名。腾讯云: ap-beijing.tencentags.com，e2b 官方: e2b.app（默认，留空即可）
# E2B_DOMAIN=ap-beijing.tencentags.com
```

沙箱工具名称（e2b template ID 或腾讯云沙箱工具名称）由 `scripts/setup.ts` 交互式询问，并写入 `agents.e2b_template_id`；不再放在 `.env`。

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: add E2B_DOMAIN to .env.example for Tencent Cloud sandbox"
```

---

### Task 5: 全量验证（单元测试）

- [ ] **Step 1: 运行 dispatcher 全部测试**

Run: `cd packages/dispatcher && npx vitest run tests/sandbox.test.ts tests/processor.test.ts`
Expected: sandbox 4 passed, processor 3 passed。conversation 和 inbound-jobs 因 DB 连接问题会失败，属于已知基线。

- [ ] **Step 2: 运行 TypeScript 编译检查**

Run: `cd packages/dispatcher && npx tsc --noEmit`
Expected: 无错误

---

### Task 6: 端到端验证（集成测试 + ags-cli）

> **前提：** 已完成 Task 1~4 代码修改并通过单元测试。腾讯云沙箱工具名称需替换为腾讯云实际创建的沙箱工具名称（如 `code-interpreter-v1`），而非 e2b 官方 template ID；该值在运行 `scripts/setup.ts` 时输入并写入 DB。

**Tools:**
- `ags-cli` — 腾讯云 Agent Runtime 命令行工具，用于查看和管理沙箱实例（[文档](https://cloud.tencent.com/document/product/1814/123848)）
- 腾讯云控制台 Agent Runtime → 沙箱实例列表

- [ ] **Step 1: 配置腾讯云环境变量**

在 `.env` 中设置：
```bash
# 腾讯云 Agent Runtime 后端
E2B_DOMAIN=ap-beijing.tencentags.com

# 腾讯云 API Key（与 e2b API Key 不同，需从腾讯云控制台获取）
E2B_API_KEY=<your-tencent-cloud-api-key>

# 腾讯云沙箱工具名称（需预先在腾讯云控制台创建）不放在 .env；
# 运行 scripts/setup.ts 时输入，例如 code-interpreter-v1。
```

- [ ] **Step 2: 使用 ags-cli 查看腾讯云沙箱状态**

安装 ags-cli（如未安装）：
```bash
# 腾讯云 CLI 集成在 tccli 中，或通过 pip 安装
pip install tencentcloud-ags

# 查看当前地域的沙箱实例列表
ags-cli sandbox list --limit 10

# 查看特定沙箱详情
ags-cli sandbox get --sandbox-id <sandbox_id>

# 预期输出：沙箱状态为 running / stopped / timeout 等
```

- [ ] **Step 3: 启动 dispatcher 并触发沙箱创建**

```bash
# 启动 dispatcher（需配置好上述环境变量）
cd packages/dispatcher && pnpm dev

# 通过 Telegram 发送一条消息触发对话，触发沙箱创建
# 或直接调用内部 API 触发 sandbox 创建

# 等待约 30 秒后，再次查看沙箱列表
ags-cli sandbox list --limit 10

# 预期：新增一条状态为 running 的沙箱实例
```

- [ ] **Step 4: 验证沙箱域名指向腾讯云**

从 dispatcher 日志或 ags-cli 输出中获取新创建的沙箱信息，检查：
- `sandboxDomain` 应为 `ap-beijing.tencentags.com`
- 沙箱可访问（curl 或 telnet 测试端口可达性）

```bash
# 获取沙箱域名
SANDBOX_DOMAIN=$(ags-cli sandbox list --limit 1 --output json | jq -r '.data[0].sandbox_domain')
echo "Sandbox domain: $SANDBOX_DOMAIN"

# 测试沙箱 HTTP 端口（8080）可达性
curl -v --max-time 10 "https://8080-$SANDBOX_DOMAIN"
```

- [ ] **Step 5: 验证沙箱可执行代码（通过 demo-agent）**

通过 Telegram 或内部测试接口发送一个简单代码执行请求：
```
请执行: print("Hello from Tencent Cloud Sandbox!")
```

预期：
- 代码在腾讯云沙箱中成功执行
- 返回结果中 sandbox backend 字段显示 `ap-beijing.tencentags.com`
- 不再使用 e2b 官方 `e2b.app` 域名

- [ ] **Step 6: 清理测试沙箱**

```bash
# 删除测试沙箱（可选，腾讯云会自动清理 timeout 的沙箱）
ags-cli sandbox delete --sandbox-id <sandbox_id>
```

- [ ] **Step 7: Commit**

```bash
git add docs/
git commit -m "docs: add e2e test plan with ags-cli for Tencent Cloud sandbox"
```

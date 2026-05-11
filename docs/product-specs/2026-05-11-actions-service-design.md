# Actions Service 设计文档

**日期：** 2026-05-11
**状态：** 草稿
**关联文档：** [aaas-mvp.md](./aaas-mvp.md)、[ARCHITECTURE.md](../../ARCHITECTURE.md)

---

## 1. 背景与问题

z-mono 的架构原则是"gateway 是唯一受信任出口"。MVP 阶段 gateway 代理的外部访问只有两类：LLM 调用和对象存储。随着平台演进为多 agent marketplace，各类 agent 需要调用形态各异的三方 API（网页搜索、天气、数据库查询、通知推送等）。

如果每新增一类三方 API 集成就修改 gateway，会带来两个问题：

1. **gateway 无限膨胀**：gateway 的职责是安全边界与代理，不应承载业务集成逻辑
2. **凭证散落**：各三方 API Key 混入 gateway 环境变量，与 gateway 自身凭证（LLM Key、JWT Secret）耦合

**目标：** 新增一个独立的 Actions Service，统一管理三方 API 集成。Gateway 只加两条永不改变的通用路由；新增集成只改 Actions Service，不动 gateway。

---

## 2. 不在本次范围内

- 外部开发者自定义 action（v1 由平台团队维护）
- 开发者上传自己的三方 API Key（v1 平台统一持有）
- Action 调用的限流与计费（可复用 gateway 现有限流机制，后续扩展）
- 升级为标准 MCP 协议（JSON-RPC / SSE）
- Action 调用结果的缓存（各 action 实现可选择在内部缓存，但不是本次设计范围）

---

## 3. 架构

### 3.1 系统拓扑

```
Telegram
   │
   ▼
┌───────────────────────────────────────────────────────────────────────┐
│  Trusted Zone                                                         │
│                                                                       │
│  ┌────────────┐  JWT-signed  ┌──────────┐  X-Internal-Key ┌────────────────────┐│
│  │ dispatcher │ ───────────▶ │ gateway  │ ─────────────▶  │  actions service   ││
│  └─────┬──────┘              └────┬─────┘                 └─────────┬──────────┘│
│        │ e2b SDK                  │                                 │           │
└────────┼──────────────────────────┼─────────────────────────────────┼───────────┘
         │                          │ JWT-signed                       │
         ▼                          │ (sandbox → gateway only)         ▼
  ┌─────────────┐                   │                           三方 API
  │   sandbox   │ ──────────────────┘                      (搜索、天气等)
  │  (agent 代码)│
  └─────────────┘
```

**关键边界（不得越过）：**

- Sandbox → Actions Service 直接通信：**永远不允许**。Sandbox 只与 gateway 通信；Actions Service 对 sandbox 不可见
- Actions Service → sandbox 直接通信：**永远不允许**
- Gateway → 三方 API 直接调用：**不应发生**。三方集成全部在 Actions Service 中实现

### 3.2 设计约束

- **Actions Service 是无状态的**：Action handler 在调用之间不得持久化任何状态。连接池等基础设施级缓存由 Actions Service 的初始化层管理，不写入 handler 文件
- 三方 API Key 全部存放在 Actions Service 的环境变量中，不进 gateway
- Gateway 的两条 actions 路由永不改变；新增 action 只需部署 Actions Service

---

## 4. Gateway 变更

### 4.1 新增路由（仅两条，此后不再改动）

#### `GET /gateway/actions/list`

返回 Actions Service 中所有已注册的 action 列表，供 agent-sdk 初始化时拉取 schema。

**认证：** 需要有效 `SESSION_TOKEN`（Bearer JWT）；`caller` claim 必须为 `'sandbox'`。Dispatcher token（`caller: 'dispatcher'`）不得访问此路由，应返回 `403 unauthorized`。

**返回示例：**

```json
{
  "actions": [
    {
      "name": "search_web",
      "description": "Search the web for recent information",
      "inputSchema": {
        "type": "object",
        "properties": {
          "query": { "type": "string" }
        },
        "required": ["query"]
      }
    },
    {
      "name": "get_weather",
      "description": "Get current weather for a location",
      "inputSchema": {
        "type": "object",
        "properties": {
          "location": { "type": "string" }
        },
        "required": ["location"]
      }
    }
  ]
}
```

#### `POST /gateway/actions/invoke`

**认证：** 需要有效 `SESSION_TOKEN`；`caller` claim 必须为 `'sandbox'`。Dispatcher token 不得调用此路由。

**请求体（来自 sandbox）：**

```json
{
  "action": "search_web",
  "input": { "query": "最新 AI 新闻" }
}
```

**返回体：**

```json
{
  "result": <action-specific value>
}
```

`result` 的类型由各 action 定义；可以是对象、字符串、数组或 null，但不能省略该字段（即使 action 无有意义的返回值，也应返回 `{ "result": null }`）。

**错误格式**（复用现有信封）：

```json
{
  "error": {
    "code": "action_not_found",
    "message": "Action 'foo' is not registered",
    "retryable": false,
    "details": {}
  }
}
```

| `error.code` | HTTP 状态码 | `retryable` | 触发场景 |
|---|---|---|---|
| `action_not_found` | 400 | false | action 名称不在注册表中 |
| `action_input_invalid` | 400 | false | input 不符合 inputSchema |
| `action_execution_failed` | 502 | true | 三方 API 返回错误或不可达 |
| `action_timeout` | 504 | true | 三方 API 超时 |
| `unauthorized` | 401/403 | false | JWT 无效或 caller 不是 sandbox |
| `internal_error` | 500 | true | Actions Service 内部异常 |

### 4.2 Gateway 内部转发逻辑

两条路由共用步骤 1-2，后续处理按路由分开：

**共用步骤：**

1. 验证 `SESSION_TOKEN`，检查 `caller` claim 为 `'sandbox'`（若不是则 403）
2. 从 JWT payload 提取 `agent_id` 和 `conversation_id`

**`GET /gateway/actions/list` 转发：**

3. 向 Actions Service `GET /actions/list` 发请求，仅附加 `X-Internal-Key` header，无请求体
4. 原样将 Actions Service 的响应返回给 sandbox

**`POST /gateway/actions/invoke` 转发：**

3. 构造增补后的请求体：`{ action, input, agentId, conversationId }`（不是原样转发，gateway 附加了 agentId/conversationId）
4. 向 Actions Service `POST /actions/invoke` 发请求，携带增补请求体和 `X-Internal-Key` header，超时设为 **30 秒**
5. 若 Actions Service **不可达**：返回 `502 { error: { code: "action_execution_failed", retryable: true } }`
6. 若 Actions Service **超时**（30 秒）：返回 `504 { error: { code: "action_timeout", retryable: true } }`
7. 其他情况：原样将 Actions Service 的响应返回给 sandbox

Gateway 不感知有哪些 action，不解析 `input` 的具体结构。

### 4.3 内部认证（Gateway → Actions Service）

- 使用共享密钥 `INTERNAL_API_KEY`，通过 `X-Internal-Key` request header 传递
- Actions Service 验证此 header；若缺失或错误，返回 `401 { error: { code: "unauthorized", ... } }`
- 与现有 dispatcher→gateway 的内部认证模式一致，不引入新机制

---

## 5. Actions Service 设计

### 5.1 包位置

```
z-mono/packages/actions/
  src/
    index.ts            # Express 入口，挂载路由，验证 X-Internal-Key
    registry.ts         # action 注册表
    actions/
      search-web.ts     # 一个 action 一个文件
      get-weather.ts
  package.json
  tsconfig.json
```

### 5.2 Action 接口

```typescript
interface ActionDefinition {
  name: string
  description: string
  inputSchema: JSONSchema
  execute(input: unknown, context: ActionContext): Promise<unknown>
}

interface ActionContext {
  agentId: string
  conversationId: string
}
```

`execute()` 的返回值即 gateway 响应体中 `result` 字段的值。

### 5.3 注册表

```typescript
// registry.ts
import { searchWeb } from './actions/search-web.js'
import { getWeather } from './actions/get-weather.js'

export const registry = new Map<string, ActionDefinition>([
  ['search_web', searchWeb],
  ['get_weather', getWeather],
])
```

**新增 action = 新建文件 + 在 `registry.ts` 加一行注册。**

### 5.4 内部 HTTP 路由

Actions Service 对外（仅对 gateway）暴露两个端点：

#### `GET /actions/list`

返回所有已注册 action 的 schema 列表。仅验证 `X-Internal-Key`，无请求体。

**返回体：** 与 `GET /gateway/actions/list` 返回给 sandbox 的格式相同（`{ actions: ActionDefinition[] }`）。

若注册表加载异常，返回 `500 { error: { code: "internal_error", retryable: true } }`。

#### `POST /actions/invoke`

Actions Service 收到的请求体（来自 gateway 增补后）：

```
POST /actions/invoke
{ action, input, agentId, conversationId }
```

处理逻辑：

1. 验证 `X-Internal-Key`；不合法则返回 `401`
2. `registry.get(action)`：找不到则返回 `{ error: { code: "action_not_found", retryable: false } }`
3. 用 `inputSchema` 校验 `input`：不合法则返回 `{ error: { code: "action_input_invalid", retryable: false } }`
4. 调用 `action.execute(input, { agentId, conversationId })`，超时设为 **25 秒**（比 gateway 的 30 秒短，确保 gateway 能收到来自 AS 的错误而非超时）
5. 成功则返回 `{ result: <execute 的返回值> }`；三方 API 失败则返回 `action_execution_failed`

### 5.5 API Key 管理

每个 action 所需的三方凭证存放在 Actions Service 的环境变量中：

```
SEARCH_WEB_API_KEY=xxx
WEATHER_API_KEY=xxx
```

Action 实现文件内直接读取 `process.env.*`。Sandbox 端完全拿不到这些 Key。

### 5.6 审计日志

Actions Service 对每次调用记录两条日志（成功和失败），格式与平台其他服务一致：

**成功：**
```json
{
  "level": "info",
  "time": "2026-05-11T10:00:00Z",
  "service": "actions",
  "event": "action.success",
  "action": "search_web",
  "agent_id": "agent_xyz",
  "conversation_id": "conv_abc",
  "duration_ms": 320
}
```

**失败：**
```json
{
  "level": "error",
  "time": "2026-05-11T10:00:00Z",
  "service": "actions",
  "event": "action.failed",
  "action": "search_web",
  "agent_id": "agent_xyz",
  "conversation_id": "conv_abc",
  "duration_ms": 5100,
  "error_code": "action_execution_failed",
  "error": "upstream returned 503"
}
```

---

## 6. Agent-SDK 变更

### 6.1 前置修复：gateway-llm-adapter 的 tool call 支持

**现状问题：**

`packages/agent-sdk/src/gateway-llm-adapter.ts` 存在两个 bug：

1. 发送 LLM 请求时未携带 `tools` 字段（`context` 中有 tools，但未写入请求体）
2. 收到响应中的 `tool_calls` 时直接丢弃（第 82-84 行仅打印 warn 日志）

这导致所有 tool call 机制完全失效，是 Actions 功能的阻塞项。

**修复内容：**

1. 在请求体中加入 `tools` 和 `tool_choice`（从 `context` 中取）
2. 将响应中的 `tool_calls` 转换为 `pi-coding-agent` 的 `ToolCallBlock[]` 格式并返回，而不是丢弃

**验收条件：** `pi-coding-agent` 的 tool call loop 能正常运行——即 LLM 返回 `finish_reason: "tool_calls"` 时，SDK 能触发对应 tool 的 `execute()` 并将结果作为 tool result 送回 LLM 继续对话。

此修复独立于 Actions Service 实现，应作为 Phase 0 优先完成，可单独测试。

### 6.2 GatewayClient 变更

新增 `get()` 辅助方法（现有 `GatewayClient` 只有 `post()`）：

```typescript
private async get<T>(path: string): Promise<T> {
  const res = await fetch(`${this.baseUrl}${path}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${this.token}` },
  })
  if (!res.ok) throw await this.toError(res)
  return res.json()
}
```

新增两个公开方法：

```typescript
async invokeAction(action: string, input: unknown): Promise<unknown> {
  const res = await this.post<{ result: unknown }>('/gateway/actions/invoke', { action, input })
  return res.result
}

async listActions(): Promise<ActionDefinition[]> {
  const res = await this.get<{ actions: ActionDefinition[] }>('/gateway/actions/list')
  return res.actions
}
```

### 6.3 createAgent() 支持 actions 选项

```typescript
export interface CreateAgentOptions {
  systemPrompt?: string
  tools?: ToolDefinition[]   // 现有：开发者自定义工具
  actions?: string[]         // 新增：平台 action 名称列表
  skillDirs?: string[]
}
```

SDK 在 session 初始化阶段处理 `actions`：

```typescript
if (actions?.length && gateway) {
  let available: ActionDefinition[] = []
  try {
    available = await gateway.listActions()
  } catch (err) {
    // listActions 失败不阻断 agent 启动；以 warn 日志记录，agent 将在无 action 工具的情况下运行
    logger.warn({ event: 'agent.actions_list_failed', error: String(err) })
  }

  const unknown = actions.filter(name => !available.some(a => a.name === name))
  if (unknown.length) {
    logger.warn({ event: 'agent.actions_unknown', names: unknown })
    // 未知的 action 名称不会中断启动，但会记录告警，方便开发者排查
  }

  const actionTools = available
    .filter(a => actions.includes(a.name))
    .map(a => ({
      name: a.name,
      description: a.description,
      inputSchema: a.inputSchema,
      execute: (input: unknown) => gateway.invokeAction(a.name, input),
    }))
  customTools = [...(tools ?? []), ...actionTools]
}
```

**关键行为：**
- `listActions()` 失败 → warn 日志，agent 以无 action 工具的状态启动，不抛出错误
- `actions` 数组中包含未知名称 → warn 日志，未知名称被静默跳过
- `listActions()` 只在 session 初始化时调用一次；Actions Service 在 session 存续期间发布新 action，当前 session 不会感知（下次 sandbox 冷启动时生效）

### 6.4 Agent 开发者用法

```typescript
await createAgent({
  systemPrompt: 'You are a helpful assistant with web search capability.',
  actions: ['search_web'],
})
```

Agent 开发者无需手写 schema，无需实现 execute handler，SDK 全部处理。

**完整执行链路：**

```
LLM 输出 tool_call: search_web
  → pi-coding-agent 执行 tool（SDK 注册的 execute handler）
  → gateway.invokeAction('search_web', input)
  → POST /gateway/actions/invoke
  → Gateway 验 JWT (caller=sandbox) + 增补 agentId/conversationId + 转发
  → Actions Service 执行 search_web.execute()
  → 三方搜索 API 返回结果
  → 结果作为 tool result 返回给 pi-coding-agent
  → pi-coding-agent 将 tool result 送回 LLM 继续对话
  → LLM 生成最终回复
```

---

## 7. 实现顺序

| Phase | 任务 | 验收条件 |
|---|---|---|
| 0 | 修复 gateway-llm-adapter tool call | pi-coding-agent tool call loop 可正常工作（含集成测试） |
| 1 | 实现 Actions Service（packages/actions） | `GET /actions/list` 和 `POST /actions/invoke` 可用，含两个示例 action |
| 2 | Gateway 加两条通用路由 | JWT 验 caller=sandbox，invoke/list 转发逻辑分开实现，超时与错误码正确 |
| 3 | GatewayClient 加 get() + invokeAction() + listActions() | 单元测试覆盖 |
| 4 | createAgent() 支持 actions 选项 | listActions 失败降级行为、未知 action 告警均有测试覆盖 |
| 5 | 更新 ARCHITECTURE.md | Key boundaries 新增三条边界；Services 一节加入 Actions Service 描述 |

---

## 8. 新增 Action 的操作流程

整个系统建好之后，平台团队新增一个三方 API 集成只需：

1. 在 `packages/actions/src/actions/` 新建一个文件，实现 `ActionDefinition` 接口
2. 在 `registry.ts` 加一行注册
3. 在 Actions Service 的环境变量中添加对应的 API Key
4. 部署 Actions Service

**Gateway 代码不改动，dispatcher 代码不改动，agent-sdk 不需要发版（schema 是运行时从 `/gateway/actions/list` 拉取的）。**

---

## 9. 与现有架构信条的关系

| 信条 | 本设计的处理 |
|---|---|
| Gateway 是唯一受信任出口 | Sandbox 仍只与 gateway 通信；Actions Service 在受信任区域，不对 sandbox 直接暴露 |
| Sandbox 是无状态且短暂的 | Actions Service 无状态；每次 action 调用是独立请求；sandbox 重建不影响 action 可用性 |
| 所有错误遵循统一信封格式 | Actions Service 与 gateway 错误均复用 `{ error: { code, message, retryable, details } }` |
| 外部知识必须编码进 repo | 本文档记录设计决策；action schema 在代码中声明，运行时可发现 |

**需同步更新 `ARCHITECTURE.md`（Phase 5 完成）：**

Key boundaries 新增三条：
- "Sandbox → Actions Service 直接通信：**永远不允许**"
- "Actions Service → sandbox 直接通信：**永远不允许**"
- "Gateway → 三方 API 直接调用：**不应发生**。三方集成全部在 Actions Service 中实现"

Services 一节新增 Actions Service 的描述，topology 图补充 Actions Service 节点。

---

## 10. 超时设计

| 链路 | 超时值 | 说明 |
|---|---|---|
| Gateway → Actions Service | 30 秒 | Gateway 侧兜底 |
| Actions Service → 三方 API | 25 秒 | 比 gateway 超时短，确保 AS 能返回结构化错误而非 gateway 侧超时 |

超时处理：
- Gateway 等待 Actions Service 超时（30 秒）→ gateway 向 sandbox 返回 `504 action_timeout`
- Actions Service 等待三方 API 超时（25 秒）→ Actions Service 向 gateway 返回 `action_execution_failed`，gateway 原样转发给 sandbox

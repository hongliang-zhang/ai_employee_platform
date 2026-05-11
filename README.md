# z-mono

**Agent Runtime** 是一个用于部署和运营沙箱化 AI agent 的运行平台。它把 Telegram、飞书等 IM 渠道中的用户消息路由到隔离的 agent runtime，并由平台统一处理会话历史、LLM 访问、文件存储和三方工具调用。

当前仓库是 Agent Runtime 的 monorepo，包含可信后端服务、IM dispatcher、Actions Service、数据库 schema、agent SDK 和本地开发脚本。

## 这个项目解决什么问题？

我们希望让一个 agent 可以像普通 IM bot 一样被使用，但又不把平台密钥、数据库和 LLM Key 暴露给 agent 代码。

因此平台提供一套运行时边界：

- 用户只需要在 IM 中发消息；
- dispatcher 负责接入 IM、去重消息、创建 sandbox；
- agent 代码运行在隔离 sandbox 中；
- gateway 负责所有 sandbox 可访问的平台能力；
- Actions Service 负责三方 API 集成和三方凭证隔离；
- 对话历史持久化到 MySQL/TiDB，sandbox 重启后仍可恢复上下文。

MVP 阶段主要面向内部使用，已支持 Telegram / 飞书接入，以及基于数据库配置的 sandbox agent runtime。

## 核心链路

```text
用户消息
  → Telegram / 飞书
  → dispatcher
      - 接收 IM 事件
      - 抢占 receipt，避免重复处理
      - 定位 conversation
      - 创建 E2B/AGS sandbox
  → agent sandbox runtime
      - 通过 gateway 读取历史
      - 通过 gateway 调用 LLM
      - 通过 gateway 调用 actions / 文件存储
      - 写回 assistant 回复
  → dispatcher
      - 把回复发送回 IM
      - 标记消息处理完成
```

更完整的服务拓扑和边界见 [`ARCHITECTURE.md`](./ARCHITECTURE.md)。

## 设计原则

### 1. sandbox 不可信

agent runtime 运行在 sandbox 中，只能拿到作用域受限的 JWT 和 gateway 地址。它不能直接访问数据库、LLM Provider、对象存储、IM 平台或 Actions Service。

### 2. gateway 是平台能力入口

gateway 统一承载 sandbox 可访问的能力：会话历史、LLM 代理、文件存储 URL、Actions Service 代理。所有非健康检查请求都需要 JWT，并根据 `caller` claim 做权限限制。

### 3. dispatcher 只管 IM 和生命周期

dispatcher 负责 IM provider 接入、消息 receipt/lease 去重、conversation 定位，以及每次请求的 sandbox 创建、调用和销毁。它不直接调用 LLM，也不持有完整对话历史。

### 4. Actions Service 隔离三方集成

三方 API Key 不放进 sandbox，也尽量不混进 gateway。Actions Service 在可信区内统一持有三方凭证，并只接受 gateway 携带 `X-Internal-Key` 的内部调用。

## 仓库结构

| 路径 | 说明 |
|------|------|
| `packages/gateway` | 可信 HTTP 服务；会话历史、LLM、文件存储、actions 代理入口 |
| `packages/dispatcher` | IM 接入与 sandbox 编排；Telegram / 飞书消息处理、去重和回复发送 |
| `packages/actions` | 三方 API 集成服务；例如 web search、weather 等 action |
| `packages/agent-sdk` | 构建 agent runtime 的 TypeScript SDK / harness |
| `packages/db` | Prisma schema、migration、生成客户端和共享 DB factory/types |
| `packages/sandbox-base` | 外部 agent template 使用的基础 sandbox 镜像/runtime 支持 |
| `scripts` | 本地 setup、文档治理、MR review 等自动化脚本 |
| `docs` | 架构、产品规格、执行计划、质量、安全和本地开发文档 |

参考 agent runtime 原先位于 `packages/demo-agent`，现在已迁移到外部 `agent-sub` 项目。

## 快速开始

> 完整本地 e2e 需要数据库、LLM Key、IM 凭证、E2B/AGS Key 和公网隧道。第一次配置请优先阅读 [`docs/LOCAL-DEV.md`](./docs/LOCAL-DEV.md)。

```bash
# 仅在 .env 不存在时初始化本地配置
test -f .env || cp .env.example .env

# 安装依赖
pnpm install

# 应用数据库 migration
pnpm --filter @aaas/db migrate:deploy

# 写入初始 agent / IM 配置
pnpm tsx scripts/setup.ts
```

启动服务时请使用独立终端，避免后台进程残留导致多个 dispatcher 竞争同一条 IM 消息：

```bash
pnpm --filter @aaas/gateway dev
pnpm --filter @aaas/actions dev
pnpm --filter @aaas/dispatcher dev
```

运行测试：

```bash
pnpm test
```

## 常用开发入口

| 任务 | 命令 |
|------|------|
| 启动 gateway | `pnpm --filter @aaas/gateway dev` |
| 启动 Actions Service | `pnpm --filter @aaas/actions dev` |
| 启动 dispatcher | `pnpm --filter @aaas/dispatcher dev` |
| 运行 gateway 测试 | `pnpm --filter @aaas/gateway test` |
| 运行 dispatcher 测试 | `pnpm --filter @aaas/dispatcher test` |
| 运行 actions 测试 | `pnpm --filter @aaas/actions test` |
| 应用 DB migration | `pnpm --filter @aaas/db migrate:deploy` |
| 本地初始化/种子数据 | `pnpm tsx scripts/setup.ts` |

## 文档导航

| 文档 | 内容 |
|------|------|
| [`AGENTS.md`](./AGENTS.md) | agent-facing 项目地图和操作规则 |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | 顶层架构、服务边界和关键设计决策 |
| [`docs/LOCAL-DEV.md`](./docs/LOCAL-DEV.md) | 本地开发和 e2e 测试流程 |
| [`docs/QUALITY_SCORE.md`](./docs/QUALITY_SCORE.md) | 测试覆盖和质量缺口 |
| [`docs/SECURITY.md`](./docs/SECURITY.md) | 安全模型 |
| [`docs/RELIABILITY.md`](./docs/RELIABILITY.md) | 错误处理、重试和可靠性约定 |
| [`docs/product-specs/`](./docs/product-specs/) | 产品规格和设计文档 |
| [`docs/exec-plans/`](./docs/exec-plans/) | active/completed implementation plans |

## 当前状态

这是一个 MVP 阶段项目，重点是验证 IM → sandbox agent → gateway → LLM/actions → IM reply 的闭环。当前实现优先服务内部使用场景；dashboard、多租户产品化、高规模多实例恢复等能力仍在演进中。

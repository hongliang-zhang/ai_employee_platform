<!-- DOC-GARDENING-CHANGE: 2026-04-16
  - Updated doc-gardening.md status: Draft → Completed (all components implemented including CI job)
  - Updated 2026-04-15-feishu-gateway-design.md status: Active → Completed (feishu client exists, migration applied)
  - Updated 2026-04-15-agent-sdk-design.md status: Active → Completed (SDK fully implemented)
-->
<!-- DOC-GARDENING-CHANGE: 2026-04-17
  - Updated 2026-04-17-mr-claude-review-design.md status: Active → Completed (exec plan implemented, CI job active)
-->
<!-- DOC-GARDENING-CHANGE: 2026-04-22
  - Updated 2026-04-21-fix-sandbox-ready-and-message-sync.md status: Active → Completed (exec plan archived, code implemented)
-->
# Product Specs Index

| Document | Status | Description |
|----------|--------|-------------|
| [aaas-mvp.md](./aaas-mvp.md) | Active | Agent Runtime MVP — full product spec and architecture design (2026-03-30) |
| [sandbox-persistent-storage.md](./sandbox-persistent-storage.md) | Implemented with divergence | Sandbox persistent file storage via presigned URLs; gateway routes and agent-sdk file sync exist, original Python demo-agent plan is historical (2026-04-14) |
| [doc-gardening.md](./doc-gardening.md) | Completed | Automated doc gardening via Claude Code in e2b sandbox (2026-04-14) |
| [2026-04-14-doc-gardening-prompt-design.md](./2026-04-14-doc-gardening-prompt-design.md) | Draft | Doc-gardening prompt optimization design: verification table + done detection rules |
| [2026-04-15-feishu-gateway-design.md](./2026-04-15-feishu-gateway-design.md) | Completed | 飞书（Feishu/Lark）WebSocket 长连接接入设计 (2026-04-15) |
| [2026-04-15-agent-sdk-design.md](./2026-04-15-agent-sdk-design.md) | Completed | Agent SDK 设计：`@alexlikevibe/agent-sdk` 让开发者一行 `createAgent()` 部署到 Agent Runtime harness (2026-04-15) |
| [2026-04-16-doc-gardening-prompt-redesign.md](./2026-04-16-doc-gardening-prompt-redesign.md) | Draft | Doc-gardening prompt 重设计：从步骤驱动改为目标驱动 (2026-04-16) |
| [2026-04-17-mr-claude-review-design.md](./2026-04-17-mr-claude-review-design.md) | Completed | MR Claude Code Review：MR 创建/更新时在 e2b sandbox 中自动触发 Claude inline code review (2026-04-17) |
| [2026-04-21-fix-sandbox-ready-and-message-sync.md](./2026-04-21-fix-sandbox-ready-and-message-sync.md) | Completed | 修复 sandbox 就绪信号不匹配与 assistant 消息 stale_write (2026-04-21) |
| [2026-04-21-tencent-sandbox-migration.md](./2026-04-21-tencent-sandbox-migration.md) | Completed | 腾讯云沙箱迁移设计：从 e2b.dev 迁移到腾讯云 AGS (2026-04-21) |
| [2026-05-08-dispatcher-multi-bot-design.md](./2026-05-08-dispatcher-multi-bot-design.md) | Completed | Dispatcher 多 bot 支持：单进程管理所有 agent 的全部 IM bot，热加载，独立重试 (2026-05-08) |
| [2026-05-08-tencent-cloud-docker-deploy-design.md](./2026-05-08-tencent-cloud-docker-deploy-design.md) | Completed | 腾讯云 Docker 部署设计：gateway/dispatcher 镜像构建、加密 env 与容器启动脚本 (2026-05-08) |
| [2026-05-11-actions-service-design.md](./2026-05-11-actions-service-design.md) | Active | Actions Service 设计：三方 API 统一集成层，gateway 两条永不改变的路由，新增集成只改 Actions Service (2026-05-11) |
| [2026-05-11-gateway-session-events-design.md](./2026-05-11-gateway-session-events-design.md) | Draft | Gateway Session Events 重设计：messages 升级为 append-only event log，harness 统一写入，对齐 Anthropic Managed Agents 架构 (2026-05-11) |
| [2026-05-12-actions-third-party-design.md](./2026-05-12-actions-third-party-design.md) | Active | Actions Service 新增三方 API Action：fxiaoke 线索创建/查询、智谱知识库检索等集成 (2026-05-12) |

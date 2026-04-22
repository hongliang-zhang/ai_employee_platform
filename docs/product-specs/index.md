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
| [aaas-mvp.md](./aaas-mvp.md) | Active | AaaS MVP — full product spec and architecture design (2026-03-30) |
| [sandbox-persistent-storage.md](./sandbox-persistent-storage.md) | Active | Sandbox persistent file storage via presigned URLs (2026-04-14) |
| [doc-gardening.md](./doc-gardening.md) | Completed | Automated doc gardening via Claude Code in e2b sandbox (2026-04-14) |
| [2026-04-14-doc-gardening-prompt-design.md](./2026-04-14-doc-gardening-prompt-design.md) | Draft | Doc-gardening prompt optimization design: verification table + done detection rules |
| [2026-04-15-feishu-gateway-design.md](./2026-04-15-feishu-gateway-design.md) | Completed | 飞书（Feishu/Lark）WebSocket 长连接接入设计 (2026-04-15) |
| [2026-04-15-agent-sdk-design.md](./2026-04-15-agent-sdk-design.md) | Completed | Agent SDK 设计：`@aaas/agent-sdk` 让开发者一行 `createAgent()` 部署到 AaaS harness (2026-04-15) |
| [2026-04-16-doc-gardening-prompt-redesign.md](./2026-04-16-doc-gardening-prompt-redesign.md) | Draft | Doc-gardening prompt 重设计：从步骤驱动改为目标驱动 (2026-04-16) |
| [2026-04-17-mr-claude-review-design.md](./2026-04-17-mr-claude-review-design.md) | Completed | MR Claude Code Review：MR 创建/更新时在 e2b sandbox 中自动触发 Claude inline code review (2026-04-17) |
| [2026-04-21-fix-sandbox-ready-and-message-sync.md](./2026-04-21-fix-sandbox-ready-and-message-sync.md) | Completed | 修复 sandbox 就绪信号不匹配与 assistant 消息 stale_write (2026-04-21) |

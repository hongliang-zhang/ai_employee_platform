# Doc Gardening Prompt Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重写 `.doc-gardening-prompt.md`，从"步骤驱动"改为"目标驱动"——保留核查表结构，但把机械执行步骤替换为验证目标，让 agent 自己决定如何读取证据和做出判断。

**Architecture:** 只修改 `.doc-gardening-prompt.md` 一个文件。改动分三个区域：核查表（"核查重点"→"验证目标"）、完成状态检测（三步算法→意图理解+代码验证）、输出 summary 示例（机械依据→推理过程）。新增"无法判断时"统一处理协议。

**Spec:** `docs/product-specs/2026-04-16-doc-gardening-prompt-redesign.md`

**Tech Stack:** Markdown

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `.doc-gardening-prompt.md` | Modify | doc-gardening agent 的审查 prompt |

---

### Task 1: 重写 `.doc-gardening-prompt.md`

**Files:**
- Modify: `.doc-gardening-prompt.md`

- [ ] **Step 1: 读当前文件，确认改动基线**

  Read `.doc-gardening-prompt.md`，确认四个主要章节存在：核查表、完成状态检测、操作规则、运行结束 Summary。

- [ ] **Step 2: 用新内容覆盖文件**

  将 `.doc-gardening-prompt.md` 替换为以下完整内容：

````markdown
你是 z-mono 仓库的文档审查 agent。你的任务是检查仓库中的文档，找出与代码实际行为不符的内容，并直接修复。

**开始前**：先读 `AGENTS.md` 了解项目结构。

## 核查表

按以下顺序核查每个文档：

| 文档 | 真相来源 | 验证目标 |
|------|---------|---------|
| `AGENTS.md` | `packages/` 目录、`.env.example`、根目录 `package.json scripts` | 读文档中对每个 package 的描述，确认 packages/ 下实际目录与描述一致；读文档中列出的 env vars，对照 .env.example 判断有无缺失或多余；读文档中的开发命令，确认 package.json scripts 中是否存在且行为一致 |
| `ARCHITECTURE.md` | `packages/*/src/` 路由文件、`packages/db/prisma/schema.prisma` | 读文档中每条 API 路由描述和服务说明，在对应源文件中确认路由是否真实存在、描述是否准确；读文档中的 DB 表列表，对照 schema 判断有无增删或字段变化 |
| `docs/generated/db-schema.md` | `packages/db/prisma/schema.prisma` | 读文档中每张表的每个字段，对照 schema 判断是否一致；有无表或字段的增删 |
| `docs/QUALITY_SCORE.md` | `packages/` 下 `*.test.ts` 文件 | 读文档中的覆盖率评级和测试文件描述，在代码库中确认对应测试文件是否存在；评级是否与实际测试覆盖情况相符 |
| `docs/RELIABILITY.md` | `packages/gateway/src/`、`packages/dispatcher/src/` | 读文档中的错误码约定和重试逻辑描述，在对应源文件中确认实现是否与描述一致 |
| `docs/SECURITY.md` | `ARCHITECTURE.md`、`.env.example` | 读文档中的安全约束描述，对照 ARCHITECTURE.md 和 .env.example 判断约束是否仍然准确 |
| `docs/LOCAL-DEV.md` | `package.json scripts`、`.env.example` | 读文档中的每条启动命令，在 package.json 中确认命令是否存在且参数一致；读文档中的 env var 列表，对照 .env.example 判断有无缺失或多余 |
| `docs/product-specs/index.md` | `docs/product-specs/` 目录 | 读 index.md 中列出的 spec 文件，确认每个文件是否实际存在；确认目录下有无 spec 文件未被列出 |
| `docs/exec-plans/tech-debt-tracker.md` | `packages/*/src/` | 读文档中每条 tech debt 条目，在代码库中判断该问题是否已被解决；应标记完成的条目是否已标记 |
| `docs/` 所有 `.md` 中的相对链接 | 被引用路径 | 读每个 .md 文件中的相对链接，确认目标文件或目录是否存在 |

> `docs/LINTING.md`、`docs/design-docs/` 只检查链接有效性，不做内容核查。

**真相来源不存在时**：若某行列出的真相来源路径在仓库中不存在，对该文档标记 flag，注明无法找到对比基准，跳过内容核查。

## 完成状态检测

### Exec Plan 归档

对 `docs/exec-plans/active/` 里每个计划：

1. **读懂计划**：理解它要实现什么功能、关键交付物是什么
2. **在代码里找落地证据**：直接去 plan 描述的关键文件或功能点检查——文件是否存在、核心逻辑是否实现
3. **做出判断**：基于对计划意图的理解和代码现状，判断这个计划是否已经完成

checkboxes 是辅助信号，不是主要判据。

如果你读完代码后判断这个计划描述的功能已经落地，就归档（移动到 `docs/exec-plans/completed/`）。如果证据不足或存在矛盾，不归档，加 flag 说明你观察到了什么、为什么无法判断。

### Product Spec 状态更新

对 `docs/product-specs/` 下每个 spec（除 `index.md`）：

1. **读懂 spec**：理解它描述的是什么功能、核心交付物是什么
2. **在代码和 exec-plans 里找证据**：
   - 功能是否已在代码里实现
   - `docs/exec-plans/` 下是否有描述该功能的计划（读内容来判断，不靠文件名匹配）
3. **判断状态**：
   - 功能未实现、有 exec plan 在 `active/` → **Active**
   - 功能已在代码里落地，或对应 exec plan 已归档到 `completed/`（含本次 run 中刚归档的）→ **Completed**
   - 功能未实现、也没有对应 exec plan → 不修改，加 flag 说明

**内容匹配示例**：spec `doc-gardening.md` 描述的是"定时审查文档准确性的自动化 agent"；exec plan `2026-04-14-doc-gardening-prompt-rewrite.md` 的内容提到"重写 `.doc-gardening-prompt.md`"——二者描述的是同一功能域，可判定为关联，不依赖文件名是否包含相同关键词。

**说明**：本次 run 中通过上一步刚归档到 `completed/` 的 exec plan，在 spec 状态判断中同样有效。

## 无法判断时的处理

适用于核查表、exec plan 归档、spec 状态更新三个场景：

当读完所有可用证据后仍无法得出有把握的结论时：

- **不做修改**，不强行归档或更新状态
- 在相关文件顶部加：`<!-- DOC-GARDENING-FLAG: [描述你观察到了什么、哪里矛盾、为什么无法判断] -->`
- 在 summary 中用 `[FLAGGED]` 记录，说明观察和无法判断的原因

典型情形：代码与文档描述部分匹配、真相来源路径不存在、exec plan 意图不明确、spec 功能只实现了一半。

## 操作规则

- 只修改已存在的 `.md` 文件，不修改代码，不创建新文件，不删除文件
- 每个被修改的文件，在文件顶部（标题下方）加 HTML 注释块：

```html
<!-- DOC-GARDENING-CHANGE: YYYY-MM-DD
  - <改了什么>：<为什么改>
-->
```

- 不确定时，加 `<!-- DOC-GARDENING-FLAG: [描述问题] -->` 标注，不做修改

## 运行结束 Summary

所有核查完成后，输出到 stdout（不写入文件）：

```
=== DOC GARDENING SUMMARY ===
[ARCHIVED]   docs/exec-plans/active/2026-04-14-gateway-hardening.md → completed/
             依据：读 plan，目标是在 gateway 加 rate limiting；确认 packages/gateway/src/middleware/
             中存在 rateLimit.ts 且逻辑与 plan 描述一致
[STATUS]     docs/product-specs/doc-gardening.md: Draft → Active
             依据：读 spec，描述定时文档审查 agent；找到 exec plan 2026-04-14-doc-gardening-prompt-rewrite.md
             内容描述同一功能，且该 plan 仍在 active/
[FIXED]      ARCHITECTURE.md: 补充 POST /gateway/storage/presign 路由
[NO-CHANGE]  docs/QUALITY_SCORE.md: 与实际一致，无需修改
[FLAGGED]    docs/exec-plans/active/2026-04-14-xxx.md: plan 描述的核心文件均不存在，意图不明确，需人工确认
=============================
```
````

- [ ] **Step 3: 验证文件结构正确**

  Read `.doc-gardening-prompt.md`，确认以下正向检查（应存在）：
  - 核查表列头包含"验证目标"
  - 包含"无法判断时的处理"章节
  - `[ARCHIVED]` 示例的 `依据:` 字段包含推理描述（如"读 plan，目标是..."）

  以及以下负向检查（不应存在）：
  - 不包含"核查重点"字样（旧列头）
  - 不包含判定表格（旧格式为 `| 条件 | 结论 |`）
  - 不包含 `grep "- \[ \]"`、`git log --oneline | grep -i` 等具体命令字符串
  - 不包含"从 spec 文件名"或"作为关键词"等文件名匹配指令（旧 spec 状态更新逻辑）

- [ ] **Step 4: Commit**

  ```bash
  git add .doc-gardening-prompt.md
  git commit -m "feat(doc-gardening): redesign prompt from step-driven to goal-driven"
  ```

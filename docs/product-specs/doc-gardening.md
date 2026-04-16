# Doc Gardening — 自动化文档清理 Agent

<!-- DOC-GARDENING-CHANGE: 2026-04-16
  - Updated status from 草稿 to Completed: All components implemented (scripts/doc-gardening/run.ts exists, .doc-gardening-prompt.md exists, CI job exists in .gitlab-ci.yml)
-->
**日期：** 2026-04-14
**状态：** Completed
**灵感来源：** [Harness engineering: leveraging Codex in an agent-first world](https://openai.com/index/harness-engineering/) — "doc-gardening agent" 与 "entropy and garbage collection" 章节

---

## 1. 概述

在 agent-first 的工作模式下，仓库文档既是人的参考资料，也是 agent 的上下文来源（core belief #7）。过时或不准确的文档会直接误导 agent 产出错误的代码。

Doc Gardening 是一个定期运行的自动化流程：在 e2b sandbox 中启动 Claude Code，让它审查仓库中的所有文档，找出与代码实际行为不符的内容，并自动提交 Merge Request 修复。

---

## 2. 目标

- 自动发现文档与代码之间的偏差（路径引用、API 描述、架构说明、数据模型等）
- 自动发现已完成但未归档的 execution plan
- 自动发现 QUALITY_SCORE.md 中与实际测试覆盖率不一致的评分
- 自动发现 AGENTS.md、ARCHITECTURE.md 中过时的信息
- 以 Merge Request 的形式提交修复，由人工 review 后合并
- 在 GitLab CI 中通过 scheduled pipeline 定期触发，无需人工干预

## 3. 非目标

- 不改动业务代码——只修改 `docs/`、`AGENTS.md`、`ARCHITECTURE.md` 等文档文件
- 不自动合并 MR——所有变更需经人工审核
- 不替代 CI 中已有的机械化检查（`check-doc-links.ts`、`check-doc-index.ts`）——Doc Gardening 做的是语义层面的审查，机械化检查做的是结构层面的校验
- 不做代码重构或代码风格清理

---

## 4. 架构

### 4.1 运行环境

复用项目已有的 e2b 基础设施。e2b 提供了预构建的 `claude` 模板，内置 Claude Code CLI。

```
GitLab Scheduled Pipeline (weekly)
  │
  │  触发 CI job
  ▼
┌──────────────────────────────────────────────┐
│  CI Runner (ci-node:22p1)                    │
│                                              │
│  pnpm tsx scripts/doc-gardening/run.ts       │
│    │                                         │
│    │  1. e2b Sandbox.create('claude')        │
│    │  2. git clone z-mono into sandbox       │
│    │  3. claude -p <prompt> (headless)        │
│    │  4. git diff → 收集变更                  │
│    │  5. 如有变更 → push branch + 创建 MR     │
│    │  6. sandbox.kill()                       │
│    │                                         │
└──────────────────────────────────────────────┘
```

### 4.2 关键设计决策

**为什么在 e2b 中运行 Claude Code，而不是在 CI runner 上直接安装？**

- CI runner 是共享的、受控的环境，安装 Claude Code CLI 需要改 CI 镜像
- e2b sandbox 是隔离的、临时的，适合运行 agent——与项目已有的 sandbox 使用模式一致
- 项目已有 `E2B_API_KEY`，无需额外开通
- Claude Code 的 `--dangerously-skip-permissions` 在 e2b sandbox 中是安全的，因为 sandbox 本身就是隔离环境

**为什么不直接调 Anthropic API 而用 Claude Code CLI？**

- Claude Code CLI 内置了文件读写、bash 执行、代码搜索等 agent 能力
- 它能自主决定读哪些文件、做哪些对比，而不需要我们预先编排每一步
- 直接调 API 需要自己实现 tool use 循环和 agent 逻辑，本质上是重新实现 Claude Code

**为什么创建 MR 而不是直接 push 到 main？**

- 文档修改虽然风险低，但 agent 可能误判某些内容是"过时的"
- MR 提供了一个轻量级的 review checkpoint
- MR 中的 diff 清晰展示了所有变更，便于快速浏览

---

## 5. 详细设计

### 5.1 编排脚本：`scripts/doc-gardening/run.ts`

使用 e2b TypeScript SDK，核心流程如下：

```typescript
import { Sandbox } from 'e2b'

// 1. 创建 sandbox
const sandbox = await Sandbox.create('claude', {
  envs: { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY },
  timeoutMs: 30 * 60 * 1000, // 30 分钟上限
})

// 2. 克隆仓库
await sandbox.commands.run(
  `git clone https://${GIT_USER}:${GIT_TOKEN}@gitlab.example.com/z-mono.git /home/user/repo`,
)

// 3. 运行 Claude Code（headless）
const result = await sandbox.commands.run(
  `cd /home/user/repo && claude --dangerously-skip-permissions -p "$(cat .doc-gardening-prompt.md)"`,
  { timeoutMs: 25 * 60 * 1000 },
)

// 4. 收集 diff
const diff = await sandbox.commands.run('cd /home/user/repo && git diff')

// 5. 如果有变更，创建分支并推送
if (diff.stdout.trim()) {
  const branch = `doc-gardening/${new Date().toISOString().slice(0, 10)}`
  await sandbox.commands.run(`
    cd /home/user/repo &&
    git checkout -b ${branch} &&
    git add -A &&
    git commit -m "docs: automated doc gardening $(date +%Y-%m-%d)" &&
    git push origin ${branch}
  `)
  // 6. 调用 GitLab API 创建 MR
  await createMergeRequest(branch)
}

// 7. 清理
await sandbox.kill()
```

### 5.2 Claude Code Prompt：`.doc-gardening-prompt.md`

Prompt 存放在仓库根目录，内容如下：

```markdown
你是 z-mono 仓库的文档审查 agent。你的任务是检查仓库中的文档，找出与代码实际行为不符的内容，并直接修复。

## 审查范围

按以下顺序检查：

### 1. 路径与引用有效性
- AGENTS.md 中引用的所有文件路径是否存在
- ARCHITECTURE.md 中引用的文件路径是否存在
- docs/ 下所有 .md 文件中的相对链接是否有效

### 2. 架构描述与代码一致性
- ARCHITECTURE.md 中的服务描述是否与 packages/ 下的实际代码一致
- ARCHITECTURE.md 中的 API 路由列表是否与 gateway 和 dispatcher 的实际路由一致
- ARCHITECTURE.md 中的数据库表列表是否与 Prisma schema 一致

### 3. AGENTS.md 准确性
- 仓库布局描述是否与实际目录结构一致
- 环境变量列表是否与 .env.example 一致
- 开发工作流命令是否与 package.json scripts 一致

### 4. Execution Plan 归档
- docs/exec-plans/active/ 中的计划，如果所有步骤都已标记完成，应移动到 completed/

### 5. 数据库 Schema 文档
- docs/generated/db-schema.md 是否与当前 Prisma schema 一致

### 6. Quality Score 准确性
- docs/QUALITY_SCORE.md 中的覆盖率评级是否与实际测试文件的存在性一致

### 7. Product Specs Index
- docs/product-specs/index.md 是否列出了 product-specs/ 下的所有文件

## 操作规则

- 只修改文档文件（.md 文件），不修改代码
- 如果发现问题但不确定正确的修复方式，在文件中添加 `<!-- DOC-GARDENING: [描述问题] -->` 注释标记
- 对每个修改写清楚改了什么、为什么改
- 先读 AGENTS.md 了解项目结构，再开始审查
```

### 5.3 GitLab CI 配置

在 `.gitlab-ci.yml` 中新增一个 job：

```yaml
doc-gardening:
  extends: .pnpm_setup
  stage: validate
  rules:
    - if: $CI_PIPELINE_SOURCE == "schedule" && $DOC_GARDENING == "true"
  variables:
    GIT_STRATEGY: clone
    GIT_CHECKOUT: "true"
  script:
    - pnpm tsx scripts/doc-gardening/run.ts
  timeout: 35m
```

### 5.4 GitLab Schedule 配置

在 GitLab 项目中创建 Pipeline Schedule：

| 设置 | 值 |
|------|-----|
| Description | Doc Gardening (weekly) |
| Cron | `0 9 * * 1`（每周一 09:00 UTC） |
| Target branch | `main` |
| Variable | `DOC_GARDENING` = `true` |

### 5.5 所需环境变量（CI Variables）

| 变量 | 用途 | 类型 |
|------|------|------|
| `ANTHROPIC_API_KEY` | Claude Code 所需的 API key | Protected, Masked |
| `E2B_API_KEY` | 创建 e2b sandbox | Protected, Masked |
| `GITLAB_TOKEN` | 克隆仓库 + 推送分支 + 创建 MR | Protected, Masked |
| `GITLAB_PROJECT_ID` | GitLab API 创建 MR 时使用 | CI/CD variable |

### 5.6 创建 MR 的逻辑

通过 GitLab REST API `POST /api/v4/projects/:id/merge_requests`：

```typescript
async function createMergeRequest(branch: string): Promise<void> {
  const date = new Date().toISOString().slice(0, 10)
  await fetch(
    `${GITLAB_URL}/api/v4/projects/${GITLAB_PROJECT_ID}/merge_requests`,
    {
      method: 'POST',
      headers: {
        'PRIVATE-TOKEN': process.env.GITLAB_TOKEN!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        source_branch: branch,
        target_branch: 'main',
        title: `docs: automated doc gardening ${date}`,
        description: [
          '## 🌱 Doc Gardening',
          '',
          '由 doc-gardening agent 自动生成的文档修复。',
          '',
          '请审查以下变更：',
          '- 文档与代码之间的偏差修复',
          '- 过时引用/路径的更新',
          '- execution plan 归档',
          '',
          '> 此 MR 由 [scheduled pipeline] 自动创建，所有变更仅限文档文件。',
        ].join('\n'),
        labels: 'doc-gardening,automated',
        remove_source_branch: true,
      }),
    },
  )
}
```

---

## 6. 安全模型

| 属性 | 状态 |
|------|------|
| Claude Code 运行在 e2b sandbox 中 | ✅ 隔离环境 |
| `ANTHROPIC_API_KEY` 仅在 sandbox 内可见 | ✅ 通过 e2b envs 注入 |
| `GITLAB_TOKEN` 不进入 sandbox | ✅ 仅在 CI runner 上使用 |
| Agent 只修改文档文件 | ⚠️ prompt 中约束，但不强制——MR review 是最终防线 |
| 不自动合并 | ✅ 所有变更需人工 review |

---

## 7. 成本估算

| 项目 | 估算 |
|------|------|
| e2b sandbox 运行时间 | ~15-25 分钟/次 |
| Claude Code token 消耗 | ~100K-200K tokens/次（读取全部文档 + 对照代码） |
| 运行频率 | 每周 1 次 |
| 月成本 | e2b ~$2-4 + Anthropic ~$4-8 ≈ **$6-12/月** |

---

## 8. 错误处理

| 场景 | 处理方式 |
|------|----------|
| e2b sandbox 创建失败 | CI job 失败，GitLab 发通知 |
| Claude Code 运行超时（>25min） | 进程被 kill，CI job 失败 |
| Claude Code 运行完成但无变更 | 正常退出，不创建 MR |
| git push 失败 | CI job 失败，GitLab 发通知 |
| GitLab API 创建 MR 失败 | CI job 失败，GitLab 发通知 |
| Claude Code 意外修改了非文档文件 | MR review 时人工发现并拒绝 |
| 同名分支已存在（上周的 MR 未合并） | push 失败，CI job 失败——提醒人去处理积压 MR |

---

## 9. 涉及的组件

| 组件 | 变更 |
|------|------|
| `scripts/doc-gardening/run.ts` | **新增**。编排脚本：创建 sandbox、运行 Claude Code、收集 diff、创建 MR |
| `.doc-gardening-prompt.md` | **新增**。Claude Code 的 prompt 文件 |
| `.gitlab-ci.yml` | **修改**。新增 `doc-gardening` job |
| `package.json` | **可能修改**。如需新增 e2b SDK 依赖 |
| GitLab 项目设置 | **配置**。新增 Pipeline Schedule + CI Variables |

---

## 10. 已知局限（MVP）

- **无法验证修复的正确性**：Agent 可能误判文档内容为"过时"并做出错误修改——依赖 MR review 兜底
- **无法处理跨仓库引用**：只能检查仓库内部的文档一致性
- **分支冲突**：如果上周的 MR 未合并，本周的 push 会失败。需要人工处理积压
- **单次运行范围有限**：Claude Code 的 context window 有限，如果仓库文档量增长到很大，可能需要分批审查
- **prompt 中的"只改文档"约束不是强制的**：如果 Claude Code 改了代码文件，只能在 MR review 时发现。后续可通过在 push 前检查 diff 范围来加固

---

## 11. 后续演进

- **分批审查**：当文档量增长后，可以按目录分多次运行（每次审查一个子目录）
- **代码清理 Agent**：同样的架构可以扩展为定期运行代码清理 agent——扫描 tech debt、更新 QUALITY_SCORE.md
- **Push 前 diff 校验**：在 push 之前检查 `git diff --name-only`，只保留 `.md` 文件的变更，其余自动 revert
- **MR 自动合并**：当信心足够时，可以对纯文档变更开启自动合并（需要先积累一段时间的 review 经验）
- **运行结果通知**：通过 webhook 将每次运行的结果（发现了多少问题、创建了几个 MR）推送到 Telegram 群

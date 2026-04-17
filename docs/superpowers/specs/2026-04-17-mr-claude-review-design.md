# MR Claude Code Review — Design Spec

**Date:** 2026-04-17  
**Status:** Approved  
**Scope:** `scripts/mr-review/` + `.gitlab-ci.yml`

---

## Overview

When a Merge Request is created or updated in GitLab, a CI job automatically launches a Claude Code review in an e2b sandbox. Claude analyzes the diff against the project's architecture constraints and produces inline comments directly on the changed lines, plus a summary comment on the MR.

---

## Architecture

### Flow

```
MR 创建/更新
     │ merge_request_event
     ▼
GitLab CI: mr-review job
     │
     ├─ 1. 从 GitLab API 拉取 MR diff + version SHAs（CI runner 侧）
     ├─ 2. 启动 e2b sandbox（claude template）
     ├─ 3. 将 diff + 架构上下文 + prompt 写入 sandbox
     ├─ 4. Claude 在 sandbox 内分析，输出 review.json 到 /home/user/review.json
     ├─ 5. CI runner 从 sandbox 读取 review.json
     └─ 6. CI runner 调用 GitLab Discussions API 发 inline 评论 + summary 评论
```

### File Structure

```
scripts/
  mr-review/
    run.ts          # 主流程（类比 doc-gardening/run.ts）
    gitlab.ts       # GitLab API：拉 diff/versions + 发 inline 评论
    config.ts       # 环境变量加载
    prompt.ts       # 构建注入 Claude 的 REVIEW_PROMPT.md
    run.test.ts
    gitlab.test.ts
    config.test.ts
```

### Shared Patterns with doc-gardening

- `SandboxLike` interface（可直接从 `doc-gardening/run.ts` 复用或提取到 shared 位置）
- Dependency injection via `RunDeps` (makes unit testing possible without real e2b/GitLab)
- `loadConfig` pattern with explicit required vars
- Same e2b `claude` template, same `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_BASE_URL` envs

---

## Data Flow

### Step 1 — Fetch MR data (CI runner)

Two GitLab API calls before launching sandbox:

1. `GET /projects/:id/merge_requests/:iid/diffs` → list of changed files with diff hunks
2. `GET /projects/:id/merge_requests/:iid/versions` → latest version entry for `base_sha`, `start_sha`, `head_sha`

These SHAs are required by the Discussions API to anchor inline comments to the correct commit. They must be the latest version's SHAs — stale SHAs cause API errors.

### Step 2 — Sandbox inputs

Two files written into sandbox at `/home/user/`:

| File | Content |
|------|---------|
| `diff.patch` | Raw unified diff of all changed files |
| `REVIEW_PROMPT.md` | Prompt with architecture context + review dimensions + output format spec + diff content |

**`REVIEW_PROMPT.md` structure:**

```markdown
# 任务
你是 z-mono 项目的 code reviewer，请审查以下 MR diff。

# 项目架构约定
- gateway 是唯一可信后端，拥有所有存储和 LLM 访问权限
- sandbox（e2b）是不可信的，只能通过 scoped JWT 访问 gateway
- sandbox 不能直接访问数据库或持有平台 secrets
- 所有错误响应必须符合 { error: { code, message, retryable, details } } 格式
- migrations 只能追加，不能修改已有迁移文件
- dispatcher 管理 sandbox 生命周期，gateway 不感知 sandbox

# 评审维度
- Bug / 逻辑错误（边界条件、异步错误处理、竞态）
- 安全漏洞（JWT 泄露、sandbox 边界违反、secrets 暴露、SQL 注入）
- 架构约定违反（跨边界直接访问、error shape 不符、迁移文件修改）
- 代码质量与可维护性（命名、复杂度、重复代码）

# 输出格式
输出严格合法的 JSON，写入文件 /home/user/review.json，格式如下：
{
  "comments": [
    {
      "path": "packages/gateway/src/routes.ts",
      "line": 42,
      "side": "RIGHT",
      "body": "评论内容（中文）"
    }
  ],
  "summary": "整体评价，包含主要发现（中文）"
}
不要输出 JSON 以外的任何内容。

# Diff
[diff 内容由程序注入]
```

### Step 3 — Claude execution (sandbox)

```bash
claude --dangerously-skip-permissions -p "$(cat /home/user/REVIEW_PROMPT.md)"
```

Claude writes `/home/user/review.json` as output.

### Step 4 — Read output (CI runner)

CI runner reads `review.json` from sandbox via `sandbox.files.read('/home/user/review.json')` (e2b Files API). Parses and validates JSON shape before proceeding.

### Step 5 — Publish comments (CI runner)

**Inline comments** — one `POST /discussions` per entry in `comments[]`:

```json
{
  "body": "...",
  "position": {
    "position_type": "text",
    "base_sha": "<from versions API>",
    "start_sha": "<from versions API>",
    "head_sha": "<from versions API>",
    "new_path": "packages/gateway/src/routes.ts",
    "new_line": 42
  }
}
```

**Summary comment** — one `POST /discussions` without `position`, posting `summary` as MR-level comment.

---

## Error Handling

| Failure | Behavior |
|---------|----------|
| Individual inline comment fails (e.g., line out of range) | Skip that comment, continue posting remaining. Note count of skipped in summary. |
| Claude outputs invalid JSON | CI job fails, prints raw output. No comments posted. |
| e2b sandbox timeout | CI job fails. Other CI jobs (lint/test) unaffected. |
| GitLab API error on summary comment | CI job fails with error message. |

---

## CI Configuration

```yaml
mr-review:
  extends: .pnpm_setup
  stage: validate
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
  allow_failure: true
  timeout: 20m
  script:
    - pnpm tsx scripts/mr-review/run.ts
  variables:
    MR_IID: $CI_MERGE_REQUEST_IID
```

`allow_failure: true` — review is advisory, must not block MR merges.

---

## Environment Variables

| Variable | Source | Description |
|----------|--------|-------------|
| `ZHIPU_API_KEY` | CI secret (existing) | Anthropic-compatible API key for Claude |
| `E2B_API_KEY` | CI secret (existing) | e2b cloud API key |
| `GITLAB_TOKEN` | CI secret (existing) | GitLab API token (read MR + post comments) |
| `GITLAB_PROJECT_ID` | CI secret (existing) | Project ID |
| `GITLAB_URL` | CI variable (optional) | Default: `https://gitlab.com` |
| `MR_IID` | `$CI_MERGE_REQUEST_IID` | MR internal ID, injected by CI |

All secrets already exist in CI from doc-gardening — no new secrets needed.

---

## Testing Strategy

- **Unit tests** (`run.test.ts`, `gitlab.test.ts`, `config.test.ts`) — use dependency injection to mock e2b sandbox and GitLab API calls, same pattern as doc-gardening tests
- **`SandboxLike` mock** — implement `files.read` mock in addition to `commands.run`
- **Prompt snapshot test** — verify `buildPrompt()` output contains required sections
- No integration tests (e2b + GitLab API calls are mocked in all tests)

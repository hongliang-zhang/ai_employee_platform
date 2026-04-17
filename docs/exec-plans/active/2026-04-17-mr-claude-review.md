# MR Claude Code Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 GitLab MR 创建/更新时，自动在 e2b sandbox 中运行 Claude Code Review，并将 inline 评论直接发布到 MR 的变更行上。

**Architecture:** CI job 触发后，先在 runner 侧调用 GitLab API 拉取 MR diff 和版本 SHAs，然后启动 e2b sandbox，将 diff + prompt 写入 sandbox，让 Claude 输出结构化 JSON（review.json），最后由 runner 侧读取 JSON 并调用 GitLab Discussions API 发布 inline 评论和总结评论。GitLab token 始终留在 runner 侧，不传入 sandbox。

**Tech Stack:** Node.js, TypeScript, e2b SDK, GitLab REST API v4, Vitest

---

## Scope

只实现 `scripts/mr-review/` 脚本和 `.gitlab-ci.yml` 的 `mr-review` job。不修改现有服务代码（gateway、dispatcher 等）。

## File Structure

### Create
- `scripts/mr-review/config.ts` — 环境变量加载，`loadConfig()` 函数，与 doc-gardening/config.ts 同模式
- `scripts/mr-review/config.test.ts` — config 单元测试
- `scripts/mr-review/gitlab.ts` — GitLab API：拉取 diff、versions、发 inline 评论和 summary 评论
- `scripts/mr-review/gitlab.test.ts` — gitlab 单元测试（mock fetch）
- `scripts/mr-review/prompt.ts` — `buildPrompt(diff: string): string`，构建注入 Claude 的完整 prompt
- `scripts/mr-review/prompt.test.ts` — prompt 内容校验
- `scripts/mr-review/run.ts` — 主流程，`SandboxLike` 接口定义，`runMrReview()` 函数
- `scripts/mr-review/run.test.ts` — 主流程单元测试（mock sandbox + gitlab）

### Modify
- `.gitlab-ci.yml` — 新增 `mr-review` job

### Read Before Editing
- `scripts/doc-gardening/run.ts` — 复用 SandboxLike 模式、依赖注入、sandbox 创建方式
- `scripts/doc-gardening/config.ts` — 复用 loadConfig 模式
- `scripts/doc-gardening/gitlab.ts` — 参考 GitLab API 调用风格
- `scripts/doc-gardening/run.test.ts` — 参考 mock sandbox 写法
- `scripts/doc-gardening/config.test.ts` — 参考 config 测试写法
- `scripts/doc-gardening/gitlab.test.ts` — 参考 mock fetch 写法
- `.gitlab-ci.yml` — 了解现有 job 结构和 `.pnpm_setup` extends

---

## Task 1: config.ts + config.test.ts

**Files:**
- Create: `scripts/mr-review/config.ts`
- Create: `scripts/mr-review/config.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `scripts/mr-review/config.test.ts`：

```typescript
import { describe, it, expect } from 'vitest'
import { loadConfig } from './config.js'

const REQUIRED_ENV = {
  ZHIPU_API_KEY: 'zhipu-test',
  E2B_API_KEY: 'e2b_test',
  GITLAB_TOKEN: 'glpat-test',
  GITLAB_PROJECT_ID: '99',
  MR_IID: '7',
}

describe('loadConfig', () => {
  it('returns config when all required vars are set', () => {
    const config = loadConfig(REQUIRED_ENV)
    expect(config.zhipuApiKey).toBe('zhipu-test')
    expect(config.e2bApiKey).toBe('e2b_test')
    expect(config.gitlabToken).toBe('glpat-test')
    expect(config.gitlabProjectId).toBe('99')
    expect(config.mrIid).toBe('7')
    expect(config.gitlabUrl).toBe('https://gitlab.com') // default
  })

  it('respects GITLAB_URL override', () => {
    const config = loadConfig({ ...REQUIRED_ENV, GITLAB_URL: 'https://dev.aminer.cn' })
    expect(config.gitlabUrl).toBe('https://dev.aminer.cn')
  })

  it('throws when a required var is missing', () => {
    expect(() => loadConfig({})).toThrow('Missing required env vars')
  })

  it('each missing var name appears in the error', () => {
    expect(() => loadConfig({})).toThrow('ZHIPU_API_KEY')
  })
})
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
pnpm vitest run scripts/mr-review/config.test.ts
```

期望：FAIL，`Cannot find module './config.js'`

- [ ] **Step 3: 实现 config.ts**

创建 `scripts/mr-review/config.ts`：

```typescript
export interface MrReviewConfig {
  zhipuApiKey: string
  e2bApiKey: string
  gitlabToken: string
  gitlabProjectId: string
  gitlabUrl: string
  mrIid: string
  sandboxTimeoutMs: number
  claudeTimeoutMs: number
}

const REQUIRED_VARS = [
  'ZHIPU_API_KEY',
  'E2B_API_KEY',
  'GITLAB_TOKEN',
  'GITLAB_PROJECT_ID',
  'MR_IID',
] as const

export function loadConfig(
  env: Record<string, string | undefined> = process.env,
): MrReviewConfig {
  const missing = REQUIRED_VARS.filter((k) => !env[k])
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`)
  }

  return {
    zhipuApiKey: env.ZHIPU_API_KEY!,
    e2bApiKey: env.E2B_API_KEY!,
    gitlabToken: env.GITLAB_TOKEN!,
    gitlabProjectId: env.GITLAB_PROJECT_ID!,
    gitlabUrl: env.GITLAB_URL ?? 'https://gitlab.com',
    mrIid: env.MR_IID!,
    sandboxTimeoutMs: Number(env.SANDBOX_TIMEOUT_MS) || 20 * 60 * 1000,
    claudeTimeoutMs: Number(env.CLAUDE_TIMEOUT_MS) || 15 * 60 * 1000,
  }
}
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
pnpm vitest run scripts/mr-review/config.test.ts
```

期望：全部 PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/mr-review/config.ts scripts/mr-review/config.test.ts
git commit -m "feat(mr-review): add config loader"
```

---

## Task 2: gitlab.ts — 拉取 MR 数据

**Files:**
- Create: `scripts/mr-review/gitlab.ts`（先实现 fetch MR data 部分）
- Create: `scripts/mr-review/gitlab.test.ts`（对应测试）

这个任务只实现读取 GitLab 数据（diff + versions）。发评论在 Task 4 实现。

- [ ] **Step 1: 写失败测试**

创建 `scripts/mr-review/gitlab.test.ts`：

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchMrData } from './gitlab.js'

const BASE_CONFIG = {
  gitlabUrl: 'https://gitlab.example.com',
  gitlabToken: 'glpat-test',
  gitlabProjectId: '42',
  mrIid: '7',
}

describe('fetchMrData', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('calls diffs and versions endpoints and returns combined data', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([
          { new_path: 'src/foo.ts', diff: '@@ -1 +1 @@\n-old\n+new' },
        ]),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([
          { base_commit_sha: 'base123', start_commit_sha: 'start456', head_commit_sha: 'head789' },
        ]),
      })

    const result = await fetchMrData(BASE_CONFIG, mockFetch as unknown as typeof fetch)

    expect(mockFetch).toHaveBeenCalledTimes(2)
    const [url1] = mockFetch.mock.calls[0]
    const [url2] = mockFetch.mock.calls[1]
    expect(url1).toContain('/projects/42/merge_requests/7/diffs')
    expect(url2).toContain('/projects/42/merge_requests/7/versions')

    expect(result.diffs).toHaveLength(1)
    expect(result.diffs[0].new_path).toBe('src/foo.ts')
    expect(result.baseSha).toBe('base123')
    expect(result.startSha).toBe('start456')
    expect(result.headSha).toBe('head789')
  })

  it('throws when diffs API returns non-ok', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: () => Promise.resolve('Not Found'),
    })
    await expect(fetchMrData(BASE_CONFIG, mockFetch as unknown as typeof fetch))
      .rejects.toThrow('GitLab diffs API failed (404)')
  })

  it('throws when versions list is empty', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]), // empty versions
      })
    await expect(fetchMrData(BASE_CONFIG, mockFetch as unknown as typeof fetch))
      .rejects.toThrow('No MR versions found')
  })
})
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
pnpm vitest run scripts/mr-review/gitlab.test.ts
```

期望：FAIL，`Cannot find module './gitlab.js'`

- [ ] **Step 3: 实现 gitlab.ts（fetch 部分）**

创建 `scripts/mr-review/gitlab.ts`：

```typescript
interface GitLabConfig {
  gitlabUrl: string
  gitlabToken: string
  gitlabProjectId: string
  mrIid: string
}

export interface MrDiff {
  new_path: string
  old_path: string
  diff: string
  new_file: boolean
  deleted_file: boolean
}

export interface MrData {
  diffs: MrDiff[]
  baseSha: string
  startSha: string
  headSha: string
}

export async function fetchMrData(
  config: GitLabConfig,
  fetchFn: typeof fetch = fetch,
): Promise<MrData> {
  const base = `${config.gitlabUrl}/api/v4/projects/${config.gitlabProjectId}/merge_requests/${config.mrIid}`
  const headers = { 'PRIVATE-TOKEN': config.gitlabToken }

  // Fetch diffs
  const diffsRes = await fetchFn(`${base}/diffs`, { headers })
  if (!diffsRes.ok) {
    const body = await diffsRes.text()
    throw new Error(`GitLab diffs API failed (${diffsRes.status}): ${body}`)
  }
  const diffs: MrDiff[] = await diffsRes.json()

  // Fetch versions (to get SHAs for Discussions API)
  const versionsRes = await fetchFn(`${base}/versions`, { headers })
  if (!versionsRes.ok) {
    const body = await versionsRes.text()
    throw new Error(`GitLab versions API failed (${versionsRes.status}): ${body}`)
  }
  const versions: Array<{ base_commit_sha: string; start_commit_sha: string; head_commit_sha: string }> =
    await versionsRes.json()

  if (versions.length === 0) {
    throw new Error('No MR versions found')
  }

  // Latest version is first in the list
  const latest = versions[0]
  return {
    diffs,
    baseSha: latest.base_commit_sha,
    startSha: latest.start_commit_sha,
    headSha: latest.head_commit_sha,
  }
}
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
pnpm vitest run scripts/mr-review/gitlab.test.ts
```

期望：全部 PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/mr-review/gitlab.ts scripts/mr-review/gitlab.test.ts
git commit -m "feat(mr-review): add gitlab fetchMrData"
```

---

## Task 3: prompt.ts

**Files:**
- Create: `scripts/mr-review/prompt.ts`
- Create: `scripts/mr-review/prompt.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `scripts/mr-review/prompt.test.ts`：

```typescript
import { describe, it, expect } from 'vitest'
import { buildPrompt } from './prompt.js'

describe('buildPrompt', () => {
  const diff = 'diff --git a/foo.ts b/foo.ts\n+const x = 1'

  it('contains architecture constraints', () => {
    const prompt = buildPrompt(diff)
    expect(prompt).toContain('gateway')
    expect(prompt).toContain('sandbox')
    expect(prompt).toContain('error: { code, message, retryable, details }')
    expect(prompt).toContain('migrations')
  })

  it('contains review dimensions', () => {
    const prompt = buildPrompt(diff)
    expect(prompt).toContain('Bug')
    expect(prompt).toContain('安全')
    expect(prompt).toContain('架构')
  })

  it('contains output format instruction with review.json path', () => {
    const prompt = buildPrompt(diff)
    expect(prompt).toContain('/home/user/review.json')
    expect(prompt).toContain('"comments"')
    expect(prompt).toContain('"summary"')
  })

  it('contains the diff content', () => {
    const prompt = buildPrompt(diff)
    expect(prompt).toContain(diff)
  })
})
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
pnpm vitest run scripts/mr-review/prompt.test.ts
```

期望：FAIL，`Cannot find module './prompt.js'`

- [ ] **Step 3: 实现 prompt.ts**

创建 `scripts/mr-review/prompt.ts`：

```typescript
export function buildPrompt(diff: string): string {
  return `# 任务
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
将严格合法的 JSON 写入文件 /home/user/review.json，格式如下：
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
不要输出 JSON 以外的任何内容。只写文件，不要在终端打印 JSON。

# Diff
${diff}
`
}
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
pnpm vitest run scripts/mr-review/prompt.test.ts
```

期望：全部 PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/mr-review/prompt.ts scripts/mr-review/prompt.test.ts
git commit -m "feat(mr-review): add buildPrompt"
```

---

## Task 4: gitlab.ts — 发布评论（扩展现有文件）

**Files:**
- Modify: `scripts/mr-review/gitlab.ts` — 新增 `postReviewComments()` 函数
- Modify: `scripts/mr-review/gitlab.test.ts` — 新增对应测试

- [ ] **Step 1: 写失败测试**

在 `scripts/mr-review/gitlab.test.ts` 末尾追加：

```typescript
import { postReviewComments, type ReviewComment } from './gitlab.js'

describe('postReviewComments', () => {
  const shaConfig = {
    baseSha: 'base123',
    startSha: 'start456',
    headSha: 'head789',
  }

  it('posts one inline discussion per comment', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: '1' }),
    })

    const comments: ReviewComment[] = [
      { path: 'src/foo.ts', line: 10, side: 'RIGHT', body: '有问题' },
    ]

    const result = await postReviewComments(
      BASE_CONFIG,
      shaConfig,
      comments,
      '总体不错',
      mockFetch as unknown as typeof fetch,
    )

    // 1 inline + 1 summary = 2 calls
    expect(mockFetch).toHaveBeenCalledTimes(2)

    const [url, opts] = mockFetch.mock.calls[0]
    expect(url).toContain('/projects/42/merge_requests/7/discussions')
    const body = JSON.parse(opts.body)
    expect(body.body).toBe('有问题')
    expect(body.position.new_path).toBe('src/foo.ts')
    expect(body.position.new_line).toBe(10)
    expect(body.position.base_sha).toBe('base123')

    expect(result.posted).toBe(1)
    expect(result.skipped).toBe(0)
  })

  it('skips failed inline comments and continues', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 422, text: () => Promise.resolve('line out of range') })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ id: '2' }) }) // summary

    const comments: ReviewComment[] = [
      { path: 'src/foo.ts', line: 999, side: 'RIGHT', body: '行号超出范围' },
    ]

    const result = await postReviewComments(
      BASE_CONFIG,
      shaConfig,
      comments,
      '总结',
      mockFetch as unknown as typeof fetch,
    )

    expect(result.posted).toBe(0)
    expect(result.skipped).toBe(1)
    // summary still posted
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('throws when summary comment fails', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ id: '1' }) }) // inline ok
      .mockResolvedValueOnce({ ok: false, status: 500, text: () => Promise.resolve('server error') }) // summary fails

    const comments: ReviewComment[] = [
      { path: 'src/foo.ts', line: 1, side: 'RIGHT', body: '没问题' },
    ]

    await expect(
      postReviewComments(BASE_CONFIG, shaConfig, comments, '总结', mockFetch as unknown as typeof fetch),
    ).rejects.toThrow('GitLab summary comment failed (500)')
  })
})
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
pnpm vitest run scripts/mr-review/gitlab.test.ts
```

期望：新增测试 FAIL（`postReviewComments` 未实现）

- [ ] **Step 3: 实现 postReviewComments**

在 `scripts/mr-review/gitlab.ts` 末尾追加：

```typescript
export interface ReviewComment {
  path: string
  line: number
  side: 'RIGHT' | 'LEFT'
  body: string
}

interface ShaConfig {
  baseSha: string
  startSha: string
  headSha: string
}

export interface PostResult {
  posted: number
  skipped: number
}

export async function postReviewComments(
  config: GitLabConfig,
  shas: ShaConfig,
  comments: ReviewComment[],
  summary: string,
  fetchFn: typeof fetch = fetch,
): Promise<PostResult> {
  const url = `${config.gitlabUrl}/api/v4/projects/${config.gitlabProjectId}/merge_requests/${config.mrIid}/discussions`
  const headers = { 'PRIVATE-TOKEN': config.gitlabToken, 'Content-Type': 'application/json' }

  let posted = 0
  let skipped = 0

  // Post inline comments
  for (const comment of comments) {
    const res = await fetchFn(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        body: comment.body,
        position: {
          position_type: 'text',
          base_sha: shas.baseSha,
          start_sha: shas.startSha,
          head_sha: shas.headSha,
          new_path: comment.path,
          new_line: comment.line,
        },
      }),
    })

    if (!res.ok) {
      const text = await res.text()
      console.warn(`Skipping inline comment on ${comment.path}:${comment.line} — ${res.status}: ${text}`)
      skipped++
    } else {
      posted++
    }
  }

  // Post summary comment (no position = MR-level comment)
  const summaryBody = skipped > 0
    ? `${summary}\n\n> ⚠️ ${skipped} 条评论因行号偏移未能定位，已跳过。`
    : summary

  const summaryRes = await fetchFn(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ body: `## 🤖 Claude Code Review\n\n${summaryBody}` }),
  })

  if (!summaryRes.ok) {
    const text = await summaryRes.text()
    throw new Error(`GitLab summary comment failed (${summaryRes.status}): ${text}`)
  }

  return { posted, skipped }
}
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
pnpm vitest run scripts/mr-review/gitlab.test.ts
```

期望：全部 PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/mr-review/gitlab.ts scripts/mr-review/gitlab.test.ts
git commit -m "feat(mr-review): add postReviewComments"
```

---

## Task 5: run.ts + run.test.ts — 主流程

**Files:**
- Create: `scripts/mr-review/run.ts`
- Create: `scripts/mr-review/run.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `scripts/mr-review/run.test.ts`：

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runMrReview, type SandboxLike } from './run.js'
import type { MrReviewConfig } from './config.js'

const TEST_CONFIG: MrReviewConfig = {
  zhipuApiKey: 'zhipu-test',
  e2bApiKey: 'e2b_test',
  gitlabToken: 'glpat-test',
  gitlabProjectId: '42',
  gitlabUrl: 'https://gitlab.example.com',
  mrIid: '7',
  sandboxTimeoutMs: 30_000,
  claudeTimeoutMs: 20_000,
}

const VALID_REVIEW_JSON = JSON.stringify({
  comments: [{ path: 'src/foo.ts', line: 5, side: 'RIGHT', body: '有问题' }],
  summary: '整体不错',
})

function createMockSandbox(reviewJson: string): SandboxLike {
  return {
    commands: {
      run: vi.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 }),
    },
    files: {
      write: vi.fn().mockResolvedValue(undefined),
      read: vi.fn().mockResolvedValue(reviewJson),
    },
    kill: vi.fn().mockResolvedValue(undefined),
  }
}

describe('runMrReview', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('creates sandbox with Zhipu env vars', async () => {
    const sandbox = createMockSandbox(VALID_REVIEW_JSON)
    const createSandbox = vi.fn().mockResolvedValue(sandbox)
    const fetchMr = vi.fn().mockResolvedValue({
      diffs: [{ new_path: 'src/foo.ts', diff: '+x', new_file: false, deleted_file: false }],
      baseSha: 'b', startSha: 's', headSha: 'h',
    })
    const postComments = vi.fn().mockResolvedValue({ posted: 1, skipped: 0 })

    await runMrReview(TEST_CONFIG, { createSandbox, fetchMr, postComments })

    const [, opts] = createSandbox.mock.calls[0]
    expect(opts.envs.ANTHROPIC_AUTH_TOKEN).toBe('zhipu-test')
    expect(opts.envs.ANTHROPIC_BASE_URL).toBe('https://open.bigmodel.cn/api/anthropic')
  })

  it('writes prompt file and runs claude in sandbox', async () => {
    const sandbox = createMockSandbox(VALID_REVIEW_JSON)
    const createSandbox = vi.fn().mockResolvedValue(sandbox)
    const fetchMr = vi.fn().mockResolvedValue({
      diffs: [{ new_path: 'src/foo.ts', diff: '+x', new_file: false, deleted_file: false }],
      baseSha: 'b', startSha: 's', headSha: 'h',
    })
    const postComments = vi.fn().mockResolvedValue({ posted: 1, skipped: 0 })

    await runMrReview(TEST_CONFIG, { createSandbox, fetchMr, postComments })

    // Files written to sandbox
    expect(sandbox.files.write).toHaveBeenCalledWith(
      expect.stringContaining('REVIEW_PROMPT.md'),
      expect.stringContaining('gateway'),
    )

    // Claude command run
    const claudeCall = (sandbox.commands.run as ReturnType<typeof vi.fn>).mock.calls.find(
      ([cmd]: [string]) => cmd.includes('claude'),
    )
    expect(claudeCall).toBeTruthy()
  })

  it('reads review.json and posts comments', async () => {
    const sandbox = createMockSandbox(VALID_REVIEW_JSON)
    const createSandbox = vi.fn().mockResolvedValue(sandbox)
    const fetchMr = vi.fn().mockResolvedValue({
      diffs: [{ new_path: 'src/foo.ts', diff: '+x', new_file: false, deleted_file: false }],
      baseSha: 'b', startSha: 's', headSha: 'h',
    })
    const postComments = vi.fn().mockResolvedValue({ posted: 1, skipped: 0 })

    const result = await runMrReview(TEST_CONFIG, { createSandbox, fetchMr, postComments })

    expect(sandbox.files.read).toHaveBeenCalledWith('/home/user/review.json')
    expect(postComments).toHaveBeenCalledWith(
      expect.objectContaining({ mrIid: '42' || '7' }),
      expect.objectContaining({ baseSha: 'b' }),
      expect.arrayContaining([expect.objectContaining({ path: 'src/foo.ts' })]),
      '整体不错',
    )
    expect(result.posted).toBe(1)
  })

  it('kills sandbox even when claude fails', async () => {
    const sandbox = createMockSandbox('')
    sandbox.commands.run = vi.fn().mockImplementation((cmd: string) => {
      if (cmd.includes('claude')) return Promise.reject(new Error('timeout'))
      return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 })
    })
    const createSandbox = vi.fn().mockResolvedValue(sandbox)
    const fetchMr = vi.fn().mockResolvedValue({
      diffs: [], baseSha: 'b', startSha: 's', headSha: 'h',
    })
    const postComments = vi.fn()

    await expect(
      runMrReview(TEST_CONFIG, { createSandbox, fetchMr, postComments }),
    ).rejects.toThrow('timeout')

    expect(sandbox.kill).toHaveBeenCalledOnce()
  })

  it('throws and kills sandbox when review.json is invalid JSON', async () => {
    const sandbox = createMockSandbox('not valid json')
    const createSandbox = vi.fn().mockResolvedValue(sandbox)
    const fetchMr = vi.fn().mockResolvedValue({
      diffs: [], baseSha: 'b', startSha: 's', headSha: 'h',
    })
    const postComments = vi.fn()

    await expect(
      runMrReview(TEST_CONFIG, { createSandbox, fetchMr, postComments }),
    ).rejects.toThrow()

    expect(sandbox.kill).toHaveBeenCalledOnce()
    expect(postComments).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
pnpm vitest run scripts/mr-review/run.test.ts
```

期望：FAIL，`Cannot find module './run.js'`

- [ ] **Step 3: 实现 run.ts**

创建 `scripts/mr-review/run.ts`：

```typescript
import { Sandbox } from 'e2b'
import { loadConfig, type MrReviewConfig } from './config.js'
import { fetchMrData, postReviewComments, type MrDiff, type ReviewComment } from './gitlab.js'
import { buildPrompt } from './prompt.js'

const REVIEW_PROMPT_PATH = '/home/user/REVIEW_PROMPT.md'
const REVIEW_OUTPUT_PATH = '/home/user/review.json'

export interface SandboxLike {
  commands: {
    run: (
      cmd: string,
      opts?: { timeoutMs?: number; onStdout?: (d: string) => void; onStderr?: (d: string) => void },
    ) => Promise<{ stdout: string; stderr: string; exitCode: number }>
  }
  files: {
    write: (path: string, content: string) => Promise<void>
    read: (path: string) => Promise<string>
  }
  kill: () => Promise<void>
}

interface ReviewOutput {
  comments: ReviewComment[]
  summary: string
}

function parseReviewOutput(raw: string): ReviewOutput {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`Claude output is not valid JSON:\n${raw.slice(0, 500)}`)
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !Array.isArray((parsed as ReviewOutput).comments) ||
    typeof (parsed as ReviewOutput).summary !== 'string'
  ) {
    throw new Error(`Claude output has unexpected shape:\n${raw.slice(0, 500)}`)
  }

  return parsed as ReviewOutput
}

function buildDiffText(diffs: MrDiff[]): string {
  return diffs.map((d) => `--- ${d.old_path}\n+++ ${d.new_path}\n${d.diff}`).join('\n\n')
}

interface RunDeps {
  createSandbox: (
    template: string,
    opts: { envs: Record<string, string>; timeoutMs: number },
  ) => Promise<SandboxLike>
  fetchMr: (config: MrReviewConfig) => Promise<Awaited<ReturnType<typeof fetchMrData>>>
  postComments: (
    config: MrReviewConfig,
    shas: { baseSha: string; startSha: string; headSha: string },
    comments: ReviewComment[],
    summary: string,
  ) => Promise<{ posted: number; skipped: number }>
}

function defaultDeps(config: MrReviewConfig): RunDeps {
  return {
    createSandbox: (template, opts) =>
      Sandbox.create(template, {
        apiKey: config.e2bApiKey,
        ...opts,
      }) as unknown as Promise<SandboxLike>,
    fetchMr: (cfg) => fetchMrData(cfg),
    postComments: (cfg, shas, comments, summary) =>
      postReviewComments(cfg, shas, comments, summary),
  }
}

export interface RunResult {
  posted: number
  skipped: number
}

export async function runMrReview(
  config: MrReviewConfig,
  deps?: Partial<RunDeps>,
): Promise<RunResult> {
  const { createSandbox, fetchMr, postComments } = { ...defaultDeps(config), ...deps }

  // 1. Fetch MR data from GitLab (runner side, before sandbox)
  const mrData = await fetchMr(config)
  const diffText = buildDiffText(mrData.diffs)

  // 2. Start sandbox
  const sandbox = await createSandbox('claude', {
    envs: {
      ANTHROPIC_AUTH_TOKEN: config.zhipuApiKey,
      ANTHROPIC_BASE_URL: 'https://open.bigmodel.cn/api/anthropic',
      API_TIMEOUT_MS: '3000000',
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    },
    timeoutMs: config.sandboxTimeoutMs,
  })

  try {
    // 3. Write prompt into sandbox
    const prompt = buildPrompt(diffText)
    await sandbox.files.write(REVIEW_PROMPT_PATH, prompt)

    // 4. Run Claude
    console.log('\n── Claude Code output ──────────────────────────────────────')
    const claudeResult = await sandbox.commands.run(
      `claude --dangerously-skip-permissions -p "$(cat ${REVIEW_PROMPT_PATH})"`,
      {
        timeoutMs: config.claudeTimeoutMs,
        onStdout: (d) => process.stdout.write(d),
        onStderr: (d) => process.stderr.write(d),
      },
    )
    console.log('────────────────────────────────────────────────────────────\n')

    if (claudeResult.exitCode !== 0) {
      throw new Error(`Claude exited with code ${claudeResult.exitCode}`)
    }

    // 5. Read and parse review.json
    const raw = await sandbox.files.read(REVIEW_OUTPUT_PATH)
    const review = parseReviewOutput(raw)

    // 6. Post comments (runner side)
    const result = await postComments(
      config,
      { baseSha: mrData.baseSha, startSha: mrData.startSha, headSha: mrData.headSha },
      review.comments,
      review.summary,
    )

    console.log(`Review posted: ${result.posted} inline, ${result.skipped} skipped`)
    return result
  } finally {
    await sandbox.kill().catch(() => {})
  }
}

// CLI entrypoint
const isMain =
  process.argv[1]?.endsWith('mr-review/run.ts') ||
  process.argv[1]?.endsWith('mr-review/run.js')

if (isMain) {
  const config = loadConfig()
  runMrReview(config)
    .then((r) => {
      console.log(`Done. Posted: ${r.posted}, Skipped: ${r.skipped}`)
      process.exit(0)
    })
    .catch((err) => {
      console.error('MR review failed:', err)
      process.exit(1)
    })
}
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
pnpm vitest run scripts/mr-review/run.test.ts
```

期望：全部 PASS

- [ ] **Step 5: 运行所有 mr-review 测试**

```bash
pnpm vitest run scripts/mr-review/
```

期望：全部 PASS

- [ ] **Step 6: Commit**

```bash
git add scripts/mr-review/run.ts scripts/mr-review/run.test.ts
git commit -m "feat(mr-review): add main runMrReview orchestrator"
```

---

## Task 6: .gitlab-ci.yml — 新增 mr-review job

**Files:**
- Modify: `.gitlab-ci.yml`

- [ ] **Step 1: 在 .gitlab-ci.yml 末尾新增 job**

在 `.gitlab-ci.yml` 的 `doc-gardening` job 之后追加：

```yaml
# MR Claude Code Review: runs on every MR open/update in e2b sandbox
# allow_failure: true — review is advisory, must not block MR merges
mr-review:
  extends: .pnpm_setup
  stage: validate
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
  allow_failure: true
  timeout: 20m
  variables:
    MR_IID: $CI_MERGE_REQUEST_IID
  script:
    - pnpm tsx scripts/mr-review/run.ts
```

- [ ] **Step 2: 验证 YAML 语法**

```bash
python3 -c "import yaml; yaml.safe_load(open('.gitlab-ci.yml'))" && echo "YAML OK"
```

期望：`YAML OK`

- [ ] **Step 3: Commit**

```bash
git add .gitlab-ci.yml
git commit -m "feat(mr-review): add mr-review CI job"
```

---

## Task 7: 全量测试 + 收尾

- [ ] **Step 1: 运行全量测试**

```bash
pnpm test
```

期望：全部 PASS，无回归

- [ ] **Step 2: 确认新文件都覆盖到**

```bash
pnpm vitest run scripts/mr-review/
```

期望：config、gitlab、prompt、run 四个测试文件全部 PASS

- [ ] **Step 3: 更新 product-specs/index.md 状态**

将 `docs/product-specs/index.md` 中 `2026-04-17-mr-claude-review-design.md` 的状态从 `Draft` 改为 `Active`。

- [ ] **Step 4: 最终 commit**

```bash
git add docs/product-specs/index.md
git commit -m "docs: mark mr-review spec as Active"
```

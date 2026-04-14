# Doc Gardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an automated doc-gardening pipeline that runs Claude Code in an e2b sandbox to audit repo docs, then pushes fixes as a GitLab Merge Request.

**Architecture:** A standalone TypeScript script (`scripts/doc-gardening/run.ts`) creates an e2b sandbox using the prebuilt `claude` template, clones the repo inside it, runs Claude Code headless with a prompt file, collects the diff, and creates a GitLab MR if changes exist. Triggered weekly by a GitLab scheduled pipeline.

**Tech Stack:** TypeScript, e2b SDK (`e2b` package), GitLab REST API, pnpm workspace

**Spec:** `docs/product-specs/doc-gardening.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `scripts/doc-gardening/run.ts` | Create | Orchestration: sandbox lifecycle, git clone, Claude Code invocation, diff collection, branch push |
| `scripts/doc-gardening/gitlab.ts` | Create | GitLab API client: create MR |
| `scripts/doc-gardening/config.ts` | Create | Env var loading + validation |
| `.doc-gardening-prompt.md` | Create | Claude Code prompt for headless audit |
| `.gitlab-ci.yml` | Modify | Add `doc-gardening` scheduled job |
| `scripts/package.json` | Modify | Add `e2b` dependency |
| `scripts/doc-gardening/run.test.ts` | Create | Tests for orchestration logic (e2b/git mocked) |
| `scripts/doc-gardening/gitlab.test.ts` | Create | Tests for MR creation logic (fetch mocked) |

---

### Task 1: Project setup — add dependencies to scripts package

**Files:**
- Modify: `scripts/package.json`

The scripts package currently has no test runner or e2b SDK. Both are needed before writing any tests or implementation.

- [ ] **Step 1: Add `e2b` and `vitest` to the scripts package**

```bash
cd scripts && pnpm add e2b && pnpm add -D vitest
```

- [ ] **Step 2: Add test script to scripts/package.json**

Edit `scripts/package.json` to add the `test` script:

```json
"scripts": {
  "setup": "tsx --env-file ../.env setup.ts",
  "test": "vitest run"
}
```

- [ ] **Step 3: Verify dependencies installed**

Run: `cd scripts && npx vitest --version`
Expected: Prints vitest version without error

- [ ] **Step 4: Commit**

```bash
git add scripts/package.json pnpm-lock.yaml
git commit -m "chore(scripts): add e2b and vitest dependencies for doc-gardening"
```

---

### Task 2: Config — env var loading and validation

**Files:**
- Create: `scripts/doc-gardening/config.ts`
- Test: `scripts/doc-gardening/config.test.ts`

- [ ] **Step 1: Write the failing test**

Create `scripts/doc-gardening/config.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { loadConfig } from './config.js'

describe('loadConfig', () => {
  it('returns config when all required env vars are set', () => {
    const env = {
      ZHIPU_API_KEY: 'zhipu-test-key',
      E2B_API_KEY: 'e2b_test',
      GITLAB_TOKEN: 'glpat-test',
      GITLAB_PROJECT_ID: '42',
      GITLAB_URL: 'https://gitlab.example.com',
      GIT_CLONE_URL: 'https://gitlab.example.com/z-mono.git',
    }
    const config = loadConfig(env)
    expect(config.zhipuApiKey).toBe('zhipu-test-key')
    expect(config.e2bApiKey).toBe('e2b_test')
    expect(config.gitlabToken).toBe('glpat-test')
    expect(config.gitlabProjectId).toBe('42')
    expect(config.gitlabUrl).toBe('https://gitlab.example.com')
    expect(config.gitCloneUrl).toBe('https://gitlab.example.com/z-mono.git')
  })

  it('throws when a required env var is missing', () => {
    expect(() => loadConfig({})).toThrow('Missing required env')
  })

  it('uses default GITLAB_URL when not provided', () => {
    const env = {
      ZHIPU_API_KEY: 'zhipu-test-key',
      E2B_API_KEY: 'e2b_test',
      GITLAB_TOKEN: 'glpat-test',
      GITLAB_PROJECT_ID: '42',
      GIT_CLONE_URL: 'https://gitlab.example.com/z-mono.git',
    }
    const config = loadConfig(env)
    expect(config.gitlabUrl).toBe('https://gitlab.com')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scripts && npx vitest run doc-gardening/config.test.ts`
Expected: FAIL — module `./config.js` not found

- [ ] **Step 3: Write minimal implementation**

Create `scripts/doc-gardening/config.ts`:

```typescript
export interface DocGardeningConfig {
  zhipuApiKey: string
  e2bApiKey: string
  gitlabToken: string
  gitlabProjectId: string
  gitlabUrl: string
  gitCloneUrl: string
  sandboxTimeoutMs: number
  claudeTimeoutMs: number
}

const REQUIRED_VARS = [
  'ZHIPU_API_KEY',
  'E2B_API_KEY',
  'GITLAB_TOKEN',
  'GITLAB_PROJECT_ID',
  'GIT_CLONE_URL',
] as const

export function loadConfig(
  env: Record<string, string | undefined> = process.env,
): DocGardeningConfig {
  const missing = REQUIRED_VARS.filter((k) => !env[k])
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`)
  }

  return {
    zhipuApiKey: env.ZHIPU_API_KEY!,
    e2bApiKey: env.E2B_API_KEY!,
    gitlabToken: env.GITLAB_TOKEN!,
    gitlabProjectId: env.GITLAB_PROJECT_ID!,
    gitlabUrl: env.GITLAB_URL || 'https://gitlab.com',
    gitCloneUrl: env.GIT_CLONE_URL!,
    sandboxTimeoutMs: Number(env.SANDBOX_TIMEOUT_MS) || 30 * 60 * 1000,
    claudeTimeoutMs: Number(env.CLAUDE_TIMEOUT_MS) || 25 * 60 * 1000,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd scripts && npx vitest run doc-gardening/config.test.ts`
Expected: PASS — all 3 tests green

- [ ] **Step 5: Commit**

```bash
git add scripts/doc-gardening/config.ts scripts/doc-gardening/config.test.ts
git commit -m "feat(doc-gardening): add config module with env var loading"
```

---

### Task 3: GitLab API client — create MR

**Files:**
- Create: `scripts/doc-gardening/gitlab.ts`
- Test: `scripts/doc-gardening/gitlab.test.ts`

- [ ] **Step 1: Write the failing test**

Create `scripts/doc-gardening/gitlab.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMergeRequest } from './gitlab.js'

describe('createMergeRequest', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('sends POST to GitLab MR API with correct payload', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ iid: 1, web_url: 'https://gitlab.example.com/mr/1' }),
    })

    const result = await createMergeRequest(
      {
        gitlabUrl: 'https://gitlab.example.com',
        gitlabToken: 'glpat-test',
        gitlabProjectId: '42',
      },
      'doc-gardening/2026-04-14',
      mockFetch as unknown as typeof fetch,
    )

    expect(mockFetch).toHaveBeenCalledOnce()
    const [url, options] = mockFetch.mock.calls[0]
    expect(url).toBe('https://gitlab.example.com/api/v4/projects/42/merge_requests')
    expect(options.method).toBe('POST')

    const body = JSON.parse(options.body)
    expect(body.source_branch).toBe('doc-gardening/2026-04-14')
    expect(body.target_branch).toBe('main')
    expect(body.title).toContain('doc gardening')
    expect(body.labels).toBe('doc-gardening,automated')
    expect(body.remove_source_branch).toBe(true)

    expect(result.web_url).toBe('https://gitlab.example.com/mr/1')
  })

  it('throws on non-ok response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      text: () => Promise.resolve('Branch already exists'),
    })

    await expect(
      createMergeRequest(
        {
          gitlabUrl: 'https://gitlab.example.com',
          gitlabToken: 'glpat-test',
          gitlabProjectId: '42',
        },
        'doc-gardening/2026-04-14',
        mockFetch as unknown as typeof fetch,
      ),
    ).rejects.toThrow('GitLab MR creation failed (422)')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scripts && npx vitest run doc-gardening/gitlab.test.ts`
Expected: FAIL — module `./gitlab.js` not found

- [ ] **Step 3: Write minimal implementation**

Create `scripts/doc-gardening/gitlab.ts`:

```typescript
interface GitLabConfig {
  gitlabUrl: string
  gitlabToken: string
  gitlabProjectId: string
}

interface MergeRequestResult {
  iid: number
  web_url: string
}

export async function createMergeRequest(
  config: GitLabConfig,
  branch: string,
  fetchFn: typeof fetch = fetch,
): Promise<MergeRequestResult> {
  const date = branch.replace('doc-gardening/', '')
  const url = `${config.gitlabUrl}/api/v4/projects/${config.gitlabProjectId}/merge_requests`

  const res = await fetchFn(url, {
    method: 'POST',
    headers: {
      'PRIVATE-TOKEN': config.gitlabToken,
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
        '> 此 MR 由 scheduled pipeline 自动创建，所有变更仅限文档文件。',
      ].join('\n'),
      labels: 'doc-gardening,automated',
      remove_source_branch: true,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`GitLab MR creation failed (${res.status}): ${body}`)
  }

  return res.json() as Promise<MergeRequestResult>
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd scripts && npx vitest run doc-gardening/gitlab.test.ts`
Expected: PASS — both tests green

- [ ] **Step 5: Commit**

```bash
git add scripts/doc-gardening/gitlab.ts scripts/doc-gardening/gitlab.test.ts
git commit -m "feat(doc-gardening): add GitLab MR creation client"
```

---

### Task 4: Orchestration script — run.ts

**Files:**
- Create: `scripts/doc-gardening/run.ts`
- Test: `scripts/doc-gardening/run.test.ts`

- [ ] **Step 1: Write the failing test for orchestration**

Create `scripts/doc-gardening/run.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runDocGardening, type SandboxLike } from './run.js'

function createMockSandbox(diffOutput: string): SandboxLike {
  const commands: Array<{ cmd: string }> = []
  return {
    commands: {
      run: vi.fn().mockImplementation((cmd: string) => {
        commands.push({ cmd })
        if (cmd.includes('git diff') && !cmd.includes('checkout') && !cmd.includes('add')) {
          return Promise.resolve({ stdout: diffOutput, stderr: '', exitCode: 0 })
        }
        return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 })
      }),
    },
    kill: vi.fn().mockResolvedValue(undefined),
    _commands: commands,
  }
}

describe('runDocGardening', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('creates sandbox, clones repo, runs claude, and creates MR when diff exists', async () => {
    const sandbox = createMockSandbox('diff --git a/README.md b/README.md\n+fixed')
    const createSandbox = vi.fn().mockResolvedValue(sandbox)
    const createMR = vi.fn().mockResolvedValue({ iid: 1, web_url: 'https://example.com/mr/1' })

    const result = await runDocGardening(
      {
        zhipuApiKey: 'zhipu-test-key',
        e2bApiKey: 'e2b_test',
        gitlabToken: 'glpat-test',
        gitlabProjectId: '42',
        gitlabUrl: 'https://gitlab.example.com',
        gitCloneUrl: 'https://x-token:glpat-test@gitlab.example.com/z-mono.git',
        sandboxTimeoutMs: 30 * 60 * 1000,
        claudeTimeoutMs: 25 * 60 * 1000,
      },
      { createSandbox, createMR },
    )

    // Should have created sandbox
    expect(createSandbox).toHaveBeenCalledOnce()

    // Should have run git clone
    const cloneCmd = sandbox.commands.run.mock.calls.find(
      ([cmd]: [string]) => cmd.includes('git clone'),
    )
    expect(cloneCmd).toBeTruthy()

    // Should have run claude
    const claudeCmd = sandbox.commands.run.mock.calls.find(
      ([cmd]: [string]) => cmd.includes('claude'),
    )
    expect(claudeCmd).toBeTruthy()

    // Should have created MR
    expect(createMR).toHaveBeenCalledOnce()

    // Sandbox should be killed
    expect(sandbox.kill).toHaveBeenCalledOnce()

    expect(result.hasChanges).toBe(true)
  })

  it('skips MR creation when no diff exists', async () => {
    const sandbox = createMockSandbox('')
    const createSandbox = vi.fn().mockResolvedValue(sandbox)
    const createMR = vi.fn()

    const result = await runDocGardening(
      {
        zhipuApiKey: 'zhipu-test-key',
        e2bApiKey: 'e2b_test',
        gitlabToken: 'glpat-test',
        gitlabProjectId: '42',
        gitlabUrl: 'https://gitlab.example.com',
        gitCloneUrl: 'https://x-token:glpat-test@gitlab.example.com/z-mono.git',
        sandboxTimeoutMs: 30 * 60 * 1000,
        claudeTimeoutMs: 25 * 60 * 1000,
      },
      { createSandbox, createMR },
    )

    expect(createMR).not.toHaveBeenCalled()
    expect(sandbox.kill).toHaveBeenCalledOnce()
    expect(result.hasChanges).toBe(false)
  })

  it('kills sandbox even when claude command fails', async () => {
    const sandbox = createMockSandbox('')
    sandbox.commands.run = vi.fn().mockImplementation((cmd: string) => {
      if (cmd.includes('claude')) {
        return Promise.reject(new Error('timeout'))
      }
      return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 })
    })
    const createSandbox = vi.fn().mockResolvedValue(sandbox)
    const createMR = vi.fn()

    await expect(
      runDocGardening(
        {
          zhipuApiKey: 'zhipu-test-key',
          e2bApiKey: 'e2b_test',
          gitlabToken: 'glpat-test',
          gitlabProjectId: '42',
          gitlabUrl: 'https://gitlab.example.com',
          gitCloneUrl: 'https://x-token:glpat-test@gitlab.example.com/z-mono.git',
          sandboxTimeoutMs: 30 * 60 * 1000,
          claudeTimeoutMs: 25 * 60 * 1000,
        },
        { createSandbox, createMR },
      ),
    ).rejects.toThrow('timeout')

    expect(sandbox.kill).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scripts && npx vitest run doc-gardening/run.test.ts`
Expected: FAIL — module `./run.js` not found

- [ ] **Step 3: Write the orchestration implementation**

Create `scripts/doc-gardening/run.ts`:

```typescript
import { Sandbox } from 'e2b'
import { loadConfig, type DocGardeningConfig } from './config.js'
import { createMergeRequest } from './gitlab.js'

const REPO_DIR = '/home/user/repo'
const PROMPT_FILE = '.doc-gardening-prompt.md'

export interface SandboxLike {
  commands: {
    run: (cmd: string, opts?: { timeoutMs?: number }) => Promise<{ stdout: string; stderr: string; exitCode: number }>
  }
  kill: () => Promise<void>
}

interface RunDeps {
  createSandbox: (template: string, opts: { envs: Record<string, string>; timeoutMs: number }) => Promise<SandboxLike>
  createMR: (config: DocGardeningConfig, branch: string) => Promise<{ iid: number; web_url: string }>
}

export interface RunResult {
  hasChanges: boolean
  mrUrl?: string
}

function defaultDeps(config: DocGardeningConfig): RunDeps {
  return {
    createSandbox: (template, opts) =>
      Sandbox.create(template, { apiKey: config.e2bApiKey, ...opts }) as unknown as Promise<SandboxLike>,
    createMR: (cfg, branch) =>
      createMergeRequest(
        { gitlabUrl: cfg.gitlabUrl, gitlabToken: cfg.gitlabToken, gitlabProjectId: cfg.gitlabProjectId },
        branch,
      ),
  }
}

export async function runDocGardening(
  config: DocGardeningConfig,
  deps?: Partial<RunDeps>,
): Promise<RunResult> {
  const { createSandbox, createMR } = { ...defaultDeps(config), ...deps }

  const sandbox = await createSandbox('claude', {
    envs: { ZHIPU_API_KEY: config.zhipuApiKey },
    timeoutMs: config.sandboxTimeoutMs,
  })

  try {
    // 1. Clone repo
    await sandbox.commands.run(
      `git clone ${config.gitCloneUrl} ${REPO_DIR}`,
      { timeoutMs: 120_000 },
    )

    // 2. Configure git user (needed for commit)
    await sandbox.commands.run(
      `cd ${REPO_DIR} && git config user.email "doc-gardening@bot" && git config user.name "Doc Gardening Bot"`,
    )

    // 3. Run Claude Code headless
    await sandbox.commands.run(
      `cd ${REPO_DIR} && claude --dangerously-skip-permissions -p "$(cat ${PROMPT_FILE})"`,
      { timeoutMs: config.claudeTimeoutMs },
    )

    // 4. Check for changes
    const diff = await sandbox.commands.run(`cd ${REPO_DIR} && git diff`)
    const hasChanges = diff.stdout.trim().length > 0

    if (!hasChanges) {
      console.log('No documentation changes detected. Skipping MR creation.')
      return { hasChanges: false }
    }

    // 5. Create branch, commit, push
    const date = new Date().toISOString().slice(0, 10)
    const branch = `doc-gardening/${date}`

    await sandbox.commands.run(`
      cd ${REPO_DIR} &&
      git checkout -b ${branch} &&
      git add -A &&
      git commit -m "docs: automated doc gardening ${date}"
    `)

    await sandbox.commands.run(
      `cd ${REPO_DIR} && git push origin ${branch}`,
      { timeoutMs: 60_000 },
    )

    // 6. Create MR (via GitLab API from CI runner, not from sandbox)
    const mr = await createMR(config, branch)
    console.log(`MR created: ${mr.web_url}`)

    return { hasChanges: true, mrUrl: mr.web_url }
  } finally {
    await sandbox.kill().catch(() => {})
  }
}

// CLI entrypoint — only runs when executed directly
const isMainModule = process.argv[1]?.endsWith('doc-gardening/run.ts')
  || process.argv[1]?.endsWith('doc-gardening/run.js')

if (isMainModule) {
  const config = loadConfig()
  runDocGardening(config)
    .then((result) => {
      console.log(result.hasChanges ? `Done. MR: ${result.mrUrl}` : 'Done. No changes.')
      process.exit(0)
    })
    .catch((err) => {
      console.error('Doc gardening failed:', err)
      process.exit(1)
    })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd scripts && npx vitest run doc-gardening/run.test.ts`
Expected: PASS — all 3 tests green

- [ ] **Step 5: Commit**

```bash
git add scripts/doc-gardening/run.ts scripts/doc-gardening/run.test.ts scripts/package.json pnpm-lock.yaml
git commit -m "feat(doc-gardening): add orchestration script with e2b sandbox"
```

---

### Task 5: Claude Code prompt file

**Files:**
- Create: `.doc-gardening-prompt.md`

- [ ] **Step 1: Create the prompt file**

Create `.doc-gardening-prompt.md` in the repo root:

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

- [ ] **Step 2: Verify file exists and content is correct**

Run: `head -5 .doc-gardening-prompt.md`
Expected: First line is `你是 z-mono 仓库的文档审查 agent。`

- [ ] **Step 3: Commit**

```bash
git add .doc-gardening-prompt.md
git commit -m "feat(doc-gardening): add Claude Code prompt for headless audit"
```

---

### Task 6: GitLab CI job configuration

**Files:**
- Modify: `.gitlab-ci.yml`

- [ ] **Step 1: Verify current CI file structure**

Run: `cat .gitlab-ci.yml`
Confirm the file has `stages: [validate]` and uses `.pnpm_setup` template.

- [ ] **Step 2: Add the doc-gardening job**

Append the following to `.gitlab-ci.yml` (after the existing `test` job):

```yaml

# Doc Gardening: weekly automated doc audit via Claude Code in e2b sandbox
# Triggered by scheduled pipeline with DOC_GARDENING=true variable
doc-gardening:
  extends: .pnpm_setup
  stage: validate
  rules:
    - if: $CI_PIPELINE_SOURCE == "schedule" && $DOC_GARDENING == "true"
  script:
    - pnpm tsx scripts/doc-gardening/run.ts
  timeout: 35m
```

- [ ] **Step 3: Validate YAML syntax**

Run: `node -e "const yaml = require('yaml'); yaml.parse(require('fs').readFileSync('.gitlab-ci.yml','utf8')); console.log('Valid YAML')" 2>/dev/null || python3 -c "import yaml; yaml.safe_load(open('.gitlab-ci.yml')); print('Valid YAML')"`
Expected: `Valid YAML`

- [ ] **Step 4: Commit**

```bash
git add .gitlab-ci.yml
git commit -m "ci: add doc-gardening scheduled job"
```

---

### Task 7: Update .env.example with new variables

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Append doc-gardening section to .env.example**

Add the following at the end of `.env.example`:

```bash

# ── Doc Gardening (CI only) ──────────────────────────────────────────────────
# These variables are set as GitLab CI Variables, not needed locally.
# ZHIPU_API_KEY=your_zhipu_api_key
# GITLAB_TOKEN=glpat-...
# GITLAB_PROJECT_ID=42
# GITLAB_URL=https://gitlab.example.com
# GIT_CLONE_URL=https://x-token:${GITLAB_TOKEN}@gitlab.example.com/group/z-mono.git
```

- [ ] **Step 2: Verify the section appears**

Run: `tail -8 .env.example`
Expected: Shows the `Doc Gardening` section

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "docs: add doc-gardening env vars to .env.example"
```

---

### Task 8: Run full test suite and verify

**Files:** None (verification only)

- [ ] **Step 1: Run doc-gardening tests**

Run: `cd scripts && npx vitest run doc-gardening/`
Expected: All tests pass (config: 3, gitlab: 2, run: 3 — total 8 tests)

- [ ] **Step 2: Run existing CI checks**

Run: `pnpm tsx scripts/check-doc-links.ts && pnpm tsx scripts/check-doc-index.ts`
Expected: Both pass (no broken links introduced)

- [ ] **Step 3: Run full project test suite**

Run: `pnpm test`
Expected: All existing tests still pass

- [ ] **Step 4: Final commit (if any fixes needed)**

```bash
# Only if previous steps required fixes
git add -A
git commit -m "fix(doc-gardening): address test/lint issues"
```

---

### Task 9: Update AGENTS.md with doc-gardening info

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Add `scripts/doc-gardening/` to the repository layout section**

In the `AGENTS.md` repository layout section, add `scripts/doc-gardening/` under the existing `scripts/` entry. The scripts entry should become:

```
    scripts/        # setup.ts + doc-gardening automation
```

- [ ] **Step 2: Verify AGENTS.md is valid**

Run: `pnpm tsx scripts/check-doc-links.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md
git commit -m "docs: add doc-gardening to AGENTS.md repo layout"
```

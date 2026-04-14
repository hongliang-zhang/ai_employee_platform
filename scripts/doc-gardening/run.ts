import { Sandbox } from 'e2b'
import { loadConfig, type DocGardeningConfig } from './config.js'
import { createMergeRequest } from './gitlab.js'

const REPO_DIR = '/home/user/repo'
const PROMPT_FILE = '.doc-gardening-prompt.md'

export interface SandboxLike {
  commands: {
    run: (
      cmd: string,
      opts?: {
        timeoutMs?: number
        onStdout?: (data: string) => void
        onStderr?: (data: string) => void
      },
    ) => Promise<{ stdout: string; stderr: string; exitCode: number }>
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
        { gitlabUrl: cfg.gitlabUrl, gitlabToken: cfg.gitlabToken, gitlabProjectId: cfg.gitlabProjectId, targetBranch: cfg.targetBranch },
        branch,
      ),
  }
}

export async function runDocGardening(
  config: DocGardeningConfig,
  deps?: Partial<RunDeps>,
): Promise<RunResult> {
  const { createSandbox, createMR } = { ...defaultDeps(config), ...deps }

  // Pass Zhipu credentials as env vars — Claude Code picks these up automatically
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

    // 1. Clone repo
    const cloneBranchFlag = config.gitCloneBranch ? `--branch ${config.gitCloneBranch} ` : ''
    await sandbox.commands.run(
      `git clone ${cloneBranchFlag}${config.gitCloneUrl} ${REPO_DIR}`,
      { timeoutMs: 120_000 },
    )

    // 2. Configure git user (needed for commit)
    await sandbox.commands.run(
      `cd ${REPO_DIR} && git config user.email "doc-gardening@bot" && git config user.name "Doc Gardening Bot"`,
    )

    // 3. Run Claude Code headless — stream output so we can see what it's doing
    console.log('\n── Claude Code output ──────────────────────────────────────')
    const claudeResult = await sandbox.commands.run(
      `cd ${REPO_DIR} && claude --dangerously-skip-permissions -p "$(cat ${PROMPT_FILE})"`,
      {
        timeoutMs: config.claudeTimeoutMs,
        onStdout: (data) => process.stdout.write(data),
        onStderr: (data) => process.stderr.write(data),
      },
    )
    console.log('────────────────────────────────────────────────────────────\n')
    if (claudeResult.exitCode !== 0) {
      throw new Error(`Claude Code exited with code ${claudeResult.exitCode}`)
    }

    // 4. Check for changes
    const diff = await sandbox.commands.run(`cd ${REPO_DIR} && git diff`)
    const hasChanges = diff.stdout.trim().length > 0

    console.log(hasChanges
      ? `── git diff ────────────────────────────────────────────────\n${diff.stdout}\n────────────────────────────────────────────────────────────`
      : 'git diff: no changes'
    )

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
      `cd ${REPO_DIR} && git push origin ${branch} --force-with-lease`,
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

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

function extractJson(raw: string): string {
  // Try direct parse first
  const trimmed = raw.trim()
  if (trimmed.startsWith('{')) return trimmed

  // Find first { ... } block spanning the whole content
  const start = raw.indexOf('{')
  if (start === -1) return raw

  // Walk to find matching closing brace
  let depth = 0
  let end = -1
  for (let i = start; i < raw.length; i++) {
    if (raw[i] === '{') depth++
    else if (raw[i] === '}') {
      depth--
      if (depth === 0) { end = i; break }
    }
  }
  return end !== -1 ? raw.slice(start, end + 1) : raw
}

function parseReviewOutput(raw: string): ReviewOutput {
  const jsonStr = extractJson(raw)
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonStr)
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

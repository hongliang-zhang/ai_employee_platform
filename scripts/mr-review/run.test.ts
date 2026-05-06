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
      diffs: [{ new_path: 'src/foo.ts', old_path: 'src/foo.ts', diff: '+x', new_file: false, deleted_file: false }],
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
      diffs: [{ new_path: 'src/foo.ts', old_path: 'src/foo.ts', diff: '+x', new_file: false, deleted_file: false }],
      baseSha: 'b', startSha: 's', headSha: 'h',
    })
    const postComments = vi.fn().mockResolvedValue({ posted: 1, skipped: 0 })

    await runMrReview(TEST_CONFIG, { createSandbox, fetchMr, postComments })

    expect(sandbox.files.write).toHaveBeenCalledWith(
      expect.stringContaining('REVIEW_PROMPT.md'),
      expect.stringContaining('gateway'),
    )

    const claudeCall = (sandbox.commands.run as ReturnType<typeof vi.fn>).mock.calls.find(
      ([cmd]: [string]) => cmd.includes('claude'),
    )
    expect(claudeCall).toBeTruthy()
  })

  it('reads review.json and posts comments', async () => {
    const sandbox = createMockSandbox(VALID_REVIEW_JSON)
    const createSandbox = vi.fn().mockResolvedValue(sandbox)
    const fetchMr = vi.fn().mockResolvedValue({
      diffs: [{ new_path: 'src/foo.ts', old_path: 'src/foo.ts', diff: '+x', new_file: false, deleted_file: false }],
      baseSha: 'b', startSha: 's', headSha: 'h',
    })
    const postComments = vi.fn().mockResolvedValue({ posted: 1, skipped: 0 })

    const result = await runMrReview(TEST_CONFIG, { createSandbox, fetchMr, postComments })

    expect(sandbox.files.read).toHaveBeenCalledWith('/home/user/review.json')
    expect(postComments).toHaveBeenCalledWith(
      expect.objectContaining({ mrIid: '7' }),
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

  it('parses review JSON from stdout when file is not written', async () => {
    const sandbox = createMockSandbox('')
    // Claude outputs JSON to stdout but does NOT write review.json
    sandbox.commands.run = vi.fn().mockResolvedValue({
      stdout: VALID_REVIEW_JSON,
      stderr: '',
      exitCode: 0,
    })
    const createSandbox = vi.fn().mockResolvedValue(sandbox)
    const fetchMr = vi.fn().mockResolvedValue({
      diffs: [{ new_path: 'src/foo.ts', old_path: 'src/foo.ts', diff: '+x', new_file: false, deleted_file: false }],
      baseSha: 'b', startSha: 's', headSha: 'h',
    })
    const postComments = vi.fn().mockResolvedValue({ posted: 1, skipped: 0 })

    const result = await runMrReview(TEST_CONFIG, { createSandbox, fetchMr, postComments })

    // Should NOT have read the file — stdout was sufficient
    expect(sandbox.files.read).not.toHaveBeenCalled()
    expect(postComments).toHaveBeenCalledWith(
      expect.objectContaining({ mrIid: '7' }),
      expect.objectContaining({ baseSha: 'b' }),
      expect.arrayContaining([expect.objectContaining({ path: 'src/foo.ts' })]),
      '整体不错',
    )
    expect(result.posted).toBe(1)
  })
})

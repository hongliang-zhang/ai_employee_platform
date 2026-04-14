import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runDocGardening, type SandboxLike } from './run.js'

function createMockSandbox(diffOutput: string): SandboxLike & { _commands: Array<{ cmd: string }> } {
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
        anthropicApiKey: 'sk-ant-test',
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
        anthropicApiKey: 'sk-ant-test',
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
          anthropicApiKey: 'sk-ant-test',
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
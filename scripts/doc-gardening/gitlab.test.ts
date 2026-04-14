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
        targetBranch: 'master',
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
    expect(body.target_branch).toBe('master')
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
          targetBranch: 'master',
        },
        'doc-gardening/2026-04-14',
        mockFetch as unknown as typeof fetch,
      ),
    ).rejects.toThrow('GitLab MR creation failed (422)')
  })
})
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
          { new_path: 'src/foo.ts', old_path: 'src/foo.ts', diff: '@@ -1 +1 @@\n-old\n+new', new_file: false, deleted_file: false },
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
        json: () => Promise.resolve([
          { new_path: 'src/foo.ts', old_path: 'src/foo.ts', diff: '', new_file: false, deleted_file: false },
        ]),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]), // empty versions
      })
    await expect(fetchMrData(BASE_CONFIG, mockFetch as unknown as typeof fetch))
      .rejects.toThrow('No MR versions found')
  })
})

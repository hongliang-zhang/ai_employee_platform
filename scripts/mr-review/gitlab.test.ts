import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchMrData } from './gitlab.js'
import { postReviewComments, type ReviewComment } from './gitlab.js'

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

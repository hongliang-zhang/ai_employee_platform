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

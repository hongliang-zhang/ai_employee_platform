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

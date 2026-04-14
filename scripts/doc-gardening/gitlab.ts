interface GitLabConfig {
  gitlabUrl: string
  gitlabToken: string
  gitlabProjectId: string
  targetBranch: string
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
      target_branch: config.targetBranch,
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
export interface DocGardeningConfig {
  zhipuApiKey: string
  e2bApiKey: string
  gitlabToken: string
  gitlabProjectId: string
  gitlabUrl: string
  gitCloneUrl: string
  gitCloneBranch?: string
  sandboxTimeoutMs: number
  claudeTimeoutMs: number
}

const REQUIRED_VARS = [
  'ZHIPU_API_KEY',
  'E2B_API_KEY',
  'GITLAB_TOKEN',
  'GITLAB_PROJECT_ID',
  'GIT_CLONE_URL',
] as const

export function loadConfig(
  env: Record<string, string | undefined> = process.env,
): DocGardeningConfig {
  const missing = REQUIRED_VARS.filter((k) => !env[k])
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`)
  }

  return {
    zhipuApiKey: env.ZHIPU_API_KEY!,
    e2bApiKey: env.E2B_API_KEY!,
    gitlabToken: env.GITLAB_TOKEN!,
    gitlabProjectId: env.GITLAB_PROJECT_ID!,
    gitlabUrl: env.GITLAB_URL || 'https://gitlab.com',
    gitCloneUrl: env.GIT_CLONE_URL!,
    gitCloneBranch: env.GIT_CLONE_BRANCH,
    sandboxTimeoutMs: Number(env.SANDBOX_TIMEOUT_MS) || 30 * 60 * 1000,
    claudeTimeoutMs: Number(env.CLAUDE_TIMEOUT_MS) || 25 * 60 * 1000,
  }
}

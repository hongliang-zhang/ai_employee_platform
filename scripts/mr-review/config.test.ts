import { describe, it, expect } from 'vitest'
import { loadConfig } from './config.js'

const REQUIRED_ENV = {
  ZHIPU_API_KEY: 'zhipu-test',
  E2B_API_KEY: 'e2b_test',
  GITLAB_TOKEN: 'glpat-test',
  GITLAB_PROJECT_ID: '99',
  MR_IID: '7',
}

describe('loadConfig', () => {
  it('returns config when all required vars are set', () => {
    const config = loadConfig(REQUIRED_ENV)
    expect(config.zhipuApiKey).toBe('zhipu-test')
    expect(config.e2bApiKey).toBe('e2b_test')
    expect(config.gitlabToken).toBe('glpat-test')
    expect(config.gitlabProjectId).toBe('99')
    expect(config.mrIid).toBe('7')
    expect(config.gitlabUrl).toBe('https://gitlab.com')
  })

  it('respects GITLAB_URL override', () => {
    const config = loadConfig({ ...REQUIRED_ENV, GITLAB_URL: 'https://dev.aminer.cn' })
    expect(config.gitlabUrl).toBe('https://dev.aminer.cn')
  })

  it('throws when a required var is missing', () => {
    expect(() => loadConfig({})).toThrow('Missing required env vars')
  })

  it('each missing var name appears in the error', () => {
    expect(() => loadConfig({})).toThrow('ZHIPU_API_KEY')
  })
})

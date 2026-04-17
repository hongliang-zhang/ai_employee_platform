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

  it('throws listing all missing var names when none are set', () => {
    expect(() => loadConfig({})).toThrow('Missing required env vars')
    expect(() => loadConfig({})).toThrow('ZHIPU_API_KEY')
  })

  it('throws listing only the missing var when one is missing', () => {
    const { MR_IID: _, ...withoutMrIid } = REQUIRED_ENV
    expect(() => loadConfig(withoutMrIid)).toThrow('MR_IID')
    expect(() => loadConfig(withoutMrIid)).not.toThrow('ZHIPU_API_KEY')
  })
})

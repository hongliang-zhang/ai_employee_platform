import { describe, it, expect } from 'vitest'
import { loadConfig } from './config.js'

describe('loadConfig', () => {
  it('returns config when all required env vars are set', () => {
    const env = {
      ANTHROPIC_API_KEY: 'sk-ant-test',
      E2B_API_KEY: 'e2b_test',
      GITLAB_TOKEN: 'glpat-test',
      GITLAB_PROJECT_ID: '42',
      GITLAB_URL: 'https://gitlab.example.com',
      GIT_CLONE_URL: 'https://gitlab.example.com/z-mono.git',
    }
    const config = loadConfig(env)
    expect(config.anthropicApiKey).toBe('sk-ant-test')
    expect(config.e2bApiKey).toBe('e2b_test')
    expect(config.gitlabToken).toBe('glpat-test')
    expect(config.gitlabProjectId).toBe('42')
    expect(config.gitlabUrl).toBe('https://gitlab.example.com')
    expect(config.gitCloneUrl).toBe('https://gitlab.example.com/z-mono.git')
  })

  it('throws when a required env var is missing', () => {
    expect(() => loadConfig({})).toThrow('Missing required env')
  })

  it('uses default GITLAB_URL when not provided', () => {
    const env = {
      ANTHROPIC_API_KEY: 'sk-ant-test',
      E2B_API_KEY: 'e2b_test',
      GITLAB_TOKEN: 'glpat-test',
      GITLAB_PROJECT_ID: '42',
      GIT_CLONE_URL: 'https://gitlab.example.com/z-mono.git',
    }
    const config = loadConfig(env)
    expect(config.gitlabUrl).toBe('https://gitlab.com')
  })
})

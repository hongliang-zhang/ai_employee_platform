import { describe, it, expect } from 'vitest'
import { buildPrompt } from './prompt.js'

describe('buildPrompt', () => {
  const diff = 'diff --git a/foo.ts b/foo.ts\n+const x = 1'

  it('contains architecture constraints', () => {
    const prompt = buildPrompt(diff)
    expect(prompt).toContain('gateway')
    expect(prompt).toContain('sandbox')
    expect(prompt).toContain('error: { code, message, retryable, details }')
    expect(prompt).toContain('migrations')
  })

  it('contains diff-only constraints', () => {
    const prompt = buildPrompt(diff)
    expect(prompt).toContain('只基于 diff')
    expect(prompt).toContain('只报告确定存在的问题')
    expect(prompt).toContain('没有问题就返回空 comments')
  })

  it('contains review dimensions', () => {
    const prompt = buildPrompt(diff)
    expect(prompt).toContain('Bug')
    expect(prompt).toContain('安全')
    expect(prompt).toContain('架构')
  })

  it('contains output format instruction with review.json path', () => {
    const prompt = buildPrompt(diff)
    expect(prompt).toContain('/home/user/review.json')
    expect(prompt).toContain('"comments"')
    expect(prompt).toContain('"summary"')
    expect(prompt).toContain('json.dump') // Python-based output to avoid raw newlines in JSON
  })

  it('contains the diff content', () => {
    const prompt = buildPrompt(diff)
    expect(prompt).toContain(diff)
  })
})

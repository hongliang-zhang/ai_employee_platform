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
  })

  it('contains the diff content', () => {
    const prompt = buildPrompt(diff)
    expect(prompt).toContain(diff)
  })
})

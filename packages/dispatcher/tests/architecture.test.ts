import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'

const srcDir = new URL('../src', import.meta.url).pathname

function getAllTsFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true })
  return entries.flatMap(entry => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return getAllTsFiles(full)
    if (entry.name.endsWith('.ts')) return [full]
    return []
  })
}

function scanImports(files: string[], pattern: RegExp): string[] {
  const violations: string[] = []
  for (const file of files) {
    const content = readFileSync(file, 'utf-8')
    const lines = content.split('\n')
    lines.forEach((line, i) => {
      if (pattern.test(line)) {
        violations.push(`${file}:${i + 1}  ${line.trim()}`)
      }
    })
  }
  return violations
}

describe('dispatcher — architecture boundaries', () => {
  const files = getAllTsFiles(srcDir)

  it('must not import LLM SDKs directly (all LLM calls go through gateway /gateway/llm)', () => {
    // Any direct LLM SDK import bypasses gateway's auth, logging, and model allowlist
    const violations = scanImports(files, /from ['"](?:@anthropic-ai\/sdk|openai|@google\/generative-ai|@mistralai\/)/)
    expect(violations, `Direct LLM SDK import found:\n${violations.join('\n')}`).toHaveLength(0)
  })

  it('must not import gateway package (gateway is accessed via HTTP, not in-process)', () => {
    const violations = scanImports(files, /from ['"]@aaas\/gateway['"]/)
    expect(violations, `gateway package import found:\n${violations.join('\n')}`).toHaveLength(0)
  })

  it('must not call LLM API URLs directly (all LLM via gateway)', () => {
    // Catch hardcoded LLM endpoint strings that bypass gateway
    const violations = scanImports(files, /openai\.com\/v1|anthropic\.com\/v1|generativelanguage\.googleapis\.com/)
    expect(violations, `Direct LLM API URL found:\n${violations.join('\n')}`).toHaveLength(0)
  })

  it('all source files are under 300 lines (hard limit; ESLint warns at 200)', () => {
    const oversized: string[] = []
    for (const file of files) {
      const lines = readFileSync(file, 'utf-8').split('\n').length
      if (lines > 300) oversized.push(`${file}: ${lines} lines`)
    }
    expect(oversized, `Files over 300 lines:\n${oversized.join('\n')}`).toHaveLength(0)
  })
})

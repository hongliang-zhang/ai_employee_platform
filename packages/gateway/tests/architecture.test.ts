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

describe('gateway — architecture boundaries', () => {
  const files = getAllTsFiles(srcDir)

  it('must not import e2b (sandbox lifecycle belongs to dispatcher)', () => {
    const violations = scanImports(files, /from ['"]@e2b\//)
    expect(violations, `e2b import found:\n${violations.join('\n')}`).toHaveLength(0)
  })

  it('must not import Telegram SDKs (IM channel belongs to dispatcher)', () => {
    const violations = scanImports(files, /from ['"](?:node-telegram-bot-api|telegraf|grammy)['"]/)
    expect(violations, `Telegram SDK import found:\n${violations.join('\n')}`).toHaveLength(0)
  })

  it('must not import dispatcher package', () => {
    const violations = scanImports(files, /from ['"]@aaas\/dispatcher['"]/)
    expect(violations, `dispatcher import found:\n${violations.join('\n')}`).toHaveLength(0)
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

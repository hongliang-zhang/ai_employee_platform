import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '..')

describe('setup script environment contract', () => {
  it('does not require E2B_TEMPLATE_ID from .env', () => {
    const setup = readFileSync(resolve(repoRoot, 'scripts/setup.ts'), 'utf8')
    const envExample = readFileSync(resolve(repoRoot, '.env.example'), 'utf8')

    expect(setup).not.toContain('process.env.E2B_TEMPLATE_ID')
    expect(setup).not.toContain('Required env vars: DATABASE_URL, BOT_TOKEN_ENC_KEY, E2B_TEMPLATE_ID')
    expect(envExample).not.toMatch(/^E2B_TEMPLATE_ID=/m)
  })

  it('prompts for the sandbox template/tool id during setup', () => {
    const setup = readFileSync(resolve(repoRoot, 'scripts/setup.ts'), 'utf8')

    expect(setup).toContain('Enter sandbox template/tool ID')
    expect(setup).toContain('e2bTemplateId: sandboxTemplateId')
  })
})

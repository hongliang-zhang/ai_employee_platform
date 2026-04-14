/**
 * e2e smoke test for doc-gardening sandbox setup.
 *
 * Phase 1 (E2B only): verify sandbox creation + Claude Code is installed.
 * Phase 2 (E2B + Zhipu): verify Claude Code can talk to GLM.
 *
 * Usage:
 *   # Phase 1 only (no Zhipu key needed):
 *   E2B_API_KEY=... tsx scripts/doc-gardening/smoke-test.ts
 *
 *   # Phase 1 + 2:
 *   E2B_API_KEY=... ZHIPU_API_KEY=... tsx scripts/doc-gardening/smoke-test.ts
 */

import { Sandbox } from 'e2b'

const E2B_API_KEY = process.env.E2B_API_KEY
const ZHIPU_API_KEY = process.env.ZHIPU_API_KEY

if (!E2B_API_KEY) {
  console.error('E2B_API_KEY is required')
  process.exit(1)
}

async function run(cmd: string, label: string, sandbox: Awaited<ReturnType<typeof Sandbox.create>>) {
  process.stdout.write(`  ${label}... `)
  const result = await sandbox.commands.run(cmd, { timeoutMs: 60_000 })
  if (result.exitCode !== 0) {
    console.log('❌')
    console.error(`  stdout: ${result.stdout.trim()}`)
    console.error(`  stderr: ${result.stderr.trim()}`)
    throw new Error(`Command failed (exit ${result.exitCode}): ${cmd}`)
  }
  const out = result.stdout.trim()
  console.log(`✅${out ? '  ' + out : ''}`)
  return out
}

console.log('\n🌿 Doc Gardening Smoke Test\n')

// ─── Phase 1: sandbox + Claude Code ───────────────────────────────────────────
console.log('Phase 1: sandbox creation + Claude Code')

const envs: Record<string, string> = {}
if (ZHIPU_API_KEY) {
  envs.ANTHROPIC_AUTH_TOKEN = ZHIPU_API_KEY
  envs.ANTHROPIC_BASE_URL = 'https://open.bigmodel.cn/api/anthropic'
  envs.API_TIMEOUT_MS = '60000'
  envs.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = '1'
}

const sandbox = await Sandbox.create('claude', {
  apiKey: E2B_API_KEY,
  envs,
  timeoutMs: 5 * 60 * 1000,
})
console.log(`  sandbox id: ${sandbox.sandboxId}`)

try {
  await run('claude --version', 'claude --version', sandbox)
  await run('git --version', 'git --version', sandbox)
  console.log('\nPhase 1 ✅  Sandbox OK, Claude Code installed\n')

  // ─── Phase 2: GLM connectivity ──────────────────────────────────────────────
  if (!ZHIPU_API_KEY) {
    console.log('Phase 2: skipped (ZHIPU_API_KEY not set)')
    console.log('\nTo run Phase 2:')
    console.log('  ZHIPU_API_KEY=your_key E2B_API_KEY=... tsx scripts/doc-gardening/smoke-test.ts')
  } else {
    console.log('Phase 2: Claude Code → GLM-5.1 connectivity')
    await run(
      `claude --dangerously-skip-permissions -p "Reply with exactly: SMOKE_OK"`,
      'claude -p "Reply with exactly: SMOKE_OK"',
      sandbox,
    )
    console.log('\nPhase 2 ✅  Claude Code + GLM-5.1 working\n')
  }
} finally {
  await sandbox.kill().catch(() => {})
  console.log('Sandbox killed.')
}

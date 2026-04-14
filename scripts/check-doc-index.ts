/**
 * Verify that every index.md in docs/ correctly lists all sibling .md files.
 *
 * Rule: for any directory containing an index.md, all other .md files in that
 * directory must be referenced via a same-directory relative link (./foo.md)
 * somewhere in the index.
 *
 * Exit 1 on any mismatch — suitable for CI.
 */
import { readdirSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'

const DOCS_DIR = 'docs'

const errors: string[] = []

function checkDirectory(dir: string) {
  const indexPath = join(dir, 'index.md')
  if (!existsSync(indexPath)) return

  const indexContent = readFileSync(indexPath, 'utf-8')

  // Collect same-directory .md links: [text](./foo.md) or [text](./foo.md#anchor)
  const linkedFiles = new Set(
    [...indexContent.matchAll(/\]\(\.\/([^)#]+\.md)/g)].map(m => m[1]),
  )

  // Actual .md files in the directory, excluding index.md itself
  const actualFiles = readdirSync(dir)
    .filter(f => f.endsWith('.md') && f !== 'index.md')

  // Files present but not linked from index
  const missing = actualFiles.filter(f => !linkedFiles.has(f))
  if (missing.length) {
    errors.push(
      `${indexPath}: index is missing entries for: ${missing.join(', ')}`,
    )
  }

  // Files linked but no longer exist
  const stale = [...linkedFiles].filter(f => !actualFiles.includes(f))
  if (stale.length) {
    errors.push(
      `${indexPath}: index references non-existent files: ${stale.join(', ')}`,
    )
  }
}

function walkDirs(dir: string) {
  checkDirectory(dir)
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      walkDirs(join(dir, entry.name))
    }
  }
}

walkDirs(DOCS_DIR)

if (errors.length) {
  console.error('❌ Doc index check failed:\n' + errors.map(e => `  - ${e}`).join('\n'))
  process.exit(1)
}

console.log('✅ All doc indexes are consistent')

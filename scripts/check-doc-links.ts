/**
 * Verify that all relative markdown links in docs/, AGENTS.md, and ARCHITECTURE.md
 * point to files that actually exist.
 *
 * Handles: [text](./foo.md), [text](../bar.md#anchor), [text](./dir/file.md)
 * Ignores: URLs (http/https), absolute paths, mailto:
 *
 * Exit 1 on any broken link — suitable for CI.
 */
import { readdirSync, readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'

const ROOT_FILES = ['AGENTS.md', 'ARCHITECTURE.md']
const DOCS_DIR = 'docs'

const errors: string[] = []

function* walkMarkdown(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) yield* walkMarkdown(full)
    else if (entry.name.endsWith('.md')) yield full
  }
}

// Match relative links: [text](./...) or [text](../...)
const linkRe = /\[([^\]]*)\]\(((\.\/|\.\.\/)[^)]+)\)/g

function checkFile(file: string) {
  const content = readFileSync(file, 'utf-8')
  const dir = dirname(file)

  for (const [, , rawLink] of content.matchAll(linkRe)) {
    // Strip anchor
    const [pathPart] = rawLink.split('#')

    // Skip directory-only links like ./ or ../
    if (pathPart.endsWith('/')) continue

    const target = join(dir, pathPart)

    if (!existsSync(target)) {
      errors.push(`${file}: broken link → ${rawLink}`)
    }
  }
}

// Check root files
for (const rootFile of ROOT_FILES) {
  if (existsSync(rootFile)) {
    checkFile(rootFile)
  }
}

// Check all docs/
for (const file of walkMarkdown(DOCS_DIR)) {
  checkFile(file)
}

if (errors.length) {
  console.error(
    '❌ Doc link check failed:\n' + errors.map(e => `  - ${e}`).join('\n'),
  )
  process.exit(1)
}

console.log('✅ All doc links are valid')

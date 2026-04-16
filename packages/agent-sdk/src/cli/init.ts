#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const TEMPLATES_DIR = join(__dirname, 'templates')

function renderTemplate(content: string, vars: Record<string, string>): string {
  return content.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`)
}

function main() {
  const name = process.argv[2]
  if (!name) {
    console.error('Usage: npx @alexlikevibe/agent-sdk init <project-name>')
    process.exit(1)
  }

  const targetDir = resolve(process.cwd(), name)
  if (existsSync(targetDir)) {
    console.error(`Directory "${name}" already exists.`)
    process.exit(1)
  }

  mkdirSync(join(targetDir, 'src', 'skills'), { recursive: true })

  const vars = { name }
  const files: Array<[string, string]> = [
    ['agent.ts.template', 'src/agent.ts'],
    ['e2b.Dockerfile.template', 'e2b.Dockerfile'],
    ['e2b.toml.template', 'e2b.toml'],
    ['package.json.template', 'package.json'],
    ['tsconfig.json.template', 'tsconfig.json'],
    ['README.md.template', 'README.md'],
  ]

  for (const [template, output] of files) {
    const content = readFileSync(join(TEMPLATES_DIR, template), 'utf-8')
    writeFileSync(join(targetDir, output), renderTemplate(content, vars))
  }

  console.log(`✓ Created ${name}/`)
  console.log(`\nNext steps:`)
  console.log(`  cd ${name}`)
  console.log(`  npm install`)
  console.log(`  ANTHROPIC_API_KEY=sk-ant-... npm run dev`)
}

main()

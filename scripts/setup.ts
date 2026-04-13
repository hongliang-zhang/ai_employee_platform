import { execSync } from 'child_process'
import { createInterface } from 'readline'
import { createId } from '@paralleldrive/cuid2'
import { createCipheriv, randomBytes } from 'crypto'
import { createPrismaClient } from '@aaas/db'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const DATABASE_URL = process.env.DATABASE_URL!
const BOT_TOKEN_ENC_KEY = process.env.BOT_TOKEN_ENC_KEY!
const E2B_TEMPLATE_ID = process.env.E2B_TEMPLATE_ID!

if (!DATABASE_URL || !BOT_TOKEN_ENC_KEY || !E2B_TEMPLATE_ID) {
  console.error('Required env vars: DATABASE_URL, BOT_TOKEN_ENC_KEY, E2B_TEMPLATE_ID')
  process.exit(1)
}

// Run Prisma migrations
console.log('Running migrations...')
const __dirname = dirname(fileURLToPath(import.meta.url))
const schemaPath = resolve(__dirname, '../packages/db/prisma/schema.prisma')
execSync(`pnpm --filter @aaas/db exec prisma migrate deploy --schema=${schemaPath}`, {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL },
})
console.log('Migrations complete.')

// Read bot token from stdin
const rl = createInterface({ input: process.stdin, output: process.stderr })
const botToken: string = await new Promise(resolve => {
  rl.question('Enter Telegram bot token: ', answer => {
    rl.close()
    resolve(answer.trim())
  })
})

function encrypt(plaintext: string, hexKey: string): string {
  const key = Buffer.from(hexKey, 'hex')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv, tag, encrypted].map(b => b.toString('base64')).join(':')
}

const botTokenEnc = encrypt(botToken, BOT_TOKEN_ENC_KEY)

// Seed agent and im_config
const prisma = createPrismaClient(DATABASE_URL)
const agentId = 'agt_' + createId()
const cfgId = 'cfg_' + createId()

await prisma.agent.create({
  data: { id: agentId, name: 'Demo Agent', status: 'active', e2bTemplateId: E2B_TEMPLATE_ID, port: 8080, idleTimeoutMs: 300000 },
})

await prisma.imConfig.create({
  data: { id: cfgId, agentId, platform: 'telegram', botTokenEnc, chatScope: 'all', status: 'active' },
})

await prisma.$disconnect()

console.log(`\nSetup complete.`)
console.log(`  agent_id:   ${agentId}`)
console.log(`  im_config:  ${cfgId}`)
console.log(`  channel_key: im:${cfgId}`)
console.log('\nStart dispatcher and gateway to go live.')

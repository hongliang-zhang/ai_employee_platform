import { execSync } from 'child_process'
import { createInterface } from 'readline'
import { createId } from '@paralleldrive/cuid2'
import { createPrismaClient } from '@aaas/db'
import { createEncryptor } from '../packages/dispatcher/src/encrypt.js'

const DATABASE_URL = process.env.DATABASE_URL!
const BOT_TOKEN_ENC_KEY = process.env.BOT_TOKEN_ENC_KEY!
const E2B_TEMPLATE_ID = process.env.E2B_TEMPLATE_ID!

if (!DATABASE_URL || !BOT_TOKEN_ENC_KEY || !E2B_TEMPLATE_ID) {
  console.error('Required env vars: DATABASE_URL, BOT_TOKEN_ENC_KEY, E2B_TEMPLATE_ID')
  process.exit(1)
}

const enc = createEncryptor(BOT_TOKEN_ENC_KEY)

// Run Prisma migrations
console.log('Running migrations...')
execSync(`pnpm --filter @aaas/db migrate:deploy`, { stdio: 'inherit' })
console.log('Migrations complete.')

const rl = createInterface({ input: process.stdin, output: process.stderr })
const ask = (q: string): Promise<string> =>
  new Promise(resolve => rl.question(q, answer => resolve(answer.trim())))

// Select provider
const provider = await ask('Provider [telegram/feishu]: ')
if (provider !== 'telegram' && provider !== 'feishu') {
  console.error(`Unknown provider: ${provider}`)
  process.exit(1)
}

let credentials: Record<string, string>

if (provider === 'telegram') {
  const botToken = await ask('Enter Telegram bot token: ')
  credentials = { bot_token: botToken }

} else {
  const appId = await ask('Enter Feishu App ID (cli_xxx): ')
  const appSecret = await ask('Enter Feishu App Secret: ')
  credentials = { app_id: appId, app_secret: appSecret }
}

rl.close()

const credentialsEnc = enc.encrypt(JSON.stringify(credentials))

const prisma = createPrismaClient(DATABASE_URL)
const agentId = 'agt_' + createId()
const cfgId = 'cfg_' + createId()

await prisma.agent.create({
  data: { id: agentId, name: 'Demo Agent', status: 'active', e2bTemplateId: E2B_TEMPLATE_ID, port: 8080, idleTimeoutMs: 300000 },
})

await prisma.imConfig.create({
  data: { id: cfgId, agentId, provider, credentialsEnc, chatScope: 'all', status: 'active' },
})

await prisma.$disconnect()

console.log(`\nSetup complete.`)
console.log(`  provider:    ${provider}`)
console.log(`  agent_id:    ${agentId}`)
console.log(`  im_config:   ${cfgId}`)
console.log(`  channel_key: im:${cfgId}`)
console.log('\nStart dispatcher and gateway to go live.')

import postgres from 'postgres'
import { readFileSync } from 'fs'
import { createInterface } from 'readline'
import { createId } from '@paralleldrive/cuid2'
import { createCipheriv, randomBytes } from 'crypto'
import { resolve } from 'path'

const DATABASE_URL = process.env.DATABASE_URL!
const BOT_TOKEN_ENC_KEY = process.env.BOT_TOKEN_ENC_KEY!
const E2B_TEMPLATE_ID = process.env.E2B_TEMPLATE_ID!

if (!DATABASE_URL || !BOT_TOKEN_ENC_KEY || !E2B_TEMPLATE_ID) {
  console.error('Required env vars: DATABASE_URL, BOT_TOKEN_ENC_KEY, E2B_TEMPLATE_ID')
  process.exit(1)
}

const sql = postgres(DATABASE_URL)

// Run migrations (safe to re-run)
console.log('Running migrations...')
const migration = readFileSync(resolve(process.cwd(), 'migrations/001_initial.sql'), 'utf8')
// Wrap each CREATE TABLE/INDEX with IF NOT EXISTS
const safeMigration = migration
  .replace(/CREATE TABLE /g, 'CREATE TABLE IF NOT EXISTS ')
  .replace(/CREATE INDEX /g, 'CREATE INDEX IF NOT EXISTS ')
await sql.unsafe(safeMigration)
console.log('Migrations complete.')

// Read bot token from stdin
const rl = createInterface({ input: process.stdin, output: process.stderr })
const botToken: string = await new Promise(resolve => {
  rl.question('Enter Telegram bot token: ', answer => {
    rl.close()
    resolve(answer.trim())
  })
})

// Encrypt bot token
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
const agentId = 'agt_' + createId()
const cfgId = 'cfg_' + createId()

await sql`
  INSERT INTO agents (id, name, status, e2b_template_id, port, idle_timeout_ms)
  VALUES (${agentId}, 'Demo Agent', 'active', ${E2B_TEMPLATE_ID}, 8080, 300000)`

await sql`
  INSERT INTO im_configs (id, agent_id, platform, bot_token_enc, chat_scope, status)
  VALUES (${cfgId}, ${agentId}, 'telegram', ${botTokenEnc}, 'all', 'active')`

console.log(`\nSetup complete.`)
console.log(`  agent_id:   ${agentId}`)
console.log(`  im_config:  ${cfgId}`)
console.log(`  channel_key: im:${cfgId}`)
console.log('\nStart dispatcher and gateway to go live.')

await sql.end()

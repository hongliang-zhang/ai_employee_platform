import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import postgres from 'postgres'
import { createInboundJobsManager } from '../src/inbound-jobs.js'

const DB_URL = process.env.DATABASE_URL ?? 'postgres://aaas:aaas@localhost:5432/aaas'
const sql = postgres(DB_URL)
const AGENT_ID = 'agt_jobtest'
const CFG_ID = 'cfg_jobtest'
const CONV_ID = 'conv_jobtest'
const INSTANCE_ID = 'dispatcher-test-01'

beforeAll(async () => {
  await sql`INSERT INTO agents (id, name, status, e2b_template_id) VALUES (${AGENT_ID}, 'test', 'active', 'tpl_x') ON CONFLICT DO NOTHING`
  await sql`INSERT INTO conversations (id, agent_id, channel_key, external_chat_id) VALUES (${CONV_ID}, ${AGENT_ID}, ${'im:' + CFG_ID}, '456') ON CONFLICT DO NOTHING`
})
afterAll(async () => {
  await sql`DELETE FROM inbound_jobs WHERE conversation_id = ${CONV_ID}`
  await sql`DELETE FROM conversations WHERE id = ${CONV_ID}`
  await sql`DELETE FROM agents WHERE id = ${AGENT_ID}`
  await sql.end()
})
beforeEach(async () => {
  await sql`DELETE FROM inbound_jobs WHERE conversation_id = ${CONV_ID}`
})

describe('InboundJobsManager', () => {
  it('inserts a new job and returns true', async () => {
    const mgr = createInboundJobsManager(sql, INSTANCE_ID)
    const inserted = await mgr.tryInsert(`im:${CFG_ID}`, 'ext_msg_1', CONV_ID)
    expect(inserted).toBe(true)
  })

  it('returns false on duplicate (dedup)', async () => {
    const mgr = createInboundJobsManager(sql, INSTANCE_ID)
    await mgr.tryInsert(`im:${CFG_ID}`, 'ext_msg_2', CONV_ID)
    const inserted = await mgr.tryInsert(`im:${CFG_ID}`, 'ext_msg_2', CONV_ID)
    expect(inserted).toBe(false)
  })

  it('marks job as processing', async () => {
    const mgr = createInboundJobsManager(sql, INSTANCE_ID)
    await mgr.tryInsert(`im:${CFG_ID}`, 'ext_msg_3', CONV_ID)
    await mgr.markProcessing(`im:${CFG_ID}`, 'ext_msg_3')
    const [row] = await sql`SELECT status FROM inbound_jobs WHERE channel_key = ${'im:' + CFG_ID} AND external_message_id = 'ext_msg_3'`
    expect(row.status).toBe('processing')
  })

  it('marks job as done', async () => {
    const mgr = createInboundJobsManager(sql, INSTANCE_ID)
    await mgr.tryInsert(`im:${CFG_ID}`, 'ext_msg_4', CONV_ID)
    await mgr.markDone(`im:${CFG_ID}`, 'ext_msg_4')
    const [row] = await sql`SELECT status FROM inbound_jobs WHERE channel_key = ${'im:' + CFG_ID} AND external_message_id = 'ext_msg_4'`
    expect(row.status).toBe('done')
  })

  it('marks job as failed', async () => {
    const mgr = createInboundJobsManager(sql, INSTANCE_ID)
    await mgr.tryInsert(`im:${CFG_ID}`, 'ext_msg_5', CONV_ID)
    await mgr.markFailed(`im:${CFG_ID}`, 'ext_msg_5')
    const [row] = await sql`SELECT status FROM inbound_jobs WHERE channel_key = ${'im:' + CFG_ID} AND external_message_id = 'ext_msg_5'`
    expect(row.status).toBe('failed')
  })
})

import express from 'express'
import pino from 'pino'
import { createDb } from './db.js'
import { createAuthMiddleware } from './auth.js'
import { createEventsRouter } from './routes/events.js'
import { createLlmRouter } from './routes/llm.js'
import { createS3Service } from './s3.js'
import { createStorageRouter } from './routes/storage.js'
import { createActionsRouter } from './routes/actions.js'

export const logger = pino({ transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined })

const PORT = parseInt(process.env.PORT ?? '3001')
const DATABASE_URL = process.env.DATABASE_URL!
const JWT_SECRET = process.env.JWT_SECRET!
const LLM_API_KEY = process.env.LLM_API_KEY!
const S3_ENDPOINT = process.env.S3_ENDPOINT
const S3_BUCKET = process.env.S3_BUCKET
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY
const S3_SECRET_KEY = process.env.S3_SECRET_KEY
const S3_REGION = process.env.S3_REGION ?? 'us-east-1'
const ACTIONS_SERVICE_URL = process.env.ACTIONS_SERVICE_URL ?? 'http://localhost:3002'
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY ?? ''

export const db = createDb(DATABASE_URL)
export const auth = createAuthMiddleware(JWT_SECRET)

const app = express()
app.use(express.json())

app.get('/health', (_req, res) => { res.json({ ok: true }) })

app.use('/gateway/events', auth, createEventsRouter(db))
app.use('/gateway/llm', auth, createLlmRouter(LLM_API_KEY))

if (S3_ENDPOINT && S3_BUCKET && S3_ACCESS_KEY && S3_SECRET_KEY) {
  const s3 = createS3Service({
    endpoint: S3_ENDPOINT,
    bucket: S3_BUCKET,
    accessKey: S3_ACCESS_KEY,
    secretKey: S3_SECRET_KEY,
    region: S3_REGION,
  })
  app.use('/gateway/storage', auth, createStorageRouter(s3))
}

app.use('/gateway/actions', auth, createActionsRouter(ACTIONS_SERVICE_URL, INTERNAL_API_KEY))

// Only start server when run directly (not imported by tests)
if (process.env.VITEST === undefined) {
  app.listen(PORT, () => {
    logger.info({ port: PORT }, 'gateway started')
  })
}

export default app

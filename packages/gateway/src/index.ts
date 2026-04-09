import express from 'express'
import pino from 'pino'
import { createDb } from './db.js'
import { createAuthMiddleware } from './auth.js'
import { createMessagesRouter } from './routes/messages.js'
import { createLlmRouter } from './routes/llm.js'

export const logger = pino({ transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined })

const PORT = parseInt(process.env.PORT ?? '3001')
const DATABASE_URL = process.env.DATABASE_URL!
const JWT_SECRET = process.env.JWT_SECRET!
const LLM_API_KEY = process.env.LLM_API_KEY!

export const db = createDb(DATABASE_URL)
export const auth = createAuthMiddleware(JWT_SECRET)

const app = express()
app.use(express.json())

app.get('/health', (_req, res) => { res.json({ ok: true }) })

app.use('/gateway/messages', auth, createMessagesRouter(db))
app.use('/gateway/llm', auth, createLlmRouter(LLM_API_KEY))

app.listen(PORT, () => {
  logger.info({ port: PORT }, 'gateway started')
})

export default app

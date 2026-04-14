import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import express from 'express'
import { createAuthMiddleware } from '../src/auth.js'
import { createStorageRouter } from '../src/routes/storage.js'
import type { S3Service } from '../src/s3.js'

const SECRET = 'test-secret-32-chars-minimum-len'

function sandboxToken(convId: string, agentId: string) {
  return jwt.sign({ conversation_id: convId, agent_id: agentId, caller: 'sandbox' }, SECRET, { expiresIn: '24h' })
}

const AGENT_ID = 'agt_stor01'
const CONV_ID = 'conv_stor01'
const TOKEN = sandboxToken(CONV_ID, AGENT_ID)

function createMockS3(): S3Service {
  return {
    presignUpload: vi.fn().mockResolvedValue('https://s3.example.com/upload?sig=abc'),
    presignDownload: vi.fn().mockResolvedValue('https://s3.example.com/download?sig=xyz'),
    listObjects: vi.fn().mockResolvedValue([
      { key: `agents/${AGENT_ID}/shared/SOUL.md`, size: 1024, lastModified: '2026-04-14T10:00:00Z' },
    ]),
  }
}

function createTestApp(s3: S3Service) {
  const app = express()
  app.use(express.json())
  app.use('/gateway/storage', createAuthMiddleware(SECRET), createStorageRouter(s3))
  return app
}

describe('POST /gateway/storage/presign', () => {
  let s3: S3Service
  let app: ReturnType<typeof express>

  beforeEach(() => {
    s3 = createMockS3()
    app = createTestApp(s3)
  })

  it('generates upload presigned URL for shared path', async () => {
    const res = await request(app)
      .post('/gateway/storage/presign')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ operations: [{ action: 'upload', path: 'shared/SOUL.md' }] })

    expect(res.status).toBe(200)
    expect(res.body.urls).toHaveLength(1)
    expect(res.body.urls[0].path).toBe('shared/SOUL.md')
    expect(res.body.urls[0].url).toContain('https://')
    expect(res.body.urls[0].expires_in).toBe(3600)
    expect(s3.presignUpload).toHaveBeenCalledWith(`agents/${AGENT_ID}/shared/SOUL.md`)
  })

  it('generates download presigned URL for conversation path', async () => {
    const res = await request(app)
      .post('/gateway/storage/presign')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ operations: [{ action: 'download', path: 'conversation/scratch/draft.md' }] })

    expect(res.status).toBe(200)
    expect(s3.presignDownload).toHaveBeenCalledWith(`agents/${AGENT_ID}/conversations/${CONV_ID}/scratch/draft.md`)
  })

  it('handles multiple operations in one request', async () => {
    const res = await request(app)
      .post('/gateway/storage/presign')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({
        operations: [
          { action: 'upload', path: 'shared/SOUL.md' },
          { action: 'download', path: 'conversation/session.md' },
        ],
      })

    expect(res.status).toBe(200)
    expect(res.body.urls).toHaveLength(2)
  })

  it('rejects path traversal', async () => {
    const res = await request(app)
      .post('/gateway/storage/presign')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ operations: [{ action: 'upload', path: 'shared/../../../etc/passwd' }] })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('invalid_path')
  })

  it('rejects invalid prefix', async () => {
    const res = await request(app)
      .post('/gateway/storage/presign')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ operations: [{ action: 'upload', path: 'other/file.md' }] })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('invalid_path')
  })

  it('rejects invalid action', async () => {
    const res = await request(app)
      .post('/gateway/storage/presign')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ operations: [{ action: 'delete', path: 'shared/SOUL.md' }] })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('invalid_request')
  })

  it('rejects empty operations', async () => {
    const res = await request(app)
      .post('/gateway/storage/presign')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ operations: [] })

    expect(res.status).toBe(400)
  })

  it('rejects unauthenticated requests', async () => {
    const res = await request(app)
      .post('/gateway/storage/presign')
      .send({ operations: [{ action: 'upload', path: 'shared/SOUL.md' }] })

    expect(res.status).toBe(401)
  })
})

describe('POST /gateway/storage/list', () => {
  let s3: S3Service
  let app: ReturnType<typeof express>

  beforeEach(() => {
    s3 = createMockS3()
    app = createTestApp(s3)
  })

  it('lists files under shared prefix', async () => {
    const res = await request(app)
      .post('/gateway/storage/list')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ prefix: 'shared' })

    expect(res.status).toBe(200)
    expect(res.body.files).toHaveLength(1)
    expect(res.body.files[0].path).toBe('shared/SOUL.md')
    expect(res.body.files[0].size).toBe(1024)
    expect(s3.listObjects).toHaveBeenCalledWith(`agents/${AGENT_ID}/shared/`)
  })

  it('lists files under conversation prefix', async () => {
    const res = await request(app)
      .post('/gateway/storage/list')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ prefix: 'conversation' })

    expect(res.status).toBe(200)
    expect(s3.listObjects).toHaveBeenCalledWith(`agents/${AGENT_ID}/conversations/${CONV_ID}/`)
  })

  it('rejects invalid prefix', async () => {
    const res = await request(app)
      .post('/gateway/storage/list')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ prefix: 'other' })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('invalid_request')
  })
})

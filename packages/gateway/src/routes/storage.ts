import { Router } from 'express'
import type { S3Service } from '../s3.js'

function validatePath(path: string): { valid: boolean; error?: string } {
  if (!path.startsWith('shared/') && !path.startsWith('conversation/')) {
    return { valid: false, error: `path must start with 'shared/' or 'conversation/'` }
  }
  if (path.includes('..')) {
    return { valid: false, error: 'path traversal not allowed' }
  }
  if (path.endsWith('/')) {
    return { valid: false, error: 'path must not end with /' }
  }
  return { valid: true }
}

function resolveS3Key(
  relativePath: string,
  agentId: string,
  conversationId: string
): string {
  if (relativePath.startsWith('shared/')) {
    return `agents/${agentId}/${relativePath}`
  }
  // conversation/* → agents/{agent_id}/conversations/{conv_id}/*
  const subPath = relativePath.slice('conversation/'.length)
  return `agents/${agentId}/conversations/${conversationId}/${subPath}`
}

function stripS3Prefix(
  s3Key: string,
  agentId: string,
  conversationId: string,
  prefix: 'shared' | 'conversation'
): string {
  if (prefix === 'shared') {
    return s3Key.slice(`agents/${agentId}/`.length)
  }
  return 'conversation/' + s3Key.slice(`agents/${agentId}/conversations/${conversationId}/`.length)
}

export function createStorageRouter(s3: S3Service) {
  const router = Router()

  router.post('/presign', async (req, res) => {
    const { conversation_id, agent_id } = req.jwtPayload
    const { operations } = req.body ?? {}

    if (!Array.isArray(operations) || operations.length === 0) {
      res.status(400).json({
        error: { code: 'invalid_request', message: 'operations must be a non-empty array', retryable: false, details: {} },
      })
      return
    }

    if (operations.length > 100) {
      res.status(400).json({
        error: { code: 'invalid_request', message: 'max 100 operations per request', retryable: false, details: {} },
      })
      return
    }

    try {
      const urls = []
      for (const op of operations) {
        if (!op.action || !op.path) {
          res.status(400).json({
            error: { code: 'invalid_request', message: 'each operation must have action and path', retryable: false, details: {} },
          })
          return
        }

        const validation = validatePath(op.path)
        if (!validation.valid) {
          res.status(400).json({
            error: { code: 'invalid_path', message: validation.error!, retryable: false, details: { path: op.path } },
          })
          return
        }

        const s3Key = resolveS3Key(op.path, agent_id, conversation_id)

        let url: string
        if (op.action === 'upload') {
          url = await s3.presignUpload(s3Key)
        } else if (op.action === 'download') {
          url = await s3.presignDownload(s3Key)
        } else {
          res.status(400).json({
            error: { code: 'invalid_request', message: `action must be 'upload' or 'download'`, retryable: false, details: {} },
          })
          return
        }

        urls.push({ path: op.path, url, expires_in: 3600 })
      }
      res.json({ urls })
    } catch (err) {
      res.status(500).json({
        error: { code: 's3_error', message: String(err), retryable: true, details: {} },
      })
    }
  })

  router.post('/list', async (req, res) => {
    const { conversation_id, agent_id } = req.jwtPayload
    const { prefix } = req.body ?? {}

    if (prefix !== 'shared' && prefix !== 'conversation') {
      res.status(400).json({
        error: { code: 'invalid_request', message: `prefix must be 'shared' or 'conversation'`, retryable: false, details: {} },
      })
      return
    }

    try {
      const s3Prefix = prefix === 'shared'
        ? `agents/${agent_id}/shared/`
        : `agents/${agent_id}/conversations/${conversation_id}/`

      const objects = await s3.listObjects(s3Prefix)
      const files = objects.map(obj => ({
        path: stripS3Prefix(obj.key, agent_id, conversation_id, prefix),
        size: obj.size,
        last_modified: obj.lastModified,
      }))

      res.json({ files })
    } catch (err) {
      res.status(500).json({
        error: { code: 's3_error', message: String(err), retryable: true, details: {} },
      })
    }
  })

  return router
}

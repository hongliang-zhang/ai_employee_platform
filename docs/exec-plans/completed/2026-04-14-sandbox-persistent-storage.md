<!-- DOC-GARDENING-FLAG: Implementation divergence detected. This active plan should not be executed as-is. It describes a Python file_sync.py under the removed demo-agent package, while the current implementation is TypeScript file sync in agent-sdk (packages/agent-sdk/src/file-sync.ts) plus gateway storage routes (/gateway/storage/presign and /gateway/storage/list). Re-evaluate whether this plan should be rewritten around agent-sdk/external runtimes or moved out of active/. -->
# Sandbox Persistent File Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give sandbox agents a `/persistent/` directory that transparently syncs to S3-compatible object storage via presigned URLs issued by gateway. No cloud credentials enter the sandbox.

**Architecture:** Gateway gets two new routes (`/storage/presign`, `/storage/list`) that generate presigned S3 URLs scoped to the requesting agent/conversation. A Python file sync daemon (`file_sync.py`) runs inside the sandbox, downloading existing files on startup and periodically uploading changes. Dispatcher orchestrates the startup sequence: init sync → start watch daemon → start agent.

**Tech Stack:** `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` (S3-compatible, works with Tencent COS), Python `requests` (already in demo-agent), `vitest` + `supertest` for gateway tests.

**Spec:** `docs/product-specs/sandbox-persistent-storage.md`

---

## File Map

```
packages/
  gateway/
    src/
      routes/
        storage.ts          # NEW — /storage/presign and /storage/list routes
      s3.ts                 # NEW — S3 client wrapper (presign + list operations)
    tests/
      storage.test.ts       # NEW — integration tests for storage routes
  demo-agent/
    file_sync.py            # NEW — init + watch subcommands
    e2b.Dockerfile          # MODIFY — copy file_sync.py into template
  dispatcher/
    src/
      sandbox.ts            # MODIFY — add file sync init + watch to startup
.env.example                # MODIFY — add S3 env vars
docs/
  product-specs/
    sandbox-persistent-storage.md  # already exists (spec)
```

---

## Task 1: Gateway S3 Client (`s3.ts`)

**Files:**
- Create: `packages/gateway/src/s3.ts`

- [ ] **Step 1: Install S3 SDK dependencies**

```bash
cd packages/gateway
pnpm add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

- [ ] **Step 2: Implement S3 client wrapper**

Create `packages/gateway/src/s3.ts`:

```typescript
import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

export interface S3Config {
  endpoint: string
  bucket: string
  accessKey: string
  secretKey: string
  region: string
}

export function createS3Service(config: S3Config) {
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKey,
      secretAccessKey: config.secretKey,
    },
    forcePathStyle: true, // required for some S3-compatible providers
  })

  return {
    async presignUpload(key: string, expiresIn = 3600): Promise<string> {
      const command = new PutObjectCommand({ Bucket: config.bucket, Key: key })
      return getSignedUrl(client, command, { expiresIn })
    },

    async presignDownload(key: string, expiresIn = 3600): Promise<string> {
      const command = new GetObjectCommand({ Bucket: config.bucket, Key: key })
      return getSignedUrl(client, command, { expiresIn })
    },

    async listObjects(prefix: string): Promise<Array<{ key: string; size: number; lastModified: string }>> {
      const results: Array<{ key: string; size: number; lastModified: string }> = []
      let continuationToken: string | undefined

      do {
        const command = new ListObjectsV2Command({
          Bucket: config.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        })
        const response = await client.send(command)
        for (const obj of response.Contents ?? []) {
          if (obj.Key && obj.Size !== undefined && obj.LastModified) {
            results.push({
              key: obj.Key,
              size: obj.Size,
              lastModified: obj.LastModified.toISOString(),
            })
          }
        }
        continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined
      } while (continuationToken)

      return results
    },
  }
}

export type S3Service = ReturnType<typeof createS3Service>
```

- [ ] **Step 3: Commit**

```bash
git add packages/gateway/src/s3.ts packages/gateway/package.json pnpm-lock.yaml
git commit -m "feat(gateway): add S3 client wrapper for presigned URLs"
```

---

## Task 2: Gateway Storage Routes (`storage.ts`)

**Files:**
- Create: `packages/gateway/src/routes/storage.ts`
- Modify: `packages/gateway/src/index.ts`

- [ ] **Step 1: Implement storage routes**

Create `packages/gateway/src/routes/storage.ts`:

```typescript
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
        : `agents/${agent_id}/conversations/${conversationId}/`

      const objects = await s3.listObjects(s3Prefix)
      const files = objects.map(obj => ({
        path: stripS3Prefix(obj.key, agentId, conversationId, prefix),
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
```

- [ ] **Step 2: Wire storage routes into gateway index.ts**

Modify `packages/gateway/src/index.ts` — add these lines:

After the existing imports, add:
```typescript
import { createS3Service } from './s3.js'
import { createStorageRouter } from './routes/storage.js'
```

After the existing env var declarations (`LLM_API_KEY`), add:
```typescript
const S3_ENDPOINT = process.env.S3_ENDPOINT
const S3_BUCKET = process.env.S3_BUCKET
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY
const S3_SECRET_KEY = process.env.S3_SECRET_KEY
const S3_REGION = process.env.S3_REGION ?? 'us-east-1'
```

After the existing `app.use('/gateway/llm', ...)` line, add:
```typescript
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
```

- [ ] **Step 3: Commit**

```bash
git add packages/gateway/src/routes/storage.ts packages/gateway/src/index.ts
git commit -m "feat(gateway): add /storage/presign and /storage/list routes"
```

---

## Task 3: Gateway Storage Route Tests

**Files:**
- Create: `packages/gateway/tests/storage.test.ts`

- [ ] **Step 1: Write storage route tests**

Create `packages/gateway/tests/storage.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
cd packages/gateway && pnpm test -- storage
```

Expected: All tests PASS (mock-based, no real S3 or DB needed).

- [ ] **Step 3: Commit**

```bash
git add packages/gateway/tests/storage.test.ts
git commit -m "test(gateway): add storage route tests with mock S3"
```

---

## Task 4: File Sync Daemon (`file_sync.py`)

**Files:**
- Create: `packages/demo-agent/file_sync.py`

- [ ] **Step 1: Implement file sync daemon**

Create `packages/demo-agent/file_sync.py`:

```python
#!/usr/bin/env python3
"""
File sync daemon for sandbox persistent storage.

Usage:
  file_sync.py init    — download existing files from S3 to /persistent/
  file_sync.py watch   — poll for changes every 10s and upload to S3
"""

import os
import sys
import time
import hashlib
import logging
import requests
from pathlib import Path
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
logger = logging.getLogger('file_sync')

PERSISTENT_ROOT = Path('/persistent')
POLL_INTERVAL = 10  # seconds

GATEWAY_URL = os.environ.get('GATEWAY_URL', '').rstrip('/')
SESSION_TOKEN = os.environ.get('SESSION_TOKEN', '')


def create_session() -> requests.Session:
    session = requests.Session()
    retry = Retry(total=3, backoff_factor=1, status_forcelist=[502, 503, 504])
    adapter = HTTPAdapter(max_retries=retry)
    session.mount('https://', adapter)
    session.mount('http://', adapter)
    return session


def headers() -> dict:
    return {'Authorization': f'Bearer {SESSION_TOKEN}', 'Content-Type': 'application/json'}


def list_remote_files(session: requests.Session, prefix: str) -> list:
    """List files on S3 under a given prefix ('shared' or 'conversation')."""
    resp = session.post(
        f'{GATEWAY_URL}/gateway/storage/list',
        json={'prefix': prefix},
        headers=headers(),
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json().get('files', [])


def get_presigned_urls(session: requests.Session, operations: list) -> list:
    """Get presigned URLs for upload/download operations."""
    if not operations:
        return []
    resp = session.post(
        f'{GATEWAY_URL}/gateway/storage/presign',
        json={'operations': operations},
        headers=headers(),
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json().get('urls', [])


def download_file(session: requests.Session, url: str, local_path: Path):
    """Download a file from a presigned URL."""
    local_path.parent.mkdir(parents=True, exist_ok=True)
    resp = session.get(url, timeout=60)
    resp.raise_for_status()
    local_path.write_bytes(resp.content)
    logger.info(f'Downloaded: {local_path} ({len(resp.content)} bytes)')


def upload_file(session: requests.Session, url: str, local_path: Path):
    """Upload a file to a presigned URL."""
    data = local_path.read_bytes()
    resp = session.put(url, data=data, timeout=60)
    resp.raise_for_status()
    logger.info(f'Uploaded: {local_path} ({len(data)} bytes)')


def init():
    """Download all existing files from S3 to /persistent/."""
    logger.info('Starting file sync init...')
    session = create_session()

    PERSISTENT_ROOT.mkdir(parents=True, exist_ok=True)
    (PERSISTENT_ROOT / 'shared').mkdir(exist_ok=True)
    (PERSISTENT_ROOT / 'conversation').mkdir(exist_ok=True)

    total = 0
    for prefix in ('shared', 'conversation'):
        files = list_remote_files(session, prefix)
        if not files:
            logger.info(f'No existing files under {prefix}/')
            continue

        # Batch get download URLs
        operations = [{'action': 'download', 'path': f['path']} for f in files]
        urls = get_presigned_urls(session, operations)

        for url_entry in urls:
            local_path = PERSISTENT_ROOT / url_entry['path']
            download_file(session, url_entry['url'], local_path)
            total += 1

    logger.info(f'Init complete. Downloaded {total} files.')


def scan_files() -> dict:
    """Scan /persistent/ and return {relative_path: mtime} for all files."""
    result = {}
    for file_path in PERSISTENT_ROOT.rglob('*'):
        if file_path.is_file():
            rel = str(file_path.relative_to(PERSISTENT_ROOT))
            result[rel] = file_path.stat().st_mtime
    return result


def watch():
    """Poll for file changes and upload to S3."""
    logger.info(f'Starting file sync watch (poll every {POLL_INTERVAL}s)...')
    session = create_session()

    # Establish baseline
    baseline = scan_files()
    logger.info(f'Baseline: {len(baseline)} files')

    while True:
        time.sleep(POLL_INTERVAL)
        try:
            current = scan_files()

            # Find new or modified files
            changed = []
            for path, mtime in current.items():
                if path not in baseline or mtime > baseline[path]:
                    changed.append(path)

            if not changed:
                continue

            # Batch get upload URLs
            operations = [{'action': 'upload', 'path': p} for p in changed]

            # Upload in batches of 100
            for i in range(0, len(operations), 100):
                batch = operations[i:i+100]
                urls = get_presigned_urls(session, batch)
                for url_entry in urls:
                    local_path = PERSISTENT_ROOT / url_entry['path']
                    if local_path.exists():
                        try:
                            upload_file(session, url_entry['url'], local_path)
                        except Exception as e:
                            logger.warning(f'Failed to upload {url_entry["path"]}: {e}')

                            size = local_path.stat().st_size
                            if size > 10 * 1024 * 1024:
                                logger.warning(f'Large file warning: {url_entry["path"]} is {size} bytes')

            # Update baseline with successfully synced files
            baseline = scan_files()
            logger.info(f'Synced {len(changed)} changed files')

        except Exception as e:
            logger.warning(f'Sync cycle failed: {e}')


def main():
    if len(sys.argv) < 2:
        print('Usage: file_sync.py [init|watch]', file=sys.stderr)
        sys.exit(1)

    if not GATEWAY_URL or not SESSION_TOKEN:
        logger.error('GATEWAY_URL and SESSION_TOKEN must be set')
        sys.exit(1)

    command = sys.argv[1]
    if command == 'init':
        init()
    elif command == 'watch':
        watch()
    else:
        print(f'Unknown command: {command}', file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
```

- [ ] **Step 2: Commit**

```bash
git add packages/demo-agent/file_sync.py
git commit -m "feat(demo-agent): add file sync daemon for persistent storage"
```

---

## Task 5: Update e2b Dockerfile

**Files:**
- Modify: `packages/demo-agent/e2b.Dockerfile`

- [ ] **Step 1: Add file_sync.py to Dockerfile**

Update `packages/demo-agent/e2b.Dockerfile` to copy `file_sync.py` and create the `/persistent` directory:

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY gateway_client.py .
COPY app.py .
COPY file_sync.py .
RUN mkdir -p /persistent/shared /persistent/conversation
```

- [ ] **Step 2: Commit**

```bash
git add packages/demo-agent/e2b.Dockerfile
git commit -m "feat(demo-agent): include file_sync.py in e2b template"
```

---

## Task 6: Update Dispatcher Sandbox Startup

**Files:**
- Modify: `packages/dispatcher/src/sandbox.ts`

- [ ] **Step 1: Add file sync init + watch to sandbox startup**

In `packages/dispatcher/src/sandbox.ts`, modify the `getOrCreate` method. Replace the existing block that starts Flask with the following sequence:

Find this block (the `startCmd` and `flaskStart` section):
```typescript
      // Start Flask app with env vars via nohup — e2b start command does not receive envs
      const startCmd = `nohup bash -c 'GATEWAY_URL=${config.gatewayUrl} SESSION_TOKEN=${sessionToken} SESSION_ID=${conversationId} python /app/app.py' > /tmp/flask.log 2>&1 &`
      const flaskStart = Date.now()
      await sandbox.commands.run(startCmd, { timeoutMs: 10000 })
      logger.info({ event: 'sandbox.flask_started', conversation_id: conversationId, sandbox_id: sandbox.sandboxId, duration_ms: Date.now() - flaskStart })
```

Replace with:
```typescript
      const envPrefix = `GATEWAY_URL=${config.gatewayUrl} SESSION_TOKEN=${sessionToken} SESSION_ID=${conversationId}`

      // File sync: download existing persistent files from S3
      const syncInitStart = Date.now()
      const syncInitResult = await sandbox.commands.run(
        `${envPrefix} python /app/file_sync.py init`,
        { timeoutMs: 60000 }
      )
      if (syncInitResult.exitCode !== 0) {
        logger.error({ event: 'sandbox.file_sync_init_failed', conversation_id: conversationId, sandbox_id: sandbox.sandboxId, stderr: syncInitResult.stderr })
        await sandbox.kill().catch(() => {})
        throw new Error('file sync init failed')
      }
      logger.info({ event: 'sandbox.file_sync_init', conversation_id: conversationId, sandbox_id: sandbox.sandboxId, duration_ms: Date.now() - syncInitStart })

      // File sync: start background watcher
      await sandbox.commands.run(
        `nohup bash -c '${envPrefix} python /app/file_sync.py watch' > /tmp/file_sync.log 2>&1 &`,
        { timeoutMs: 5000 }
      )
      logger.info({ event: 'sandbox.file_sync_watch_started', conversation_id: conversationId, sandbox_id: sandbox.sandboxId })

      // Start Flask app
      const startCmd = `nohup bash -c '${envPrefix} python /app/app.py' > /tmp/flask.log 2>&1 &`
      const flaskStart = Date.now()
      await sandbox.commands.run(startCmd, { timeoutMs: 10000 })
      logger.info({ event: 'sandbox.flask_started', conversation_id: conversationId, sandbox_id: sandbox.sandboxId, duration_ms: Date.now() - flaskStart })
```

- [ ] **Step 2: Commit**

```bash
git add packages/dispatcher/src/sandbox.ts
git commit -m "feat(dispatcher): add file sync init + watch to sandbox startup"
```

---

## Task 7: Update Environment Config and Docs

**Files:**
- Modify: `.env.example`
- Modify: `docs/product-specs/sandbox-persistent-storage.md` (mark as implemented)
- Modify: `ARCHITECTURE.md` (document storage routes)

- [ ] **Step 1: Add S3 env vars to .env.example**

Append to `.env.example` after the existing dispatcher section:

```
# ── Object Storage (S3-compatible) ────────────────────────────────────────────
# Used by gateway for agent persistent file storage.
# Supports any S3-compatible provider: AWS S3, Tencent Cloud COS, Cloudflare R2.
# Leave unset to disable persistent storage.
S3_ENDPOINT=https://cos.ap-guangzhou.myqcloud.com
S3_BUCKET=z-mono-agent-storage
S3_ACCESS_KEY=AKIDxxxxxxxx
S3_SECRET_KEY=xxxxxxxx
S3_REGION=ap-guangzhou
```

- [ ] **Step 2: Update ARCHITECTURE.md**

Add to the gateway service section in `ARCHITECTURE.md`, after the existing routes:

```
- `POST /gateway/storage/presign` — generate presigned S3 URLs for file upload/download (scoped to agent/conversation)
- `POST /gateway/storage/list` — list files under agent's shared or conversation prefix
```

Add a new subsection after "Optimistic concurrency on message history":

```
## Persistent file storage

Sandbox agents can read and write files in `/persistent/` inside the sandbox. A background daemon (`file_sync.py`) syncs these files to S3-compatible storage via presigned URLs issued by gateway. The sandbox never holds S3 credentials.

Storage layout: `agents/{agent_id}/shared/` (cross-conversation) and `agents/{agent_id}/conversations/{conv_id}/` (conversation-scoped). See `docs/product-specs/sandbox-persistent-storage.md` for full design.
```

- [ ] **Step 3: Update SECURITY.md**

Add `S3_ACCESS_KEY` / `S3_SECRET_KEY` to the credential table:

```
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | gateway env | Never reaches sandbox (presigned URLs used instead) |
```

- [ ] **Step 4: Commit**

```bash
git add .env.example ARCHITECTURE.md docs/SECURITY.md
git commit -m "docs: update env, architecture, and security for persistent storage"
```

---

## Task 8: End-to-End Manual Verification

- [ ] **Step 1: Run gateway tests**

```bash
cd packages/gateway && pnpm test
```

Expected: All tests pass, including new storage tests.

- [ ] **Step 2: Run dispatcher tests (if any)**

```bash
cd packages/dispatcher && pnpm test
```

Expected: Existing tests still pass.

- [ ] **Step 3: Rebuild e2b template (manual)**

```bash
cd packages/demo-agent && e2b template build
```

Note: This requires `e2b` CLI and `E2B_API_KEY`. Update `e2b.toml` with the new template ID.

- [ ] **Step 4: Manual integration test**

1. Set S3 env vars in `.env`
2. Start gateway: `cd packages/gateway && pnpm dev`
3. Start dispatcher: `cd packages/dispatcher && pnpm dev`
4. Send a Telegram message — verify sandbox starts, file sync init runs
5. In agent code, write to `/persistent/shared/SOUL.md` — verify it appears in S3 after ~10s
6. Kill sandbox (idle timeout) → send another message → verify `/persistent/shared/SOUL.md` is restored

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: sandbox persistent file storage via presigned URLs"
```

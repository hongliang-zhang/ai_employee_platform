import { mkdirSync, mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FileSync } from '../src/file-sync.js'
import type { GatewayClient } from '../src/gateway-client.js'

describe('FileSync', () => {
  let tmpDir: string
  let mockGateway: GatewayClient

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'file-sync-test-'))
    mkdirSync(join(tmpDir, 'shared'), { recursive: true })
    mkdirSync(join(tmpDir, 'conversation'), { recursive: true })

    mockGateway = {
      listFiles: vi.fn(),
      presignUrls: vi.fn(),
      appendMessages: vi.fn(),
    } as any
  })

  it('init: downloads files listed by gateway', async () => {
    vi.mocked(mockGateway.listFiles).mockImplementation(async (prefix) => {
      if (prefix === 'shared') return [{ path: 'shared/SOUL.md', size: 10, last_modified: '' }]
      return []
    })
    vi.mocked(mockGateway.presignUrls).mockResolvedValue([
      { path: 'shared/SOUL.md', url: 'https://s3/presigned', expires_in: 3600 },
    ])

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => Buffer.from('# SOUL').buffer,
    })
    global.fetch = fetchMock

    const sync = new FileSync(mockGateway, tmpDir)
    await sync.init()

    expect(mockGateway.listFiles).toHaveBeenCalledWith('shared')
    expect(mockGateway.listFiles).toHaveBeenCalledWith('conversation')
    expect(mockGateway.presignUrls).toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledWith('https://s3/presigned')
  })

  it('watch: detects new files and uploads', async () => {
    vi.mocked(mockGateway.presignUrls).mockResolvedValue([
      { path: 'shared/new.md', url: 'https://s3/upload', expires_in: 3600 },
    ])
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    global.fetch = fetchMock

    const sync = new FileSync(mockGateway, tmpDir, 50) // 50ms poll interval

    sync.startWatch()

    await new Promise((r) => setTimeout(r, 10))
    writeFileSync(join(tmpDir, 'shared', 'new.md'), '# new')

    await new Promise((r) => setTimeout(r, 150))
    sync.stopWatch()

    expect(fetchMock).toHaveBeenCalledWith('https://s3/upload', expect.objectContaining({ method: 'PUT' }))
  })
})

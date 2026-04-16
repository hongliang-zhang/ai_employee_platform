import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { join, relative } from 'path'
import type { GatewayClient } from './gateway-client.js'
import { logger } from './logger.js'
const POLL_INTERVAL_MS = 10_000

export class FileSync {
  private baseline = new Map<string, number>() // relative path → mtime
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(
    private readonly gateway: GatewayClient,
    private readonly root: string,
    private readonly pollIntervalMs: number = POLL_INTERVAL_MS,
  ) {}

  async init(): Promise<void> {
    mkdirSync(join(this.root, 'shared'), { recursive: true })
    mkdirSync(join(this.root, 'conversation'), { recursive: true })

    // Fetch both prefixes in parallel
    const [sharedFiles, conversationFiles] = await Promise.all([
      this.gateway.listFiles('shared'),
      this.gateway.listFiles('conversation'),
    ])

    const allFiles = [
      ...sharedFiles,
      ...conversationFiles,
    ]

    if (allFiles.length > 0) {
      const ops = allFiles.map((f) => ({ action: 'download' as const, path: f.path }))
      const urls = await this.gateway.presignUrls(ops)

      for (const { path, url } of urls) {
        const localPath = join(this.root, path)
        mkdirSync(join(localPath, '..'), { recursive: true })
        const res = await fetch(url)
        if (!res.ok) {
          logger.warn({ event: 'file_sync.download_failed', path, status: res.status })
          continue
        }
        const buf = await res.arrayBuffer()
        writeFileSync(localPath, Buffer.from(buf))
      }
    }

    this.baseline = this.scanFiles()
  }

  startWatch(): void {
    this.baseline = this.scanFiles()
    this.timer = setInterval(() => {
      this.syncCycle().catch((err) => logger.warn({ event: 'file_sync.cycle_failed', error: String(err) }))
    }, this.pollIntervalMs)
  }

  stopWatch(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  private scanFiles(): Map<string, number> {
    const result = new Map<string, number>()
    this.walkDir(this.root, result)
    return result
  }

  private walkDir(dir: string, result: Map<string, number>): void {
    if (!existsSync(dir)) return
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        this.walkDir(full, result)
      } else if (entry.isFile()) {
        const rel = relative(this.root, full)
        result.set(rel, statSync(full).mtimeMs)
      }
    }
  }

  private async syncCycle(): Promise<void> {
    const current = this.scanFiles()
    const changed: string[] = []

    for (const [path, mtime] of current) {
      const prev = this.baseline.get(path)
      if (prev === undefined || mtime > prev) changed.push(path)
    }

    if (changed.length === 0) return

    for (let i = 0; i < changed.length; i += 100) {
      const batch = changed.slice(i, i + 100)
      const ops = batch.map((p) => ({ action: 'upload' as const, path: p }))
      const urls = await this.gateway.presignUrls(ops)

      for (const { path, url } of urls) {
        const localPath = join(this.root, path)
        if (!existsSync(localPath)) continue
        try {
          const data = readFileSync(localPath)
          const res = await fetch(url, { method: 'PUT', body: data })
          if (!res.ok) logger.warn({ event: 'file_sync.upload_failed', path, status: res.status })
        } catch (err) {
          logger.warn({ event: 'file_sync.upload_error', path, error: String(err) })
        }
      }
    }

    this.baseline = this.scanFiles()
  }
}

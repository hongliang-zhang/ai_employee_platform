import type { ActionDefinition } from '../types.js'
import { randomUUID } from 'node:crypto'

const ZHIPU_KB_API_URL = 'https://open.bigmodel.cn/api/llm-application/open/knowledge/retrieve'
const CACHE_TTL_MS = 30_000
const HTTP_TIMEOUT_MS = 15_000
const MAX_QUERY_LENGTH = 500

interface KbResultItem {
  text: string
  score: number
  metadata: {
    doc_name: string
    doc_url: string
  }
}

interface CacheEntry {
  result: unknown
  timestamp: number
}

// In-memory TTL cache (module-level, shared across invocations)
const cache = new Map<string, CacheEntry>()

function getKbIds(mode: string): string[] {
  const raw = process.env.ZHIPU_KB_IDS ?? ''
  const ids = raw.split(',').map((s) => s.trim()).filter(Boolean)
  if (ids.length === 0) return []
  switch (mode) {
    case 'sales':
      return ids.length > 0 ? [ids[0]] : []
    case 'product':
      return ids.length > 1 ? [ids[1]] : []
    case 'both':
    default:
      // Return both; if only one ID exists, just return it
      return ids.slice(0, 2)
  }
}

async function queryKb(query: string, knowledgeIds: string[]): Promise<KbResultItem[]> {
  const apiKey = process.env.ZHIPU_KB_API_KEY
  if (!apiKey) {
    throw new Error('ZHIPU_KB_API_KEY is not configured')
  }

  const body = {
    query,
    knowledge_ids: knowledgeIds,
    request_id: randomUUID(),
    top_k: 10,
    top_n: 20,
    recall_method: 'mixed',
    recall_ratio: 80,
    rerank_status: 0,
    rerank_model: 'rerank',
    fractional_threshold: 0.3,
  }

  const response = await fetch(ZHIPU_KB_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  })

  const result = await response.json() as { code: number; message?: string; data: KbResultItem[] }

  if (result.code !== 200) {
    throw new Error(`Zhipu KB API error: code=${result.code}, message=${result.message ?? 'unknown'}`)
  }

  return result.data ?? []
}

export const kbSearch: ActionDefinition = {
  name: 'kb_search',
  description: 'Search the Zhipu knowledge base for relevant documents',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '检索关键词或问题描述，不超过 500 字符' },
      mode: { type: 'string', description: '检索模式：both（默认）/ product / sales' },
    },
    required: ['query'],
  },
  async execute(input, _context) {
    const { query: rawQuery, mode = 'both' } = input as { query: string; mode?: string }

    // Read env vars lazily inside execute
    const apiKey = process.env.ZHIPU_KB_API_KEY
    if (!apiKey) {
      return { content: 'ERROR', error: 'ZHIPU_KB_API_KEY is not configured', sources: [] }
    }

    const query = rawQuery.slice(0, MAX_QUERY_LENGTH)

    // Check cache
    const cacheKey = `${mode}:${query}`
    const cached = cache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.result
    }

    // Evict expired entries only when cache is non-trivially large to avoid per-request overhead
    if (cache.size > 50) {
      for (const [key, entry] of cache) {
        if (Date.now() - entry.timestamp >= CACHE_TTL_MS) {
          cache.delete(key)
        }
      }
    }

    const kbIds = getKbIds(mode)

    try {
      let allResults: KbResultItem[]

      if (mode === 'both' && kbIds.length >= 2) {
        // Dual-KB parallel query
        const [salesResults, productResults] = await Promise.all([
          queryKb(query, [kbIds[0]]),
          queryKb(query, [kbIds[1]]),
        ])

        // Merge and dedup by first 100 chars of text
        const seen = new Map<string, KbResultItem>()
        for (const item of [...salesResults, ...productResults]) {
          const key = item.text.slice(0, 100)
          const existing = seen.get(key)
          if (!existing || item.score > existing.score) {
            seen.set(key, item)
          }
        }
        allResults = Array.from(seen.values())
      } else {
        allResults = await queryKb(query, kbIds)
      }

      // Sort by score descending
      allResults.sort((a, b) => b.score - a.score)

      if (allResults.length === 0) {
        // NO_MATCH results are NOT cached
        return { content: 'NO_MATCH', sources: [] }
      }

      const sources = allResults.map((item) => ({
        text: item.text,
        score: item.score,
        docName: item.metadata.doc_name,
        docUrl: item.metadata.doc_url,
      }))

      const result = { content: 'HIT', sources }

      // Cache the result
      cache.set(cacheKey, { result, timestamp: Date.now() })

      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return { content: 'ERROR', error: message, sources: [] }
    }
  },
}

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Set env vars before importing the module
process.env.ZHIPU_KB_API_KEY = 'test-kb-key'
process.env.ZHIPU_KB_IDS = 'sales-kb-id,product-kb-id'

// Mock global fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Need to clear module cache between tests that change env
let kbSearch: typeof import('../src/actions/zhipu-kb.js')['kbSearch']

describe('kb_search action', () => {
  beforeEach(async () => {
    // Re-import to get fresh module with current env vars
    vi.resetModules()
    mockFetch.mockReset()
    process.env.ZHIPU_KB_API_KEY = 'test-kb-key'
    process.env.ZHIPU_KB_IDS = 'sales-kb-id,product-kb-id'
    const mod = await import('../src/actions/zhipu-kb.js')
    kbSearch = mod.kbSearch
  })

  it('has valid ActionDefinition structure', () => {
    expect(kbSearch.name).toBe('kb_search')
    expect(kbSearch.description).toBeTruthy()
    expect(kbSearch.inputSchema.type).toBe('object')
    expect(kbSearch.inputSchema.required).toContain('query')
    expect(kbSearch.inputSchema.properties).toHaveProperty('query')
    expect(kbSearch.inputSchema.properties).toHaveProperty('mode')
    expect(typeof kbSearch.execute).toBe('function')
  })

  it('both-KB parallel query with merge and dedup', async () => {
    const salesResponse = {
      code: 200,
      data: [
        { text: 'Sales doc about pricing', score: 0.9, metadata: { doc_name: 'pricing.pdf', doc_url: 'https://example.com/pricing.pdf' } },
        { text: 'Shared knowledge content that appears in both KBs', score: 0.7, metadata: { doc_name: 'shared.pdf', doc_url: 'https://example.com/shared.pdf' } },
      ],
    }
    const productResponse = {
      code: 200,
      data: [
        { text: 'Product spec document', score: 0.85, metadata: { doc_name: 'spec.pdf', doc_url: 'https://example.com/spec.pdf' } },
        // Duplicate — same first 100 chars as the sales KB entry
        { text: 'Shared knowledge content that appears in both KBs', score: 0.8, metadata: { doc_name: 'shared-v2.pdf', doc_url: 'https://example.com/shared-v2.pdf' } },
      ],
    }

    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(salesResponse) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(productResponse) })

    const result = await kbSearch.execute({ query: 'test query', mode: 'both' }, { agentId: 'a1', conversationId: 'c1' })

    expect(mockFetch).toHaveBeenCalledTimes(2)
    // Both KBs queried in parallel
    const calls = mockFetch.mock.calls as string[][]
    const urls = calls.map((c) => c[0] as string)
    expect(urls.some((u) => u.includes('knowledge/retrieve'))).toBe(true)

    const body = result as { content: string; sources: Array<{ text: string; score: number }> }
    expect(body.content).toBe('HIT')
    // 3 unique results after dedup (shared appears once, highest score kept)
    expect(body.sources).toHaveLength(3)
    // Sorted by score desc
    const scores = body.sources.map((s) => s.score)
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeLessThanOrEqual(scores[i - 1])
    }
  })

  it('single-KB mode (sales only)', async () => {
    const salesResponse = {
      code: 200,
      data: [
        { text: 'Sales info', score: 0.9, metadata: { doc_name: 'sales.pdf', doc_url: 'https://example.com/sales.pdf' } },
      ],
    }

    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(salesResponse) })

    const result = await kbSearch.execute({ query: 'sales query', mode: 'sales' }, { agentId: 'a1', conversationId: 'c1' })

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const callBody = JSON.parse(mockFetch.mock.calls[0][1]!.body as string)
    expect(callBody.knowledge_ids).toEqual(['sales-kb-id'])

    const body = result as { content: string; sources: Array<{ docName: string }> }
    expect(body.content).toBe('HIT')
    expect(body.sources).toHaveLength(1)
    expect(body.sources[0].docName).toBe('sales.pdf')
  })

  it('single-KB mode (product only)', async () => {
    const productResponse = {
      code: 200,
      data: [
        { text: 'Product info', score: 0.88, metadata: { doc_name: 'product.pdf', doc_url: 'https://example.com/product.pdf' } },
      ],
    }

    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(productResponse) })

    const result = await kbSearch.execute({ query: 'product query', mode: 'product' }, { agentId: 'a1', conversationId: 'c1' })

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const callBody = JSON.parse(mockFetch.mock.calls[0][1]!.body as string)
    expect(callBody.knowledge_ids).toEqual(['product-kb-id'])

    const body = result as { content: string; sources: Array<{ docName: string }> }
    expect(body.content).toBe('HIT')
  })

  it('NO_MATCH when empty results', async () => {
    const response = {
      code: 200,
      data: [],
    }

    // mode='both' triggers 2 parallel fetches
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(response) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(response) })

    const result = await kbSearch.execute({ query: 'obscure query', mode: 'both' }, { agentId: 'a1', conversationId: 'c1' })

    const body = result as { content: string; sources: unknown[] }
    expect(body.content).toBe('NO_MATCH')
    expect(body.sources).toHaveLength(0)
  })

  it('API error handling (non-200 code)', async () => {
    const response = {
      code: 500,
      message: 'internal error',
      data: [],
    }

    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(response) })

    const result = await kbSearch.execute({ query: 'test query', mode: 'both' }, { agentId: 'a1', conversationId: 'c1' })

    const body = result as { content: string; error: string; sources: unknown[] }
    expect(body.content).toBe('ERROR')
    expect(body.error).toBeTruthy()
    expect(body.sources).toHaveLength(0)
  })

  it('network error handling', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network failure'))

    const result = await kbSearch.execute({ query: 'test query', mode: 'both' }, { agentId: 'a1', conversationId: 'c1' })

    const body = result as { content: string; error: string; sources: unknown[] }
    expect(body.content).toBe('ERROR')
    expect(body.error).toContain('network failure')
    expect(body.sources).toHaveLength(0)
  })

  it('missing ZHIPU_KB_API_KEY env var → ERROR', async () => {
    delete process.env.ZHIPU_KB_API_KEY

    const result = await kbSearch.execute({ query: 'test query', mode: 'both' }, { agentId: 'a1', conversationId: 'c1' })

    const body = result as { content: string; error: string; sources: unknown[] }
    expect(body.content).toBe('ERROR')
    expect(body.error).toBeTruthy()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('defaults mode to both when not specified', async () => {
    const response = {
      code: 200,
      data: [
        { text: 'Some result', score: 0.5, metadata: { doc_name: 'doc.pdf', doc_url: 'https://example.com/doc.pdf' } },
      ],
    }

    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(response) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ code: 200, data: [] }) })

    await kbSearch.execute({ query: 'test' }, { agentId: 'a1', conversationId: 'c1' })

    // Should query both KBs (2 fetch calls)
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('truncates query to 500 chars', async () => {
    const longQuery = 'x'.repeat(600)
    const response = {
      code: 200,
      data: [],
    }

    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(response) })

    await kbSearch.execute({ query: longQuery, mode: 'sales' }, { agentId: 'a1', conversationId: 'c1' })

    const callBody = JSON.parse(mockFetch.mock.calls[0][1]!.body as string)
    expect(callBody.query.length).toBe(500)
  })

  it('uses cache on repeated query within TTL', async () => {
    const response = {
      code: 200,
      data: [
        { text: 'Cached result', score: 0.9, metadata: { doc_name: 'cached.pdf', doc_url: 'https://example.com/cached.pdf' } },
      ],
    }

    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(response) })

    // First call
    const result1 = await kbSearch.execute({ query: 'cache test', mode: 'sales' }, { agentId: 'a1', conversationId: 'c1' })
    expect(mockFetch).toHaveBeenCalledTimes(1)

    // Second call — should hit cache
    const result2 = await kbSearch.execute({ query: 'cache test', mode: 'sales' }, { agentId: 'a1', conversationId: 'c1' })
    expect(mockFetch).toHaveBeenCalledTimes(1) // no additional fetch

    const body1 = result1 as { content: string; sources: Array<{ text: string }> }
    const body2 = result2 as { content: string; sources: Array<{ text: string }> }
    expect(body1).toEqual(body2)
  })

  it('does NOT cache NO_MATCH results', async () => {
    const emptyResponse = {
      code: 200,
      data: [],
    }
    const hitResponse = {
      code: 200,
      data: [
        { text: 'Now found', score: 0.9, metadata: { doc_name: 'found.pdf', doc_url: 'https://example.com/found.pdf' } },
      ],
    }

    // First call returns empty
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(emptyResponse) })
    const result1 = await kbSearch.execute({ query: 'no cache test', mode: 'sales' }, { agentId: 'a1', conversationId: 'c1' })
    expect((result1 as { content: string }).content).toBe('NO_MATCH')
    expect(mockFetch).toHaveBeenCalledTimes(1)

    // Second call — should NOT be cached since it was NO_MATCH
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(hitResponse) })
    const result2 = await kbSearch.execute({ query: 'no cache test', mode: 'sales' }, { agentId: 'a1', conversationId: 'c1' })
    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect((result2 as { content: string }).content).toBe('HIT')
  })
})

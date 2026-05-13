# Actions Third-Party Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three third-party API actions (Zhipu KB, Tianyancha via MCP, FXiaoke CRM) to the Actions Service as pure API gateways with no business logic.

**Architecture:** Each action implements the existing `ActionDefinition` interface. Actions only handle API authentication, request serialization, and response normalization. Business logic (lead scoring, sales routing, AI scene inference) stays on the agent side. FXiaoke uses a shared OAuth token cache within the same file. Tianyancha connects directly to Zhipu's MCP Broker via `@modelcontextprotocol/sdk` Streamable HTTP transport.

**Tech Stack:** TypeScript, Node.js fetch, `@modelcontextprotocol/sdk`, Vitest + Supertest

**Implementation convention:** All new actions MUST read env vars lazily inside `execute()`, not at module load time. This matches the existing `search-web.ts` pattern and ensures the test suite can import modules without needing every env var set.

**Spec:** `docs/product-specs/2026-05-12-actions-third-party-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/actions/src/actions/zhipu-kb.ts` | Create | Zhipu KB search (dual-KB parallel query, merge, dedup) |
| `packages/actions/src/actions/tianyancha.ts` | Create | Tianyancha company info via MCP Streamable HTTP |
| `packages/actions/src/actions/fxiaoke.ts` | Create | FXiaoke CRM create lead + query lead, shared OAuth cache |
| `packages/actions/src/registry.ts` | Modify | Register 4 new actions |
| `packages/actions/.env.example` (monorepo root `.env.example`) | Modify | Add new env vars |
| `packages/actions/test/zhipu-kb.test.ts` | Create | Unit tests for kb_search |
| `packages/actions/test/tianyancha.test.ts` | Create | Unit tests for tianyancha_enrich |
| `packages/actions/test/fxiaoke.test.ts` | Create | Unit tests for fxiaoke actions |
| `packages/actions/test/actions.test.ts` | Modify | Update registry assertions to include new actions |

---

## Task 1: Install `@modelcontextprotocol/sdk` dependency

**Files:**
- Modify: `packages/actions/package.json`

- [ ] **Step 1: Install the package**

```bash
cd /Users/fanfei/monorepo/z-mono/.worktrees/actions-third-party
pnpm --filter @aaas/actions add @modelcontextprotocol/sdk
```

- [ ] **Step 2: Verify installation**

```bash
pnpm --filter @aaas/actions build
```

Expected: Build succeeds (the new package is importable).

- [ ] **Step 3: Commit**

```bash
git add packages/actions/package.json pnpm-lock.yaml
git commit -m "chore: add @modelcontextprotocol/sdk dependency"
```

---

## Task 2: Implement `zhipu-kb.ts` → `kb_search`

This is the simplest action — pure HTTP API call, no exotic transport. Ported directly from MVP `kb-search.ts` with the `ActionDefinition` interface.

**Files:**
- Create: `packages/actions/src/actions/zhipu-kb.ts`
- Create: `packages/actions/test/zhipu-kb.test.ts`
- Reference: MVP source at `~/Downloads/Projects/zhipu-maas-sales-agent/src/tools/kb-search.ts`

### Key implementation details from MVP

- API URL: `https://open.bigmodel.cn/api/llm-application/open/knowledge/retrieve`
- Auth: `Authorization: Bearer ${ZHIPU_KB_API_KEY}`
- Request payload fields: `query`, `knowledge_ids`, `request_id` (UUID), `top_k=10`, `top_n=20`, `recall_method="mixed"`, `recall_ratio=80`, `rerank_status=0`, `rerank_model="rerank"`, `fractional_threshold=0.3`
- Response: `result.code === 200` for success, `result.data` is array of `{ text, score, metadata: { doc_name, doc_url } }`
- KB ID resolution: `ZHIPU_KB_IDS` env var, comma-separated — index 0 = sales KB, index 1 = product KB
- Dual-KB mode (`both`): `Promise.all` parallel queries, merge, dedup by `text.slice(0, 100)`, sort by `score` desc
- 30-second in-memory TTL cache keyed by `mode:query`; `NO_MATCH` results are NOT cached
- 15-second HTTP timeout via `AbortSignal.timeout(15000)`
- Query truncated to 500 chars

### Input schema

```typescript
inputSchema: {
  type: 'object',
  properties: {
    query: { type: 'string', description: '检索关键词或问题描述，不超过 500 字符' },
    mode: { type: 'string', description: "检索模式：both（默认）/ product / sales" },
  },
  required: ['query'],
}
```

### Return shape

```typescript
// Success with results
{ content: 'HIT', sources: [{ text, score, docName, docUrl }] }
// No match
{ content: 'NO_MATCH', sources: [] }
// Error
{ content: 'ERROR', error: string }
```

- [ ] **Step 1: Write failing test**

Create `packages/actions/test/zhipu-kb.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock global fetch for KB API calls
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

process.env.ZHIPU_KB_API_KEY = 'test-kb-key'
process.env.ZHIPU_KB_IDS = 'sales-kb-id,product-kb-id'
process.env.INTERNAL_API_KEY = 'test-key'

import { kbSearch } from '../src/actions/zhipu-kb.js'

function mockKbResponse(data: any[]) {
  return {
    ok: true,
    json: () => Promise.resolve({ code: 200, data }),
  }
}

describe('kb_search', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('should be a valid ActionDefinition', () => {
    expect(kbSearch.name).toBe('kb_search')
    expect(kbSearch.description).toBeTruthy()
    expect(kbSearch.inputSchema.required).toContain('query')
    expect(typeof kbSearch.execute).toBe('function')
  })

  it('queries both KBs in parallel by default and merges results', async () => {
    // sales KB returns 2 results, product KB returns 1 (duplicate of sales)
    mockFetch
      .mockResolvedValueOnce(mockKbResponse([
        { text: 'sales result 1', score: 0.9, metadata: { doc_name: 'FAQ', doc_url: '' } },
        { text: 'shared content abc', score: 0.7, metadata: { doc_name: 'FAQ', doc_url: '' } },
      ]))
      .mockResolvedValueOnce(mockKbResponse([
        { text: 'shared content abc extra', score: 0.8, metadata: { doc_name: 'Docs', doc_url: '' } },
      ]))

    const result = await kbSearch.execute({ query: 'test query' }, { agentId: 'a1', conversationId: 'c1' }) as any

    // Two fetch calls (sales + product)
    expect(mockFetch).toHaveBeenCalledTimes(2)
    // Dedup: "shared content abc" appears in both, only kept once (first 100 chars match)
    expect(result.sources).toHaveLength(2)
    // Sorted by score desc
    expect(result.sources[0].score).toBeGreaterThanOrEqual(result.sources[1].score)
  })

  it('returns NO_MATCH when no results', async () => {
    mockFetch
      .mockResolvedValueOnce(mockKbResponse([]))
      .mockResolvedValueOnce(mockKbResponse([]))

    const result = await kbSearch.execute({ query: 'nothing' }, { agentId: 'a1', conversationId: 'c1' }) as any
    expect(result.content).toBe('NO_MATCH')
    expect(result.sources).toHaveLength(0)
  })

  it('queries single KB when mode=sales', async () => {
    mockFetch.mockResolvedValueOnce(mockKbResponse([
      { text: 'sales only', score: 0.85, metadata: { doc_name: 'SOP', doc_url: '' } },
    ]))

    const result = await kbSearch.execute({ query: 'test', mode: 'sales' }, { agentId: 'a1', conversationId: 'c1' }) as any
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(result.sources).toHaveLength(1)
  })

  it('returns error when ZHIPU_KB_API_KEY is missing', async () => {
    const orig = process.env.ZHIPU_KB_API_KEY
    delete process.env.ZHIPU_KB_API_KEY

    const result = await kbSearch.execute({ query: 'test', mode: 'sales' }, { agentId: 'a1', conversationId: 'c1' }) as any
    expect(result.content).toBe('ERROR')
    expect(result.error).toContain('ZHIPU_KB_API_KEY')

    process.env.ZHIPU_KB_API_KEY = orig
  })

  it('handles API error response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ code: 500, message: 'server error' }),
    })

    const result = await kbSearch.execute({ query: 'test', mode: 'sales' }, { agentId: 'a1', conversationId: 'c1' }) as any
    expect(result.content).toBe('ERROR')
    expect(result.error).toContain('server error')
  })

  it('handles network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network timeout'))

    const result = await kbSearch.execute({ query: 'test', mode: 'sales' }, { agentId: 'a1', conversationId: 'c1' }) as any
    expect(result.content).toBe('ERROR')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @aaas/actions test -- test/zhipu-kb.test.ts
```

Expected: FAIL — module `../src/actions/zhipu-kb.js` not found.

- [ ] **Step 3: Implement `zhipu-kb.ts`**

Create `packages/actions/src/actions/zhipu-kb.ts`. Key structure:

```typescript
import type { ActionDefinition } from '../types.js'

// Constants from MVP
const KB_API_URL = 'https://open.bigmodel.cn/api/llm-application/open/knowledge/retrieve'
const TOP_K = 10
const TOP_N = 20
const MIN_SCORE = 0.3

// Simple in-memory cache
const cache = new Map<string, { ts: number; data: unknown }>()
const CACHE_TTL_MS = 30_000

type KbMode = 'both' | 'product' | 'sales'

interface KbSource {
  text: string
  score?: number
  docName: string
  docUrl: string
}

function loadKbConfig() {
  const apiKey = process.env.ZHIPU_KB_API_KEY
  const kbIdsRaw = process.env.ZHIPU_KB_IDS
  if (!apiKey) throw new Error('Missing env ZHIPU_KB_API_KEY')
  if (!kbIdsRaw) throw new Error('Missing env ZHIPU_KB_IDS')
  const kbIds = kbIdsRaw.split(',').map(s => s.trim()).filter(Boolean)
  return {
    apiKey,
    salesKbId: kbIds[0],
    productKbId: kbIds[1] ?? kbIds[0],
  }
}

function getKbIdsForMode(mode: KbMode): string[] {
  const { salesKbId, productKbId } = loadKbConfig()
  switch (mode) {
    case 'sales': return [salesKbId]
    case 'product': return [productKbId]
    case 'both': default: return [salesKbId, productKbId]
  }
}

async function searchSingleKb(query: string, kbIds: string[]): Promise<{ sources: KbSource[]; error?: string }> {
  const { apiKey } = loadKbConfig()
  const resp = await fetch(KB_API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      knowledge_ids: kbIds,
      request_id: crypto.randomUUID(),
      top_k: TOP_K, top_n: TOP_N,
      recall_method: 'mixed', recall_ratio: 80,
      rerank_status: 0, rerank_model: 'rerank',
      fractional_threshold: MIN_SCORE,
    }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!resp.ok) return { sources: [], error: `HTTP ${resp.status}` }
  const result = await resp.json() as any
  if (result.code !== 200) return { sources: [], error: result.message ?? 'unknown' }
  const sources: KbSource[] = (result.data ?? []).map((item: any) => ({
    text: (item.text ?? '').trim(),
    score: item.score,
    docName: item.metadata?.doc_name ?? '文档',
    docUrl: item.metadata?.doc_url ?? '',
  }))
  return { sources }
}

export const kbSearch: ActionDefinition = {
  name: 'kb_search',
  description: '检索智谱知识库（sales FAQ + product docs），返回按相关度排序的文档片段',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '检索关键词或问题描述' },
      mode: { type: 'string', description: "检索模式：both（默认）/ product / sales" },
    },
    required: ['query'],
  },
  async execute(input) {
    const { query: rawQuery, mode = 'both' } = input as { query: string; mode?: KbMode }
    let query = (rawQuery ?? '').trim()
    if (!query) return { content: 'ERROR', error: 'empty query', sources: [] }
    if (query.length > 500) query = query.slice(0, 500)

    const cacheKey = `${mode}:${query}`
    const cached = cache.get(cacheKey)
    if (cached && Date.now() - cached.ts <= CACHE_TTL_MS) return cached.data

    try {
      const kbIds = getKbIdsForMode(mode as KbMode)
      let sources: KbSource[]

      if (kbIds.length === 1) {
        const r = await searchSingleKb(query, kbIds)
        if (r.error) return { content: 'ERROR', error: r.error, sources: [] }
        sources = r.sources
      } else {
        const results = await Promise.all(
          kbIds.map(id => searchSingleKb(query, [id]))
        )
        // Merge + dedup by first 100 chars of text
        const seen = new Set<string>()
        sources = []
        for (const r of results) {
          for (const s of r.sources) {
            const key = s.text.slice(0, 100)
            if (!seen.has(key)) { seen.add(key); sources.push(s) }
          }
        }
        sources.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      }

      const result = sources.length === 0
        ? { content: 'NO_MATCH' as const, sources: [] }
        : { content: 'HIT' as const, sources }

      // Don't cache NO_MATCH
      if (result.content !== 'NO_MATCH') {
        cache.set(cacheKey, { ts: Date.now(), data: result })
      }
      return result
    } catch (err) {
      return { content: 'ERROR', error: err instanceof Error ? err.message : String(err), sources: [] }
    }
  },
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @aaas/actions test -- test/zhipu-kb.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/actions/src/actions/zhipu-kb.ts packages/actions/test/zhipu-kb.test.ts
git commit -m "feat(actions): add kb_search action (zhipu knowledge base)"
```

---

## Task 3: Implement `tianyancha.ts` → `tianyancha_enrich`

This action connects to Tianyancha via Zhipu's MCP Broker using Streamable HTTP transport from `@modelcontextprotocol/sdk`.

**Files:**
- Create: `packages/actions/src/actions/tianyancha.ts`
- Create: `packages/actions/test/tianyancha.test.ts`
- Reference: MVP Python at `~/Downloads/Projects/zhipu-maas-sales-agent/skills/tianyancha-enrich/scripts/tianyancha_client.py`

### Key implementation details from MVP

- MCP Broker endpoint: `https://open.bigmodel.cn/api/mcp-broker/proxy/tianyancha` (Streamable HTTP base; the SDK appends `/mcp` or similar per protocol)
- Auth: `Authorization: Bearer ${ZHIPU_API_KEY}` header on transport
- Three MCP tools: `companyBaseInfo`, `risk`, `enterprisePatent` — all take `{ keyword: string }`
- MVP `query_company_base()` does multi-key field normalization (e.g., `name` / `companyName`, `regCapital` / `registeredCapital`). Reproduce this in TS.
- MVP `query_company_risk()` computes a `risk_level` (低/中/高) based on self_risk + alert count — this is data normalization, keep it.
- MVP `query_company_patent()` checks `has_invention_patent` and truncates to top 10 — keep it.
- NO `infer_ai_scenes` or `infer_crm_enrichment` — those are business logic, stay on agent side.

### Input schema

```typescript
inputSchema: {
  type: 'object',
  properties: {
    keyword: { type: 'string', description: '公司名/注册号/统一社会信用代码' },
    include_risk: { type: 'boolean', description: '是否查风险信息（+0.20元）' },
    include_patent: { type: 'boolean', description: '是否查专利信息（+0.10元）' },
  },
  required: ['keyword'],
}
```

### Return shape

```typescript
{
  keyword: string,
  basic_info: {
    name, type, established_date, legal_status, registered_capital,
    legal_representative, business_scope, industry, staff_range,
    /* ... other normalized fields */
  },
  risk_info?: { risk_level, self_risk_count, surrounding_count, alert_count, /* top 5 risks */ },
  patent_info?: { total_count, has_invention_patent, /* top 10 patents */ },
}
```

### MCP connection pattern

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const apiKey = process.env.ZHIPU_API_KEY
const transport = new StreamableHTTPClientTransport(
  new URL('https://open.bigmodel.cn/api/mcp-broker/proxy/tianyancha/mcp'),
  { requestInit: { headers: { Authorization: `Bearer ${apiKey}` } } }
)
const client = new Client({ name: 'actions-tianyancha', version: '1.0' })
await client.connect(transport)

const result = await client.callTool({ name: 'companyBaseInfo', arguments: { keyword } })
await client.close()
```

**Fallback chain:** If `StreamableHTTPClientTransport` fails (e.g., Broker doesn't support Streamable HTTP at that path), catch the error and try `SSEClientTransport` with the SSE URL (`https://open.bigmodel.cn/api/mcp-broker/proxy/tianyancha/sse`). If that also fails, throw with a clear error message. The GLM passthrough fallback (3rd tier from spec) is intentionally omitted from this plan — it adds significant complexity (requires LLM API call + function calling orchestration) and the MCP direct approach should work. If both Streamable HTTP and SSE fail during testing, we'll add GLM passthrough as a follow-up.

- [ ] **Step 1: Write failing test**

Create `packages/actions/test/tianyancha.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the MCP SDK
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => {
  const mockCallTool = vi.fn()
  const mockConnect = vi.fn().mockResolvedValue(undefined)
  const mockClose = vi.fn().mockResolvedValue(undefined)
  return {
    Client: vi.fn().mockImplementation(() => ({
      connect: mockConnect,
      callTool: mockCallTool,
      close: mockClose,
    })),
  }
})

process.env.ZHIPU_API_KEY = 'test-zhipu-key'
process.env.INTERNAL_API_KEY = 'test-key'

import { tianyanchaEnrich } from '../src/actions/tianyancha.js'

describe('tianyancha_enrich', () => {
  it('should be a valid ActionDefinition', () => {
    expect(tianyanchaEnrich.name).toBe('tianyancha_enrich')
    expect(tianyanchaEnrich.inputSchema.required).toContain('keyword')
    expect(typeof tianyanchaEnrich.execute).toBe('function')
  })

  it('queries companyBaseInfo and returns normalized basic_info', async () => {
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
    const instance = new (Client as any)()
    instance.callTool.mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify({
        name: '测试公司',
        companyOrgType: '有限责任公司',
        regCapital: '1000万元',
        legalPersonName: '张三',
        regStatus: '在营',
        estiblishTime: '2020-01-01',
        creditCode: '91110000XXXX',
        businessScope: '技术开发',
        industry: '软件',
        staffNumRange: '100-499人',
      })}],
    })

    const result = await tianyanchaEnrich.execute(
      { keyword: '测试公司' },
      { agentId: 'a1', conversationId: 'c1' },
    ) as any

    expect(result.keyword).toBe('测试公司')
    expect(result.basic_info.name).toBe('测试公司')
    expect(result.basic_info.registered_capital).toBe('1000万元')
    expect(result.risk_info).toBeUndefined()
    expect(result.patent_info).toBeUndefined()
  })

  it('queries risk info when include_risk is true', async () => {
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
    const instance = new (Client as any)()
    // First call: base info
    instance.callTool
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: JSON.stringify({ name: '测试公司', regStatus: '在营' }) }],
      })
      // Second call: risk
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: JSON.stringify({
          selfRisk: [{ a: 1 }],
          surroundingRisk: [],
          alertRisk: [{ b: 2 }],
        }) }],
      })

    const result = await tianyanchaEnrich.execute(
      { keyword: '测试公司', include_risk: true },
      { agentId: 'a1', conversationId: 'c1' },
    ) as any

    expect(result.risk_info).toBeDefined()
    expect(result.risk_info.risk_level).toBe('中等风险')
    expect(result.risk_info.self_risk_count).toBe(1)
  })

  it('queries patent info when include_patent is true', async () => {
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
    const instance = new (Client as any)()
    instance.callTool
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: JSON.stringify({ name: '测试公司' }) }],
      })
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: JSON.stringify({
          items: [{ type: '发明专利', name: '一种方法' }],
          total: 1,
        }) }],
      })

    const result = await tianyanchaEnrich.execute(
      { keyword: '测试公司', include_patent: true },
      { agentId: 'a1', conversationId: 'c1' },
    ) as any

    expect(result.patent_info).toBeDefined()
    expect(result.patent_info.has_invention_patent).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @aaas/actions test -- test/tianyancha.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `tianyancha.ts`**

Create `packages/actions/src/actions/tianyancha.ts`. Structure:

1. `normalizeBasicInfo(raw: unknown)` — multi-key field matching (reproduce MVP's `query_company_base` field normalization)
2. `normalizeRiskInfo(raw: unknown)` — risk level calculation (reproduce MVP's `query_company_risk`)
3. `normalizePatentInfo(raw: unknown)` — patent summary (reproduce MVP's `query_company_patent`)
4. `createMcpClient()` — creates and connects MCP client with Streamable HTTP, fallback to SSE
5. `tianyanchaEnrich` action definition — calls `companyBaseInfo`, optionally `risk` and `enterprisePatent`, normalizes results

Key: The `execute` function creates a fresh MCP client per request, calls tools, then closes. No persistent connection.

For parsing MCP tool responses: `callTool` returns `{ content: [{ type: 'text', text: string }] }`. Parse the `text` field as JSON (strip markdown fences if present, like MVP's `_extract_json`).

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @aaas/actions test -- test/tianyancha.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/actions/src/actions/tianyancha.ts packages/actions/test/tianyancha.test.ts
git commit -m "feat(actions): add tianyancha_enrich action (MCP Streamable HTTP)"
```

---

## Task 4: Implement `fxiaoke.ts` → `fxiaoke_create_lead` + `fxiaoke_query_lead`

This is the largest action. Two action definitions in one file, sharing OAuth token cache and helper functions.

**Files:**
- Create: `packages/actions/src/actions/fxiaoke.ts`
- Create: `packages/actions/test/fxiaoke.test.ts`
- Reference: MVP Python `fxiaoke_client.py`, `create_lead.py`, `query_lead.py`

### Key implementation details from MVP

**API endpoints (constants, not env vars):**
```typescript
const FXIAOKE_AUTH_URL = 'https://open.fxiaoke.com/cgi/corpAccessToken/get'
const FXIAOKE_OPEN_USER_URL = 'https://open.fxiaoke.com/cgi/user/getByMobile'
const FXIAOKE_WRITE_URL = 'https://open.fxiaoke.com/cgi/crm/v2/object/create'
const FXIAOKE_QUERY_URL = 'https://open.fxiaoke.com/cgi/crm/v2/object/query'
```

**OAuth token cache (module-level singleton):**
```typescript
let tokenCache: { token: string; corpId: string; expiresAt: number } | null = null
async function getToken(): Promise<{ token: string; corpId: string }> {
  if (tokenCache && Date.now() < tokenCache.expiresAt - 60_000) return tokenCache
  const resp = await fetch(FXIAOKE_AUTH_URL, { ... })
  // parse, cache, return
}
```

**FXiaoke API response pattern:** `{ errorCode: 0, ... }` for success, `{ errorCode: nonZero, errorMessage: "..." }` for failure.

**Employee lookup helpers:**
- `getOpenUserId(token, corpId, mobile)` → POST `FXIAOKE_OPEN_USER_URL`, returns `empList[0].openUserId`
- `getPersonnelUserId(token, corpId, operatorUserId, name)` → POST `FXIAOKE_QUERY_URL` with `PersonnelObj` + name filter, returns `dataList[0].user_id`

**CRM field mapping (in `fxiaoke_create_lead`):**
```
input field          → CRM LeadsObj field
mobile               → mobile
name                 → name
company              → company
email                → email
position             → job_title
address              → address, field_ut2B9__c
company_size_code    → field_tn2yY__c
industry             → field_98ov1__c
business             → field_r0ZXk__c
usage                → remark
source               → source
leads_pool_id        → leads_pool_id
remarks              → field_6FM3b__c
second_phone         → field_8ekqS__c
customer_id          → zhipu_id__c
```

All mapped in a `buildLeadObject()` function. `dataObjectApiName` is always `"LeadsObj"`. `skipCheckCleanOwner: true`.

**Phone validation (data quality guard, not business logic):**
```typescript
const FAKE_MOBILES = new Set([
  '13800138000', '13888888888', '12345678901', '11111111111',
  '13900000000', '00000000000', '99999999999', '10000000000',
])
// In execute: validate format /^1[3-9]\d{9}$/ and check FAKE_MOBILES
```

**`fxiaoke_query_lead` modes:**
- `mobile`: filter by `mobile` field, return `{ exists, count, leads, suggestion }`
- `detail`: filter by `_id`, return single lead with extra fields
- `list`: filter by company/source/life_status, return paginated list

Query helper: `queryLeads(token, corpId, userId, filters, limit, offset)` wraps the FXIAOKE_QUERY_URL POST.

### Input schemas

**fxiaoke_create_lead:**
```typescript
{
  type: 'object',
  properties: {
    name: { type: 'string' },
    mobile: { type: 'string', description: '11位手机号' },
    company: { type: 'string' },
    email: { type: 'string' },
    position: { type: 'string' },
    address: { type: 'string' },
    industry: { type: 'string' },
    company_size_code: { type: 'string', description: 'CRM枚举code' },
    business: { type: 'string', description: '咨询业务' },
    usage: { type: 'string', description: '使用场景' },
    creator_user_id: { type: 'string', description: '归属销售user_id' },
    leads_pool_id: { type: 'string', description: '线索池ID' },
    potential_level: { type: 'string', description: 'high/low/unknown' },
    source: { type: 'string', description: '来源code' },
    remarks: { type: 'string' },
    second_phone: { type: 'string' },
    customer_id: { type: 'string', description: '智谱账号ID' },
  },
  required: ['name', 'mobile', 'company', 'creator_user_id', 'leads_pool_id'],
}
```

**fxiaoke_query_lead:**
```typescript
{
  type: 'object',
  properties: {
    mode: { type: 'string', description: 'mobile / detail / list' },
    mobile: { type: 'string' },
    data_id: { type: 'string' },
    company: { type: 'string' },
    source: { type: 'string' },
    life_status: { type: 'string' },
    limit: { type: 'number' },
    offset: { type: 'number' },
    operator_user_id: { type: 'string', description: '查询人user_id' },
  },
  required: ['mode', 'operator_user_id'],
}
```

- [ ] **Step 1: Write failing test**

Create `packages/actions/test/fxiaoke.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

process.env.FXIAOKE_APP_ID = 'test-app-id'
process.env.FXIAOKE_APP_SECRET = 'test-app-secret'
process.env.FXIAOKE_PERMANENT_CODE = 'test-perm-code'
process.env.INTERNAL_API_KEY = 'test-key'

import { fxiaokeCreateLead, fxiaokeQueryLead } from '../src/actions/fxiaoke.js'

function mockTokenResponse() {
  return {
    ok: true,
    json: () => Promise.resolve({
      errorCode: 0,
      corpAccessToken: 'test-token',
      corpId: 'test-corp-id',
      expiresIn: 7200,
    }),
  }
}

describe('fxiaoke_create_lead', () => {
  beforeEach(() => { mockFetch.mockReset() })

  it('should be a valid ActionDefinition', () => {
    expect(fxiaokeCreateLead.name).toBe('fxiaoke_create_lead')
    expect(fxiaokeCreateLead.inputSchema.required).toContain('mobile')
    expect(typeof fxiaokeCreateLead.execute).toBe('function')
  })

  it('rejects invalid mobile format', async () => {
    const result = await fxiaokeCreateLead.execute(
      { name: '张三', mobile: 'abc', company: '测试公司', creator_user_id: 'u1', leads_pool_id: 'pool1' },
      { agentId: 'a1', conversationId: 'c1' },
    ) as any
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/手机号格式无效/)
  })

  it('rejects fake mobile numbers', async () => {
    const result = await fxiaokeCreateLead.execute(
      { name: '张三', mobile: '13800138000', company: '测试公司', creator_user_id: 'u1', leads_pool_id: 'pool1' },
      { agentId: 'a1', conversationId: 'c1' },
    ) as any
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/占位号/)
  })

  it('creates lead successfully', async () => {
    mockFetch
      .mockResolvedValueOnce(mockTokenResponse())                    // auth
      .mockResolvedValueOnce({                                        // write
        ok: true,
        json: () => Promise.resolve({ errorCode: 0, dataId: 'lead-123' }),
      })

    const result = await fxiaokeCreateLead.execute({
      name: '张三', mobile: '13800001111', company: '测试公司',
      creator_user_id: 'user-1', leads_pool_id: 'pool-1',
      source: 'MaaS_Agent',
    }, { agentId: 'a1', conversationId: 'c1' }) as any

    expect(result.success).toBe(true)
    expect(result.dataId).toBe('lead-123')

    // Verify write call structure
    const writeCall = mockFetch.mock.calls[1]
    const writeBody = JSON.parse(writeCall[1].body)
    expect(writeBody.data.object_data.dataObjectApiName).toBe('LeadsObj')
    expect(writeBody.data.object_data.mobile).toBe('13800001111')
    expect(writeBody.data.object_data.leads_pool_id).toBe('pool-1')
    expect(writeBody.corpAccessToken).toBe('test-token')
    expect(writeBody.currentOpenUserId).toBe('user-1')
  })

  it('handles CRM API error', async () => {
    mockFetch
      .mockResolvedValueOnce(mockTokenResponse())
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ errorCode: 1001, errorMessage: 'duplicate' }),
      })

    const result = await fxiaokeCreateLead.execute({
      name: '张三', mobile: '13800001111', company: '测试公司',
      creator_user_id: 'user-1', leads_pool_id: 'pool-1',
    }, { agentId: 'a1', conversationId: 'c1' }) as any

    expect(result.success).toBe(false)
    expect(result.error).toContain('duplicate')
  })
})

describe('fxiaoke_query_lead', () => {
  beforeEach(() => { mockFetch.mockReset() })

  it('queries by mobile and reports exists', async () => {
    // operator_user_id is passed directly as currentOpenUserId — no lookup needed
    mockFetch
      .mockResolvedValueOnce(mockTokenResponse())
      .mockResolvedValueOnce({                                        // query leads
        ok: true,
        json: () => Promise.resolve({
          errorCode: 0,
          data: { total: 1, dataList: [{ _id: 'l1', name: '张三', mobile: '13800001111', company: '测试公司' }] },
        }),
      })

    const result = await fxiaokeQueryLead.execute({
      mode: 'mobile', mobile: '13800001111', operator_user_id: 'op-1',
    }, { agentId: 'a1', conversationId: 'c1' }) as any

    expect(result.success).toBe(true)
    expect(result.exists).toBe(true)
    expect(result.count).toBe(1)
  })

  it('queries by mobile and reports not exists', async () => {
    mockFetch
      .mockResolvedValueOnce(mockTokenResponse())
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ errorCode: 0, data: { total: 0, dataList: [] } }),
      })

    const result = await fxiaokeQueryLead.execute({
      mode: 'mobile', mobile: '13900001111', operator_user_id: 'op-1',
    }, { agentId: 'a1', conversationId: 'c1' }) as any

    expect(result.exists).toBe(false)
    expect(result.suggestion).toContain('安全')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @aaas/actions test -- test/fxiaoke.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `fxiaoke.ts`**

Create `packages/actions/src/actions/fxiaoke.ts`. Key sections:

1. **Constants** — API endpoint URLs, `FAKE_MOBILES` set
2. **`getToken()`** — OAuth with module-level cache, TTL-60s refresh
3. **`getOpenUserId()`** — phone → openUserId lookup
4. **`getPersonnelUserId()`** — name → PersonnelObj user_id lookup
5. **`queryLeads()`** — generic LeadsObj query wrapper
6. **`buildLeadObject()`** — input → CRM field mapping
7. **`fxiaokeCreateLead`** — validate phone → get token → write lead → return result
8. **`fxiaokeQueryLead`** — get token → route by mode → query → return formatted result
9. **Export both actions**

The token cache must be invalidated/resettable for testing. Use a module-level `let` variable.

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @aaas/actions test -- test/fxiaoke.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/actions/src/actions/fxiaoke.ts packages/actions/test/fxiaoke.test.ts
git commit -m "feat(actions): add fxiaoke_create_lead and fxiaoke_query_lead actions"
```

---

## Task 5: Update registry and existing tests

**Files:**
- Modify: `packages/actions/src/registry.ts`
- Modify: `packages/actions/test/actions.test.ts`

- [ ] **Step 1: Update registry.ts**

```typescript
import type { ActionDefinition } from './types.js'
import { searchWeb } from './actions/search-web.js'
import { getWeather } from './actions/get-weather.js'
import { kbSearch } from './actions/zhipu-kb.js'
import { fxiaokeCreateLead, fxiaokeQueryLead } from './actions/fxiaoke.js'
import { tianyanchaEnrich } from './actions/tianyancha.js'

export const registry = new Map<string, ActionDefinition>([
  ['search_web', searchWeb],
  ['get_weather', getWeather],
  ['kb_search', kbSearch],
  ['fxiaoke_create_lead', fxiaokeCreateLead],
  ['fxiaoke_query_lead', fxiaokeQueryLead],
  ['tianyancha_enrich', tianyanchaEnrich],
])
```

- [ ] **Step 2: Update existing test assertions**

In `packages/actions/test/actions.test.ts`, update the `'returns actions array with correct key, no execute field'` test to check for all 6 actions:

```typescript
const names = res.body.map((a: { name: string }) => a.name)
expect(names).toContain('search_web')
expect(names).toContain('get_weather')
expect(names).toContain('kb_search')
expect(names).toContain('fxiaoke_create_lead')
expect(names).toContain('fxiaoke_query_lead')
expect(names).toContain('tianyancha_enrich')
expect(names).toHaveLength(6)
```

Note: This test imports the app which imports registry which imports the new action files. The new files may reference env vars that aren't set in the test environment. Ensure env vars needed at import time are set in the test (or that the new actions read env vars lazily inside `execute`, not at module load time). The test file already sets `process.env.INTERNAL_API_KEY = 'test-key'` before importing — add the other needed env vars there too.

- [ ] **Step 3: Run all tests**

```bash
pnpm --filter @aaas/actions test
```

Expected: All tests PASS (existing + new).

- [ ] **Step 4: Commit**

```bash
git add packages/actions/src/registry.ts packages/actions/test/actions.test.ts
git commit -m "feat(actions): register kb_search, tianyancha_enrich, fxiaoke actions"
```

---

## Task 6: Update `.env.example` and verify build

**Files:**
- Modify: `.env.example` (monorepo root)

- [ ] **Step 1: Add new env vars to .env.example**

In the Actions Service section, add after `FIRECRAWL_API_KEY`:

```dotenv
# 智谱知识库 (kb_search action)
ZHIPU_KB_API_KEY=
ZHIPU_KB_IDS=<salesKbId>,<productKbId>

# 智谱 API (tianyancha_enrich action — MCP Broker auth)
ZHIPU_API_KEY=

# 纷享销客 CRM (fxiaoke actions)
FXIAOKE_APP_ID=
FXIAOKE_APP_SECRET=
FXIAOKE_PERMANENT_CODE=
```

- [ ] **Step 2: Verify build**

```bash
pnpm --filter @aaas/actions build
```

Expected: Build succeeds with no type errors.

- [ ] **Step 3: Run full test suite one final time**

```bash
pnpm --filter @aaas/actions test
```

Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add .env.example
git commit -m "docs: add env vars for new actions (zhipu kb, tianyancha, fxiaoke)"
```

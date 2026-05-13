import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import type { ActionDefinition } from '../types.js'

const MCP_BASE_URL = 'https://open.bigmodel.cn/api/mcp-broker/proxy/tianyancha/mcp'
const MCP_SSE_URL = 'https://open.bigmodel.cn/api/mcp-broker/proxy/tianyancha/sse'

function normalizeBasicInfo(raw: Record<string, unknown>) {
  const g = (...keys: string[]): string => {
    for (const k of keys) {
      const v = (raw as any)[k]
      if (v == null) continue
      if (typeof v === 'object') return JSON.stringify(v)
      if (String(v).trim()) return String(v)
    }
    return ''
  }
  return {
    name: g('name', 'companyName'),
    type: g('companyOrgType', 'type'),
    established_date: g('estiblishTime', 'establishTime', 'startDate'),
    legal_status: g('regStatus', 'operatingStatus') || '未知',
    registered_capital: g('regCapital', 'registeredCapital'),
    legal_representative: g('legalPersonName', 'legalPerson'),
    business_reg_no: g('regNumber'),
    social_credit_code: g('creditCode'),
    business_scope: g('businessScope'),
    industry: g('industry', 'industryAll'),
    staff_range: g('staffNumRange', 'employeeRange'),
  }
}

function normalizeRiskInfo(raw: Record<string, unknown>) {
  const toList = (v: unknown): unknown[] => Array.isArray(v) ? v : v ? [v] : []
  const selfRisks = toList((raw as any).selfRisk ?? (raw as any).selfRisks ?? [])
  const surroundingRisks = toList((raw as any).surroundingRisk ?? (raw as any).surroundingRisks ?? [])
  const alertRisks = toList((raw as any).alertRisk ?? (raw as any).alertRisks ?? [])
  const highCount = selfRisks.length + alertRisks.length
  const riskLevel = highCount === 0 ? '低风险' : highCount <= 3 ? '中等风险' : '高风险'
  return {
    risk_level: riskLevel,
    self_risk_count: selfRisks.length,
    surrounding_count: surroundingRisks.length,
    alert_count: alertRisks.length,
    self_risks: selfRisks.slice(0, 5),
    surrounding_risks: surroundingRisks.slice(0, 5),
    alert_risks: alertRisks.slice(0, 5),
  }
}

function normalizePatentInfo(raw: Record<string, unknown>) {
  const patents = (raw as any).items ?? (raw as any).patents ?? (raw as any).data ?? (Array.isArray(raw) ? raw : [])
  const total = (raw as any).total ?? (raw as any).count ?? patents.length
  const hasInvention = patents.some((p: any) =>
    String(p.type ?? p.patentType ?? p.applicationType ?? '').includes('发明')
  )
  return {
    total_count: typeof total === 'number' ? total : patents.length,
    has_invention_patent: hasInvention,
    patents: patents.slice(0, 10),
  }
}

function stripCodeFences(text: string): string {
  // Strip markdown code fences: ```json ... ``` or ``` ... ```
  let stripped = text.trim()
  if (stripped.startsWith('```')) {
    // Remove opening fence (with optional language tag)
    const firstNewline = stripped.indexOf('\n')
    if (firstNewline !== -1) {
      stripped = stripped.slice(firstNewline + 1)
    }
    // Remove closing fence
    if (stripped.endsWith('```')) {
      stripped = stripped.slice(0, -3).trimEnd()
    }
  }
  return stripped
}

function parseToolResult(result: { content: Array<{ type: string; text?: string }> }): any {
  const textContent = result.content.find((c) => c.type === 'text' && c.text)
  if (!textContent?.text) {
    throw new Error('No text content in MCP tool result')
  }
  const cleaned = stripCodeFences(textContent.text)
  let parsed = JSON.parse(cleaned)
  // MCP broker may double-serialize: the text field itself is a JSON string
  // containing the actual data. Only unwrap if it looks like JSON to avoid masking plain error strings.
  if (typeof parsed === 'string') {
    const trimmed = parsed.trimStart()
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        parsed = JSON.parse(parsed)
      } catch {
        // Not valid JSON despite looking like it — keep the original string
      }
    }
  }
  return parsed
}

async function callMcpTool(toolName: string, args: { keyword: string }): Promise<any> {
  const apiKey = process.env.ZHIPU_API_KEY
  if (!apiKey) {
    throw new Error('ZHIPU_API_KEY is not configured')
  }

  const authHeaders = {
    Authorization: `Bearer ${apiKey}`,
  }

  let lastError: Error | undefined

  // Try StreamableHTTPClientTransport first
  try {
    const transport = new StreamableHTTPClientTransport(new URL(MCP_BASE_URL), {
      requestInit: { headers: authHeaders },
    })
    const client = new Client({ name: 'tianyancha-enrich', version: '1.0.0' })
    try {
      await client.connect(transport)
      const result = await client.callTool({ name: toolName, arguments: args })
      return parseToolResult(result as any)
    } finally {
      await client.close()
    }
  } catch (err) {
    lastError = err instanceof Error ? err : new Error(String(err))
  }

  // Fallback to SSEClientTransport
  try {
    const transport = new SSEClientTransport(new URL(MCP_SSE_URL), {
      requestInit: { headers: authHeaders },
    })
    const client = new Client({ name: 'tianyancha-enrich', version: '1.0.0' })
    try {
      await client.connect(transport)
      const result = await client.callTool({ name: toolName, arguments: args })
      return parseToolResult(result as any)
    } finally {
      await client.close()
    }
  } catch (err) {
    const sseError = err instanceof Error ? err : new Error(String(err))
    throw new Error(
      `MCP connection failed for tool ${toolName}. StreamableHTTP error: ${lastError?.message}. SSE error: ${sseError.message}`,
    )
  }
}

export const tianyanchaEnrich: ActionDefinition = {
  name: 'tianyancha_enrich',
  description: '查询天眼查企业信息（基础信息、风险、专利），通过智谱 MCP Broker 接口',
  inputSchema: {
    type: 'object',
    properties: {
      keyword: { type: 'string', description: '公司名/注册号/统一社会信用代码' },
      include_risk: { type: 'boolean', description: '是否查风险信息（+0.20元）' },
      include_patent: { type: 'boolean', description: '是否查专利信息（+0.10元）' },
    },
    required: ['keyword'],
  },
  async execute(input, _context) {
    const { keyword, include_risk = false, include_patent = false } = input as {
      keyword: string
      include_risk?: boolean
      include_patent?: boolean
    }

    // Read env var lazily inside execute
    const apiKey = process.env.ZHIPU_API_KEY
    if (!apiKey) {
      return { error: 'ZHIPU_API_KEY is not configured', keyword }
    }

    try {
      // Always query basic info
      const basicRaw = await callMcpTool('companyBaseInfo', { keyword })

      const result: Record<string, unknown> = {
        keyword,
        basic_info: normalizeBasicInfo(basicRaw),
      }

      // Optionally query risk info
      if (include_risk) {
        const riskRaw = await callMcpTool('risk', { keyword })
        result.risk_info = normalizeRiskInfo(riskRaw)
      }

      // Optionally query patent info
      if (include_patent) {
        const patentRaw = await callMcpTool('enterprisePatent', { keyword })
        result.patent_info = normalizePatentInfo(patentRaw)
      }

      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return { error: message, keyword }
    }
  },
}

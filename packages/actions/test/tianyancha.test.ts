import { describe, it, expect, vi, beforeEach } from 'vitest'

// Set env var before importing
process.env.ZHIPU_API_KEY = 'test-zhipu-key'

// Mock the MCP SDK modules
const mockCallTool = vi.fn()
const mockConnect = vi.fn()
const mockClose = vi.fn()

const mockClientInstance = {
  connect: mockConnect,
  close: mockClose,
  callTool: mockCallTool,
}

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => {
  return {
    Client: vi.fn(() => mockClientInstance),
  }
})

vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => {
  return {
    StreamableHTTPClientTransport: vi.fn((url: URL, opts?: any) => ({
      url,
      opts,
      start: vi.fn(),
      close: vi.fn(),
      send: vi.fn(),
    })),
  }
})

vi.mock('@modelcontextprotocol/sdk/client/sse.js', () => {
  return {
    SSEClientTransport: vi.fn((url: URL, opts?: any) => ({
      url,
      opts,
      start: vi.fn(),
      close: vi.fn(),
      send: vi.fn(),
    })),
  }
})

let tianyanchaEnrich: typeof import('../src/actions/tianyancha.js')['tianyanchaEnrich']

describe('tianyancha_enrich action', () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    process.env.ZHIPU_API_KEY = 'test-zhipu-key'

    // Re-mock after resetModules
    vi.doMock('@modelcontextprotocol/sdk/client/index.js', () => ({
      Client: vi.fn(() => ({
        connect: mockConnect,
        close: mockClose,
        callTool: mockCallTool,
      })),
    }))
    vi.doMock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
      StreamableHTTPClientTransport: vi.fn((url: URL, opts?: any) => ({
        url,
        opts,
        start: vi.fn(),
        close: vi.fn(),
        send: vi.fn(),
      })),
    }))
    vi.doMock('@modelcontextprotocol/sdk/client/sse.js', () => ({
      SSEClientTransport: vi.fn((url: URL, opts?: any) => ({
        url,
        opts,
        start: vi.fn(),
        close: vi.fn(),
        send: vi.fn(),
      })),
    }))

    mockConnect.mockReset().mockResolvedValue(undefined)
    mockClose.mockReset().mockResolvedValue(undefined)

    const mod = await import('../src/actions/tianyancha.js')
    tianyanchaEnrich = mod.tianyanchaEnrich
  })

  it('has valid ActionDefinition structure', () => {
    expect(tianyanchaEnrich.name).toBe('tianyancha_enrich')
    expect(tianyanchaEnrich.description).toBeTruthy()
    expect(tianyanchaEnrich.inputSchema.type).toBe('object')
    expect(tianyanchaEnrich.inputSchema.required).toContain('keyword')
    expect(tianyanchaEnrich.inputSchema.properties).toHaveProperty('keyword')
    expect(tianyanchaEnrich.inputSchema.properties).toHaveProperty('include_risk')
    expect(tianyanchaEnrich.inputSchema.properties).toHaveProperty('include_patent')
    expect(typeof tianyanchaEnrich.execute).toBe('function')
  })

  it('basic info query returns normalized fields', async () => {
    const basicRaw = {
      name: '北京智谱华章科技有限公司',
      companyOrgType: '有限责任公司',
      estiblishTime: '2019-06-01',
      regStatus: '在营',
      regCapital: '1000万人民币',
      legalPersonName: '张三',
      regNumber: '11010801234567',
      creditCode: '91110108MA01XXXXX',
      businessScope: '技术开发、技术咨询',
      industry: '软件和信息技术服务业',
      staffNumRange: '50-100人',
    }

    mockCallTool.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(basicRaw) }],
    })

    const result = await tianyanchaEnrich.execute(
      { keyword: '北京智谱华章科技有限公司' },
      { agentId: 'a1', conversationId: 'c1' },
    )

    const body = result as any
    expect(body.keyword).toBe('北京智谱华章科技有限公司')
    expect(body.basic_info).toBeDefined()
    expect(body.basic_info.name).toBe('北京智谱华章科技有限公司')
    expect(body.basic_info.type).toBe('有限责任公司')
    expect(body.basic_info.established_date).toBe('2019-06-01')
    expect(body.basic_info.legal_status).toBe('在营')
    expect(body.basic_info.registered_capital).toBe('1000万人民币')
    expect(body.basic_info.legal_representative).toBe('张三')
    expect(body.basic_info.business_reg_no).toBe('11010801234567')
    expect(body.basic_info.social_credit_code).toBe('91110108MA01XXXXX')
    expect(body.basic_info.business_scope).toBe('技术开发、技术咨询')
    expect(body.basic_info.industry).toBe('软件和信息技术服务业')
    expect(body.basic_info.staff_range).toBe('50-100人')
    expect(body.risk_info).toBeUndefined()
    expect(body.patent_info).toBeUndefined()

    // Verify callTool was called for companyBaseInfo
    expect(mockCallTool).toHaveBeenCalledWith(
      { name: 'companyBaseInfo', arguments: { keyword: '北京智谱华章科技有限公司' } },
    )
  })

  it('risk info query when include_risk=true', async () => {
    const basicRaw = { name: '测试公司', regStatus: '在营' }
    const riskRaw = {
      selfRisk: [{ type: '法律诉讼', count: 2 }],
      surroundingRisk: [{ type: '经营异常', count: 1 }],
      alertRisk: [{ type: '行政处罚', count: 3 }],
    }

    mockCallTool
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: JSON.stringify(basicRaw) }],
      })
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: JSON.stringify(riskRaw) }],
      })

    const result = await tianyanchaEnrich.execute(
      { keyword: '测试公司', include_risk: true },
      { agentId: 'a1', conversationId: 'c1' },
    )

    const body = result as any
    expect(body.risk_info).toBeDefined()
    // selfRisks has 1 item, alertRisks has 1 item → highCount = 2 → 中等风险
    expect(body.risk_info.risk_level).toBe('中等风险')
    expect(body.risk_info.self_risk_count).toBe(1)
    expect(body.risk_info.surrounding_count).toBe(1)
    expect(body.risk_info.alert_count).toBe(1)
    expect(body.risk_info.self_risks).toHaveLength(1)
    expect(body.risk_info.surrounding_risks).toHaveLength(1)
    expect(body.risk_info.alert_risks).toHaveLength(1)

    // Verify risk tool was called
    expect(mockCallTool).toHaveBeenCalledWith(
      { name: 'risk', arguments: { keyword: '测试公司' } },
    )
  })

  it('patent info query when include_patent=true', async () => {
    const basicRaw = { name: '专利公司', regStatus: '存续' }
    const patentRaw = {
      items: [
        { name: '专利1', type: '发明专利' },
        { name: '专利2', type: '实用新型' },
      ],
      total: 5,
    }

    mockCallTool
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: JSON.stringify(basicRaw) }],
      })
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: JSON.stringify(patentRaw) }],
      })

    const result = await tianyanchaEnrich.execute(
      { keyword: '专利公司', include_patent: true },
      { agentId: 'a1', conversationId: 'c1' },
    )

    const body = result as any
    expect(body.patent_info).toBeDefined()
    expect(body.patent_info.total_count).toBe(5)
    expect(body.patent_info.has_invention_patent).toBe(true)
    expect(body.patent_info.patents).toHaveLength(2)

    // Verify patent tool was called
    expect(mockCallTool).toHaveBeenCalledWith(
      { name: 'enterprisePatent', arguments: { keyword: '专利公司' } },
    )
  })

  it('handles risk level correctly: low risk', async () => {
    const basicRaw = { name: '安全公司' }
    const riskRaw = {
      selfRisk: [],
      surroundingRisk: [],
      alertRisk: [],
    }

    mockCallTool
      .mockResolvedValueOnce({ content: [{ type: 'text', text: JSON.stringify(basicRaw) }] })
      .mockResolvedValueOnce({ content: [{ type: 'text', text: JSON.stringify(riskRaw) }] })

    const result = await tianyanchaEnrich.execute(
      { keyword: '安全公司', include_risk: true },
      { agentId: 'a1', conversationId: 'c1' },
    )

    expect((result as any).risk_info.risk_level).toBe('低风险')
  })

  it('handles markdown code fences in response text', async () => {
    const basicRaw = { name: '代码围栏公司', companyName: '代码围栏公司' }
    const fencedText = '```json\n' + JSON.stringify(basicRaw) + '\n```'

    mockCallTool.mockResolvedValue({
      content: [{ type: 'text', text: fencedText }],
    })

    const result = await tianyanchaEnrich.execute(
      { keyword: '代码围栏公司' },
      { agentId: 'a1', conversationId: 'c1' },
    )

    expect((result as any).basic_info.name).toBe('代码围栏公司')
  })

  it('MCP connection errors are handled gracefully', async () => {
    mockConnect.mockRejectedValue(new Error('Connection refused'))

    const result = await tianyanchaEnrich.execute(
      { keyword: '失败公司' },
      { agentId: 'a1', conversationId: 'c1' },
    )

    const body = result as any
    expect(body.error).toBeDefined()
    expect(body.error).toContain('Connection refused')
  })

  it('missing ZHIPU_API_KEY returns error', async () => {
    delete process.env.ZHIPU_API_KEY

    const result = await tianyanchaEnrich.execute(
      { keyword: '无Key公司' },
      { agentId: 'a1', conversationId: 'c1' },
    )

    const body = result as any
    expect(body.error).toBeDefined()
    expect(body.error).toContain('ZHIPU_API_KEY')
  })

  it('field normalization uses fallback keys', async () => {
    const basicRaw = {
      companyName: '回退公司',
      type: '股份有限公司',
      establishTime: '2020-01-01',
      operatingStatus: '正常',
      registeredCapital: '500万',
      legalPerson: '李四',
    }

    mockCallTool.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(basicRaw) }],
    })

    const result = await tianyanchaEnrich.execute(
      { keyword: '回退公司' },
      { agentId: 'a1', conversationId: 'c1' },
    )

    const info = (result as any).basic_info
    expect(info.name).toBe('回退公司')
    expect(info.type).toBe('股份有限公司')
    expect(info.established_date).toBe('2020-01-01')
    expect(info.legal_status).toBe('正常')
    expect(info.registered_capital).toBe('500万')
    expect(info.legal_representative).toBe('李四')
  })

  it('patent normalization handles array-only response', async () => {
    const basicRaw = { name: '数组公司' }
    const patentRaw = [
      { name: '专利A', type: '外观设计' },
    ]

    mockCallTool
      .mockResolvedValueOnce({ content: [{ type: 'text', text: JSON.stringify(basicRaw) }] })
      .mockResolvedValueOnce({ content: [{ type: 'text', text: JSON.stringify(patentRaw) }] })

    const result = await tianyanchaEnrich.execute(
      { keyword: '数组公司', include_patent: true },
      { agentId: 'a1', conversationId: 'c1' },
    )

    const patentInfo = (result as any).patent_info
    expect(patentInfo.total_count).toBe(1)
    expect(patentInfo.has_invention_patent).toBe(false)
    expect(patentInfo.patents).toHaveLength(1)
  })

  it('closes MCP client after successful query', async () => {
    const basicRaw = { name: '关闭公司' }
    mockCallTool.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(basicRaw) }],
    })

    await tianyanchaEnrich.execute(
      { keyword: '关闭公司' },
      { agentId: 'a1', conversationId: 'c1' },
    )

    expect(mockClose).toHaveBeenCalled()
  })
})

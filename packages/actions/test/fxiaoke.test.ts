import { describe, it, expect, vi, beforeEach } from 'vitest'

// Set env vars before importing the module
process.env.FXIAOKE_APP_ID = 'test-app-id'
process.env.FXIAOKE_APP_SECRET = 'test-app-secret'
process.env.FXIAOKE_PERMANENT_CODE = 'test-perm-code'

// Mock global fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

let fxiaokeCreateLead: typeof import('../src/actions/fxiaoke.js')['fxiaokeCreateLead']
let fxiaokeQueryLead: typeof import('../src/actions/fxiaoke.js')['fxiaokeQueryLead']

// Helper to create auth response
function authResponse(overrides: Record<string, any> = {}) {
  return {
    errorCode: 0,
    corpAccessToken: 'test-token',
    corpId: 'test-corp-id',
    expiresIn: 7200,
    ...overrides,
  }
}

// Helper to extract request body from fetch call
function getCallBody(callIndex: number): any {
  return JSON.parse(mockFetch.mock.calls[callIndex][1]!.body as string)
}

describe('fxiaoke actions', () => {
  beforeEach(async () => {
    vi.resetModules()
    mockFetch.mockReset()
    process.env.FXIAOKE_APP_ID = 'test-app-id'
    process.env.FXIAOKE_APP_SECRET = 'test-app-secret'
    process.env.FXIAOKE_PERMANENT_CODE = 'test-perm-code'

    const mod = await import('../src/actions/fxiaoke.js')
    fxiaokeCreateLead = mod.fxiaokeCreateLead
    fxiaokeQueryLead = mod.fxiaokeQueryLead
  })

  describe('fxiaoke_create_lead', () => {
    it('has valid ActionDefinition structure', () => {
      expect(fxiaokeCreateLead.name).toBe('fxiaoke_create_lead')
      expect(fxiaokeCreateLead.description).toBeTruthy()
      expect(fxiaokeCreateLead.inputSchema.type).toBe('object')
      expect(fxiaokeCreateLead.inputSchema.required).toContain('name')
      expect(fxiaokeCreateLead.inputSchema.required).toContain('mobile')
      expect(fxiaokeCreateLead.inputSchema.required).toContain('company')
      expect(fxiaokeCreateLead.inputSchema.required).toContain('creator_user_id')
      expect(fxiaokeCreateLead.inputSchema.required).toContain('leads_pool_id')
      expect(fxiaokeCreateLead.inputSchema.properties).toHaveProperty('mobile')
      expect(typeof fxiaokeCreateLead.execute).toBe('function')
    })

    it('rejects invalid phone format', async () => {
      const result = await fxiaokeCreateLead.execute(
        { name: 'Test', mobile: '12345', company: 'Co', creator_user_id: 'u1', leads_pool_id: 'p1' },
        { agentId: 'a1', conversationId: 'c1' },
      )
      expect((result as any).success).toBe(false)
      expect((result as any).error).toContain('手机号格式不正确')
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('rejects fake phone numbers', async () => {
      const result = await fxiaokeCreateLead.execute(
        { name: 'Test', mobile: '13800138000', company: 'Co', creator_user_id: 'u1', leads_pool_id: 'p1' },
        { agentId: 'a1', conversationId: 'c1' },
      )
      expect((result as any).success).toBe(false)
      expect((result as any).error).toContain('测试手机号')
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('successfully creates a lead with correct field mapping', async () => {
      // Auth call
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(authResponse()) })
      // Write call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ errorCode: 0, dataId: 'lead-123' }),
      })

      const result = await fxiaokeCreateLead.execute(
        {
          name: '张三',
          mobile: '13912345678',
          company: '测试公司',
          email: 'test@example.com',
          position: '经理',
          address: '北京市朝阳区',
          industry: '互联网',
          company_size_code: 'SM',
          business: '云计算',
          usage: '内部使用',
          creator_user_id: 'user-001',
          leads_pool_id: 'pool-001',
          source: '官网',
          remarks: '重要客户',
          second_phone: '13987654321',
          customer_id: 'cust-001',
        },
        { agentId: 'a1', conversationId: 'c1' },
      )

      expect(mockFetch).toHaveBeenCalledTimes(2)

      // Verify auth call
      const authBody = getCallBody(0)
      expect(authBody.appId).toBe('test-app-id')
      expect(authBody.appSecret).toBe('test-app-secret')
      expect(authBody.permanentCode).toBe('test-perm-code')

      // Verify write call with field mapping
      const writeBody = getCallBody(1)
      expect(writeBody.corpAccessToken).toBe('test-token')
      expect(writeBody.corpId).toBe('test-corp-id')
      expect(writeBody.currentOpenUserId).toBe('user-001')
      expect(writeBody.data.skipCheckCleanOwner).toBe(true)

      const obj = writeBody.data.object_data
      expect(obj.dataObjectApiName).toBe('LeadsObj')
      expect(obj.name).toBe('张三')
      expect(obj.mobile).toBe('13912345678')
      expect(obj.company).toBe('测试公司')
      expect(obj.email).toBe('test@example.com')
      expect(obj.job_title).toBe('经理')
      expect(obj.address).toBe('北京市朝阳区')
      expect(obj.field_ut2B9__c).toBe('北京市朝阳区')
      expect(obj.field_tn2yY__c).toBe('SM')
      expect(obj.field_98ov1__c).toBe('互联网')
      expect(obj.field_r0ZXk__c).toBe('云计算')
      expect(obj.remark).toBe('内部使用')
      expect(obj.source).toBe('官网')
      expect(obj.leads_pool_id).toBe('pool-001')
      expect(obj.field_6FM3b__c).toBe('重要客户')
      expect(obj.field_8ekqS__c).toBe('13987654321')
      expect(obj.zhipu_id__c).toBe('cust-001')

      expect((result as any).success).toBe(true)
      expect((result as any).dataId).toBe('lead-123')
    })

    it('handles CRM API error', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(authResponse()) })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ errorCode: 1001, errorMessage: 'duplicate lead' }),
      })

      const result = await fxiaokeCreateLead.execute(
        { name: 'Test', mobile: '13912345678', company: 'Co', creator_user_id: 'u1', leads_pool_id: 'p1' },
        { agentId: 'a1', conversationId: 'c1' },
      )

      expect((result as any).success).toBe(false)
      expect((result as any).error).toContain('duplicate lead')
    })

    it('handles network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('network failure'))

      const result = await fxiaokeCreateLead.execute(
        { name: 'Test', mobile: '13912345678', company: 'Co', creator_user_id: 'u1', leads_pool_id: 'p1' },
        { agentId: 'a1', conversationId: 'c1' },
      )

      expect((result as any).success).toBe(false)
      expect((result as any).error).toContain('network failure')
    })

    it('returns error when env vars are missing', async () => {
      delete process.env.FXIAOKE_APP_ID

      const result = await fxiaokeCreateLead.execute(
        { name: 'Test', mobile: '13912345678', company: 'Co', creator_user_id: 'u1', leads_pool_id: 'p1' },
        { agentId: 'a1', conversationId: 'c1' },
      )

      expect((result as any).success).toBe(false)
      expect((result as any).error).toContain('凭证未配置')
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe('fxiaoke_query_lead', () => {
    it('has valid ActionDefinition structure', () => {
      expect(fxiaokeQueryLead.name).toBe('fxiaoke_query_lead')
      expect(fxiaokeQueryLead.description).toBeTruthy()
      expect(fxiaokeQueryLead.inputSchema.type).toBe('object')
      expect(fxiaokeQueryLead.inputSchema.required).toContain('mode')
      expect(fxiaokeQueryLead.inputSchema.required).toContain('operator_user_id')
      expect(fxiaokeQueryLead.inputSchema.properties).toHaveProperty('mode')
      expect(fxiaokeQueryLead.inputSchema.properties).toHaveProperty('operator_user_id')
      expect(typeof fxiaokeQueryLead.execute).toBe('function')
    })

    it('queries by mobile — leads exist', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(authResponse()) })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          errorCode: 0,
          data: {
            total: 2,
            dataList: [
              { _id: 'l1', name: '张三', mobile: '13912345678', company: 'A', source: 'web', life_status: 'active', owner: 'sales1', create_time: 1700000000000 },
              { _id: 'l2', name: '李四', mobile: '13912345678', company: 'B', source: 'ref', life_status: 'inactive', owner: 'sales2', create_time: 1700000001000 },
            ],
          },
        }),
      })

      const result = await fxiaokeQueryLead.execute(
        { mode: 'mobile', mobile: '13912345678', operator_user_id: 'op-001' },
        { agentId: 'a1', conversationId: 'c1' },
      )

      expect(mockFetch).toHaveBeenCalledTimes(2)
      // Verify query uses operator_user_id directly as currentOpenUserId
      const queryBody = getCallBody(1)
      expect(queryBody.currentOpenUserId).toBe('op-001')
      expect(queryBody.data.dataObjectApiName).toBe('LeadsObj')
      expect(queryBody.data.search_query_info.filters).toEqual([
        { field_name: 'mobile', field_values: ['13912345678'], operator: 'EQ' },
      ])

      expect((result as any).success).toBe(true)
      expect((result as any).mode).toBe('mobile')
      expect((result as any).exists).toBe(true)
      expect((result as any).count).toBe(2)
      expect((result as any).leads).toHaveLength(2)
      expect((result as any).suggestion).toContain('已存在 2 条')
    })

    it('queries by mobile — no leads', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(authResponse()) })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          errorCode: 0,
          data: { total: 0, dataList: [] },
        }),
      })

      const result = await fxiaokeQueryLead.execute(
        { mode: 'mobile', mobile: '13900001111', operator_user_id: 'op-001' },
        { agentId: 'a1', conversationId: 'c1' },
      )

      expect((result as any).success).toBe(true)
      expect((result as any).exists).toBe(false)
      expect((result as any).count).toBe(0)
      expect((result as any).suggestion).toBe('安全，可以录入')
    })

    it('queries by data_id (detail mode)', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(authResponse()) })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          errorCode: 0,
          data: {
            total: 1,
            dataList: [{ _id: 'lead-detail-1', name: '张三', mobile: '13912345678', company: 'A' }],
          },
        }),
      })

      const result = await fxiaokeQueryLead.execute(
        { mode: 'detail', data_id: 'lead-detail-1', operator_user_id: 'op-001' },
        { agentId: 'a1', conversationId: 'c1' },
      )

      const queryBody = getCallBody(1)
      expect(queryBody.data.search_query_info.filters).toEqual([
        { field_name: '_id', field_values: ['lead-detail-1'], operator: 'EQ' },
      ])

      expect((result as any).success).toBe(true)
      expect((result as any).mode).toBe('detail')
      expect((result as any).exists).toBe(true)
      expect((result as any).lead.name).toBe('张三')
    })

    it('queries detail mode — not found', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(authResponse()) })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          errorCode: 0,
          data: { total: 0, dataList: [] },
        }),
      })

      const result = await fxiaokeQueryLead.execute(
        { mode: 'detail', data_id: 'nonexistent', operator_user_id: 'op-001' },
        { agentId: 'a1', conversationId: 'c1' },
      )

      expect((result as any).success).toBe(true)
      expect((result as any).exists).toBe(false)
      expect((result as any).lead).toBeNull()
    })

    it('queries list mode with filters', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(authResponse()) })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          errorCode: 0,
          data: {
            total: 1,
            dataList: [
              { _id: 'l1', name: '张三', mobile: '13912345678', company: '测试公司', source: 'web', life_status: 'active', owner: 'sales1', create_time: 1700000000000 },
            ],
          },
        }),
      })

      const result = await fxiaokeQueryLead.execute(
        { mode: 'list', company: '测试公司', source: 'web', life_status: 'active', limit: 20, offset: 5, operator_user_id: 'op-001' },
        { agentId: 'a1', conversationId: 'c1' },
      )

      const queryBody = getCallBody(1)
      expect(queryBody.data.search_query_info.limit).toBe(20)
      expect(queryBody.data.search_query_info.offset).toBe(5)
      expect(queryBody.data.search_query_info.filters).toEqual([
        { field_name: 'company', field_values: ['测试公司'], operator: 'EQ' },
        { field_name: 'source', field_values: ['web'], operator: 'EQ' },
        { field_name: 'life_status', field_values: ['active'], operator: 'EQ' },
      ])

      expect((result as any).success).toBe(true)
      expect((result as any).mode).toBe('list')
      expect((result as any).total).toBe(1)
      expect((result as any).leads).toHaveLength(1)
    })

    it('handles query API error', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(authResponse()) })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ errorCode: 500, errorMessage: 'server error' }),
      })

      const result = await fxiaokeQueryLead.execute(
        { mode: 'mobile', mobile: '13912345678', operator_user_id: 'op-001' },
        { agentId: 'a1', conversationId: 'c1' },
      )

      expect((result as any).success).toBe(false)
      expect((result as any).error).toContain('server error')
    })

    it('rejects unsupported mode', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(authResponse()) })

      const result = await fxiaokeQueryLead.execute(
        { mode: 'invalid', operator_user_id: 'op-001' },
        { agentId: 'a1', conversationId: 'c1' },
      )

      expect((result as any).success).toBe(false)
      expect((result as any).error).toContain('不支持的查询模式')
    })

    it('token caching — second call reuses token', async () => {
      const authResp = authResponse()
      // First call: create lead
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(authResp) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ errorCode: 0, data: { id: 'l1' } }) })
      // Second call: query lead — should NOT re-auth
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ errorCode: 0, data: { total: 0, dataList: [] } }),
        })

      await fxiaokeCreateLead.execute(
        { name: 'Test', mobile: '13912345678', company: 'Co', creator_user_id: 'u1', leads_pool_id: 'p1' },
        { agentId: 'a1', conversationId: 'c1' },
      )

      await fxiaokeQueryLead.execute(
        { mode: 'mobile', mobile: '13912345678', operator_user_id: 'op-001' },
        { agentId: 'a1', conversationId: 'c1' },
      )

      // Only 3 fetch calls: 1 auth + 1 create + 1 query (no second auth)
      expect(mockFetch).toHaveBeenCalledTimes(3)

      // Verify the query call uses the cached token
      const queryBody = getCallBody(2)
      expect(queryBody.corpAccessToken).toBe('test-token')
      expect(queryBody.corpId).toBe('test-corp-id')
    })

    it('mobile mode requires mobile parameter', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(authResponse()) })

      const result = await fxiaokeQueryLead.execute(
        { mode: 'mobile', operator_user_id: 'op-001' },
        { agentId: 'a1', conversationId: 'c1' },
      )

      expect((result as any).success).toBe(false)
      expect((result as any).error).toContain('mobile')
    })

    it('detail mode requires data_id parameter', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(authResponse()) })

      const result = await fxiaokeQueryLead.execute(
        { mode: 'detail', operator_user_id: 'op-001' },
        { agentId: 'a1', conversationId: 'c1' },
      )

      expect((result as any).success).toBe(false)
      expect((result as any).error).toContain('data_id')
    })
  })
})

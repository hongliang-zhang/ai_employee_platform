import type { ActionDefinition } from '../types.js'

// API Endpoints (constants, NOT env vars)
const FXIAOKE_AUTH_URL = 'https://open.fxiaoke.com/cgi/corpAccessToken/get/V2'
const FXIAOKE_OPEN_USER_URL = 'https://open.fxiaoke.com/cgi/user/getByMobile'
const FXIAOKE_WRITE_URL = 'https://open.fxiaoke.com/cgi/crm/v2/data/create'
const FXIAOKE_QUERY_URL = 'https://open.fxiaoke.com/cgi/crm/v2/data/query'

// Fake phone numbers to reject
const FAKE_MOBILES = new Set([
  '13800138000', '13888888888', '12345678901', '11111111111',
  '13900000000', '00000000000', '99999999999', '10000000000',
])

// OAuth Token Cache (module-level singleton). In serverless/worker-thread deployments
// this cache is lost on cold start, causing an extra auth request per invocation.
let tokenCache: { token: string; corpId: string; expiresAt: number } | null = null

async function getToken(): Promise<{ token: string; corpId: string }> {
  if (tokenCache && Date.now() < tokenCache.expiresAt - 60_000) return tokenCache
  const resp = await fetch(FXIAOKE_AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      appId: process.env.FXIAOKE_APP_ID,
      appSecret: process.env.FXIAOKE_APP_SECRET,
      permanentCode: process.env.FXIAOKE_PERMANENT_CODE,
    }),
  })
  const body = await resp.json() as any
  if (body.errorCode !== 0) throw new Error(`FXiaoke auth failed: ${body.errorMessage}`)
  tokenCache = {
    token: body.corpAccessToken,
    corpId: body.corpId,
    expiresAt: Date.now() + (body.expiresIn ?? 7200) * 1000,
  }
  return tokenCache
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function getOpenUserId(token: string, corpId: string, mobile: string): Promise<string | null> {
  const resp = await fetch(FXIAOKE_OPEN_USER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ corpAccessToken: token, corpId, mobile }),
  })
  const body = await resp.json() as any
  if (body.errorCode !== 0 || !body.empList?.length) return null
  return body.empList[0].openUserId
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function getPersonnelUserId(token: string, corpId: string, operatorUserId: string, name: string): Promise<string | null> {
  const resp = await fetch(FXIAOKE_QUERY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      corpAccessToken: token, corpId,
      currentOpenUserId: operatorUserId,
      data: {
        dataObjectApiName: 'PersonnelObj',
        search_query_info: {
          limit: 1, offset: 0,
          filters: [
            { field_name: 'life_status', field_values: ['invalid'], operator: 'NIN' },
            { field_name: 'name', field_values: [name], operator: 'EQ' },
          ],
          orders: [{ fieldName: 'name', isAsc: true }],
        },
      },
    }),
  })
  const body = await resp.json() as any
  if (body.errorCode !== 0) return null
  const dataList = body.data?.dataList
  if (!dataList?.length) return null
  return dataList[0].user_id
}

async function queryLeads(token: string, corpId: string, userId: string, filters: any[], limit = 10, offset = 0) {
  const resp = await fetch(FXIAOKE_QUERY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      corpAccessToken: token, corpId,
      currentOpenUserId: userId,
      data: {
        dataObjectApiName: 'LeadsObj',
        search_query_info: {
          limit, offset, filters,
          orders: [{ fieldName: 'create_time', isAsc: false }],
        },
      },
    }),
  })
  const body = await resp.json() as any
  if (body.errorCode !== 0) throw new Error(`Query leads failed: ${body.errorMessage}`)
  return body.data // { total, dataList }
}

export const fxiaokeCreateLead: ActionDefinition = {
  name: 'fxiaoke_create_lead',
  description: '在纷享销客CRM中创建线索（LeadsObj）',
  inputSchema: {
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
      business: { type: 'string' },
      usage: { type: 'string' },
      creator_user_id: { type: 'string', description: '归属销售user_id' },
      leads_pool_id: { type: 'string', description: '线索池ID' },
      potential_level: { type: 'string', description: 'high/low/unknown' },
      source: { type: 'string' },
      remarks: { type: 'string' },
      second_phone: { type: 'string' },
      customer_id: { type: 'string' },
    },
    required: ['name', 'mobile', 'company', 'creator_user_id', 'leads_pool_id'],
  },
  async execute(input, _context) {
    const data = input as Record<string, any>
    const { name, mobile, company, creator_user_id, leads_pool_id } = data

    // Phone validation
    if (!/^1[3-9]\d{9}$/.test(mobile)) {
      return { success: false, error: '手机号格式不正确，必须是11位且以1开头', mobile }
    }
    if (FAKE_MOBILES.has(mobile)) {
      return { success: false, error: '无效的测试手机号', mobile }
    }

    // Check required env vars
    if (!process.env.FXIAOKE_APP_ID || !process.env.FXIAOKE_APP_SECRET || !process.env.FXIAOKE_PERMANENT_CODE) {
      return { success: false, error: '纷享销客API凭证未配置' }
    }

    try {
      const { token, corpId } = await getToken()

      // Build lead object with field mapping
      const leadObject: Record<string, any> = {
        dataObjectApiName: 'LeadsObj',
        name,
        mobile,
        company,
      }

      // Optional field mapping
      if (data.email) leadObject.email = data.email
      if (data.position) leadObject.job_title = data.position
      if (data.address) {
        leadObject.address = data.address
        leadObject.field_ut2B9__c = data.address // CRM custom address field mirrors the standard address field
      }
      if (data.company_size_code) leadObject.field_tn2yY__c = data.company_size_code
      if (data.industry) leadObject.field_98ov1__c = data.industry
      if (data.business) leadObject.field_r0ZXk__c = data.business
      if (data.usage) leadObject.remark = data.usage
      if (data.source) leadObject.source = data.source
      if (leads_pool_id) leadObject.leads_pool_id = leads_pool_id
      if (data.remarks) leadObject.field_6FM3b__c = data.remarks
      if (data.second_phone) leadObject.field_8ekqS__c = data.second_phone
      if (data.customer_id) leadObject.zhipu_id__c = data.customer_id

      const resp = await fetch(FXIAOKE_WRITE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          corpAccessToken: token,
          corpId,
          currentOpenUserId: creator_user_id,
          data: {
            object_data: leadObject,
            skipCheckCleanOwner: true,
          },
        }),
      })

      const body = await resp.json() as any
      if (body.errorCode !== 0) {
        return { success: false, error: `CRM创建失败: ${body.errorMessage}`, errorCode: body.errorCode }
      }

      return {
        success: true,
        dataId: body.dataId,
        name,
        mobile,
        company,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return { success: false, error: message }
    }
  },
}

export const fxiaokeQueryLead: ActionDefinition = {
  name: 'fxiaoke_query_lead',
  description: '查询纷享销客CRM线索（LeadsObj），支持按手机号、详情、列表模式',
  inputSchema: {
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
  },
  async execute(input, _context) {
    const data = input as Record<string, any>
    const { mode, operator_user_id } = data

    // Check required env vars
    if (!process.env.FXIAOKE_APP_ID || !process.env.FXIAOKE_APP_SECRET || !process.env.FXIAOKE_PERMANENT_CODE) {
      return { success: false, error: '纷享销客API凭证未配置' }
    }

    try {
      const { token, corpId } = await getToken()

      // operator_user_id is passed DIRECTLY as currentOpenUserId
      const userId = operator_user_id

      if (mode === 'mobile') {
        // Query by mobile number
        if (!data.mobile) {
          return { success: false, error: 'mobile模式需要提供mobile参数' }
        }

        const filters = [
          { field_name: 'mobile', field_values: [data.mobile], operator: 'EQ' },
        ]

        const result = await queryLeads(token, corpId, userId, filters, 10, 0)
        const leads = (result?.dataList ?? []).map((lead: any) => ({
          _id: lead._id,
          name: lead.name,
          mobile: lead.mobile,
          company: lead.company,
          source: lead.source,
          life_status: lead.life_status,
          owner: lead.owner,
          create_time: lead.create_time,
        }))
        const count = result?.total ?? leads.length

        let suggestion: string
        if (count === 0) {
          suggestion = '安全，可以录入'
        } else {
          suggestion = `已存在 ${count} 条相同手机号的线索，请勿重复录入`
        }

        return {
          success: true,
          mode: 'mobile',
          mobile: data.mobile,
          exists: count > 0,
          count,
          leads,
          suggestion,
        }
      }

      if (mode === 'detail') {
        // Query by data_id
        if (!data.data_id) {
          return { success: false, error: 'detail模式需要提供data_id参数' }
        }

        const filters = [
          { field_name: '_id', field_values: [data.data_id], operator: 'EQ' },
        ]

        const result = await queryLeads(token, corpId, userId, filters, 1, 0)
        const leads = result?.dataList ?? []

        if (!leads.length) {
          return { success: true, mode: 'detail', data_id: data.data_id, exists: false, lead: null }
        }

        return {
          success: true,
          mode: 'detail',
          data_id: data.data_id,
          exists: true,
          lead: leads[0],
        }
      }

      if (mode === 'list') {
        // List mode with filters
        const filters: any[] = []

        if (data.company) {
          filters.push({ field_name: 'company', field_values: [data.company], operator: 'EQ' })
        }
        if (data.source) {
          filters.push({ field_name: 'source', field_values: [data.source], operator: 'EQ' })
        }
        if (data.life_status) {
          filters.push({ field_name: 'life_status', field_values: [data.life_status], operator: 'EQ' })
        }

        const limit = data.limit ?? 10
        const offset = data.offset ?? 0

        const result = await queryLeads(token, corpId, userId, filters, limit, offset)
        const leads = (result?.dataList ?? []).map((lead: any) => ({
          _id: lead._id,
          name: lead.name,
          mobile: lead.mobile,
          company: lead.company,
          source: lead.source,
          life_status: lead.life_status,
          owner: lead.owner,
          create_time: lead.create_time,
        }))

        return {
          success: true,
          mode: 'list',
          total: result?.total ?? 0,
          count: leads.length,
          leads,
        }
      }

      return { success: false, error: `不支持的查询模式: ${mode}，可选: mobile / detail / list` }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return { success: false, error: message }
    }
  },
}

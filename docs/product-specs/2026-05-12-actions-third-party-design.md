# Actions Service: 新增三方 API Action

**日期：** 2026-05-12
**分支：** actions-third-party
**前置文档：** [maas-sales-agent 重构设计](~/monorepo/agent-hub/docs/superpowers/specs/2026-05-11-maas-sales-agent-design.md)

---

## 背景

maas-sales-agent 重构需要将 MVP 中 sandbox 直接持有的三方 API 调用迁移到 Actions Service，使 sandbox 零三方 API Key。涉及的三个三方服务：

| 服务 | MVP 实现 | 迁移目标 |
|------|----------|----------|
| 智谱知识库 | `kb-search.ts`（TS） | `zhipu-kb.ts` |
| 天眼查 | `enrich_company.py` + `tianyancha_client.py`（Python，通过智谱 MCP Broker） | `tianyancha.ts`（MCP SSE 直连） |
| 纷享销客 CRM | `create_lead.py` + `query_lead.py` + `fxiaoke_client.py`（Python） | `fxiaoke.ts` |

## 设计原则

**Actions 作为纯 API 网关，不做业务决策。**

MVP 中 `fxiaoke_client.py` 混杂了 API 通信和业务逻辑（潜客分级、销售归属路由、飞书通知等）。这种耦合违反了 Actions Service 的定位——它应该和具体 agent 无关，不应该持有业务规则。

职责划分：

| 职责 | 放在哪 | 原因 |
|------|--------|------|
| 三方 API 认证与通信 | Actions | 隔离凭证 |
| 请求序列化 / 响应标准化 | Actions | 技术性映射 |
| 潜客分级规则 | Agent | 业务决策，运营频繁调整 |
| 销售归属路由 | Agent | 业务决策 |
| 天眼查 AI 场景推断 | Agent | 本地规则，与销售策略相关 |
| 飞书通知 | Agent | 业务触达策略 |
| 业务配置（maas-sales.yaml） | Agent 侧 | 运营维护，不碰 actions 部署 |

## 文件结构

```
packages/actions/src/
  actions/
    zhipu-kb.ts          # 新增：kb_search
    tianyancha.ts         # 新增：tianyancha_enrich
    fxiaoke.ts            # 新增：fxiaoke_create_lead + fxiaoke_query_lead
    search-web.ts         # 不变
    get-weather.ts        # 不变
  registry.ts             # 更新：新增 4 个 action
```

不新增 `config/` 下的业务配置文件。

## Action 设计

### `zhipu-kb.ts` → `kb_search`

从 MVP `kb-search.ts` 移植，逻辑清晰，无业务决策。

**能力：** 调用智谱知识库 Retrieve API，支持双知识库（sales / product）并行查询，结果按 score 降序合并，用 text 前 100 字符去重。

**Input Schema：**

```typescript
{
  query: string,                         // required，不超过 500 字符
  mode?: 'both' | 'product' | 'sales',  // 默认 both
}
```

**输出：** 检索结果列表（text、score、docName、docUrl），无匹配时返回 `NO_MATCH`。

**实现细节：**
- 30 秒内存缓存，key 为 `mode:query`；`NO_MATCH` 不缓存（允许重试）
- 15 秒 HTTP 超时
- 查询超 500 字符自动截断
- TOP_K = 10, TOP_N = 20, MIN_SCORE = 0.3

**环境变量：** `ZHIPU_KB_API_KEY`, `ZHIPU_KB_IDS`（逗号分隔，index 0 = sales KB，index 1 = product KB）

### `tianyancha.ts` → `tianyancha_enrich`

通过智谱 MCP Broker 直连天眼查 MCP Server，使用 Streamable HTTP 传输协议，不走 GLM 推理接口。

**为什么能直连：** 智谱 MCP Broker 实现的是标准 MCP 协议（支持 SSE 和 Streamable HTTP）。MVP 中通过 GLM Function Calling 间接调用，是因为 Python 侧没有方便的 MCP 客户端。TypeScript 侧有官方 `@modelcontextprotocol/sdk`，可以直接用 `StreamableHTTPClientTransport` + `Client` 连接。

**为什么用 Streamable HTTP 而不是 SSE：** SSE 是旧版 MCP 传输协议，存在长连接管理复杂、服务端资源占用高等问题。Streamable HTTP 是 MCP 协议推荐的传输方式，基于标准 HTTP POST/GET，无状态，更适合服务端调用场景。

**优势：** 零 LLM token 消耗、更快（省去推理延迟）、更稳定（无 LLM 透传丢字段风险）。

**Input Schema：**

```typescript
{
  keyword: string,                         // required，公司名/注册号/信用代码
  include_risk?: boolean,                  // 默认 false，+0.20元
  include_patent?: boolean,                // 默认 false，+0.10元
}
```

**输出：**
- `basic_info` — 工商基本信息（名称、类型、注册资本、法人、经营范围、行业、人员规模等）
- `risk_info` — 风险摘要（可选，包含风险等级、各类型风险数量、前 5 条详情）
- `patent_info` — 专利摘要（可选，包含总数、是否有发明专利、前 10 条专利）

不做 AI 场景推断（`infer_ai_scenes`、`infer_crm_enrichment`），这些业务规则移到 agent 侧。

**MCP 连接管理：**
- 使用 `@modelcontextprotocol/sdk` 的 `Client` + `StreamableHTTPClientTransport`
- MCP endpoint: 智谱 MCP Broker 的天眼查 Streamable HTTP 地址
- 认证: `Authorization: Bearer ${ZHIPU_API_KEY}`
- 每次请求建立连接，调用完毕断开（天眼查调用频率低，无需保持长连接）
- 如果 Streamable HTTP 不被智谱 Broker 支持，退回 SSE 传输；如果 MCP 直连整体失败，退回 GLM 透传方式

**MVP Python 字段标准化逻辑保留：** `query_company_base()` 中的多路字段匹配（如 `name` / `companyName`）在 TypeScript 中重现，确保不同版本天眼查返回格式的兼容性。

**环境变量：** `ZHIPU_API_KEY`

### `fxiaoke.ts` → `fxiaoke_create_lead` + `fxiaoke_query_lead`

从 MVP Python 脚本 TypeScript 重写。两个 action 共享文件，复用 OAuth token 获取逻辑。

#### `fxiaoke_create_lead`

**能力：** 创建纷享销客 CRM 线索。纯 API 操作——agent 侧已完成业务决策（潜客分级、销售归属），action 只负责认证、序列化、HTTP POST。

**Input Schema：**

```typescript
{
  // 基本信息
  name: string,                           // required
  mobile: string,                         // required，11 位手机号
  company: string,                        // required
  email?: string,
  position?: string,
  address?: string,

  // CRM 枚举字段（agent 已映射）
  industry?: string,                      // 行业
  company_size_code?: string,             // 公司规模 CRM 枚举 code
  business?: string,                      // 咨询业务
  usage?: string,                         // 使用场景

  // 业务决策结果（agent 传入）
  creator_user_id: string,                // 归属销售 user_id（agent 已路由）
  leads_pool_id: string,                  // 线索池 ID（agent 已选定）
  potential_level?: 'high' | 'low' | 'unknown',
  source?: string,                        // 来源 code

  // 可选补充
  remarks?: string,                       // 备注（拼接后）
  second_phone?: string,
  customer_id?: string,                   // 智谱账号 ID
}
```

**手机号校验：** action 侧保留基础格式校验（11 位数字）和占位号黑名单（`FAKE_MOBILES`，如 `13800138000`），防止无效数据进入 CRM。这是数据质量守卫，不是业务逻辑。

**输出：**

```typescript
{
  success: true,
  dataId: string,       // CRM 记录 ID
}
```

**字段映射：** action 侧做 `inputSchema` 字段到 CRM `LeadsObj` 字段的一对一序列化（如 `company_size_code` → `field_tn2yY__c`），这是技术性映射，不含业务决策。

#### `fxiaoke_query_lead`

**能力：** 查询纷享销客 CRM 线索，三种模式。

**Input Schema：**

```typescript
{
  mode: 'mobile' | 'detail' | 'list',    // required
  // mode=mobile
  mobile?: string,
  // mode=detail
  data_id?: string,
  // mode=list
  company?: string,
  source?: string,
  life_status?: string,                   // 默认 'normal'
  limit?: number,                         // 默认 10
  offset?: number,                        // 默认 0
  // 通用
  operator_user_id: string,               // 查询人 user_id（agent 传入）
}
```

**输出：** 线索列表（`_id`, `name`, `mobile`, `company`, `source`, `life_status`, `owner`, `create_time` 等）。`mobile` 模式额外返回 `exists`（布尔）和 `suggestion`（"安全，可以录入" / "已存在 N 条"）。

#### 共享实现：OAuth Token 管理

纷享销客开放平台使用 OAuth corpAccessToken（2 小时过期），不支持静态 API Key。认证流程：

```
POST https://open.fxiaoke.com/cgi/corpAccessToken/get
  body: { appId, appSecret, permanentCode }
  → { corpAccessToken, corpId }
```

**进程内缓存：**
- 存储最近一次 `(corpAccessToken, corpId, expiresAt)`
- TTL 提前 60 秒刷新（避免临界态过期）
- 模块级单例，两个 action 共享

**员工查询辅助（action 内部函数）：**
- `getOpenUserId(token, corpId, mobile)` — 按手机号查员工 openUserId
- `getPersonnelUserId(token, corpId, operatorUserId, name)` — 按姓名查 PersonnelObj user_id

这两个是 CRM API 操作的技术性步骤（resolve 一个 ID 才能调下一个 API），不是业务逻辑。`fxiaoke_create_lead` 内部会用 `creator_user_id`（agent 传入）直接作为 `currentOpenUserId`，不需要再查。

**API endpoint（代码常量，非环境变量）：**
- OAuth: `https://open.fxiaoke.com/cgi/corpAccessToken/get/V2`
- 员工查询: `https://open.fxiaoke.com/cgi/user/getByMobile`
- 线索写入: `https://open.fxiaoke.com/cgi/crm/v2/data/create`
- 通用查询: `https://open.fxiaoke.com/cgi/crm/v2/data/query`

这些是纷享销客开放平台的固定地址，对所有租户相同，不应作为环境变量。

**环境变量：**
- `FXIAOKE_APP_ID` — 应用 ID
- `FXIAOKE_APP_SECRET` — 应用 Secret
- `FXIAOKE_PERMANENT_CODE` — 永久授权码

## Registry 更新

`src/registry.ts` 新增 4 个 action：

```typescript
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

## 环境变量汇总

在 `.env.example` 的 Actions Service 区块新增：

```dotenv
# 智谱知识库
ZHIPU_KB_API_KEY=
ZHIPU_KB_IDS=<salesKbId>,<productKbId>

# 智谱 API（天眼查 MCP Broker 认证）
ZHIPU_API_KEY=

# 纷享销客 CRM
FXIAOKE_APP_ID=
FXIAOKE_APP_SECRET=
FXIAOKE_PERMANENT_CODE=
```

## 新增依赖

```json
{
  "@modelcontextprotocol/sdk": "^1.29.0"
}
```

用于天眼查 MCP Streamable HTTP 直连。不需要其他新依赖——kb_search 和 fxiaoke 用原生 `fetch` 即可。

## 不在范围内

- `maas-sales.yaml` 业务配置文件 — 放在 agent-hub 的 maas-sales-agent 中
- 潜客分级规则（`classify_lead_potential`）— agent 侧
- 销售归属路由（`resolve_creator`）— agent 侧
- AI 场景推断（`infer_ai_scenes`、`infer_crm_enrichment`）— agent 侧
- 飞书通知（`send_feishu`）— agent 侧
- 公司规模映射表（`map_company_size`）— agent 侧传映射后的 code
- dispatcher 变更（Part 2）— 另一个分支
- agent-hub 变更（Part 3）— 另一个分支

## 测试要点

- [ ] `kb_search` 双库并行查询，结果按 score 合并去重
- [ ] `kb_search` 单库模式（sales / product）正常
- [ ] `kb_search` 缓存命中和过期行为正确
- [ ] `tianyancha_enrich` MCP SSE 直连成功（或确认退回 GLM 透传）
- [ ] `tianyancha_enrich` 工商信息字段标准化正确（多路字段匹配）
- [ ] `tianyancha_enrich` 风险和专利查询可选加载
- [ ] `fxiaoke_create_lead` 手机号格式校验和占位号黑名单
- [ ] `fxiaoke_create_lead` 字段序列化到 CRM LeadsObj 正确
- [ ] `fxiaoke_query_lead` 三种模式（mobile / detail / list）
- [ ] OAuth token 缓存和 TTL 刷新
- [ ] registry 正确注册 6 个 action（4 新 + 2 旧）
- [ ] 环境变量缺失时有明确错误信息
- [ ] 现有 action（search_web、get_weather）不受影响

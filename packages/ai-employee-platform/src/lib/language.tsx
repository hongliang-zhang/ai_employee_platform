"use client"

import { createContext, useContext, useEffect, useMemo, useState } from "react"

export type Language = "en" | "zh"

type Dictionary = Record<string, { en: string; zh: string }>

const dictionary: Dictionary = {
  "app.name": { en: "AI Employee", zh: "AI 员工" },
  "nav.overview": { en: "Overview", zh: "总览" },
  "nav.dashboard": { en: "Dashboard", zh: "仪表盘" },
  "nav.workforce": { en: "Workforce", zh: "员工团队" },
  "nav.team": { en: "AI Employee Team", zh: "AI 员工团队" },
  "nav.hire": { en: "Hire", zh: "招聘" },
  "nav.operations": { en: "Operations", zh: "运营" },
  "nav.workspace": { en: "Workspace", zh: "工作区" },
  "nav.collaboration": { en: "Collaboration", zh: "协作" },
  "nav.insights": { en: "Insights", zh: "洞察" },
  "nav.analytics": { en: "Analytics", zh: "分析" },
  "nav.performance": { en: "Performance", zh: "绩效" },
  "nav.settings": { en: "Settings", zh: "设置" },
  "top.getReward": { en: "Get $25", zh: "领取 $25" },
  "top.help": { en: "Help", zh: "帮助" },
  "top.settings": { en: "Settings", zh: "设置" },
  "language.label": { en: "Language", zh: "语言" },
  "language.english": { en: "English", zh: "English" },
  "language.chinese": { en: "中文", zh: "中文" },
  "dashboard.greeting": { en: "Good afternoon, Hongliang", zh: "下午好，Hongliang" },
  "dashboard.subtitle": { en: "SLMobbin Workspace · AI Employee operating system", zh: "SLMobbin Workspace · AI 员工操作系统" },
  "dashboard.hire": { en: "Hire employee", zh: "招聘员工" },
  "workspace.title": { en: "Workspace", zh: "工作区" },
  "workspace.subtitle": { en: "Each team has a shared file system agents use as common context.", zh: "每个团队都有共享文件系统，Agent 会把它作为共同上下文。" },
  "workspace.newTeam": { en: "New Team", zh: "新建团队" },
  "workspace.teams": { en: "Teams", zh: "团队" },
  "workspace.totalAgents": { en: "Total Agents", zh: "Agent 总数" },
  "workspace.contextFiles": { en: "Context Files", zh: "上下文文件" },
  "workspace.newTeamHint": { en: "Group agents around a shared purpose", zh: "围绕共同目标组织 Agent" },
  "workspace.createTitle": { en: "Create team workspace", zh: "创建团队工作区" },
  "workspace.createSubtitle": { en: "Set up the shared file system agents will read as team context.", zh: "设置 Agent 会作为团队上下文读取的共享文件系统。" },
  "workspace.teamIdentity": { en: "Team identity", zh: "团队信息" },
  "workspace.namePlaceholder": { en: "e.g., Finance Operations", zh: "例如：财务运营" },
  "workspace.descriptionPlaceholder": { en: "What should this team be responsible for?", zh: "这个团队负责什么？" },
  "workspace.starterFs": { en: "Starter file system", zh: "初始文件系统" },
  "workspace.initialMembers": { en: "Initial members", zh: "初始成员" },
  "workspace.filePreview": { en: "File preview", zh: "文件预览" },
  "workspace.createFootnote": { en: "You can add more files and members after creation.", zh: "创建后仍可继续添加文件和成员。" },
  "workspace.cancel": { en: "Cancel", zh: "取消" },
  "workspace.createTeam": { en: "Create Team", zh: "创建团队" },
  "workspace.allTeams": { en: "All Teams", zh: "全部团队" },
  "workspace.members": { en: "Members", zh: "成员" },
  "workspace.teamFileSystem": { en: "Team File System", zh: "团队文件系统" },
  "workspace.addMember": { en: "Add Member", zh: "添加成员" },
  "workspace.uploadFile": { en: "Upload file", zh: "上传文件" },
  "workspace.filesRead": { en: "files · Read by every agent before work starts", zh: "个文件 · 每个 Agent 工作前都会读取" },
  "collaboration.title": { en: "Collaboration", zh: "协作" },
  "collaboration.subtitle": { en: "Manage human-AI workflows and task execution", zh: "管理人机协作流程与任务执行" },
  "collaboration.tasks": { en: "Tasks", zh: "任务" },
  "collaboration.approvals": { en: "Approvals", zh: "审批" },
  "collaboration.scheduled": { en: "Scheduled", zh: "定时任务" },
  "collaboration.recent": { en: "Recent task activity across your AI team", zh: "AI 团队最近的任务动态" },
  "collaboration.assignTask": { en: "Assign Task", zh: "分配任务" },
  "collaboration.needsHuman": { en: "Needs Human", zh: "需要人工" },
  "collaboration.automated": { en: "Automated", zh: "自动执行" },
}

const phraseTranslations: Record<string, string> = {
  "AI Employee": "AI 员工",
  "AI Team": "AI 员工团队",
  "AI Employee Team": "AI 员工团队",
  "Hire Employee": "招聘员工",
  "Hire AI Employee": "招聘 AI 员工",
  "Hire new employee": "招聘新员工",
  "Powered by AI": "AI 驱动",
  "Good afternoon, Hongliang": "下午好，Hongliang",
  "SLMobbin Workspace · AI Employee operating system": "SLMobbin Workspace · AI 员工操作系统",

  "Dashboard": "仪表盘",
  "Overview": "总览",
  "Workforce": "员工团队",
  "Operations": "运营",
  "Insights": "洞察",
  "Performance": "绩效",
  "Workspace": "工作区",
  "Collaboration": "协作",
  "Settings": "设置",
  "Hire": "招聘",

  "Active employees": "活跃员工",
  "Sessions today": "今日会话",
  "Success rate": "成功率",
  "+1 this month": "本月 +1",
  "12 awaiting review": "12 个等待审核",
  "7-day average": "7 日平均",
  "Agent execution trail": "Agent 执行轨迹",
  "Get your team context ready": "完善团队上下文",
  "Add policies, files and approval gates.": "添加政策、文件和审批门禁。",
  "Action Required": "需要处理",
  "Team Recap": "团队回顾",
  "Knowledge Gap": "知识缺口",
  "Refund, contract delivery and HubSpot cleanup are blocked until you confirm the risk.": "退款、合同发送和 HubSpot 清理会在你确认风险前暂停。",
  "Your agents completed 47 tasks": "你的 Agent 已完成 47 个任务",
  "Support is stable. Sales needs a clearer deletion policy.": "支持团队运行稳定。销售团队需要更清晰的删除策略。",
  "Support KB has 3 stale docs": "支持知识库有 3 份过期文档",
  "Update refund policy and escalation matrix before next run.": "下次运行前请更新退款政策和升级矩阵。",
  "Customer Support": "客户支持",
  "Data Analyst": "数据分析师",
  "Sales Assistant": "销售助手",
  "Needs approval before deleting 45 duplicate leads": "删除 45 条重复线索前需要审批",
  "Resolved 3 support tickets automatically": "已自动解决 3 个支持工单",
  "Generated weekly sales performance report": "已生成每周销售绩效报告",
  "Requested approval on a $124 refund": "已请求审批 $124 退款",
  "Tasks completed across support, data and sales workflows.": "支持、数据和销售工作流已完成的任务。",

  "Customer Support Agent": "客户支持 Agent",
  "Email Support Agent": "邮件支持 Agent",
  "Sales SDR": "销售 SDR",
  "Developer Assistant": "开发助手",
  "Contract Tracker": "合同追踪器",
  "Sprint Facilitator": "Sprint 协调员",
  "Support": "支持",
  "Analytics": "分析",
  "Sales": "销售",
  "Engineering": "工程",
  "Legal / Ops": "法务 / 运营",
  "Tier-1 Support": "一线支持",
  "Email Specialist": "邮件专员",
  "Analytics & Reporting": "分析与报告",
  "Outbound Prospecting": "外呼拓客",

  "Active": "活跃",
  "Testing": "测试中",
  "Inactive": "未启用",
  "all": "全部",
  "testing": "测试中",
  "inactive": "未启用",
  "Never": "从未",
  "Just now": "刚刚",
  "2 min ago": "2 分钟前",
  "18 min ago": "18 分钟前",
  "1h ago": "1 小时前",
  "Search by name or role…": "按名称或角色搜索…",
  "No employees found": "未找到员工",
  "Try a different search term": "换个关键词试试",
  "Hire your first AI employee to get started": "招聘你的第一个 AI 员工开始使用",
  "Edit": "编辑",
  "Duplicate": "复制",
  "Pause": "暂停",
  "Remove": "移除",
  "Sessions": "会话",
  "Success": "成功率",
  "Last active": "上次活跃",
  "Model": "模型",
  "Configure": "配置",
  "Identity": "身份",
  "Channels": "渠道",
  "Chat": "聊天",
  "identity": "身份",
  "sessions": "会话",
  "performance": "绩效",
  "channels": "渠道",
  "Capabilities": "能力",
  "Instructions": "指令",
  "SYSTEM_PROMPT": "系统提示词",
  "Objective": "目标",
  "Copy": "复制",
  "Copied": "已复制",
  "Not connected": "未连接",
  "Success Rate": "成功率",
  "Monthly Cost": "月度成本",
  "Avg Response": "平均响应",
  "Total tokens": "总 Token",
  "Updated": "更新于",
  "days ago": "天前",
  "hours ago": "小时前",
  "week ago": "周前",
  "weeks ago": "周前",

  "Handles customer inquiries, resolves tickets, and escalates complex issues to Linear.": "处理客户咨询、解决工单，并将复杂问题升级到 Linear。",
  "Handles inbound customer queries, resolves tickets, and escalates complex issues to Linear. Maintains a friendly, professional tone and always confirms before taking irreversible actions.": "处理入站客户咨询、解决工单，并将复杂问题升级到 Linear。保持友好、专业的语气，并在执行不可逆操作前始终确认。",
  "Respond to inbound customer inquiries within 2 minutes. Resolve tier-1 tickets autonomously. Escalate tier-2+ to human agents via Linear. Maintain CSAT > 4.5/5.": "在 2 分钟内响应入站客户咨询。自主解决一线工单。通过 Linear 将二线及以上问题升级给人工。保持 CSAT 高于 4.5/5。",
  "Analyzes business data, generates reports, and surfaces insights from your data warehouse.": "分析业务数据、生成报告，并从数据仓库中提炼洞察。",
  "Helps with lead generation, outreach emails, and CRM data enrichment.": "协助线索生成、外联邮件和 CRM 数据补全。",
  "Writes retro summaries, tracks sprint velocity, and preps meeting agendas.": "撰写复盘总结、跟踪 Sprint 速度，并准备会议议程。",

  "Choose role": "选择角色",
  "Apps & Skills": "应用与技能",
  "Test chat": "测试聊天",
  "Flagship": "旗舰",
  "Recommended": "推荐",
  "Vision": "视觉",
  "Fast": "高速",
  "Popular": "热门",
  "Generate": "生成",
  "Search role templates...": "搜索角色模板...",
  "Use natural language to describe your needs": "用自然语言描述你的需求",
  "Tell us what you need and we will configure it for you.": "告诉我们你需要什么，我们来帮你配置。",
  "e.g., I need an assistant that handles customer emails and sends complex issues to Linear...": "例如：我需要一个处理客户邮件并把复杂问题发到 Linear 的助手...",
  "or choose a template": "或选择模板",
  "Role & KPIs": "角色与 KPI",
  "Speed": "速度",
  "Quality": "质量",
  "Cost eff.": "成本效率",
  "Apps": "应用",
  "Skills": "技能",
  "Tools": "工具",
  "Connected": "已连接",
  "Connect": "连接",
  "Custom Skills": "自定义技能",
  "Custom Tools": "自定义工具",
  "Add skill": "添加技能",
  "Add tool": "添加工具",
  "Back": "返回",
  "Continue": "继续",
  "Name": "名称",
  "Ready": "准备就绪",
  "connected": "已连接",

  "Web Search": "网页搜索",
  "Knowledge Base": "知识库",
  "Knowledge Base Q&A": "知识库问答",
  "Intent Classification": "意图分类",
  "SQL Query": "SQL 查询",
  "Chart Generation": "图表生成",
  "Anomaly Detection": "异常检测",
  "Lead Research": "线索调研",
  "Email Drafting": "邮件起草",
  "Code Review": "代码审查",
  "Documentation Writing": "文档撰写",
  "Document Analysis": "文档分析",
  "Deadline Tracking": "截止日期追踪",
  "Meeting Summarization": "会议总结",
  "Velocity Tracking": "速度追踪",
  "Code Interpreter": "代码解释器",
  "Image Analysis": "图像分析",
  "Communication": "沟通",
  "Dev Tools": "开发工具",
  "Productivity": "生产力",
  "Data": "数据",

  "Total Sessions": "总会话数",
  "Avg Success Rate": "平均成功率",
  "Total Cost": "总成本",
  "Tokens Used": "Token 用量",
  "Per-Employee Breakdown": "员工明细",
  "Team performance, usage, and cost insights": "团队绩效、使用量和成本洞察",
  "Ticket Resolution": "工单解决",
  "Report Generation": "报告生成",
  "Data Query": "数据查询",
  "Outreach Email": "外联邮件",
  "CRM Update": "CRM 更新",
  "Escalation": "升级",
  "Other": "其他",
  "SQL / DB": "SQL / 数据库",
  "Google Sheets": "Google Sheets",

  "Manage your organization, team, and access": "管理你的组织、团队和访问权限",
  "Current Plan": "当前套餐",
  "Growth Plan": "增长版套餐",
  "5 AI employees · Unlimited sessions": "5 个 AI 员工 · 无限会话",
  "per month": "每月",
  "Organization": "组织",
  "Organization Profile": "组织资料",
  "Organization Name": "组织名称",
  "Slug": "短链接",
  "Industry": "行业",
  "Company Size": "公司规模",
  "Technology": "科技",
  "11-50 employees": "11-50 人",
  "Save changes": "保存修改",
  "Danger Zone": "危险区域",
  "Delete organization": "删除组织",
  "Permanently delete all employees, data, and billing.": "永久删除所有员工、数据和账单。",
  "Delete": "删除",
  "Team": "团队",
  "Team Members": "团队成员",
  "members": "成员",
  "Invite member": "邀请成员",
  "Owner": "所有者",
  "Admin": "管理员",
  "Member": "成员",
  "API Keys": "API 密钥",
  "Use these to trigger employees from external systems": "用于从外部系统触发员工",
  "New key": "新建密钥",
  "Production API Key": "生产 API 密钥",
  "Development Key": "开发密钥",
  "Created": "创建于",
  "Last used": "上次使用",
  "Today": "今天",
  "2 days ago": "2 天前",
  "Billing": "账单",

  "Tasks": "任务",
  "Approvals": "审批",
  "Recent task activity across your AI team": "AI 团队最近的任务动态",
  "Assign Task": "分配任务",
  "Needs Human": "需要人工",
  "Automated": "自动执行",
  "IN PROGRESS": "进行中",
  "DONE": "已完成",
  "FAILED": "失败",
  "No tasks": "暂无任务",
  "Auto": "自动",
  "Scheduled": "定时",
  "Process refund for order #4821": "处理订单 #4821 退款",
  "Send contract to Acme Corp (deal value $28,000)": "向 Acme Corp 发送合同（交易额 $28,000）",
  "Delete 45 duplicate leads from HubSpot": "从 HubSpot 删除 45 条重复线索",
  "Resolve ticket #4823 — password reset": "解决工单 #4823 — 密码重置",
  "Generate weekly metrics report": "生成每周指标报告",
  "Research 10 new enterprise leads": "调研 10 个新的企业线索",
  "Update FAQ knowledge base": "更新 FAQ 知识库",
  "Escalate ticket #4817 — billing dispute": "升级工单 #4817 — 账单争议",

  "Create team workspace": "创建团队工作区",
  "Set up the shared file system agents will read as team context.": "设置 Agent 会作为团队上下文读取的共享文件系统。",
  "Team identity": "团队信息",
  "Starter file system": "初始文件系统",
  "Initial members": "初始成员",
  "File preview": "文件预览",
  "You can add more files and members after creation.": "创建后仍可继续添加文件和成员。",
  "Create Team": "创建团队",
  "All Teams": "全部团队",
  "New Team": "新建团队",
  "Total Agents": "Agent 总数",
  "Context Files": "上下文文件",
  "Group agents around a shared purpose": "围绕共同目标组织 Agent",
  "Open Team": "打开团队",
  "Team File System": "团队文件系统",
  "Upload file": "上传文件",
  "Shared Credentials": "共享凭证",
  "Team Approval Policies": "团队审批策略",
  "Delete Team": "删除团队",
  "Files": "文件",
  "Context files": "上下文文件",
  "sessions today": "今日会话",

  "Support Team": "支持团队",
  "Data Team": "数据团队",
  "Sales & Growth Team": "销售与增长团队",
  "Handles inbound customer inquiries, billing issues, and ticket triage across all channels.": "处理入站客户咨询、账单问题和全渠道工单分流。",
  "Runs automated analytics, generates weekly reports, and monitors data pipelines.": "运行自动化分析、生成周报并监控数据管道。",
  "Drives outbound prospecting, lead qualification, and personalised outreach campaigns.": "负责外呼拓客、线索筛选和个性化触达活动。",
  "Customer Operations": "客户运营",
  "Revenue Operations": "收入运营",
  "Analytics Pod": "分析小组",
  "Blank Team": "空白团队",
  "Ticket triage, refund decisions, escalation rules, and customer-facing responses.": "工单分流、退款决策、升级规则和客户回复。",
  "Lead research, CRM hygiene, outbound sequencing, and deal handoff context.": "线索调研、CRM 清理、外联序列和交易交接上下文。",
  "Metric definitions, report templates, pipeline notes, and anomaly response rules.": "指标定义、报告模板、管道说明和异常响应规则。",
  "Start with a minimal shared file system and add context as the team learns.": "从最小共享文件系统开始，随着团队学习逐步补充上下文。",
}

const textNodeOriginals = new WeakMap<Text, string>()
const elementAttributeOriginals = new WeakMap<Element, Record<string, string>>()
const translatableAttributes = ["placeholder", "aria-label", "title"]

function translatePhrase(value: string, language: Language) {
  if (language === "en") return value
  const exact = phraseTranslations[value]
  if (exact) return exact

  let translated = value
  const entries = Object.entries(phraseTranslations).sort((a, b) => b[0].length - a[0].length)
  entries.forEach(([source, target]) => {
    if (source.length < 3 || !translated.includes(source)) return
    translated = translated.split(source).join(target)
  })
  return translated
}

function preserveOuterWhitespace(original: string, translated: string) {
  const leading = original.match(/^\s*/)?.[0] ?? ""
  const trailing = original.match(/\s*$/)?.[0] ?? ""
  return `${leading}${translated}${trailing}`
}

function shouldSkipTextNode(node: Text) {
  const parent = node.parentElement
  if (!parent) return true
  return Boolean(parent.closest("script,style,textarea,code,pre,[data-no-translate]"))
}

function applyDomTranslations(root: ParentNode, language: Language) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const textNodes: Text[] = []
  while (walker.nextNode()) {
    textNodes.push(walker.currentNode as Text)
  }

  textNodes.forEach((node) => {
    if (shouldSkipTextNode(node)) return
    const original = textNodeOriginals.get(node) ?? node.nodeValue ?? ""
    if (!textNodeOriginals.has(node)) {
      textNodeOriginals.set(node, original)
    }
    const trimmed = original.trim()
    if (!trimmed) return
    const translated = translatePhrase(trimmed, language)
    const nextValue = translated === trimmed ? original : preserveOuterWhitespace(original, translated)
    if (node.nodeValue !== nextValue) {
      node.nodeValue = nextValue
    }
  })

  const elements =
    root instanceof Element ? [root, ...Array.from(root.querySelectorAll("*"))] : Array.from(root.querySelectorAll("*"))

  elements.forEach((element) => {
    translatableAttributes.forEach((attribute) => {
      const current = element.getAttribute(attribute)
      if (!current) return
      const originals = elementAttributeOriginals.get(element) ?? {}
      if (!originals[attribute]) {
        originals[attribute] = current
        elementAttributeOriginals.set(element, originals)
      }
      const original = originals[attribute]
      const nextValue = translatePhrase(original, language)
      if (element.getAttribute(attribute) !== nextValue) {
        element.setAttribute(attribute, nextValue)
      }
    })
  })
}

function LanguageDomTranslator({ language }: { language: Language }) {
  useEffect(() => {
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en"
    applyDomTranslations(document.body, language)

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === "characterData") {
          const node = mutation.target
          if (node.nodeType === Node.TEXT_NODE && node.parentNode) {
            applyDomTranslations(node.parentNode, language)
          }
          return
        }

        if (mutation.type === "attributes" && mutation.target instanceof Element) {
          applyDomTranslations(mutation.target, language)
          return
        }

        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            applyDomTranslations(node as Element, language)
          } else if (node.nodeType === Node.TEXT_NODE && node.parentNode) {
            applyDomTranslations(node.parentNode, language)
          }
        })
      })
    })

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: translatableAttributes,
    })

    return () => observer.disconnect()
  }, [language])

  return null
}

type LanguageContextValue = {
  language: Language
  setLanguage: (language: Language) => void
  t: (key: string) => string
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>("en")

  useEffect(() => {
    const saved = window.localStorage.getItem("ai-employee-language")
    if (saved === "zh" || saved === "en") {
      setLanguageState(saved)
    }
  }, [])

  const setLanguage = (nextLanguage: Language) => {
    setLanguageState(nextLanguage)
    window.localStorage.setItem("ai-employee-language", nextLanguage)
  }

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage,
      t: (key) => dictionary[key]?.[language] ?? key,
    }),
    [language]
  )

  return (
    <LanguageContext.Provider value={value}>
      <LanguageDomTranslator language={language} />
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (!context) {
    throw new Error("useLanguage must be used within LanguageProvider")
  }
  return context
}

export function LanguageText({ id }: { id: string }) {
  const { t } = useLanguage()
  return <>{t(id)}</>
}

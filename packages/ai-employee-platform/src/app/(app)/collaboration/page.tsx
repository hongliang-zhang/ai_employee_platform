"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Plus,
  CheckCircle2,
  Clock,
  AlertTriangle,
  UserCheck,
  Bot,
  Calendar,
  Repeat,
  Play,
  Pause,
  ChevronDown,
  ChevronUp,
  Timer,
  FileText,
  X,
  Send,
  MessageSquare,
  Brain,
  Zap,
  AlertCircle,
  ArrowDownLeft,
  ChevronRight,
  GitBranch,
} from "lucide-react"
import { needsHumanTaskCount } from "@/lib/collaboration-metrics"
import { useLanguage } from "@/lib/language"
import { cn } from "@/lib/utils"

// ── Types ─────────────────────────────────────────────────────────────────────

type StageType = "input" | "thinking" | "tool_call" | "output"

type Stage = {
  type: StageType
  label: string
  content: string
  time: string
  error?: boolean
}

type Task = {
  id: string
  employee: string
  initials: string
  gradient: string
  title: string
  assignee: string
  status: "completed" | "in_progress" | "pending_human" | "failed"
  time: string
  needsHuman: boolean
  humanReason?: string
  originalFeedback: string
  stages: Stage[]
}

type ScheduledTask = {
  id: string
  name: string
  employee: string
  initials: string
  color: string
  schedule: string
  cron: string
  nextRun: string
  status: "active" | "paused"
  lastRun: string
  lastStatus: string
  executionHistory: { date: string; status: "completed" | "failed"; duration: string; error?: string }[]
}

type Approval = {
  id: string
  employee: string
  initials: string
  gradient: string
  action: string
  context: string
  time: string
  risk: "medium" | "high"
  thread: { role: "agent" | "system"; text: string }[]
  orderData: string
  riskReason: string
}

// ── Data ─────────────────────────────────────────────────────────────────────

const pendingApprovals: Approval[] = [
  {
    id: "a1",
    employee: "Customer Support Agent",
    initials: "CS",
    gradient: "from-blue-500 to-blue-700",
    action: "Send refund of $124.00 to customer@example.com",
    context: "Customer requested refund for order #4821",
    time: "3 min ago",
    risk: "medium",
    thread: [
      { role: "agent", text: "收到工单 #4821，客户 Lisa Wang 申请退款，金额 $124.00，原因：商品与描述不符。" },
      { role: "agent", text: "已查询订单记录，订单状态为「已发货」，发货时间 2026-05-10，退款政策允许 30 天内申请。" },
      { role: "agent", text: "风险检测：该客户账户首次退款申请，金额超过自动审批阈值 $100，需人工确认。" },
      { role: "system", text: "等待审批：即将向 customer@example.com 发起 $124.00 退款操作。" },
    ],
    orderData: `Order #4821
Customer : Lisa Wang <customer@example.com>
Amount   : $124.00 USD
Date     : 2026-05-08
Status   : Shipped (2026-05-10)
Items    : Premium Wireless Headphones × 1
Reason   : Item does not match description`,
    riskReason: "金额 $124.00 超过自动审批上限 $100。客户首次提交退款申请，系统无历史风险记录，建议人工核实商品描述差异后再批准。",
  },
  {
    id: "a2",
    employee: "Sales Assistant",
    initials: "SA",
    gradient: "from-orange-500 to-orange-600",
    action: "Delete 45 duplicate leads from HubSpot",
    context: "Identified as duplicates during lead enrichment run",
    time: "12 min ago",
    risk: "high",
    thread: [
      { role: "agent", text: "执行「线索清洗与富化」定时任务，扫描 HubSpot 全量线索库（共 3,214 条）。" },
      { role: "agent", text: "通过邮箱 + 公司名双字段匹配，识别出 45 条重复线索，涉及 38 家企业。" },
      { role: "agent", text: "重复线索中包含 12 条近 30 天内有互动记录的线索，删除操作不可撤销。" },
      { role: "system", text: "等待审批：即将从 HubSpot 永久删除 45 条线索记录。" },
    ],
    orderData: `Duplicate Leads Summary
Total duplicates : 45
Companies        : 38
With activity    : 12 leads (last 30 days)
Merge strategy   : Keep most-recently-updated
Fields affected  : email, company, phone, source
Risk level       : HIGH — irreversible delete`,
    riskReason: "批量删除操作不可撤销，且涉及 12 条近期有互动记录的线索。建议先导出备份或选择「合并」替代「删除」，以防丢失有价值的销售线索。",
  },
]

const recentTasks: Task[] = [
  {
    id: "t1",
    employee: "Customer Support Agent",
    initials: "CS",
    gradient: "from-blue-500 to-blue-700",
    title: "Process refund for order #4821",
    assignee: "Auto",
    status: "pending_human",
    time: "3 min ago",
    needsHuman: true,
    humanReason: "金额超过 $100",
    originalFeedback: "Lisa Wang: 商品与描述不符，我想申请订单 #4821 的 $124.00 退款。",
    stages: [
      { type: "input", label: "工单触发", content: "Order #4821 refund request received from Lisa Wang — $124.00", time: "10:21:03" },
      { type: "thinking", label: "查询账户及订单", content: "Checking order status... Shipped 2026-05-10. Refund policy: 30-day window, OK.", time: "10:21:05" },
      { type: "tool_call", label: "Tool: Approval Gate", content: "Amount $124.00 exceeds $100 auto-approval threshold\nStatus: ESCALATED to human queue", time: "10:21:07" },
    ],
  },
  {
    id: "t2",
    employee: "Sales Assistant",
    initials: "SA",
    gradient: "from-orange-500 to-orange-600",
    title: "Send contract to Acme Corp (deal value $28,000)",
    assignee: "Jane S.",
    status: "pending_human",
    time: "18 min ago",
    needsHuman: true,
    humanReason: "合同金额超过 $10,000",
    originalFeedback: "Jane S.: 请把已签合同发给 Acme Corp，deal #D-2841，合同金额 $28,000。",
    stages: [
      { type: "input", label: "任务指派", content: "Assigned by Jane S.: Send signed contract to Acme Corp, deal #D-2841", time: "10:06:10" },
      { type: "thinking", label: "验证合同内容", content: "Contract value: $28,000/yr. Reviewing terms... all clauses look standard.", time: "10:06:14" },
      { type: "tool_call", label: "Tool: Approval Gate", content: "Contract value $28,000 > $10,000 threshold\nStatus: ESCALATED — requires human approval", time: "10:06:18" },
    ],
  },
  {
    id: "t3",
    employee: "Data Analyst",
    initials: "DA",
    gradient: "from-emerald-500 to-emerald-700",
    title: "Delete 45 duplicate leads from HubSpot",
    assignee: "Auto",
    status: "pending_human",
    time: "25 min ago",
    needsHuman: true,
    humanReason: "批量删除操作需确认",
    originalFeedback: "系统定时任务 lead_cleanup：扫描 HubSpot 重复线索，清理前保留人工确认。",
    stages: [
      { type: "input", label: "定时任务触发", content: "Scheduled: lead_cleanup — scan HubSpot for duplicates", time: "09:59:00" },
      { type: "tool_call", label: "Tool: HubSpot", content: "Scanned 3,214 records\nFound 45 duplicates across 38 companies\n12 have activity in last 30 days", time: "09:59:18" },
      { type: "thinking", label: "风险评估", content: "Deletion is irreversible. 12 recent-activity leads at risk. Flagging for human review.", time: "09:59:22" },
      { type: "tool_call", label: "Tool: Approval Gate", content: "Bulk delete requires confirmation\nStatus: ESCALATED", time: "09:59:25" },
    ],
  },
  {
    id: "t4",
    employee: "Customer Support Agent",
    initials: "CS",
    gradient: "from-blue-500 to-blue-700",
    title: "Resolve ticket #4823 — password reset",
    assignee: "Auto",
    status: "completed",
    time: "5 min ago",
    needsHuman: false,
    originalFeedback: "Customer ticket #4823: I can't log in, forgot my password.",
    stages: [
      { type: "input", label: "Ticket received", content: "Customer ticket #4823: 'I can't log in, forgot my password'", time: "10:19:01" },
      { type: "thinking", label: "识别请求类型", content: "Standard password reset request — tier-1, auto-resolvable.", time: "10:19:03" },
      { type: "tool_call", label: "Tool: User Management", content: "Sent password reset link to john@example.com\nStatus: Email delivered", time: "10:19:05" },
      { type: "output", label: "Ticket closed", content: "Ticket #4823 resolved. Reset email sent. Logged in CRM.", time: "10:19:07" },
    ],
  },
  {
    id: "t5",
    employee: "Data Analyst",
    initials: "DA",
    gradient: "from-emerald-500 to-emerald-700",
    title: "Generate weekly metrics report",
    assignee: "Scheduled",
    status: "completed",
    time: "1h ago",
    needsHuman: false,
    originalFeedback: "Scheduled trigger: weekly_metrics_report — every Monday 09:00.",
    stages: [
      { type: "input", label: "Scheduled trigger", content: "weekly_metrics_report — every Monday 09:00", time: "09:00:00" },
      { type: "tool_call", label: "Tool: Analytics DB", content: "Query: SELECT * FROM events WHERE date > last_monday\nRows returned: 8,421", time: "09:00:08" },
      { type: "thinking", label: "Generating report", content: "Sessions: 312, Revenue: $48.2K (+12%), Churn: 1.4% (-0.2%)", time: "09:00:42" },
      { type: "tool_call", label: "Tool: Slack", content: "Posted to #data-insights: Weekly Metrics Report w/ 3 charts\nStatus: Delivered", time: "09:01:10" },
      { type: "output", label: "Report complete", content: "Weekly report delivered to 8 subscribers.", time: "09:01:12" },
    ],
  },
  {
    id: "t6",
    employee: "Sales Assistant",
    initials: "SA",
    gradient: "from-orange-500 to-orange-600",
    title: "Research 10 new enterprise leads",
    assignee: "Jane S.",
    status: "in_progress",
    time: "2h ago",
    needsHuman: false,
    originalFeedback: "Jane S.: Find 10 qualified enterprise leads in fintech, more than 200 employees.",
    stages: [
      { type: "input", label: "Task assigned by Jane S.", content: "Find 10 qualified enterprise leads in fintech, >200 employees", time: "08:24:00" },
      { type: "thinking", label: "Defining ICP criteria", content: "Fintech, Series B+, 200-2000 employees, US/EU, using legacy banking software.", time: "08:24:05" },
      { type: "tool_call", label: "Tool: Web Search (running)", content: "Searching LinkedIn, Crunchbase, Apollo for matching companies...\nFound 6/10 so far", time: "08:25:40" },
    ],
  },
  {
    id: "t7",
    employee: "Customer Support Agent",
    initials: "CS",
    gradient: "from-blue-500 to-blue-700",
    title: "Update FAQ knowledge base",
    assignee: "Auto",
    status: "completed",
    time: "3h ago",
    needsHuman: false,
    originalFeedback: "Scheduled: daily KB freshness check — review support entries older than 30 days.",
    stages: [
      { type: "input", label: "Scheduled: KB review", content: "Daily KB freshness check — review entries older than 30 days", time: "07:00:00" },
      { type: "tool_call", label: "Tool: Knowledge Base", content: "Found 3 stale entries. Comparing with current policy docs...", time: "07:00:12" },
      { type: "thinking", label: "Drafting updates", content: "Updated: return_policy (30d→45d), shipping_faq, contact_info.", time: "07:00:40" },
      { type: "tool_call", label: "Tool: Knowledge Base", content: "Updated 3 entries successfully", time: "07:00:58" },
      { type: "output", label: "KB updated", content: "3 entries updated. Summary posted to #support-ops.", time: "07:01:02" },
    ],
  },
  {
    id: "t8",
    employee: "Data Analyst",
    initials: "DA",
    gradient: "from-emerald-500 to-emerald-700",
    title: "Compile Q2 pipeline forecast",
    assignee: "Scheduled",
    status: "completed",
    time: "4h ago",
    needsHuman: false,
    originalFeedback: "Scheduled: monthly Q2 pipeline forecast — compile from CRM data.",
    stages: [
      { type: "input", label: "Scheduled: Q2 forecast", content: "Monthly pipeline forecast — compile from CRM data", time: "06:00:00" },
      { type: "tool_call", label: "Tool: HubSpot CRM", content: "Fetched 142 open deals, total pipeline: $1.24M\nClose probability weighted: $480K", time: "06:00:20" },
      { type: "thinking", label: "Building forecast model", content: "Q2 weighted pipeline: $480K. vs Q1 $410K (+17%). Top deals: Acme ($28K), Stripe ($45K).", time: "06:01:10" },
      { type: "tool_call", label: "Tool: Notion", content: "Created page: Q2 Pipeline Forecast 2026\nShared with leadership@company.com", time: "06:02:05" },
      { type: "output", label: "Forecast complete", content: "Q2 forecast delivered. 3 execs notified.", time: "06:02:08" },
    ],
  },
  {
    id: "t9",
    employee: "Customer Support Agent",
    initials: "CS",
    gradient: "from-blue-500 to-blue-700",
    title: "Escalate ticket #4817 — billing dispute",
    assignee: "Auto",
    status: "failed",
    time: "5h ago",
    needsHuman: false,
    originalFeedback: "Ticket #4817 was flagged as Tier-2 billing dispute and needs escalation.",
    stages: [
      { type: "input", label: "Escalation triggered", content: "Ticket #4817 flagged as Tier-2. Attempting to create Linear issue.", time: "05:12:01" },
      { type: "tool_call", label: "Tool: Linear (failed)", content: "POST /issues\nError: Connection timeout after 10s\nLinear API unreachable — possible outage", time: "05:12:11", error: true },
      { type: "tool_call", label: "Tool: Email (failed)", content: "Fallback: email engineering@company.com\nError: SMTP rate limit exceeded", time: "05:12:18", error: true },
    ],
  },
]

const scheduledTasks: ScheduledTask[] = [
  {
    id: "st1",
    name: "周报生成",
    employee: "Data Analyst",
    initials: "DA",
    color: "bg-emerald-600",
    schedule: "每周一 09:00",
    cron: "0 9 * * 1",
    nextRun: "明天 09:00",
    status: "active",
    lastRun: "1周前",
    lastStatus: "completed",
    executionHistory: [
      { date: "May 12, 09:00", status: "completed", duration: "2m 34s" },
      { date: "May 5, 09:00", status: "completed", duration: "3m 02s" },
      { date: "Apr 28, 09:00", status: "failed", duration: "0m 45s", error: "Timeout connecting to analytics DB" },
    ],
  },
  {
    id: "st2",
    name: "线索清洗与富化",
    employee: "Sales Assistant",
    initials: "SA",
    color: "bg-orange-500",
    schedule: "每天 08:00",
    cron: "0 8 * * *",
    nextRun: "明天 08:00",
    status: "active",
    lastRun: "今天 08:00",
    lastStatus: "completed",
    executionHistory: [
      { date: "May 13, 08:00", status: "completed", duration: "4m 12s" },
      { date: "May 12, 08:00", status: "completed", duration: "3m 58s" },
      { date: "May 11, 08:00", status: "completed", duration: "4m 05s" },
    ],
  },
  {
    id: "st3",
    name: "知识库更新检查",
    employee: "Customer Support Agent",
    initials: "CS",
    color: "bg-blue-600",
    schedule: "每天 00:00",
    cron: "0 0 * * *",
    nextRun: "今晚 00:00",
    status: "paused",
    lastRun: "3天前",
    lastStatus: "completed",
    executionHistory: [
      { date: "May 10, 00:00", status: "completed", duration: "1m 02s" },
      { date: "May 9, 00:00", status: "completed", duration: "0m 58s" },
      { date: "May 8, 00:00", status: "completed", duration: "1m 14s" },
    ],
  },
  {
    id: "st4",
    name: "月度成本分析报告",
    employee: "Data Analyst",
    initials: "DA",
    color: "bg-emerald-600",
    schedule: "每月1日 09:00",
    cron: "0 9 1 * *",
    nextRun: "6月1日 09:00",
    status: "active",
    lastRun: "1个月前",
    lastStatus: "completed",
    executionHistory: [
      { date: "May 1, 09:00", status: "completed", duration: "5m 43s" },
      { date: "Apr 1, 09:00", status: "completed", duration: "4m 58s" },
      { date: "Mar 1, 09:00", status: "failed", duration: "1m 02s", error: "Insufficient data — pipeline not closed yet" },
    ],
  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

const stageStyle = (type: StageType, error?: boolean) => {
  if (type === "input") return "border-l-blue-400 bg-blue-50/70"
  if (type === "thinking") return "border-l-amber-400 bg-amber-50/70"
  if (type === "tool_call") return error ? "border-l-red-400 bg-red-50/70" : "border-l-emerald-400 bg-emerald-50/70"
  return "border-l-muted bg-muted/30"
}

const stageIconColor = (type: StageType, error?: boolean) => {
  if (type === "input") return "text-blue-400"
  if (type === "thinking") return "text-amber-400"
  if (type === "tool_call") return error ? "text-red-400" : "text-emerald-500"
  return "text-muted-foreground/50"
}

function StageIcon({ type, error }: { type: StageType; error?: boolean }) {
  if (type === "input") return <ArrowDownLeft className={cn("h-3 w-3 shrink-0", stageIconColor(type))} />
  if (type === "thinking") return <Brain className={cn("h-3 w-3 shrink-0", stageIconColor(type))} />
  if (type === "tool_call") return error
    ? <AlertCircle className={cn("h-3 w-3 shrink-0", stageIconColor(type, true))} />
    : <Zap className={cn("h-3 w-3 shrink-0", stageIconColor(type))} />
  return <MessageSquare className={cn("h-3 w-3 shrink-0 text-muted-foreground/50")} />
}

const kanbanColumns = [
  { id: "in_progress", label: "In Progress", color: "text-blue-400", dotColor: "bg-blue-400", accent: "task-card-accent-blue" },
  { id: "completed", label: "Done", color: "text-emerald-400", dotColor: "bg-emerald-500", accent: "task-card-accent-emerald" },
  { id: "failed", label: "Failed", color: "text-rose-400", dotColor: "bg-red-400", accent: "task-card-accent-red" },
]

// ── Page ─────────────────────────────────────────────────────────────────────

export default function CollaborationPage() {
  const { t } = useLanguage()
  const [approving, setApproving] = useState<string | null>(null)
  const [schedules, setSchedules] = useState(scheduledTasks)
  const [contextOpenId, setContextOpenId] = useState<string | null>(null)
  const [expandedScheduleId, setExpandedScheduleId] = useState<string | null>(null)

  // Task slide-out panel
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [humanGuidance, setHumanGuidance] = useState<Record<string, string>>({})
  const [guidanceSent, setGuidanceSent] = useState<Record<string, boolean>>({})

  const selectedTask = recentTasks.find((t) => t.id === selectedTaskId) ?? null
  const humanTasks = recentTasks.filter((t) => t.needsHuman)
  const automatedTasks = recentTasks.filter((t) => !t.needsHuman)

  const handleApprove = (id: string) => {
    setApproving(id)
    setTimeout(() => setApproving(null), 1000)
  }

  const toggleSchedule = (id: string) => {
    setSchedules((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status: s.status === "active" ? "paused" : "active" } : s))
    )
  }

  const sendGuidance = (taskId: string) => {
    if (!humanGuidance[taskId]?.trim()) return
    setGuidanceSent((prev) => ({ ...prev, [taskId]: true }))
    setTimeout(() => setGuidanceSent((prev) => ({ ...prev, [taskId]: false })), 2000)
  }

  return (
    <div className="p-8 max-w-6xl relative">
      <div className="mb-7 flex items-start gap-4">
        <div className="icon-box icon-box-primary h-11 w-11">
          <GitBranch className="h-[19px] w-[19px]" />
        </div>
        <div>
          <h1 className="text-[26px] font-extrabold tracking-tight leading-none" style={{ letterSpacing: "-0.03em" }}>{t("collaboration.title")}</h1>
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            {t("collaboration.subtitle")}
          </p>
        </div>
      </div>

      <Tabs defaultValue="tasks" className="space-y-5">
        <TabsList className="h-8">
          <TabsTrigger value="tasks" className="text-xs h-7">{t("collaboration.tasks")}</TabsTrigger>
          <TabsTrigger value="approvals" className="text-xs h-7">
            {t("collaboration.approvals")}
            {pendingApprovals.length > 0 && (
              <span className="ml-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-white">
                {pendingApprovals.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="scheduled" className="text-xs h-7">{t("collaboration.scheduled")}</TabsTrigger>
        </TabsList>

        {/* ── Tasks ── */}
        <TabsContent value="tasks" className="space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{t("collaboration.recent")}</p>
            <Button size="sm" className="h-8 gap-1.5 text-xs">
              <Plus className="h-3.5 w-3.5" /> {t("collaboration.assignTask")}
            </Button>
          </div>

          {/* Needs Human */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 mb-2">
              <UserCheck className="h-3.5 w-3.5 text-amber-700" />
              <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide">{t("collaboration.needsHuman")}</p>
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-amber-700 text-[9px] font-bold text-white">
                {needsHumanTaskCount}
              </span>
            </div>
            {humanTasks.map((task) => (
              <div
                key={task.id}
                onClick={() => setSelectedTaskId(task.id)}
                className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3.5 hover:border-amber-400 hover:bg-amber-100/60 transition-colors cursor-pointer"
              >
                <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br", task.gradient)}>
                  <span className="text-[9px] font-bold text-white">{task.initials}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{task.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {task.employee} · {task.time}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="inline-flex items-center gap-1 rounded-md border border-amber-400 bg-amber-200 px-2 py-0.5 text-[10px] font-semibold text-amber-950">
                    <UserCheck className="h-2.5 w-2.5" />
                    {t("collaboration.needsHuman")}
                  </span>
                  {task.humanReason && (
                    <span className="rounded-md border border-amber-300 bg-white px-2 py-0.5 text-[10px] font-medium text-amber-900">{task.humanReason}</span>
                  )}
                  <ChevronRight className="h-3.5 w-3.5 text-amber-700" />
                </div>
              </div>
            ))}
          </div>

          {/* Automated — Kanban board */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Bot className="h-3.5 w-3.5 text-muted-foreground/60" />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("collaboration.automated")}</p>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {kanbanColumns.map((col) => {
                const colTasks = automatedTasks.filter((t) => t.status === col.id)
                return (
                  <div key={col.id} className="flex-shrink-0 w-[280px]">
                    {/* Column header */}
                    <div className="flex items-center gap-2 mb-2.5 px-1">
                      <span className={cn("h-2 w-2 rounded-full", col.dotColor)} />
                      <span className={cn("text-[11px] font-semibold uppercase tracking-wide", col.color)}>
                        {col.label}
                      </span>
                      <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground/60 font-medium">
                        {colTasks.length}
                      </span>
                    </div>

                    {/* Cards */}
                    <div className="space-y-2">
                      {colTasks.map((task) => (
                        <div
                          key={task.id}
                          onClick={() => setSelectedTaskId(task.id)}
                          className={cn(
                            "task-card-accent rounded-xl border border-border/50 bg-card p-3.5 cursor-pointer hover:border-border hover:card-shadow-hover transition-all card-shadow",
                            col.accent
                          )}
                        >
                          <div className="flex items-start gap-2.5 mb-2">
                            <div className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gradient-to-br mt-0.5", task.gradient)}>
                              <span className="text-[8px] font-bold text-white">{task.initials}</span>
                            </div>
                            <p className="text-[12.5px] font-medium leading-snug">{task.title}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                              {task.assignee}
                            </span>
                            <span className="text-[10px] text-muted-foreground/50 ml-auto">{task.time}</span>
                          </div>
                        </div>
                      ))}
                      {colTasks.length === 0 && (
                        <div className="rounded-xl border border-dashed border-border/40 bg-muted/10 p-4 text-center">
                          <p className="text-[11px] text-muted-foreground/40">No tasks</p>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </TabsContent>

        {/* ── Approvals ── */}
        <TabsContent value="approvals" className="space-y-4">
          {pendingApprovals.length > 0 && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/8 p-3 flex items-center gap-2.5">
              <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
              <p className="text-sm text-amber-400/90">
                <span className="font-semibold">{pendingApprovals.length} actions</span> are waiting for your approval before proceeding.
              </p>
            </div>
          )}

          <div className="space-y-3">
            {pendingApprovals.map((item) => (
              <div key={item.id} className="rounded-xl border border-border/50 bg-card card-shadow overflow-hidden">
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br mt-0.5", item.gradient)}>
                      <span className="text-[10px] font-bold text-white">{item.initials}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-xs text-muted-foreground">{item.employee}</p>
                        <span className="text-muted-foreground/30">·</span>
                        <p className="text-xs text-muted-foreground">{item.time}</p>
                        <span className={cn(
                          "inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase",
                          item.risk === "high" ? "bg-rose-500/10 text-rose-400" : "bg-amber-500/10 text-amber-400"
                        )}>
                          {item.risk} risk
                        </span>
                      </div>
                      <p className="text-sm font-medium">{item.action}</p>
                      <p className="text-xs text-muted-foreground mt-1">{item.context}</p>
                      <div className="flex gap-2 mt-3">
                        <Button
                          size="sm"
                          className="h-7 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700"
                          onClick={() => handleApprove(item.id)}
                          disabled={approving === item.id}
                        >
                          {approving === item.id ? (
                            <><CheckCircle2 className="h-3 w-3" /> Approved</>
                          ) : (
                            <><UserCheck className="h-3 w-3" /> Approve</>
                          )}
                        </Button>
                        <Button variant="outline" size="sm" className="h-7 text-xs text-destructive border-destructive/30 hover:bg-destructive/10">
                          Deny
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs gap-1 ml-auto"
                          onClick={() => setContextOpenId((prev) => (prev === item.id ? null : item.id))}
                        >
                          View context
                          {contextOpenId === item.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                {contextOpenId === item.id && (
                  <div className="border-t border-amber-500/15 bg-amber-500/5 p-4 space-y-4">
                    <div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <MessageSquare className="h-3.5 w-3.5 text-amber-400" />
                        <p className="text-[11px] font-semibold text-amber-400 uppercase tracking-wide">Agent 操作记录</p>
                      </div>
                      <div className="space-y-2">
                        {item.thread.map((msg, idx) => (
                          <div key={idx} className="flex items-start gap-2">
                            <span className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold", msg.role === "system" ? "bg-amber-500/20 text-amber-400" : "bg-[hsl(240_5%_14%)] text-muted-foreground")}>
                              {msg.role === "system" ? "!" : idx + 1}
                            </span>
                            <p className={cn("text-xs leading-relaxed", msg.role === "system" ? "text-amber-400 font-medium" : "text-muted-foreground")}>
                              {msg.text}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <FileText className="h-3.5 w-3.5 text-amber-400" />
                        <p className="text-[11px] font-semibold text-amber-400 uppercase tracking-wide">操作数据</p>
                      </div>
                      <pre className="rounded-lg border border-[hsl(240_5%_14%)] bg-[hsl(240_5%_9%)] p-3 text-[11px] font-mono text-muted-foreground whitespace-pre-wrap leading-relaxed">
                        {item.orderData}
                      </pre>
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                        <p className="text-[11px] font-semibold text-amber-400 uppercase tracking-wide">风险说明</p>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed bg-amber-500/8 rounded-lg border border-amber-500/15 p-3">
                        {item.riskReason}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </TabsContent>

        {/* ── Scheduled ── */}
        <TabsContent value="scheduled" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">定时任务</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {schedules.filter((s) => s.status === "active").length} 个运行中 ·{" "}
                {schedules.filter((s) => s.status === "paused").length} 个已暂停
              </p>
            </div>
            <Button size="sm" className="h-8 gap-1.5 text-xs">
              <Plus className="h-3.5 w-3.5" /> 新建定时任务
            </Button>
          </div>

          <div className="space-y-2.5">
            {schedules.map((task) => {
              const isExpanded = expandedScheduleId === task.id
              return (
                <div key={task.id} className="rounded-xl border border-border/50 bg-card card-shadow overflow-hidden">
                  <div
                    className="p-4 cursor-pointer hover:bg-muted/20 transition-colors"
                    onClick={() => setExpandedScheduleId(isExpanded ? null : task.id)}
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-xl mt-0.5", task.color)}>
                        <span className="text-[10px] font-bold text-white">{task.initials}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold">{task.name}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{task.employee}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={cn(
                              "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
                              task.status === "active" ? "bg-emerald-500/10 text-emerald-400" : "bg-muted text-muted-foreground"
                            )}>
                              {task.status === "active" ? "运行中" : "已暂停"}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={(e) => { e.stopPropagation(); toggleSchedule(task.id) }}
                            >
                              {task.status === "active"
                                ? <Pause className="h-3.5 w-3.5 text-muted-foreground" />
                                : <Play className="h-3.5 w-3.5 text-muted-foreground" />
                              }
                            </Button>
                            {isExpanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground/50" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/50" />}
                          </div>
                        </div>
                        <div className="mt-2.5 grid grid-cols-3 gap-3 text-xs">
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Repeat className="h-3 w-3 shrink-0" />
                            <span>{task.schedule}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Timer className="h-3 w-3 shrink-0" />
                            <span>下次：{task.nextRun}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Clock className="h-3 w-3 shrink-0" />
                            <span>上次：{task.lastRun}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-border/40 bg-muted/10 px-4 py-3 space-y-2">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 mb-2">
                        执行历史
                      </p>
                      {task.executionHistory.map((run, i) => (
                        <div key={i} className="flex items-center gap-3">
                          {run.status === "completed" ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                          ) : (
                            <AlertCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                          )}
                          <span className="text-[12px] text-muted-foreground flex-1">{run.date}</span>
                          <span className={cn("text-[11px] font-medium", run.status === "completed" ? "text-emerald-400" : "text-rose-400")}>
                            {run.status === "completed" ? run.duration : "Failed"}
                          </span>
                          {run.error && (
                            <span className="text-[10px] text-red-400/80 ml-2 truncate max-w-[160px]">{run.error}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </TabsContent>

      </Tabs>

      {/* ── Task slide-out panel ── */}
      {selectedTask && (
        <>
          <div className="fixed inset-0 z-40 bg-black/10" onClick={() => setSelectedTaskId(null)} />
          <div className="fixed right-0 top-0 h-screen w-[420px] z-50 bg-card border-l border-border shadow-2xl flex flex-col">
            {/* Header */}
            <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-border/60">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br", selectedTask.gradient)}>
                  <span className="text-[10px] font-bold text-white">{selectedTask.initials}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold truncate">{selectedTask.title}</p>
                  <p className="text-[11px] text-muted-foreground">{selectedTask.employee} · {selectedTask.time}</p>
                </div>
              </div>
              <button onClick={() => setSelectedTaskId(null)} className="text-muted-foreground/50 hover:text-foreground transition-colors shrink-0 ml-2">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Stages */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
              <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50 px-3.5 py-3">
                <div className="mb-1.5 flex items-center gap-1.5">
                  <MessageSquare className="h-3.5 w-3.5 text-sky-700" />
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-sky-800">用户原始反馈</p>
                </div>
                <p className="text-[12px] leading-relaxed text-slate-700">
                  {selectedTask.originalFeedback}
                </p>
              </div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40 mb-3">
                Execution trace
              </p>
              {selectedTask.stages.map((stage, i) => (
                <div key={i} className={cn("border-l-2 rounded-lg px-3 py-2.5", stageStyle(stage.type, stage.error))}>
                  <div className="flex items-center gap-1.5">
                    <StageIcon type={stage.type} error={stage.error} />
                    <span className="text-[11px] font-semibold leading-none">{stage.label}</span>
                    <span className="ml-auto text-[10px] text-muted-foreground/50">{stage.time}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground/80 font-mono mt-1.5 leading-relaxed whitespace-pre-wrap">
                    {stage.content}
                  </p>
                </div>
              ))}

              {/* Waiting indicator for pending_human */}
              {selectedTask.status === "pending_human" && (
                <div className="border-l-2 border-l-amber-500/50 rounded-lg bg-amber-500/8 px-3 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
                    <span className="text-[11px] font-semibold text-amber-400">等待人工决策</span>
                  </div>
                </div>
              )}
            </div>

            {/* Human intervention input */}
            {selectedTask.needsHuman && (
              <div className="shrink-0 border-t border-border/60 bg-amber-500/5 px-5 py-4 space-y-3">
                <p className="text-[12px] font-semibold text-amber-400">给 Agent 的指令</p>
                <p className="text-[11px] text-muted-foreground">
                  告诉 Agent 该怎么做，或者提供额外的判断依据。Agent 会按照你的指示继续执行。
                </p>
                <textarea
                  rows={3}
                  value={humanGuidance[selectedTask.id] ?? ""}
                  onChange={(e) => setHumanGuidance((prev) => ({ ...prev, [selectedTask.id]: e.target.value }))}
                  placeholder="e.g., 可以退款，客户反映确实是质量问题，优先处理..."
                  className="w-full rounded-xl border border-amber-200 bg-white px-3.5 py-2.5 text-[12.5px] leading-relaxed text-slate-900 shadow-sm placeholder:text-slate-400 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 resize-none"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="gap-1.5 flex-1 bg-amber-600 hover:bg-amber-700"
                    onClick={() => sendGuidance(selectedTask.id)}
                    disabled={!humanGuidance[selectedTask.id]?.trim() || guidanceSent[selectedTask.id]}
                  >
                    {guidanceSent[selectedTask.id] ? (
                      <><CheckCircle2 className="h-3.5 w-3.5" /> 已发送</>
                    ) : (
                      <><Send className="h-3.5 w-3.5" /> 发送指令</>
                    )}
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1 text-destructive border-destructive/30 hover:bg-destructive/5">
                    拒绝任务
                  </Button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

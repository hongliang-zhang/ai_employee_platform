"use client"

import { useParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  ArrowLeft,
  MessageSquare,
  Settings2,
  Pause,
  Copy,
  CheckCircle2,
  XCircle,
  Globe,
  Mail,
  FileText,
  Hash,
  Cpu,
  Play,
  MoreHorizontal,
  Zap,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  Brain,
  AlertCircle,
  ArrowDownLeft,
  X,
  Check,
  Save,
  Send,
  Bot,
  User,
  Plus,
  ExternalLink,
  Slack,
  Activity,
  DollarSign,
  Timer,
} from "lucide-react"
import { useState } from "react"
import { cn } from "@/lib/utils"

const availableModels = [
  { id: "glm-5.1", name: "GLM-5.1", badge: "Flagship", desc: "旗舰推理模型" },
  { id: "glm-5-turbo", name: "GLM-5 Turbo", badge: "Recommended", desc: "高效均衡" },
  { id: "glm-5v-turbo", name: "GLM-5V Turbo", badge: "Vision", desc: "视觉+语言" },
  { id: "glm-4.7-flash", name: "GLM-4.7 Flash", badge: "Fast", desc: "超低延迟" },
  { id: "claude-sonnet-4-5", name: "Claude 3.5 Sonnet", badge: "Claude", desc: "Anthropic flagship" },
  { id: "claude-haiku-4-5", name: "Claude 3.5 Haiku", badge: "Claude", desc: "Anthropic fast" },
]

const employeeData = {
  "1": {
    id: "1", name: "Customer Support Agent", role: "Support", initials: "CS",
    gradient: "from-blue-500 to-blue-700", gradientHero: "from-blue-500/10 via-blue-400/5 to-transparent",
    status: "active" as const, model: "Claude 3.5 Sonnet", modelId: "claude-sonnet-4-5",
    createdAt: "Jan 12, 2025", updatedAt: "2 days ago",
    description: "Handles inbound customer queries, resolves tickets, and escalates complex issues to Linear. Maintains a friendly, professional tone and always confirms before taking irreversible actions.",
    sessions: 145, successRate: 96.5, lastActive: "2 min ago",
    totalTokens: 198000, costMonth: "$29.70", avgResponseTime: "45s",
    skills: [
      { name: "Web Search", icon: Globe, connected: true }, { name: "Linear", icon: Hash, connected: true },
      { name: "Email", icon: Mail, connected: true }, { name: "Knowledge Base", icon: FileText, connected: true },
      { name: "Slack", icon: Hash, connected: true },
    ],
    channels: [{ id: "slack", type: "Slack", detail: "#support", active: true }, { id: "email", type: "Email", detail: "support@company.com", active: true }],
    systemPrompt: `You are a Customer Support Agent for the company.\n\nAlways be professional, empathetic, and concise in your responses. Follow these guidelines:\n\n• When a customer asks about billing or refunds, always confirm the action before proceeding\n• Escalate complex technical issues to the engineering team via Linear\n• For account access issues, verify customer identity before taking any action\n• Maintain response time under 2 minutes for tier-1 inquiries\n\nYour primary goal is customer satisfaction while protecting company policies.`,
    jobSpec: "Respond to inbound customer inquiries within 2 minutes. Resolve tier-1 tickets autonomously. Escalate tier-2+ to human agents via Linear. Maintain CSAT > 4.5/5.",
  },
  "2": {
    id: "2", name: "Data Analyst", role: "Analytics", initials: "DA",
    gradient: "from-emerald-500 to-emerald-700", gradientHero: "from-emerald-500/10 via-emerald-400/5 to-transparent",
    status: "active" as const, model: "Claude 3.5 Sonnet", modelId: "claude-sonnet-4-5",
    createdAt: "Jan 15, 2025", updatedAt: "5 hours ago",
    description: "Analyzes business data, generates reports, and surfaces insights from your data warehouse. Proactively alerts on anomalies.",
    sessions: 89, successRate: 94.2, lastActive: "18 min ago",
    totalTokens: 142000, costMonth: "$21.30", avgResponseTime: "2m 10s",
    skills: [
      { name: "SQL", icon: Hash, connected: true }, { name: "Python", icon: Zap, connected: true },
      { name: "Google Sheets", icon: FileText, connected: true }, { name: "Notion", icon: FileText, connected: true },
    ],
    channels: [{ id: "slack2", type: "Slack", detail: "#analytics", active: true }],
    systemPrompt: `You are a Data Analyst for the company.\n\nYour role is to analyze business data and provide actionable insights.\n\n• Always validate data quality before drawing conclusions\n• Present findings with confidence intervals when applicable\n• Flag anomalies immediately to the relevant team\n• Generate weekly performance reports every Monday morning`,
    jobSpec: "Analyze business KPIs, generate weekly reports, detect anomalies in data, and provide data-driven recommendations to leadership.",
  },
  "3": {
    id: "3", name: "Sales Assistant", role: "Sales", initials: "SA",
    gradient: "from-orange-500 to-orange-600", gradientHero: "from-orange-500/10 via-orange-400/5 to-transparent",
    status: "testing" as const, model: "Claude 3.5 Haiku", modelId: "claude-haiku-4-5",
    createdAt: "Feb 1, 2025", updatedAt: "1 week ago",
    description: "Helps with lead generation, outreach emails, and CRM data enrichment. Currently in testing phase.",
    sessions: 12, successRate: 87.5, lastActive: "1h ago",
    totalTokens: 18000, costMonth: "$2.70", avgResponseTime: "30s",
    skills: [
      { name: "HubSpot", icon: Hash, connected: true }, { name: "Email", icon: Mail, connected: true },
      { name: "LinkedIn", icon: Globe, connected: false },
    ],
    channels: [],
    systemPrompt: `You are a Sales Assistant for the company.\n\nYour role is to support the sales team with outreach and lead management.\n\n• Personalize outreach emails based on prospect research\n• Keep CRM data up-to-date after every interaction\n• Never make pricing commitments without human approval\n• Flag high-value leads (>$10K ARR) for immediate human follow-up`,
    jobSpec: "Generate qualified leads, send personalized outreach emails, enrich CRM data, and assist sales reps with meeting prep.",
  },
  "4": {
    id: "4", name: "Sprint Facilitator", role: "Engineering", initials: "SF",
    gradient: "from-slate-400 to-slate-600", gradientHero: "from-slate-400/10 via-slate-300/5 to-transparent",
    status: "inactive" as const, model: "Claude 3.5 Haiku", modelId: "claude-haiku-4-5",
    createdAt: "Dec 10, 2024", updatedAt: "3 weeks ago",
    description: "Writes retro summaries, tracks sprint velocity, and preps meeting agendas. Currently inactive.",
    sessions: 0, successRate: 0, lastActive: "Never",
    totalTokens: 0, costMonth: "$0", avgResponseTime: "—",
    skills: [
      { name: "Linear", icon: Hash, connected: true }, { name: "Notion", icon: FileText, connected: true },
      { name: "GitHub", icon: Hash, connected: false },
    ],
    channels: [],
    systemPrompt: `You are a Sprint Facilitator for the engineering team.\n\nYour role is to support the team's agile process.\n\n• Write retro summaries within 30 minutes of meeting end\n• Track sprint velocity and flag deviations >20% from baseline\n• Prepare meeting agendas 24 hours in advance\n• Keep the Linear board tidy — close stale issues weekly`,
    jobSpec: "Facilitate sprint ceremonies, write retro summaries, track velocity metrics, and maintain the Linear project board.",
  },
}

const sessions = [
  {
    id: "s1", status: "completed" as const, time: "Today 10:30", duration: "5m 23s", tokens: 1240, messages: 12,
    preview: "Resolved billing inquiry — waived late fee for longtime customer",
    stages: [
      { type: "input", label: "Customer message received", content: "Hi, I've been charged a late fee of $12 on my account ending in 4821. I've been a customer for 3 years and this is the first time this happened. Can you waive it?", time: "10:30:02" },
      { type: "thinking", label: "Looking up customer account", content: "Searching CRM for customer account... Found: Alice Chen, 3-year customer, no prior violations. Late fee applied on 2025-01-10.", time: "10:30:04" },
      { type: "tool_call", label: "Tool: Knowledge Base", content: "Query: late fee waiver policy\nResult: Customers with >2 years tenure and no prior violations are eligible for one-time courtesy waiver.", time: "10:30:06" },
      { type: "tool_call", label: "Tool: Approval Gate", content: "Action: waive_fee($12.00, account=4821)\nStatus: APPROVED — within $50 auto-approval threshold", time: "10:30:08" },
      { type: "output", label: "Response sent to customer", content: "Hi Alice! I've gone ahead and waived the $12 late fee as a one-time courtesy. It'll be reflected within 1-2 business days.", time: "10:30:12" },
    ],
  },
  {
    id: "s2", status: "completed" as const, time: "Today 09:15", duration: "3m 45s", tokens: 890, messages: 8,
    preview: "Updated knowledge base entry for refund policy",
    stages: [
      { type: "input", label: "Trigger: Scheduled task", content: "Task: review_kb_entries — check for outdated content in knowledge base", time: "09:15:00" },
      { type: "thinking", label: "Scanning knowledge base", content: "Found 2 entries with last-updated > 30 days. Checking against current policy docs...", time: "09:15:03" },
      { type: "tool_call", label: "Tool: Knowledge Base", content: "Update entry: refund_policy.md\nChange: Updated return window from 30 to 45 days per Q1 policy change\nStatus: Updated successfully", time: "09:15:08" },
      { type: "output", label: "Task completed", content: "Updated 1 knowledge base entry. Sent summary to #support-ops Slack channel.", time: "09:15:45" },
    ],
  },
  {
    id: "s3", status: "failed" as const, time: "Today 08:42", duration: "0m 12s", tokens: 120, messages: 2,
    preview: "Failed: timeout connecting to Linear API",
    stages: [
      { type: "input", label: "Customer escalation triggered", content: "Customer ticket #5821 marked as Tier-2. Attempting to create Linear issue.", time: "08:42:01" },
      { type: "tool_call", label: "Tool: Linear (failed)", content: "POST /issues\nError: Connection timeout after 10s\nLinear API unreachable — possible outage", time: "08:42:11", error: true },
    ],
  },
  {
    id: "s4", status: "completed" as const, time: "Yesterday 16:45", duration: "7m 12s", tokens: 1580, messages: 15,
    preview: "Generated Q4 support summary and sent to team",
    stages: [
      { type: "input", label: "Scheduled: weekly summary", content: "Generate Q4 weekly support summary report", time: "16:45:00" },
      { type: "tool_call", label: "Tool: Knowledge Base", content: "Query: all tickets resolved this week\nResult: 89 tickets, avg resolution 4.2 min, CSAT 4.8/5", time: "16:45:12" },
      { type: "thinking", label: "Drafting report", content: "Summarizing metrics, identifying top issue categories: billing (34%), technical (28%), account access (22%), other (16%).", time: "16:45:30" },
      { type: "tool_call", label: "Tool: Email", content: "To: team@company.com\nSubject: Q4 Week 2 Support Summary\nStatus: Sent successfully", time: "16:51:45" },
      { type: "output", label: "Report sent", content: "Weekly summary emailed to 5 recipients. Report archived in Notion.", time: "16:52:00" },
    ],
  },
]

const channelOptions = [
  { id: "slack", name: "Slack", icon: Slack, desc: "Connect to a Slack channel" },
  { id: "email", name: "Email", icon: Mail, desc: "Handle inbound email" },
  { id: "web", name: "Web Chat", icon: Globe, desc: "Embed on your website" },
  { id: "api", name: "API", icon: Zap, desc: "REST API endpoint" },
]

const statusConfig = {
  active: { dot: "bg-emerald-500", text: "text-emerald-700", label: "Active", pill: "bg-emerald-50 border-emerald-200/70 text-emerald-700" },
  testing: { dot: "bg-amber-400", text: "text-amber-700", label: "Testing", pill: "bg-amber-50 border-amber-200/70 text-amber-700" },
  inactive: { dot: "bg-zinc-400", text: "text-zinc-500", label: "Inactive", pill: "bg-zinc-50 border-zinc-200 text-zinc-500" },
}

type Tab = "identity" | "sessions" | "performance" | "channels"
interface ChatMsg { role: "user" | "assistant"; content: string }

export default function EmployeeDetailPage() {
  const params = useParams()
  const id = params.id as string
  const emp = employeeData[id as keyof typeof employeeData]

  const [copied, setCopied] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>("identity")
  const [expandedSession, setExpandedSession] = useState<string | null>(null)

  const [configOpen, setConfigOpen] = useState(false)
  const [editName, setEditName] = useState(emp?.name ?? "")
  const [editModel, setEditModel] = useState(emp?.modelId ?? "")
  const [editPrompt, setEditPrompt] = useState(emp?.systemPrompt ?? "")
  const [editJobSpec, setEditJobSpec] = useState(emp?.jobSpec ?? "")
  const [configTab, setConfigTab] = useState<"general" | "prompt" | "jobspec">("general")
  const [configSaved, setConfigSaved] = useState(false)

  const [chatOpen, setChatOpen] = useState(false)
  const [chatInput, setChatInput] = useState("")
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([
    { role: "assistant", content: `Hi! I'm ${emp?.name ?? "AI Employee"}. How can I help you today?` },
  ])
  const [chatSending, setChatSending] = useState(false)

  const copyPrompt = () => {
    navigator.clipboard.writeText(emp?.systemPrompt ?? "")
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleSaveConfig = () => {
    setConfigSaved(true)
    setTimeout(() => { setConfigSaved(false); setConfigOpen(false) }, 1200)
  }

  const handleSendChat = () => {
    if (!chatInput.trim()) return
    const msg = chatInput.trim()
    setChatInput("")
    setChatMessages((prev) => [...prev, { role: "user", content: msg }])
    setChatSending(true)
    setTimeout(() => {
      setChatMessages((prev) => [...prev, { role: "assistant", content: `Understood. I'll take care of that for you. Let me look into "${msg}" right away.` }])
      setChatSending(false)
    }, 1400)
  }

  if (!emp) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] p-8">
        <p className="text-sm text-muted-foreground">Employee not found</p>
        <Link href="/employees">
          <Button variant="outline" size="sm" className="mt-4 gap-1.5">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to AI Team
          </Button>
        </Link>
      </div>
    )
  }

  const sc = statusConfig[emp.status]

  return (
    <div className="flex flex-col h-full relative">

      {/* ── Topbar ── */}
      <div className="shrink-0 border-b border-border/60 bg-card/80 backdrop-blur-sm px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/employees" className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors shrink-0">
            <ArrowLeft className="h-3.5 w-3.5" /> AI Team
          </Link>
          <span className="text-border/60">/</span>
          <div className="flex items-center gap-2">
            <div className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gradient-to-br text-[9px] font-bold text-white", emp.gradient)}>
              {emp.initials}
            </div>
            <span className="text-[14px] font-semibold">{emp.name}</span>
          </div>
          <span className={cn("flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium", sc.pill)}>
            <span className={cn("h-1.5 w-1.5 rounded-full", emp.status === "active" ? "bg-emerald-500 animate-pulse" : sc.dot)} />
            {sc.label}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {emp.status === "active"
            ? <Button variant="outline" size="sm" className="h-7 gap-1.5 text-[12px] border-border/60"><Pause className="h-3 w-3" /> Pause</Button>
            : emp.status === "inactive"
            ? <Button variant="outline" size="sm" className="h-7 gap-1.5 text-[12px] border-border/60"><Play className="h-3 w-3" /> Activate</Button>
            : null}
          <Button variant="outline" size="sm" className="h-7 gap-1.5 text-[12px] border-border/60"
            onClick={() => { setConfigOpen(true); setEditName(emp.name); setEditModel(emp.modelId); setEditPrompt(emp.systemPrompt); setEditJobSpec(emp.jobSpec) }}>
            <Settings2 className="h-3 w-3" /> Configure
          </Button>
          <Button size="sm" className="h-7 gap-1.5 text-[12px]" onClick={() => setChatOpen(true)}
            style={{ background: "linear-gradient(135deg, hsl(238 42% 54%), hsl(220 55% 55%))" }}>
            <MessageSquare className="h-3 w-3" /> Chat
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left: Profile Panel ── */}
        <div className="w-[260px] shrink-0 border-r border-border/50 overflow-y-auto flex flex-col">

          {/* Hero gradient area */}
          <div className={cn("px-5 pt-7 pb-5 bg-gradient-to-b", emp.gradientHero)}>
            <div className="flex flex-col items-center text-center">
              <div
                className={cn("flex h-[72px] w-[72px] items-center justify-center rounded-2xl bg-gradient-to-br text-[17px] font-bold text-white mb-3", emp.gradient)}
                style={{ boxShadow: "0 4px 20px rgb(0 0 0 / 0.18), 0 0 0 3px hsl(var(--background)), 0 0 0 5px hsl(var(--border) / 0.3)" }}
              >
                {emp.initials}
              </div>
              <h2 className="text-[14.5px] font-bold leading-snug text-foreground">{emp.name}</h2>
              <p className="mt-0.5 text-[12px] text-muted-foreground">{emp.role}</p>
              <p className="mt-1.5 text-[10px] text-muted-foreground/40 flex items-center gap-1">
                <span className={cn("h-1.5 w-1.5 rounded-full inline-block", emp.status === "active" ? "bg-emerald-500" : sc.dot)} />
                Updated {emp.updatedAt}
              </p>
            </div>
          </div>

          <div className="px-4 py-4 space-y-4 flex-1">

            {/* Model */}
            <div>
              <p className="section-label mb-2">Model</p>
              <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-3 py-2.5">
                <div className="icon-box icon-box-primary h-6 w-6 rounded-md">
                  <Cpu className="h-3 w-3" />
                </div>
                <span className="text-[12px] font-semibold leading-none truncate">{emp.model}</span>
              </div>
            </div>

            {/* Key metrics */}
            <div>
              <p className="section-label mb-2">Metrics</p>
              <div className="space-y-2">
                {[
                  { label: "Sessions", value: emp.sessions > 0 ? emp.sessions : "—", icon: Activity, iconClass: "icon-box-primary" },
                  {
                    label: "Success Rate",
                    value: emp.successRate > 0 ? `${emp.successRate}%` : "—",
                    icon: TrendingUp,
                    iconClass: emp.successRate >= 90 ? "icon-box-emerald" : "icon-box-amber",
                    valueClass: emp.successRate >= 90 ? "text-emerald-600" : emp.successRate >= 80 ? "text-amber-600" : undefined,
                  },
                  { label: "Monthly Cost", value: emp.costMonth, icon: DollarSign, iconClass: "icon-box-amber" },
                  { label: "Avg Response", value: emp.avgResponseTime, icon: Timer, iconClass: "icon-box-muted" },
                ].map((item) => {
                  const Icon = item.icon
                  return (
                    <div key={item.label} className="flex items-center gap-2.5 rounded-lg bg-muted/20 px-3 py-2">
                      <div className={cn("icon-box h-6 w-6 rounded-md", item.iconClass)}>
                        <Icon className="h-3 w-3" />
                      </div>
                      <div className="flex-1 min-w-0 flex items-center justify-between">
                        <span className="text-[11px] text-muted-foreground/70">{item.label}</span>
                        <span className={cn("text-[13px] font-bold tabular", item.valueClass ?? "text-foreground")}>{String(item.value)}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Tokens */}
            <div className="rounded-lg border border-border/40 bg-muted/10 px-3 py-2.5 flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground/60">Total tokens</span>
              <span className="text-[12px] font-semibold tabular text-muted-foreground">
                {emp.totalTokens > 0 ? `${(emp.totalTokens / 1000).toFixed(0)}K` : "—"}
              </span>
            </div>
          </div>
        </div>

        {/* ── Right: Tabs ── */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Tab bar */}
          <div className="shrink-0 flex items-center border-b border-border/50 bg-card/10 px-6">
            {(["identity", "sessions", "performance", "channels"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "relative py-3.5 px-1 mr-5 text-[13px] font-medium capitalize transition-colors",
                  activeTab === tab ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {tab}
                {activeTab === tab && (
                  <span className="absolute bottom-0 left-0 right-0 h-[2.5px] rounded-full" style={{ background: "hsl(var(--primary))" }} />
                )}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-6">

            {/* ── IDENTITY ── */}
            {activeTab === "identity" && (
              <div className="max-w-[680px] space-y-7">
                <div>
                  <div className="flex items-center justify-between mb-2.5">
                    <h3 className="section-label">Instructions</h3>
                    <button onClick={copyPrompt} className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                      {copied ? <CheckCircle2 className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-muted/15 overflow-hidden card-shadow">
                    <div className="flex items-center justify-between border-b border-border/40 px-4 py-2 bg-muted/20">
                      <span className="text-[10px] text-muted-foreground/50 font-mono uppercase tracking-wide">system_prompt</span>
                      <span className="text-[10px] text-muted-foreground/30">{emp.systemPrompt.length} chars</span>
                    </div>
                    <pre className="px-4 py-4 text-[12.5px] leading-relaxed text-foreground/75 font-mono whitespace-pre-wrap overflow-auto max-h-64">
                      {emp.systemPrompt}
                    </pre>
                  </div>
                </div>

                <div>
                  <h3 className="section-label mb-2.5">Objective</h3>
                  <div className="rounded-xl border border-border/50 bg-card p-4 card-shadow">
                    <p className="text-[13px] text-foreground/80 leading-relaxed mb-2">{emp.description}</p>
                    <p className="text-[12px] text-muted-foreground/70 leading-relaxed border-t border-border/40 pt-2.5 mt-2.5">{emp.jobSpec}</p>
                  </div>
                </div>

                <div>
                  <h3 className="section-label mb-3">Capabilities</h3>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {emp.skills.map((skill) => {
                      const Icon = skill.icon
                      return (
                        <div key={skill.name} className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-card px-3 py-3 card-shadow hover:card-shadow-hover transition-all">
                          <div className={cn("icon-box h-7 w-7 rounded-lg", skill.connected ? "icon-box-primary" : "icon-box-muted")}>
                            <Icon className="h-3.5 w-3.5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <span className="text-[12.5px] font-medium">{skill.name}</span>
                            {!skill.connected && <p className="text-[10px] text-muted-foreground/40">Not connected</p>}
                          </div>
                          {skill.connected && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* ── SESSIONS ── */}
            {activeTab === "sessions" && (
              <div className="max-w-[680px] space-y-2.5">
                {sessions.map((s) => {
                  const isExpanded = expandedSession === s.id
                  return (
                    <div
                      key={s.id}
                      className={cn(
                        "rounded-xl border bg-card card-shadow hover:card-shadow-hover transition-all cursor-pointer overflow-hidden",
                        s.status === "completed" ? "border-border/50 hover:border-border/80" : "border-red-100 hover:border-red-200"
                      )}
                      onClick={() => setExpandedSession(isExpanded ? null : s.id)}
                    >
                      <div className={cn("w-full h-[3px]", s.status === "completed" ? "bg-gradient-to-r from-emerald-400 to-emerald-500" : "bg-gradient-to-r from-red-400 to-red-500")} />
                      <div className="flex items-start gap-3 px-4 py-3.5">
                        {s.status === "completed"
                          ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                          : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />}
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold leading-snug">{s.preview}</p>
                          <p className="mt-1 text-[11px] text-muted-foreground/60">
                            {s.time} · {s.duration} · {s.messages} msgs · {s.tokens.toLocaleString()} tokens
                          </p>
                        </div>
                        <div className="shrink-0 mt-0.5 text-muted-foreground/40">
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="border-t border-border/40 mx-4 mb-3.5 pt-3.5 space-y-2">
                          {s.stages.map((stage, i) => {
                            const isError = "error" in stage && stage.error === true
                            const stageStyle =
                              stage.type === "input" ? "border-l-blue-300 bg-blue-50/60"
                              : stage.type === "thinking" ? "border-l-amber-300 bg-amber-50/50"
                              : stage.type === "tool_call"
                                ? isError ? "border-l-red-300 bg-red-50/50" : "border-l-emerald-300 bg-emerald-50/50"
                              : "border-l-muted bg-muted/30"
                            const StageIcon = stage.type === "input" ? ArrowDownLeft
                              : stage.type === "thinking" ? Brain
                              : stage.type === "tool_call" ? (isError ? AlertCircle : Zap)
                              : MessageSquare
                            const iconColor = stage.type === "input" ? "text-blue-500"
                              : stage.type === "thinking" ? "text-amber-500"
                              : stage.type === "tool_call" ? (isError ? "text-red-400" : "text-emerald-500")
                              : "text-muted-foreground/50"
                            return (
                              <div key={i} className={cn("border-l-2 rounded-lg px-3 py-2.5", stageStyle)}>
                                <div className="flex items-center gap-1.5">
                                  <StageIcon className={cn("h-3 w-3 shrink-0", iconColor)} />
                                  <span className="text-[11px] font-semibold">{stage.label}</span>
                                  <span className="ml-auto text-[10px] text-muted-foreground/40">{stage.time}</span>
                                </div>
                                <p className="text-[11px] text-muted-foreground/75 font-mono mt-1.5 leading-relaxed whitespace-pre-wrap">
                                  {stage.content}
                                </p>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* ── PERFORMANCE ── */}
            {activeTab === "performance" && (
              <div className="max-w-[680px] space-y-6">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    { label: "Sessions", value: emp.sessions > 0 ? emp.sessions.toString() : "—", icon: Activity, iconClass: "icon-box-primary" },
                    { label: "Success Rate", value: emp.successRate > 0 ? `${emp.successRate}%` : "—", icon: TrendingUp, iconClass: "icon-box-emerald" },
                    { label: "Monthly Cost", value: emp.costMonth, icon: DollarSign, iconClass: "icon-box-amber" },
                    { label: "Avg Response", value: emp.avgResponseTime, icon: Timer, iconClass: "icon-box-muted" },
                  ].map((item) => {
                    const Icon = item.icon
                    return (
                      <div key={item.label} className="surface-elevated px-4 py-4 card-shadow">
                        <div className={cn("icon-box h-8 w-8 mb-3", item.iconClass)}>
                          <Icon className="h-3.5 w-3.5" />
                        </div>
                        <p className="stat-value text-[22px]">{item.value}</p>
                        <p className="section-label mt-1">{item.label}</p>
                      </div>
                    )
                  })}
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp className="h-3.5 w-3.5 text-muted-foreground/50" />
                    <h3 className="section-label">Success Rate Trend</h3>
                  </div>
                  <div className="surface card-shadow overflow-hidden">
                    {[
                      { label: "Overall", value: emp.successRate > 0 ? emp.successRate : null },
                      { label: "This week", value: 97.2 },
                      { label: "Last week", value: 95.8 },
                      { label: "30-day avg", value: 96.1 },
                    ].map((item, i) => (
                      <div key={item.label} className={cn("flex items-center gap-4 px-5 py-3.5", i > 0 && "border-t border-border/40")}>
                        <span className="text-[12.5px] text-muted-foreground w-24 shrink-0">{item.label}</span>
                        <div className="flex-1 h-[4px] rounded-full bg-muted overflow-hidden">
                          <div
                            className={cn("h-full rounded-full transition-all", item.value === null ? "bg-muted-foreground/20" : item.value >= 90 ? "bg-gradient-to-r from-emerald-400 to-emerald-500" : "bg-gradient-to-r from-amber-400 to-amber-500")}
                            style={{ width: item.value !== null ? `${item.value}%` : "0%" }}
                          />
                        </div>
                        <span className={cn("text-[13px] font-bold tabular w-12 text-right shrink-0", item.value === null ? "text-muted-foreground/40" : item.value >= 90 ? "text-emerald-600" : "text-amber-600")}>
                          {item.value !== null ? `${item.value}%` : "—"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Zap className="h-3.5 w-3.5 text-muted-foreground/50" />
                    <h3 className="section-label">Usage & Cost</h3>
                  </div>
                  <div className="surface card-shadow overflow-hidden">
                    {[
                      { label: "Total sessions", value: emp.sessions.toString() },
                      { label: "Total tokens", value: emp.totalTokens > 0 ? `${(emp.totalTokens / 1000).toFixed(0)}K` : "—" },
                      { label: "Est. cost this month", value: emp.costMonth },
                      { label: "Avg. response time", value: emp.avgResponseTime },
                    ].map((item, i) => (
                      <div key={item.label} className={cn("flex items-center justify-between px-5 py-3.5", i > 0 && "border-t border-border/40")}>
                        <span className="text-[12.5px] text-muted-foreground">{item.label}</span>
                        <span className="text-[14px] font-bold tabular">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── CHANNELS ── */}
            {activeTab === "channels" && (
              <div className="max-w-[680px] space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="section-label">Deployed on</h3>
                    <Button size="sm" variant="outline" className="h-7 gap-1.5 text-[12px]">
                      <Plus className="h-3 w-3" /> Connect channel
                    </Button>
                  </div>
                  {emp.channels.length > 0 ? (
                    <div className="space-y-2">
                      {emp.channels.map((ch) => (
                        <div key={ch.id} className="flex items-center gap-3 rounded-xl border border-border/50 bg-card p-4 card-shadow">
                          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted shrink-0">
                            {ch.type === "Slack" ? <Hash className="h-4 w-4 text-muted-foreground" /> : <Mail className="h-4 w-4 text-muted-foreground" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-semibold">{ch.type}</p>
                            <p className="text-[11px] text-muted-foreground">{ch.detail}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={cn("flex items-center gap-1 text-[11px] font-medium", ch.active ? "text-emerald-600" : "text-muted-foreground/50")}>
                              <span className={cn("h-1.5 w-1.5 rounded-full", ch.active ? "bg-emerald-500" : "bg-zinc-400")} />
                              {ch.active ? "Active" : "Inactive"}
                            </span>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground/50 hover:text-foreground">
                              <Settings2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center py-12 text-center rounded-xl border border-dashed border-border/50 bg-muted/10">
                      <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center mb-3">
                        <Slack className="h-5 w-5 text-muted-foreground/40" />
                      </div>
                      <p className="text-[13px] font-semibold text-muted-foreground">Not deployed yet</p>
                      <p className="text-[11px] text-muted-foreground/50 mt-0.5">Connect a channel to deploy this agent</p>
                    </div>
                  )}
                </div>

                <div>
                  <h3 className="section-label mb-3">Available channels</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {channelOptions.map((opt) => {
                      const Icon = opt.icon
                      const isActive = emp.channels.some((c) => c.type === opt.name)
                      return (
                        <div key={opt.id} className={cn("flex items-center gap-3 rounded-xl border p-4 transition-all", isActive ? "border-emerald-200/60 bg-emerald-50/50" : "border-border/50 bg-card card-shadow hover:card-shadow-hover cursor-pointer")}>
                          <div className={cn("flex h-9 w-9 items-center justify-center rounded-xl shrink-0", isActive ? "bg-emerald-100" : "bg-muted")}>
                            <Icon className={cn("h-[18px] w-[18px]", isActive ? "text-emerald-600" : "text-muted-foreground/60")} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-semibold">{opt.name}</p>
                            <p className="text-[11px] text-muted-foreground/60">{opt.desc}</p>
                          </div>
                          {isActive
                            ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                            : <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0"><ExternalLink className="h-3.5 w-3.5 text-muted-foreground/50" /></Button>}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Configure Drawer ── */}
      {configOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/25 backdrop-blur-sm" onClick={() => setConfigOpen(false)} />
          <div className="fixed right-0 top-0 h-screen w-[540px] z-50 flex flex-col" style={{ background: "hsl(var(--card))", borderLeft: "1px solid hsl(var(--border))", boxShadow: "-8px 0 40px rgb(0 0 0 / 0.15)" }}>
            <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-border/60">
              <div className="flex items-center gap-3">
                <div className={cn("flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br text-[10px] font-bold text-white", emp.gradient)}>
                  {emp.initials}
                </div>
                <div>
                  <p className="text-[14px] font-bold">Configure Agent</p>
                  <p className="text-[11px] text-muted-foreground">{emp.name}</p>
                </div>
              </div>
              <button onClick={() => setConfigOpen(false)} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors text-muted-foreground/60 hover:text-foreground">
                <X className="h-4.5 w-4.5 h-[18px] w-[18px]" />
              </button>
            </div>
            <div className="shrink-0 flex items-center border-b border-border/50 px-6">
              {(["general", "prompt", "jobspec"] as const).map((t) => (
                <button key={t} onClick={() => setConfigTab(t)}
                  className={cn("relative py-3 px-1 mr-5 text-[12.5px] font-medium capitalize transition-colors", configTab === t ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
                  {t === "jobspec" ? "Job Spec" : t.charAt(0).toUpperCase() + t.slice(1)}
                  {configTab === t && <span className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full" style={{ background: "hsl(var(--primary))" }} />}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {configTab === "general" && (
                <div className="space-y-5">
                  <div>
                    <label className="text-[12px] font-semibold mb-2 block">Agent Name</label>
                    <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-9" />
                  </div>
                  <div>
                    <label className="text-[12px] font-semibold mb-3 block">AI Model</label>
                    <div className="space-y-2">
                      {availableModels.map((m) => (
                        <button key={m.id} onClick={() => setEditModel(m.id)}
                          className={cn("flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all", editModel === m.id ? "border-[hsl(var(--primary))]/50 bg-[hsl(var(--accent))]/60 ring-1 ring-[hsl(var(--primary))]/20" : "border-border/60 bg-background hover:border-border")}>
                          <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", editModel === m.id ? "bg-[hsl(var(--primary))]" : "bg-muted")}>
                            <Cpu className={cn("h-3.5 w-3.5", editModel === m.id ? "text-white" : "text-muted-foreground/50")} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-[13px] font-semibold">{m.name}</p>
                              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground">{m.badge}</span>
                            </div>
                            <p className="text-[11px] text-muted-foreground">{m.desc}</p>
                          </div>
                          {editModel === m.id && <Check className="h-4 w-4 shrink-0" style={{ color: "hsl(var(--primary))" }} />}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              {configTab === "prompt" && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[12px] font-semibold">System Prompt</label>
                    <span className="text-[10px] text-muted-foreground/40">{editPrompt.length} chars</span>
                  </div>
                  <textarea value={editPrompt} onChange={(e) => setEditPrompt(e.target.value)}
                    className="flex w-full rounded-xl border border-border/60 bg-background px-4 py-3 text-[12.5px] leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none font-mono min-h-[400px]" />
                </div>
              )}
              {configTab === "jobspec" && (
                <div>
                  <label className="text-[12px] font-semibold mb-2 block">Job Spec</label>
                  <textarea value={editJobSpec} onChange={(e) => setEditJobSpec(e.target.value)}
                    className="flex w-full rounded-xl border border-border/60 bg-background px-4 py-3 text-[13px] leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none min-h-[300px]" />
                </div>
              )}
            </div>
            <div className="shrink-0 flex items-center justify-between gap-3 px-6 py-4 border-t border-border/60 bg-muted/20">
              <Button variant="ghost" size="sm" onClick={() => setConfigOpen(false)}>Cancel</Button>
              <Button size="sm" className="gap-1.5 px-5" onClick={handleSaveConfig} disabled={configSaved}>
                {configSaved ? <><Check className="h-3.5 w-3.5" /> Saved</> : <><Save className="h-3.5 w-3.5" /> Save changes</>}
              </Button>
            </div>
          </div>
        </>
      )}

      {/* ── Chat Panel ── */}
      {chatOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/25 backdrop-blur-sm" onClick={() => setChatOpen(false)} />
          <div className="fixed right-0 top-0 h-screen w-[400px] z-50 flex flex-col" style={{ background: "hsl(var(--card))", borderLeft: "1px solid hsl(var(--border))", boxShadow: "-8px 0 40px rgb(0 0 0 / 0.15)" }}>
            <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-border/60">
              <div className="flex items-center gap-3">
                <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br shadow-sm", emp.gradient)}>
                  <Bot className="h-[18px] w-[18px] text-white" />
                </div>
                <div>
                  <p className="text-[13.5px] font-bold">{emp.name}</p>
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                    <span className={cn("h-1.5 w-1.5 rounded-full inline-block", emp.status === "active" ? "bg-emerald-500 animate-pulse" : "bg-amber-400")} />
                    {emp.status === "active" ? "Online" : "Testing mode"}
                  </p>
                </div>
              </div>
              <button onClick={() => setChatOpen(false)} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors text-muted-foreground/60 hover:text-foreground">
                <X className="h-[18px] w-[18px]" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-background">
              {chatMessages.map((msg, i) => (
                <div key={i} className={cn("flex gap-2.5", msg.role === "user" ? "justify-end" : "justify-start")}>
                  {msg.role === "assistant" && (
                    <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br mt-0.5", emp.gradient)}>
                      <Bot className="h-3.5 w-3.5 text-white" />
                    </div>
                  )}
                  <div className={cn("max-w-[80%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed shadow-sm", msg.role === "user" ? "bg-foreground text-background rounded-br-md" : "bg-card border border-border/50 text-foreground rounded-bl-md")}>
                    {msg.content}
                  </div>
                  {msg.role === "user" && (
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--primary))]/10 mt-0.5">
                      <User className="h-3.5 w-3.5" style={{ color: "hsl(var(--primary))" }} />
                    </div>
                  )}
                </div>
              ))}
              {chatSending && (
                <div className="flex gap-2.5 justify-start">
                  <div className={cn("flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br", emp.gradient)}>
                    <Bot className="h-3.5 w-3.5 text-white" />
                  </div>
                  <div className="rounded-2xl rounded-bl-md bg-card border border-border/50 px-3.5 py-3">
                    <span className="flex gap-1.5">
                      {[0, 150, 300].map((delay) => (
                        <span key={delay} className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: `${delay}ms` }} />
                      ))}
                    </span>
                  </div>
                </div>
              )}
            </div>
            <div className="shrink-0 border-t border-border/50 p-4">
              <div className="flex gap-2 items-end">
                <textarea rows={1} value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendChat() } }}
                  placeholder={`Message ${emp.name}...`}
                  className="flex-1 w-full rounded-xl border border-border/60 bg-background px-3.5 py-2.5 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none min-h-[40px] max-h-28 leading-relaxed placeholder:text-muted-foreground/50" />
                <Button size="icon" onClick={handleSendChat} disabled={!chatInput.trim() || chatSending} className="h-10 w-10 rounded-xl shrink-0">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

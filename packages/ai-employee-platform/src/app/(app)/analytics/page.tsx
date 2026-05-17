"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  MessageSquare,
  CheckCircle2,
  Zap,
  ArrowUpRight,
  ArrowDownRight,
  ChevronDown,
  ChevronUp,
  Clock,
  BarChart3,
  Globe,
  Hash,
  Mail,
  FileText,
  Activity,
  Users,
} from "lucide-react"
import { cn } from "@/lib/utils"

const timeRanges = ["7d", "30d", "90d"] as const
type TimeRange = (typeof timeRanges)[number]

const employeeMetrics = [
  {
    id: "1",
    name: "Customer Support Agent",
    initials: "CS",
    gradient: "from-blue-500 to-blue-700",
    color: "bg-blue-600",
    dotColor: "#3b82f6",
    role: "Support",
    sessions: { "7d": 89, "30d": 412, "90d": 1240 },
    successRate: { "7d": 96.5, "30d": 95.2, "90d": 94.8 },
    avgResponseTime: { "7d": "45s", "30d": "48s", "90d": "51s" },
    tokensUsed: { "7d": 45200, "30d": 198000, "90d": 612000 },
    cost: { "7d": 6.78, "30d": 29.7, "90d": 91.8 },
    weeklyTrend: [78, 85, 82, 89, 93, 87, 89],
    taskBreakdown: [
      { label: "Ticket Resolution", pct: 54, color: "bg-blue-500" },
      { label: "Knowledge Base", pct: 22, color: "bg-blue-300" },
      { label: "Escalation", pct: 14, color: "bg-amber-400" },
      { label: "Other", pct: 10, color: "bg-muted-foreground/20" },
    ],
    topTools: [
      { name: "Knowledge Base", icon: FileText, calls: 312, pct: 42 },
      { name: "Linear", icon: Hash, calls: 198, pct: 27 },
      { name: "Email", icon: Mail, calls: 145, pct: 20 },
      { name: "Web Search", icon: Globe, calls: 81, pct: 11 },
    ],
  },
  {
    id: "2",
    name: "Data Analyst",
    initials: "DA",
    gradient: "from-emerald-500 to-emerald-700",
    color: "bg-emerald-600",
    dotColor: "#10b981",
    role: "Analytics",
    sessions: { "7d": 34, "30d": 156, "90d": 487 },
    successRate: { "7d": 94.2, "30d": 93.0, "90d": 91.5 },
    avgResponseTime: { "7d": "1m 12s", "30d": "1m 8s", "90d": "1m 15s" },
    tokensUsed: { "7d": 67800, "30d": 298000, "90d": 897000 },
    cost: { "7d": 10.17, "30d": 44.7, "90d": 134.6 },
    weeklyTrend: [28, 32, 30, 35, 31, 34, 34],
    taskBreakdown: [
      { label: "Report Generation", pct: 48, color: "bg-emerald-500" },
      { label: "Data Query", pct: 31, color: "bg-emerald-300" },
      { label: "Anomaly Detection", pct: 13, color: "bg-amber-400" },
      { label: "Other", pct: 8, color: "bg-muted-foreground/20" },
    ],
    topTools: [
      { name: "SQL / DB", icon: Hash, calls: 487, pct: 52 },
      { name: "Google Sheets", icon: FileText, calls: 234, pct: 25 },
      { name: "Notion", icon: FileText, calls: 156, pct: 17 },
      { name: "Web Search", icon: Globe, calls: 56, pct: 6 },
    ],
  },
  {
    id: "3",
    name: "Sales Assistant",
    initials: "SA",
    gradient: "from-orange-500 to-orange-600",
    color: "bg-orange-500",
    dotColor: "#f97316",
    role: "Sales",
    sessions: { "7d": 12, "30d": 48, "90d": 48 },
    successRate: { "7d": 87.5, "30d": 87.5, "90d": 87.5 },
    avgResponseTime: { "7d": "52s", "30d": "52s", "90d": "52s" },
    tokensUsed: { "7d": 8200, "30d": 32800, "90d": 32800 },
    cost: { "7d": 1.23, "30d": 4.92, "90d": 4.92 },
    weeklyTrend: [8, 10, 9, 12, 11, 10, 12],
    taskBreakdown: [
      { label: "Outreach Email", pct: 58, color: "bg-orange-500" },
      { label: "Lead Research", pct: 26, color: "bg-orange-300" },
      { label: "CRM Update", pct: 12, color: "bg-amber-400" },
      { label: "Other", pct: 4, color: "bg-muted-foreground/20" },
    ],
    topTools: [
      { name: "Email", icon: Mail, calls: 89, pct: 45 },
      { name: "HubSpot", icon: Hash, calls: 67, pct: 34 },
      { name: "Web Search", icon: Globe, calls: 27, pct: 14 },
      { name: "LinkedIn", icon: Globe, calls: 14, pct: 7 },
    ],
  },
]

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const w = 56
  const h = 24
  const pts = data.map((v, i) => ({
    x: (i / (data.length - 1)) * w,
    y: h - ((v - min) / range) * h,
  }))
  let d = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 1; i < pts.length; i++) {
    const cpx = (pts[i - 1].x + pts[i].x) / 2
    d += ` C ${cpx} ${pts[i - 1].y}, ${cpx} ${pts[i].y}, ${pts[i].x} ${pts[i].y}`
  }
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0">
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export default function AnalyticsPage() {
  const [range, setRange] = useState<TimeRange>("30d")
  const [expandedRow, setExpandedRow] = useState<string | null>(null)

  const totalSessions = employeeMetrics.reduce((acc, e) => acc + e.sessions[range], 0)
  const avgSuccessRate =
    employeeMetrics.reduce((acc, e) => acc + e.successRate[range], 0) / employeeMetrics.length
  const totalCost = employeeMetrics.reduce((acc, e) => acc + e.cost[range], 0)
  const totalTokens = employeeMetrics.reduce((acc, e) => acc + e.tokensUsed[range], 0)

  return (
    <div className="px-8 py-8 max-w-6xl">
      {/* Header */}
      <div className="mb-7 flex items-start justify-between">
        <div className="flex items-start gap-4">
          <div className="icon-box icon-box-primary h-11 w-11">
            <BarChart3 className="h-[19px] w-[19px]" />
          </div>
          <div>
            <h1 className="text-[26px] font-extrabold tracking-tight leading-none" style={{ letterSpacing: "-0.03em" }}>Analytics</h1>
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              Team performance, usage, and cost insights
            </p>
          </div>
        </div>
        <div className="flex items-center gap-0.5 rounded-[10px] border border-border/50 bg-muted/30 p-0.5">
          {timeRanges.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={cn(
                "rounded-[8px] px-3.5 py-1.5 text-[12px] font-semibold transition-all",
                range === r ? "text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
              style={range === r ? {
                background: "linear-gradient(135deg, hsl(238 62% 51%), hsl(220 65% 54%))",
                boxShadow: "0 2px 8px hsl(238 62% 51% / 0.25)",
              } : undefined}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Summary KPI row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 mb-8">
        {[
          { label: "Total Sessions", value: totalSessions.toLocaleString(), icon: MessageSquare, boxClass: "icon-box-blue", trend: "+14%", pos: true },
          { label: "Avg Success Rate", value: `${avgSuccessRate.toFixed(1)}%`, icon: CheckCircle2, boxClass: "icon-box-emerald", trend: "+1.2%", pos: true },
          { label: "Total Cost", value: `$${totalCost.toFixed(2)}`, icon: DollarSign, boxClass: "icon-box-amber", trend: "+8%", pos: false },
          { label: "Tokens Used", value: `${(totalTokens / 1000).toFixed(0)}K`, icon: Zap, boxClass: "icon-box-primary", trend: "+22%", pos: false },
        ].map((s) => {
          const Icon = s.icon
          return (
            <div key={s.label} className="surface card-shadow hover:card-shadow-hover hover:-translate-y-0.5 transition-all duration-200 pt-5 pb-4 px-5">
              <div className="flex items-start justify-between mb-4">
                <div className={cn("icon-box h-9 w-9", s.boxClass)}>
                  <Icon className="h-4 w-4" />
                </div>
                <span className={cn(
                  "text-[11px] font-semibold tabular rounded-full px-2 py-0.5 border",
                  s.pos ? "text-emerald-700 bg-emerald-50 border-emerald-200" : "text-rose-700 bg-rose-50 border-rose-200"
                )}>
                  {s.trend}
                </span>
              </div>
              <p className="stat-value mb-1.5">{s.value}</p>
              <p className="kpi-label">{s.label}</p>
            </div>
          )
        })}
      </div>

      {/* Per-employee expandable breakdown */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="icon-box icon-box-primary h-9 w-9">
            <Users className="h-[15px] w-[15px]" />
          </div>
          <h2 className="text-[17px] font-bold tracking-tight" style={{ letterSpacing: "-0.02em" }}>Per-Employee Breakdown</h2>
        </div>

        {/* Table header */}
        <div className="rounded-t-[14px] border border-border/50 bg-muted/40 px-5 py-3">
          <div className="grid grid-cols-[2fr_1fr_1.2fr_1fr_1fr_1fr_32px] gap-4 items-center">
            {["Employee", "Sessions", "Success Rate", "Avg Response", "Tokens", "Cost", ""].map(
              (h) => (
                <p key={h} className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">
                  {h}
                </p>
              )
            )}
          </div>
        </div>

        <div className="border-x border-b border-border/50 rounded-b-[14px] overflow-hidden bg-card">
          {employeeMetrics.map((emp) => {
            const isExpanded = expandedRow === emp.id
            const rate = emp.successRate[range]
            return (
              <div
                key={emp.id}
                className={cn("border-t border-border/40 first:border-t-0 transition-colors", isExpanded && "bg-muted/20")}
              >
                {/* Main row */}
                <div
                  className="grid grid-cols-[2fr_1fr_1.2fr_1fr_1fr_1fr_32px] gap-4 px-4 py-3.5 items-center cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => setExpandedRow(isExpanded ? null : emp.id)}
                >
                  <div className="flex items-center gap-2.5">
                    <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-[9px] font-bold text-white", emp.gradient)}>
                      {emp.initials}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium truncate">{emp.name}</p>
                      <p className="text-[11px] text-muted-foreground/60">{emp.role}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-bold tabular">{emp.sessions[range]}</span>
                    <Sparkline data={emp.weeklyTrend} color={emp.dotColor} />
                  </div>

                  <div className="flex items-center gap-2">
                    <span className={cn("text-[13px] font-semibold tabular", rate >= 90 ? "text-emerald-400" : "text-amber-400")}>
                      {rate}%
                    </span>
                    <div className="flex-1 h-[3px] rounded-full bg-muted overflow-hidden max-w-[48px]">
                      <div
                        className={cn("h-full rounded-full", rate >= 90 ? "bg-emerald-500" : "bg-amber-400")}
                        style={{ width: `${rate}%` }}
                      />
                    </div>
                  </div>

                  <span className="text-[13px] text-muted-foreground">{emp.avgResponseTime[range]}</span>
                  <span className="text-[13px] text-muted-foreground tabular">{(emp.tokensUsed[range] / 1000).toFixed(0)}K</span>
                  <span className="text-[13px] font-semibold tabular">${emp.cost[range].toFixed(2)}</span>

                  <button className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/50 hover:text-foreground transition-colors">
                    {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </button>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-border/30 bg-muted/10">
                    <div className="pt-4 grid grid-cols-2 gap-5">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-3">Task Distribution</p>
                        <div className="space-y-2.5">
                          {emp.taskBreakdown.map((t) => (
                            <div key={t.label}>
                              <div className="flex justify-between text-[12px] mb-1">
                                <span className="text-muted-foreground">{t.label}</span>
                                <span className="font-medium tabular">{t.pct}%</span>
                              </div>
                              <div className="h-[3px] w-full rounded-full bg-muted overflow-hidden">
                                <div className={cn("h-full rounded-full", t.color)} style={{ width: `${t.pct}%` }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-3">Top Tools</p>
                        <div className="space-y-2">
                          {emp.topTools.map((tool) => {
                            const Icon = tool.icon
                            return (
                              <div key={tool.name} className="flex items-center gap-2.5">
                                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-muted">
                                  <Icon className="h-3 w-3 text-muted-foreground/60" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex justify-between text-[12px] mb-0.5">
                                    <span className="text-muted-foreground truncate">{tool.name}</span>
                                    <span className="font-medium tabular shrink-0 ml-2">{tool.calls}</span>
                                  </div>
                                  <div className="h-[2px] w-full rounded-full bg-muted overflow-hidden">
                                    <div className="h-full rounded-full bg-[hsl(var(--primary))]/40" style={{ width: `${tool.pct}%` }} />
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Cost + Activity grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Cost by employee */}
        <div className="surface card-shadow p-5 pt-6">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="icon-box icon-box-amber h-9 w-9">
              <DollarSign className="h-4 w-4" />
            </div>
            <h3 className="text-[15px] font-bold tracking-tight" style={{ letterSpacing: "-0.02em" }}>Cost by Employee</h3>
          </div>
          <div className="space-y-4">
            {employeeMetrics.map((emp) => {
              const pct = ((emp.cost[range] / totalCost) * 100).toFixed(0)
              return (
                <div key={emp.id}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <div className={cn("h-2 w-2 rounded-full bg-gradient-to-br", emp.gradient)} />
                      <span className="text-[12px] font-medium">{emp.name}</span>
                    </div>
                    <span className="text-[12px] text-muted-foreground tabular">
                      ${emp.cost[range].toFixed(2)}{" "}
                      <span className="text-muted-foreground/50">({pct}%)</span>
                    </span>
                  </div>
                  <div className="h-[3px] w-full rounded-full bg-muted overflow-hidden">
                    <div className={cn("h-full rounded-full bg-gradient-to-r", emp.gradient)} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Success rate bars */}
        <div className="surface card-shadow p-5 pt-6">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="icon-box icon-box-emerald h-9 w-9">
              <Activity className="h-4 w-4" />
            </div>
            <h3 className="text-[15px] font-bold tracking-tight" style={{ letterSpacing: "-0.02em" }}>Success Rate Trend</h3>
          </div>
          <div className="space-y-4">
            {employeeMetrics.map((emp) => {
              const rate = emp.successRate[range]
              return (
                <div key={emp.id} className="flex items-center gap-3">
                  <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-[9px] font-bold text-white", emp.gradient)}>
                    {emp.initials}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[12px] font-medium truncate max-w-[160px]">{emp.name}</span>
                      <span className={cn("text-[12px] font-semibold tabular", rate >= 90 ? "text-emerald-400" : "text-amber-400")}>
                        {rate}%
                      </span>
                    </div>
                    <div className="h-[3px] w-full rounded-full bg-muted overflow-hidden">
                      <div className={cn("h-full rounded-full bg-gradient-to-r", emp.gradient)} style={{ width: `${rate}%` }} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

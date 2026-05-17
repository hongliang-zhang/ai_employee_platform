"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  AlertTriangle,
  CheckCircle2,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Star,
  MessageSquare,
  Clock,
  DollarSign,
  TrendingUp,
  XCircle,
  Lightbulb,
  Cpu,
} from "lucide-react"
import { cn } from "@/lib/utils"

const employees = [
  {
    id: "1",
    name: "Customer Support",
    role: "Support",
    initials: "CS",
    gradient: "from-blue-500 to-blue-700",
    strokeColor: "#3b82f6",
    status: "active",
    kpis: [
      { name: "首次解决率", value: 87, target: 85, unit: "%", trend: +2.3 },
      { name: "平均响应时间", value: 45, target: 60, unit: "s", trend: -8, lowerIsBetter: true },
      { name: "客户满意度", value: 4.8, target: 4.5, unit: "/5", trend: +0.2 },
      { name: "本周会话数", value: 89, target: 80, unit: "", trend: +12 },
    ],
    weeklyScore: 94,
    prevWeekScore: 91,
    alerts: [] as { type: string; message: string }[],
  },
  {
    id: "2",
    name: "Data Analyst",
    role: "Analytics",
    initials: "DA",
    gradient: "from-emerald-500 to-emerald-700",
    strokeColor: "#10b981",
    status: "active",
    kpis: [
      { name: "报告准时率", value: 92, target: 95, unit: "%", trend: -1.5 },
      { name: "数据准确率", value: 99.1, target: 99, unit: "%", trend: +0.3 },
      { name: "平均处理时间", value: 72, target: 90, unit: "s", trend: -5, lowerIsBetter: true },
      { name: "本周任务数", value: 34, target: 30, unit: "", trend: +6 },
    ],
    weeklyScore: 88,
    prevWeekScore: 90,
    alerts: [{ type: "warning", message: "报告准时率低于目标值 3%，连续 2 周下降" }],
  },
  {
    id: "3",
    name: "Sales Assistant",
    role: "Sales",
    initials: "SA",
    gradient: "from-orange-500 to-orange-600",
    strokeColor: "#f97316",
    status: "testing",
    kpis: [
      { name: "线索转化率", value: 12, target: 15, unit: "%", trend: -0.8 },
      { name: "外联响应率", value: 34, target: 30, unit: "%", trend: +4.2 },
      { name: "平均对话轮次", value: 6.2, target: 8, unit: "", trend: -1.1, lowerIsBetter: true },
      { name: "本周商机数", value: 12, target: 20, unit: "", trend: +2 },
    ],
    weeklyScore: 72,
    prevWeekScore: 68,
    alerts: [
      { type: "warning", message: "线索转化率低于目标，建议优化 Outreach 话术" },
      { type: "info", message: "仍处于测试阶段，数据样本量较小" },
    ],
  },
]

const weeklyTrend = [
  { week: "W1", cs: 88, da: 92, sa: 65 },
  { week: "W2", cs: 90, da: 91, sa: 67 },
  { week: "W3", cs: 89, da: 93, sa: 69 },
  { week: "W4", cs: 91, da: 90, sa: 68 },
  { week: "W5", cs: 94, da: 88, sa: 72 },
]

const insights = [
  {
    id: "i1",
    employee: "Sales Assistant",
    initials: "SA",
    gradient: "from-orange-500 to-orange-600",
    category: "prompt",
    priority: "high",
    title: "优化 Outreach 话术，提升线索转化率",
    finding: "线索转化率 (12%) 低于目标 (15%)，过去 3 周持续下降。分析 34 条失败对话后发现：开场白过长（平均 85 词）导致 62% 的潜在客户在第一轮未回复。",
    suggestion: '将系统提示中的开场白限制更新为：\n"直接说明你能为对方节省的具体成本/时间，控制在 25 词内，避免自我介绍。"',
    impact: "预计提升转化率 2-4%",
    status: "pending" as const,
  },
  {
    id: "i2",
    employee: "Data Analyst",
    initials: "DA",
    gradient: "from-emerald-500 to-emerald-700",
    category: "skill",
    priority: "medium",
    title: "添加「数据可视化」技能，减少人工图表需求",
    finding: "过去 30 天内有 23 次会话中用户手动将数据导入 Google Sheets 制图，而 Data Analyst 已提供了数据。添加可视化工具可减少该人工步骤。",
    suggestion: "为 Data Analyst 接入 Google Sheets Charts API 或 Quickchart.io，允许直接生成内嵌图表并在报告中输出。",
    impact: "预计减少每周约 2 小时人工制图",
    status: "pending" as const,
  },
  {
    id: "i3",
    employee: "Customer Support Agent",
    initials: "CS",
    gradient: "from-blue-500 to-blue-700",
    category: "knowledge",
    priority: "low",
    title: "更新退款政策知识库条目（已过时）",
    finding: "知识库中退款政策条目最后更新于 45 天前。本周有 8 次会话中 Agent 引用了旧规则（7 天申请期），实际政策已更新为 14 天。",
    suggestion: "将退款政策条目中的申请期限从 7 天更新为 14 天，并添加对应的边界案例说明。",
    impact: "消除本周 8% 的知识错误率",
    status: "accepted" as const,
  },
]

function smoothLinePath(pts: {x: number; y: number}[]): string {
  if (pts.length < 2) return ""
  let d = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 1; i < pts.length; i++) {
    const cpx = (pts[i-1].x + pts[i].x) / 2
    d += ` C ${cpx} ${pts[i-1].y}, ${cpx} ${pts[i].y}, ${pts[i].x} ${pts[i].y}`
  }
  return d
}

function smoothAreaPath(pts: {x: number; y: number}[], width: number, height: number): string {
  if (pts.length < 2) return ""
  let d = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 1; i < pts.length; i++) {
    const cpx = (pts[i-1].x + pts[i].x) / 2
    d += ` C ${cpx} ${pts[i-1].y}, ${cpx} ${pts[i].y}, ${pts[i].x} ${pts[i].y}`
  }
  d += ` L ${width} ${height} L 0 ${height} Z`
  return d
}

function CircleScore({ score, strokeColor, size = 72 }: { score: number; strokeColor: string; size?: number }) {
  const r = size / 2 - 6
  const circ = 2 * Math.PI * r
  const offset = circ - (score / 100) * circ
  const scoreColor = score >= 90 ? "#10b981" : score >= 75 ? strokeColor : "#f59e0b"
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(240 5% 18%)" strokeWidth="5" />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none"
        stroke={scoreColor}
        strokeWidth="5"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 0.6s ease" }}
      />
    </svg>
  )
}

function TrendBadge({ value, lowerIsBetter = false }: { value: number; lowerIsBetter?: boolean }) {
  const isGood = lowerIsBetter ? value <= 0 : value >= 0
  if (value === 0) return <span className="text-[11px] text-muted-foreground flex items-center gap-0.5"><Minus className="h-3 w-3" />0</span>
  return (
    <span className={cn("flex items-center gap-0.5 text-[11px] font-semibold", isGood ? "text-emerald-400" : "text-rose-400")}>
      {isGood ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {Math.abs(value)}
    </span>
  )
}

export default function PerformancePage() {
  const [selectedEmp, setSelectedEmp] = useState<string | null>(null)
  const [insightStates, setInsightStates] = useState<Record<string, "pending"|"accepted"|"rejected">>(
    Object.fromEntries(insights.map(i => [i.id, i.status]))
  )
  const totalAlerts = employees.reduce((acc, e) => acc + e.alerts.length, 0)

  return (
    <div className="px-8 py-8 max-w-6xl">
      <div className="mb-7 flex items-start justify-between">
        <div className="flex items-start gap-4">
          <div className="icon-box icon-box-emerald h-11 w-11">
            <TrendingUp className="h-[19px] w-[19px]" />
          </div>
          <div>
            <h1 className="text-[26px] font-extrabold tracking-tight leading-none" style={{ letterSpacing: "-0.03em" }}>Performance</h1>
            <p className="mt-1.5 text-[13px] text-muted-foreground">KPI 追踪、趋势分析与异常告警</p>
          </div>
        </div>
        {totalAlerts > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            <p className="text-[12px] text-amber-300 font-medium">{totalAlerts} 个待关注事项</p>
          </div>
        )}
      </div>

      <Tabs defaultValue="overview" className="space-y-5">
        <TabsList className="h-8">
          <TabsTrigger value="overview" className="text-xs h-7">总览</TabsTrigger>
          <TabsTrigger value="kpis" className="text-xs h-7">KPI 详情</TabsTrigger>
          <TabsTrigger value="trends" className="text-xs h-7">趋势对比</TabsTrigger>
          <TabsTrigger value="alerts" className="text-xs h-7">
            告警
            {totalAlerts > 0 && (
              <span className="ml-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-white">
                {totalAlerts}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="insights" className="text-xs h-7">Insights</TabsTrigger>
        </TabsList>

        {/* ── 总览 ── */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-3.5 md:grid-cols-3">
            {employees.map((emp) => {
              const delta = emp.weeklyScore - emp.prevWeekScore
              return (
                <div
                  key={emp.id}
                  className="surface card-shadow hover:card-shadow-hover hover:-translate-y-0.5 transition-all duration-200 cursor-pointer p-5"
                  onClick={() => setSelectedEmp(emp.id === selectedEmp ? null : emp.id)}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-2.5">
                      <div className={cn(
                        "flex h-10 w-10 items-center justify-center rounded-[10px] bg-gradient-to-br text-[10px] font-extrabold text-white",
                        emp.gradient
                      )}
                        style={{ boxShadow: "0 3px 10px rgb(0 0 0 / 0.3)" }}
                      >
                        {emp.initials}
                      </div>
                      <div>
                        <p className="text-[14px] font-bold leading-tight tracking-tight">{emp.name}</p>
                        <p className="text-[11.5px] text-muted-foreground">{emp.role}</p>
                      </div>
                    </div>
                    <span className={cn(
                      "text-[11px] font-semibold px-2 py-0.5 rounded-full border",
                      emp.status === "active"
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                        : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                    )}>
                      {emp.status === "active" ? "正常" : "测试"}
                    </span>
                  </div>

                  {/* Circular score */}
                  <div className="flex items-center gap-4 mb-4">
                    <div className="relative shrink-0">
                      <CircleScore score={emp.weeklyScore} strokeColor={emp.strokeColor} />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-[20px] font-extrabold tabular leading-none" style={{ letterSpacing: "-0.03em" }}>{emp.weeklyScore}</span>
                      </div>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground mb-1">本周综合评分</p>
                      <div className={cn(
                        "flex items-center gap-1 text-[13px] font-semibold",
                        delta >= 0 ? "text-emerald-400" : "text-rose-400"
                      )}>
                        {delta >= 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                        {Math.abs(delta)} vs 上周
                      </div>
                      {emp.alerts.length > 0 && (
                        <p className="text-[11px] text-amber-400 flex items-center gap-1 mt-1.5">
                          <AlertTriangle className="h-3 w-3 shrink-0" />
                          {emp.alerts.length} 个告警
                        </p>
                      )}
                    </div>
                  </div>

                  {/* KPI mini grid */}
                  <div className="grid grid-cols-2 gap-2">
                    {emp.kpis.slice(0, 2).map((kpi) => {
                      const onTarget = kpi.lowerIsBetter ? kpi.value <= kpi.target : kpi.value >= kpi.target
                      return (
                        <div key={kpi.name} className="rounded-[10px] bg-muted/50 border border-border/30 px-3 py-2.5">
                          <p className="text-[10px] text-muted-foreground/60 font-semibold uppercase tracking-wider mb-1">{kpi.name}</p>
                          <span className={cn("text-[16px] font-extrabold tabular tracking-tight", !onTarget && "text-amber-400")}>
                            {kpi.value}{kpi.unit}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Team summary bar */}
          <div className="surface card-shadow px-6 pt-6 pb-5">
            <div className="flex items-center gap-3 mb-5">
              <div className="icon-box icon-box-amber h-9 w-9">
                <Star className="h-[15px] w-[15px]" />
              </div>
              <h3 className="text-[15px] font-bold tracking-tight" style={{ letterSpacing: "-0.02em" }}>团队本周汇总</h3>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                { icon: MessageSquare, label: "本周总会话", value: "135", boxClass: "icon-box-blue" },
                { icon: CheckCircle2, label: "平均成功率", value: "92.7%", boxClass: "icon-box-emerald" },
                { icon: Clock, label: "平均响应时间", value: "54s", boxClass: "icon-box-primary" },
                { icon: DollarSign, label: "本周总成本", value: "$18.18", boxClass: "icon-box-amber" },
              ].map((item) => {
                const Icon = item.icon
                return (
                  <div key={item.label} className="flex items-center gap-3 rounded-[12px] bg-muted/40 border border-border/30 px-4 py-3.5">
                    <div className={cn("icon-box h-9 w-9", item.boxClass)}>
                      <Icon className="h-[15px] w-[15px]" />
                    </div>
                    <div>
                      <p className="text-[20px] font-extrabold tabular leading-tight tracking-tight">{item.value}</p>
                      <p className="text-[11px] text-muted-foreground/65 font-medium">{item.label}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </TabsContent>

        {/* ── KPI 详情 ── */}
        <TabsContent value="kpis" className="space-y-3.5">
          <div className="flex gap-1.5 flex-wrap">
            <button
              onClick={() => setSelectedEmp(null)}
              className={cn("rounded-full px-3.5 py-1.5 text-[12px] font-semibold border transition-all",
                !selectedEmp ? "text-white border-transparent shadow-sm" : "border-border text-muted-foreground hover:border-border/80 hover:text-foreground"
              )}
              style={!selectedEmp ? {
                background: "linear-gradient(135deg, hsl(238 62% 51%), hsl(220 65% 54%))",
                boxShadow: "0 2px 8px hsl(238 62% 51% / 0.25)",
              } : undefined}
            >全部</button>
            {employees.map(e => (
              <button key={e.id} onClick={() => setSelectedEmp(e.id === selectedEmp ? null : e.id)}
                className={cn("flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-semibold border transition-all",
                  selectedEmp === e.id ? "text-white border-transparent shadow-sm" : "border-border text-muted-foreground hover:border-border/80 hover:text-foreground"
                )}
                style={selectedEmp === e.id ? {
                  background: "linear-gradient(135deg, hsl(238 62% 51%), hsl(220 65% 54%))",
                  boxShadow: "0 2px 8px hsl(238 62% 51% / 0.25)",
                } : undefined}>
                <div className={cn("h-2 w-2 rounded-full bg-gradient-to-br", e.gradient)} />
                {e.name}
              </button>
            ))}
          </div>

          {(selectedEmp ? employees.filter(e => e.id === selectedEmp) : employees).map((emp) => (
            <div key={emp.id} className="surface card-shadow p-5 pt-6">
              <div className="flex items-center gap-3 mb-5">
                <div className={cn("flex h-9 w-9 items-center justify-center rounded-[10px] bg-gradient-to-br text-[10px] font-extrabold text-white", emp.gradient)}
                  style={{ boxShadow: "0 3px 10px rgb(0 0 0 / 0.3)" }}>
                  {emp.initials}
                </div>
                <h3 className="text-[15px] font-bold tracking-tight">{emp.name}</h3>
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {emp.kpis.map((kpi) => {
                  const pct = Math.min(100, (kpi.value / kpi.target) * 100)
                  const isOnTarget = kpi.lowerIsBetter ? kpi.value <= kpi.target : kpi.value >= kpi.target
                  return (
                    <div key={kpi.name} className="rounded-[12px] border border-border/40 bg-muted/20 p-4 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] text-muted-foreground font-semibold">{kpi.name}</p>
                        <TrendBadge value={kpi.trend} lowerIsBetter={kpi.lowerIsBetter} />
                      </div>
                      <div>
                        <span className={cn("text-[24px] font-extrabold tabular leading-none tracking-tight", !isOnTarget && "text-amber-400")}>
                          {kpi.value}
                        </span>
                        <span className="text-[12px] text-muted-foreground ml-1">{kpi.unit}</span>
                      </div>
                      <div>
                        <div className="h-[4px] w-full rounded-full bg-muted overflow-hidden mb-1.5">
                          <div
                            className={cn("h-full rounded-full transition-all", isOnTarget ? "bg-emerald-500" : "bg-amber-400")}
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-muted-foreground/60">
                          目标 {kpi.target}{kpi.unit} · {isOnTarget ? "✓ 达成" : `差 ${Math.abs(kpi.target - kpi.value).toFixed(1)}${kpi.unit}`}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </TabsContent>

        {/* ── 趋势对比 ── */}
        <TabsContent value="trends" className="space-y-3.5">
          <div className="rounded-xl border border-border/50 bg-card card-shadow p-5">
            <div className="mb-1">
              <h3 className="text-[13px] font-semibold">5 周综合评分趋势</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">基于 KPI 达成率、会话成功率、响应速度综合计算</p>
            </div>
            <div className="relative h-52 mt-6">
              <div className="absolute left-0 top-0 h-full flex flex-col justify-between text-[10px] text-muted-foreground/60 pr-3 w-7">
                {[100, 80, 60, 40].map(v => <span key={v}>{v}</span>)}
              </div>
              <div className="ml-7 h-full border-l border-b border-border/30 relative">
                {[100, 80, 60, 40].map(v => (
                  <div key={v} className="absolute w-full border-t border-border/15" style={{ bottom: `${((v - 40) / 60) * 100}%` }} />
                ))}
                <svg className="absolute inset-0 w-full h-full overflow-visible" viewBox="0 0 500 160">
                  <defs>
                    {[
                      { id: "g-cs", color: "#3b82f6" },
                      { id: "g-da", color: "#10b981" },
                      { id: "g-sa", color: "#f97316" },
                    ].map(({ id, color }) => (
                      <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={color} stopOpacity="0.15" />
                        <stop offset="100%" stopColor={color} stopOpacity="0" />
                      </linearGradient>
                    ))}
                  </defs>
                  {[
                    { key: "cs", color: "#3b82f6", gradId: "g-cs" },
                    { key: "da", color: "#10b981", gradId: "g-da" },
                    { key: "sa", color: "#f97316", gradId: "g-sa" },
                  ].map(({ key, color, gradId }) => {
                    const pts = weeklyTrend.map((w, i) => ({
                      x: (i / (weeklyTrend.length - 1)) * 500,
                      y: 160 - (((w[key as keyof typeof w] as number) - 40) / 60) * 160,
                    }))
                    return (
                      <g key={key}>
                        <path d={smoothAreaPath(pts, 500, 160)} fill={`url(#${gradId})`} />
                        <path d={smoothLinePath(pts)} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
                        {pts.map((p, i) => (
                          <circle key={i} cx={p.x} cy={p.y} r="3" fill={color} />
                        ))}
                      </g>
                    )
                  })}
                </svg>
                <div className="absolute -bottom-5 left-0 right-0 flex justify-between text-[10px] text-muted-foreground/60">
                  {weeklyTrend.map(w => <span key={w.week}>{w.week}</span>)}
                </div>
              </div>
            </div>
            <div className="flex gap-4 mt-10 justify-end">
              {[
                { gradient: "from-blue-500 to-blue-700", label: "Customer Support" },
                { gradient: "from-emerald-500 to-emerald-700", label: "Data Analyst" },
                { gradient: "from-orange-500 to-orange-600", label: "Sales Assistant" },
              ].map(l => (
                <div key={l.label} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <div className={cn("h-2 w-2 rounded-full bg-gradient-to-br", l.gradient)} />
                  {l.label}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border/50 bg-card card-shadow p-5">
            <h3 className="text-[13px] font-semibold mb-4">本周 vs 上周</h3>
            <div className="space-y-3.5">
              {employees.map((emp) => {
                const delta = emp.weeklyScore - emp.prevWeekScore
                return (
                  <div key={emp.id} className="flex items-center gap-3">
                    <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-[9px] font-bold text-white", emp.gradient)}>
                      {emp.initials}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[12px] font-medium">{emp.name}</span>
                        <div className="flex items-center gap-2.5 tabular">
                          <span className="text-[11px] text-muted-foreground">上周 {emp.prevWeekScore}</span>
                          <span className="text-[12px] font-semibold">本周 {emp.weeklyScore}</span>
                          <span className={cn("text-[12px] font-bold", delta >= 0 ? "text-emerald-400" : "text-rose-400")}>
                            {delta >= 0 ? "+" : ""}{delta}
                          </span>
                        </div>
                      </div>
                      <div className="relative h-[3px] bg-muted rounded-full overflow-visible">
                        <div
                          className={cn("absolute left-0 top-0 h-full rounded-full bg-gradient-to-r", emp.gradient)}
                          style={{ width: `${emp.weeklyScore}%` }}
                        />
                        <div
                          className="absolute top-1/2 -translate-y-1/2 h-3 w-0.5 bg-foreground/30 rounded-full"
                          style={{ left: `${emp.prevWeekScore}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </TabsContent>

        {/* ── 告警 ── */}
        <TabsContent value="alerts" className="space-y-3">
          {totalAlerts === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20 mb-3">
                <CheckCircle2 className="h-6 w-6 text-emerald-400" />
              </div>
              <p className="text-[13px] font-medium">一切正常</p>
              <p className="text-[12px] text-muted-foreground mt-1">当前没有需要关注的异常指标</p>
            </div>
          ) : (
            employees.flatMap((emp) =>
              emp.alerts.map((alert, i) => (
                <div key={`${emp.id}-${i}`} className={cn(
                  "rounded-xl border p-4 flex items-start gap-3",
                  alert.type === "warning"
                    ? "border-amber-500/20 bg-amber-500/[0.06]"
                    : "border-border/50 bg-card"
                )}>
                  <div className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-[10px] font-bold text-white mt-0.5",
                    emp.gradient
                  )}>
                    {emp.initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-[11px] font-semibold text-muted-foreground">{emp.name}</p>
                      <span className={cn(
                        "text-[10px] font-medium px-1.5 py-0.5 rounded-md",
                        alert.type === "warning"
                          ? "bg-amber-500/15 text-amber-400"
                          : "bg-blue-500/10 text-blue-400"
                      )}>
                        {alert.type === "warning" ? "需关注" : "提示"}
                      </span>
                    </div>
                    <p className="text-[13px] font-medium">{alert.message}</p>
                    <div className="flex gap-2 mt-3">
                      <Button size="sm" variant="outline" className="h-7 text-[11px] border-border/60">查看详情</Button>
                      <Button size="sm" variant="ghost" className="h-7 text-[11px] text-muted-foreground">忽略</Button>
                    </div>
                  </div>
                </div>
              ))
            )
          )}
        </TabsContent>

        {/* ── Insights ── */}
        <TabsContent value="insights" className="space-y-3.5">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/10 border border-violet-500/20">
              <Lightbulb className="h-3.5 w-3.5 text-violet-400" />
            </div>
            <div>
              <p className="text-[13px] font-semibold">AI 优化建议</p>
              <p className="text-[11px] text-muted-foreground">基于过去 30 天的运行数据自动生成</p>
            </div>
          </div>

          {insights.map((insight) => {
            const state = insightStates[insight.id]
            const isRejected = state === "rejected"
            const isAccepted = state === "accepted"

            const categoryConfig: Record<string, { label: string; className: string }> = {
              prompt: { label: "提示词", className: "bg-violet-500/10 text-violet-400 border border-violet-500/20" },
              skill: { label: "技能", className: "bg-blue-500/10 text-blue-400 border border-blue-500/20" },
              knowledge: { label: "知识库", className: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" },
            }
            const priorityConfig: Record<string, { label: string; className: string }> = {
              high: { label: "高优先级", className: "bg-red-500/10 text-red-400 border border-red-500/20" },
              medium: { label: "中优先级", className: "bg-amber-500/10 text-amber-400 border border-amber-500/20" },
              low: { label: "低优先级", className: "bg-muted/60 text-muted-foreground border border-border/50" },
            }

            const cat = categoryConfig[insight.category]
            const pri = priorityConfig[insight.priority]

            return (
              <div
                key={insight.id}
                className={cn(
                  "rounded-xl border border-border/50 bg-card card-shadow p-5 transition-all",
                  isRejected && "opacity-40"
                )}
              >
                {/* Top row */}
                <div className="flex items-center gap-2.5 mb-3">
                  <div className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-[9px] font-bold text-white",
                    insight.gradient
                  )}>
                    {insight.initials}
                  </div>
                  <span className="text-[12px] font-medium text-muted-foreground">{insight.employee}</span>
                  <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-md", cat.className)}>
                    {cat.label}
                  </span>
                  <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-md", pri.className)}>
                    {pri.label}
                  </span>
                </div>

                {/* Title */}
                <p className="text-[14px] font-semibold mb-3">{insight.title}</p>

                {/* Finding */}
                <div className="mb-3">
                  <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wide mb-1">发现</p>
                  <p className="text-[13px] text-muted-foreground leading-relaxed">{insight.finding}</p>
                </div>

                {/* Suggestion */}
                <div className="mb-3">
                  <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wide mb-1">建议</p>
                  <div className="bg-muted/30 rounded-lg p-3">
                    <p className="font-mono text-[12px] text-foreground/80 whitespace-pre-wrap leading-relaxed">{insight.suggestion}</p>
                  </div>
                </div>

                {/* Impact */}
                <div className="flex items-center gap-1.5 mb-4">
                  <TrendingUp className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  <p className="text-[12px] text-emerald-400 font-medium">{insight.impact}</p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  {state === "pending" && (
                    <>
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white h-7 text-[12px]"
                        onClick={() => setInsightStates(prev => ({ ...prev, [insight.id]: "accepted" }))}
                      >
                        采纳
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[12px] text-muted-foreground"
                        onClick={() => setInsightStates(prev => ({ ...prev, [insight.id]: "rejected" }))}
                      >
                        不采纳
                      </Button>
                    </>
                  )}
                  {isAccepted && (
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      <span className="text-[12px] text-emerald-400 font-medium">已采纳</span>
                    </div>
                  )}
                  {isRejected && (
                    <div className="flex items-center gap-1.5">
                      <XCircle className="h-4 w-4 text-muted-foreground/40" />
                      <span className="text-[12px] text-muted-foreground/60">已忽略</span>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </TabsContent>
      </Tabs>
    </div>
  )
}

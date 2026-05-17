import { Button } from "@/components/ui/button"
import {
  Users,
  MessageSquare,
  TrendingUp,
  DollarSign,
  ArrowRight,
  Plus,
  Activity,
  ArrowUpRight,
  AlertTriangle,
  Calendar,
  Clock,
  UserCheck,
  BarChart3,
  ChevronRight,
  Sparkles,
  Zap,
} from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"

const stats = [
  {
    label: "Active Employees",
    value: "3",
    sub: "+1 this month",
    icon: Users,
    trend: "+33%",
    positive: true,
    iconBoxClass: "icon-box-primary",
  },
  {
    label: "Sessions Today",
    value: "47",
    sub: "vs 42 yesterday",
    icon: MessageSquare,
    trend: "+12%",
    positive: true,
    iconBoxClass: "icon-box-blue",
  },
  {
    label: "Success Rate",
    value: "94.5%",
    sub: "7-day average",
    icon: TrendingUp,
    trend: "+2.1%",
    positive: true,
    iconBoxClass: "icon-box-emerald",
  },
  {
    label: "Cost This Month",
    value: "$48.20",
    sub: "~$16 / employee",
    icon: DollarSign,
    trend: "+8%",
    positive: false,
    iconBoxClass: "icon-box-amber",
  },
]

const recentActivity = [
  { id: "1", employee: "Customer Support", initials: "CS", gradient: "from-blue-500 to-blue-700", action: "Resolved 3 support tickets automatically", time: "2m ago", status: "success" as const },
  { id: "2", employee: "Data Analyst", initials: "DA", gradient: "from-emerald-500 to-emerald-700", action: "Generated weekly sales performance report", time: "18m ago", status: "success" as const },
  { id: "3", employee: "Sales Assistant", initials: "SA", gradient: "from-orange-500 to-orange-600", action: "Sent 12 personalized outreach emails", time: "1h ago", status: "success" as const },
  { id: "4", employee: "Customer Support", initials: "CS", gradient: "from-blue-500 to-blue-700", action: "Requested human approval on $124 refund", time: "2h ago", status: "pending" as const },
  { id: "5", employee: "Data Analyst", initials: "DA", gradient: "from-emerald-500 to-emerald-700", action: "Detected anomaly in conversion funnel data", time: "3h ago", status: "alert" as const },
  { id: "6", employee: "Sales Assistant", initials: "SA", gradient: "from-orange-500 to-orange-600", action: "Enriched 28 leads from LinkedIn scrape", time: "4h ago", status: "success" as const },
]

const teamHealth = [
  { name: "Customer Support", initials: "CS", gradient: "from-blue-500 to-blue-700", score: 96.5, sessions: 145, status: "active" as const, trend: "+1.2%" },
  { name: "Data Analyst", initials: "DA", gradient: "from-emerald-500 to-emerald-700", score: 94.2, sessions: 89, status: "active" as const, trend: "-0.4%" },
  { name: "Sales Assistant", initials: "SA", gradient: "from-orange-500 to-orange-600", score: 87.5, sessions: 12, status: "testing" as const, trend: "+3.1%" },
]

const pendingApprovals = [
  { id: "a1", employee: "Customer Support", initials: "CS", gradient: "from-blue-500 to-blue-700", action: "Refund $124.00 to Lisa Wang", risk: "medium" as const, time: "3m ago" },
  { id: "a2", employee: "Sales Assistant", initials: "SA", gradient: "from-orange-500 to-orange-600", action: "Delete 45 duplicate leads from HubSpot", risk: "high" as const, time: "12m ago" },
]

const upcomingTasks = [
  { id: "s1", name: "周报生成", employee: "Data Analyst", initials: "DA", gradient: "from-emerald-500 to-emerald-700", nextRun: "明天 09:00", schedule: "每周一" },
  { id: "s2", name: "线索清洗与富化", employee: "Sales Assistant", initials: "SA", gradient: "from-orange-500 to-orange-600", nextRun: "明天 08:00", schedule: "每天" },
  { id: "s3", name: "月度成本分析", employee: "Data Analyst", initials: "DA", gradient: "from-emerald-500 to-emerald-700", nextRun: "6月1日 09:00", schedule: "每月1日" },
]

const costBreakdown = [
  { name: "Customer Support", initials: "CS", gradient: "from-blue-500 to-blue-700", barColor: "from-blue-400 to-blue-600", cost: 29.7, pct: 62 },
  { name: "Data Analyst", initials: "DA", gradient: "from-emerald-500 to-emerald-700", barColor: "from-emerald-400 to-emerald-600", cost: 21.3, pct: 44 },
  { name: "Sales Assistant", initials: "SA", gradient: "from-orange-500 to-orange-600", barColor: "from-orange-400 to-orange-500", cost: 2.7, pct: 6 },
]

const hourlyActivity = [12, 8, 4, 2, 1, 1, 3, 9, 18, 24, 21, 17, 22, 19, 16, 14, 18, 20, 15, 11, 8, 6, 5, 3]

export default function DashboardPage() {
  const hour = 10
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"
  const maxActivity = Math.max(...hourlyActivity)

  return (
    <div className="px-8 py-8 max-w-[1100px]">

      {/* ── Hero Banner ── */}
      <div className="hero-banner mb-8 px-8 py-7 card-shadow">
        <div className="relative z-10">
          <div className="flex items-center justify-between">
            <div>
              {/* Live badge */}
              <div className="flex items-center gap-2 mb-4">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 live-dot" />
                  3 agents running
                </span>
                <span className="text-[11px] text-muted-foreground/50">·</span>
                <span className="text-[11px] text-muted-foreground/60">Thu, May 14</span>
              </div>

              {/* Greeting */}
              <h1 className="text-[38px] font-extrabold tracking-tight leading-none mb-3" style={{ letterSpacing: "-0.035em" }}>
                {greeting},{" "}
                <span className="text-gradient">Hongliang</span>
              </h1>

              <p className="text-[14.5px] text-muted-foreground leading-relaxed">
                Your AI team completed{" "}
                <span className="font-bold text-foreground">47 tasks</span>{" "}
                today with a{" "}
                <span className="font-bold text-emerald-400">94.5% success rate</span>.
                <span className="text-muted-foreground/60"> 2 approvals need your attention.</span>
              </p>
            </div>

            <div className="hidden lg:flex flex-col items-end gap-3">
              <Link href="/hire">
                <Button
                  className="h-9 gap-2 px-4 text-[13px] font-semibold shadow-lg"
                  style={{
                    background: "linear-gradient(135deg, hsl(238 62% 51%), hsl(220 65% 54%))",
                    boxShadow: "0 4px 20px hsl(238 62% 51% / 0.35), 0 1px 0 hsl(238 62% 72% / 0.2) inset",
                  }}
                >
                  <Plus className="h-4 w-4" /> Hire Employee
                </Button>
              </Link>
              <div className="flex items-center gap-1.5">
                {["CS", "DA", "SA"].map((init, i) => (
                  <div
                    key={init}
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-bold text-white border-2 border-background",
                      i === 0 ? "bg-gradient-to-br from-blue-500 to-blue-700" :
                      i === 1 ? "bg-gradient-to-br from-emerald-500 to-emerald-700" :
                      "bg-gradient-to-br from-orange-500 to-orange-600"
                    )}
                    style={{ marginLeft: i > 0 ? "-8px" : 0, zIndex: 3 - i }}
                  >
                    {init}
                  </div>
                ))}
                <span className="ml-2 text-[12px] font-medium text-muted-foreground">3 active now</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Pending approvals alert ── */}
      {pendingApprovals.length > 0 && (
        <Link href="/collaboration">
          <div className="mb-7 flex items-center gap-3.5 rounded-[14px] border border-amber-500/20 bg-amber-500/[0.06] px-5 py-4 hover:border-amber-500/30 hover:bg-amber-500/[0.09] transition-all cursor-pointer group">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/15 shrink-0 border border-amber-500/20">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13.5px] font-semibold text-amber-200">
                {pendingApprovals.length} actions awaiting your approval
              </p>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                {pendingApprovals.map((a) => (
                  <span key={a.id} className="flex items-center gap-1.5 text-[12px] text-amber-300/70">
                    <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded bg-gradient-to-br text-[7px] font-bold text-white", a.gradient)}>
                      {a.initials}
                    </span>
                    {a.action}
                    <span className={cn(
                      "rounded-full px-1.5 py-0.5 text-[9px] font-bold tracking-wide uppercase",
                      a.risk === "high" ? "bg-red-500/15 text-red-400" : "bg-amber-500/15 text-amber-400"
                    )}>
                      {a.risk}
                    </span>
                  </span>
                ))}
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-amber-500/40 shrink-0 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </Link>
      )}

      {/* ── KPI stat cards ── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 mb-6">
        {stats.map((s) => {
          const Icon = s.icon
          return (
            <div
              key={s.label}
              className="surface card-shadow hover:card-shadow-hover transition-all duration-200 cursor-default pt-5 pb-4 px-5 hover:-translate-y-0.5"
            >
              <div className="flex items-start justify-between mb-4">
                <div className={cn("icon-box h-9 w-9", s.iconBoxClass)}>
                  <Icon className="h-4 w-4" />
                </div>
                <span className={cn(
                  "text-[11px] font-semibold tabular rounded-full px-2 py-0.5 border",
                  s.positive
                    ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                    : "text-rose-400 bg-rose-500/10 border-rose-500/20"
                )}>
                  {s.trend}
                </span>
              </div>
              <p className="stat-value mb-1.5">{s.value}</p>
              <p className="kpi-label mb-1">{s.label}</p>
              <p className="text-[11.5px] text-muted-foreground/50">{s.sub}</p>
            </div>
          )
        })}
      </div>

      {/* ── Hourly activity bar chart ── */}
      <div className="mb-6 surface card-shadow px-6 py-5">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="icon-box icon-box-primary h-8 w-8">
              <BarChart3 className="h-3.5 w-3.5" />
            </div>
            <div>
              <h2 className="text-[14px] font-semibold leading-none">Today's Activity</h2>
              <p className="text-[11px] text-muted-foreground/55 mt-0.5">Sessions per hour · 24h</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60">
            <Zap className="h-3 w-3 text-[hsl(var(--primary))]/50" />
            <span>Peak: 10:00–14:00</span>
          </div>
        </div>
        <div className="flex items-end gap-[3px] h-[88px]">
          {hourlyActivity.map((v, i) => (
            <div
              key={i}
              className="flex-1 rounded-[3px] transition-all duration-300"
              style={{
                height: `${Math.max(6, (v / maxActivity) * 100)}%`,
                background: i === hour
                  ? "hsl(238 62% 51%)"
                  : v > maxActivity * 0.65
                  ? "hsl(238 62% 51% / 0.45)"
                  : v > maxActivity * 0.3
                  ? "hsl(238 62% 51% / 0.22)"
                  : "hsl(var(--muted))",
                boxShadow: i === hour ? "0 0 8px hsl(238 62% 51% / 0.5)" : undefined,
              }}
              title={`${String(i).padStart(2, "0")}:00 — ${v} sessions`}
            />
          ))}
        </div>
        <div className="flex justify-between mt-2.5">
          {[0, 4, 8, 12, 16, 20, 23].map((h) => (
            <span key={h} className="text-[9.5px] text-muted-foreground/40">{String(h).padStart(2, "0")}h</span>
          ))}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        {/* ── Left col ── */}
        <div className="lg:col-span-3 space-y-5">

          {/* Activity Timeline */}
          <div className="surface card-shadow overflow-hidden">
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border/40">
              <div className="flex items-center gap-2.5">
                <div className="icon-box icon-box-muted h-8 w-8">
                  <Activity className="h-3.5 w-3.5" />
                </div>
                <h2 className="text-[14px] font-semibold">Activity</h2>
              </div>
              <Link href="/collaboration">
                <Button variant="ghost" size="sm" className="h-7 text-[11.5px] text-muted-foreground gap-1 px-2.5 hover:text-foreground">
                  View all <ArrowRight className="h-3 w-3" />
                </Button>
              </Link>
            </div>
            <div className="px-6 py-5">
              <div className="relative">
                <div className="absolute left-[15px] top-3 bottom-3 w-px bg-border/30" />
                <div className="space-y-0">
                  {recentActivity.map((item) => (
                    <div key={item.id} className="relative flex gap-4 pb-4 last:pb-0 group/row">
                      <div
                        className={cn("relative z-10 flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-[9px] font-bold text-white", item.gradient)}
                        style={{ boxShadow: "0 2px 6px rgb(0 0 0 / 0.3)" }}
                      >
                        {item.initials}
                      </div>
                      <div className="flex-1 min-w-0 pt-[5px]">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <span className="text-[13px] font-semibold text-foreground">{item.employee} </span>
                            <span className="text-[13px] text-muted-foreground">{item.action}</span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-[11px] text-muted-foreground/40">{item.time}</span>
                            {item.status === "pending" && (
                              <span className="h-2 w-2 rounded-full bg-amber-400 live-dot" />
                            )}
                            {item.status === "alert" && (
                              <span className="h-2 w-2 rounded-full bg-rose-400" />
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Cost breakdown */}
          <div className="surface card-shadow overflow-hidden">
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border/40">
              <div className="flex items-center gap-2.5">
                <div className="icon-box icon-box-amber h-8 w-8">
                  <DollarSign className="h-3.5 w-3.5" />
                </div>
                <h2 className="text-[14px] font-semibold">Cost Breakdown</h2>
              </div>
              <span className="text-[11px] text-muted-foreground/50 bg-muted/60 rounded-full px-2.5 py-0.5 border border-border/40">
                May 2026
              </span>
            </div>
            <div className="px-6 py-5 space-y-5">
              {costBreakdown.map((emp) => (
                <div key={emp.name}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2.5">
                      <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] bg-gradient-to-br text-[8px] font-bold text-white", emp.gradient)}>
                        {emp.initials}
                      </div>
                      <span className="text-[13px] font-medium">{emp.name}</span>
                    </div>
                    <span className="text-[14px] font-bold tabular">${emp.cost.toFixed(2)}</span>
                  </div>
                  <div className="h-[6px] w-full rounded-full bg-muted/60 overflow-hidden">
                    <div
                      className={cn("h-full rounded-full bg-gradient-to-r", emp.barColor)}
                      style={{ width: `${emp.pct}%` }}
                    />
                  </div>
                </div>
              ))}
              <div className="pt-3 border-t border-border/40 flex items-center justify-between">
                <span className="text-[12.5px] text-muted-foreground">Total this month</span>
                <span className="text-[18px] font-extrabold tabular tracking-tight">$53.70</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Right col ── */}
        <div className="lg:col-span-2 space-y-4">

          {/* Team Health */}
          <div className="surface card-shadow overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-4 pb-3.5 border-b border-border/40">
              <div className="flex items-center gap-2.5">
                <div className="icon-box icon-box-emerald h-8 w-8">
                  <Users className="h-3.5 w-3.5" />
                </div>
                <h2 className="text-[14px] font-semibold">Team Health</h2>
              </div>
              <Link href="/performance">
                <Button variant="ghost" size="sm" className="h-7 text-[11.5px] text-muted-foreground gap-1 px-2.5 hover:text-foreground">
                  Details <ArrowUpRight className="h-3 w-3" />
                </Button>
              </Link>
            </div>
            <div className="px-4 py-3 space-y-1">
              {teamHealth.map((emp) => (
                <Link key={emp.name} href={`/employees/${emp.name === "Customer Support" ? "1" : emp.name === "Data Analyst" ? "2" : "3"}`}>
                  <div className="flex items-center gap-3 hover:bg-muted/40 -mx-1 px-1 py-2.5 rounded-xl transition-colors cursor-pointer group/emp">
                    <div className="relative shrink-0">
                      <div className={cn("flex h-9 w-9 items-center justify-center rounded-[9px] bg-gradient-to-br text-[10px] font-bold text-white", emp.gradient)}>
                        {emp.initials}
                      </div>
                      {emp.status === "active" && (
                        <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 border-2 border-background live-ring" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[13px] font-semibold truncate">{emp.name}</span>
                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          <span className={cn("text-[10.5px] font-semibold", emp.trend.startsWith("+") ? "text-emerald-400" : "text-rose-400")}>
                            {emp.trend}
                          </span>
                          <span className={cn("text-[13px] font-extrabold tabular", emp.score >= 90 ? "text-emerald-400" : "text-amber-400")}>
                            {emp.score}%
                          </span>
                        </div>
                      </div>
                      <div className="h-[4px] w-full rounded-full bg-muted/70 overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            emp.score >= 90 ? "bg-gradient-to-r from-emerald-400 to-emerald-500" : "bg-gradient-to-r from-amber-400 to-amber-500"
                          )}
                          style={{ width: `${emp.score}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Upcoming scheduled tasks */}
          <div className="surface card-shadow overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-4 pb-3.5 border-b border-border/40">
              <div className="flex items-center gap-2.5">
                <div className="icon-box icon-box-primary h-8 w-8">
                  <Calendar className="h-3.5 w-3.5" />
                </div>
                <h2 className="text-[14px] font-semibold">Upcoming Tasks</h2>
              </div>
              <Link href="/collaboration">
                <Button variant="ghost" size="sm" className="h-7 text-[11.5px] text-muted-foreground gap-1 px-2.5 hover:text-foreground">
                  All <ArrowRight className="h-3 w-3" />
                </Button>
              </Link>
            </div>
            <div className="px-4 py-2.5 space-y-0.5">
              {upcomingTasks.map((t) => (
                <div key={t.id} className="flex items-center gap-3 rounded-xl px-1 py-2.5 hover:bg-muted/40 transition-colors">
                  <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-gradient-to-br text-[9px] font-bold text-white", t.gradient)}>
                    {t.initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold truncate">{t.name}</p>
                    <p className="text-[11px] text-muted-foreground/55">{t.schedule}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 text-muted-foreground/40">
                    <Clock className="h-3 w-3" />
                    <span className="text-[11px]">{t.nextRun}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="surface card-shadow overflow-hidden">
            <div className="px-5 pt-4 pb-3.5 border-b border-border/40">
              <div className="flex items-center gap-2">
                <div className="icon-box icon-box-muted h-7 w-7">
                  <Sparkles className="h-3.5 w-3.5" />
                </div>
                <h2 className="text-[14px] font-semibold">Quick Actions</h2>
              </div>
            </div>
            <div className="p-3 space-y-1">
              {[
                { href: "/hire", icon: Plus, label: "Hire new employee", sub: "From templates or natural language", iconClass: "icon-box-primary" },
                { href: "/collaboration", icon: UserCheck, label: "Review approvals", sub: `${pendingApprovals.length} pending right now`, iconClass: "icon-box-amber" },
                { href: "/analytics", icon: TrendingUp, label: "View analytics", sub: "Performance & cost insights", iconClass: "icon-box-emerald" },
              ].map((action) => {
                const Icon = action.icon
                return (
                  <Link key={action.href} href={action.href}>
                    <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-muted/50 transition-colors cursor-pointer group/action">
                      <div className={cn("icon-box h-8 w-8", action.iconClass)}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-semibold leading-none mb-0.5">{action.label}</p>
                        <p className="text-[11px] text-muted-foreground/60">{action.sub}</p>
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/20 shrink-0 group-hover/action:text-muted-foreground/60 group-hover/action:translate-x-0.5 transition-all" />
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

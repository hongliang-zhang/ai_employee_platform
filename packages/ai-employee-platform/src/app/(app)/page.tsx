import Link from "next/link"
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BookOpen,
  CheckCircle2,
  Clock,
  DollarSign,
  FileText,
  Plus,
  Sparkles,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { TeamOutputChart } from "@/components/team-output-chart"
import { cn } from "@/lib/utils"

export const dynamic = "force-dynamic"
export const revalidate = 0

const activityPath = "M 0 82 C 50 82 74 78 102 69 C 150 53 164 71 205 56 C 248 40 279 44 320 38 C 365 31 393 46 430 32"

const kpis = [
  { label: "Active employees", value: "3", sub: "+1 this month", icon: Users, iconClass: "icon-box-primary" },
  { label: "Sessions today", value: "47", sub: "12 awaiting review", icon: BarChart3, iconClass: "icon-box-blue" },
  { label: "Success rate", value: "94.5%", sub: "7-day average", icon: TrendingUp, iconClass: "icon-box-emerald" },
]

const activity = [
  { agent: "Customer Support", initials: "CS", tint: "bg-sky-500", text: "Resolved 3 support tickets automatically", time: "2m ago", state: "done" },
  { agent: "Data Analyst", initials: "DA", tint: "bg-emerald-600", text: "Generated weekly sales performance report", time: "18m ago", state: "done" },
  { agent: "Sales Assistant", initials: "SA", tint: "bg-orange-500", text: "Needs approval before deleting 45 duplicate leads", time: "25m ago", state: "risk" },
  { agent: "Customer Support", initials: "CS", tint: "bg-sky-500", text: "Requested approval on a $124 refund", time: "32m ago", state: "risk" },
]

const railCards = [
  {
    label: "ACTION REQUIRED",
    title: "2 approvals need review",
    body: "Refund and HubSpot cleanup are blocked until you confirm the risk.",
    href: "/collaboration",
    tone: "blue",
  },
  {
    label: "TEAM RECAP",
    title: "Your agents completed 47 tasks",
    body: "Support is stable. Sales needs a clearer deletion policy.",
    href: "/analytics",
    tone: "white",
  },
  {
    label: "KNOWLEDGE GAP",
    title: "Support KB has 3 stale docs",
    body: "Update refund policy and escalation matrix before next run.",
    href: "/workspace",
    tone: "white",
  },
]

const costRows = [
  { name: "Customer Support", color: "bg-sky-500", amount: "$29.70", pct: 62 },
  { name: "Data Analyst", color: "bg-emerald-600", amount: "$21.30", pct: 44 },
  { name: "Sales Assistant", color: "bg-orange-500", amount: "$2.70", pct: 6 },
]

function AvatarMark({ initials, className }: { initials: string; className?: string }) {
  return (
    <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white", className)}>
      {initials}
    </div>
  )
}

export default function DashboardPage() {
  return (
    <div className="mx-auto grid max-w-[1440px] grid-cols-1 gap-6 px-8 py-7 xl:grid-cols-[minmax(0,1fr)_332px]">
      <section className="min-w-0 space-y-6">
        <div className="flex items-start justify-between gap-5">
          <div>
            <h1 className="text-[30px] font-semibold tracking-[-0.03em] text-foreground">Good afternoon, Hongliang</h1>
            <p className="mt-1 text-[13.5px] text-muted-foreground">SLMobbin Workspace · AI Employee operating system</p>
          </div>
          <Link href="/hire">
            <Button className="origin-cta h-10 rounded-full px-4 text-[13px] font-semibold">
              <Plus className="mr-2 h-4 w-4" />
              Hire employee
            </Button>
          </Link>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {kpis.map((item) => {
            const Icon = item.icon
            return (
              <div key={item.label} className="surface card-shadow flex items-center gap-4 px-5 py-4">
                <div className={cn("icon-box h-10 w-10 rounded-[12px]", item.iconClass)}>
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-[29px] font-semibold leading-none tracking-[-0.04em] tabular">{item.value}</p>
                  <p className="mt-1 text-[12px] font-medium text-muted-foreground">{item.label}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground/70">{item.sub}</p>
                </div>
              </div>
            )
          })}
        </div>

        <TeamOutputChart />

        <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
          <div className="surface card-shadow overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <p className="section-label">RECENT ACTIVITY</p>
                <h2 className="mt-2 text-[17px] font-semibold tracking-[-0.02em]">Agent execution trail</h2>
              </div>
              <Link href="/collaboration" className="text-[12px] font-semibold text-muted-foreground hover:text-foreground">
                View all <ArrowRight className="inline h-3 w-3" />
              </Link>
            </div>
            <div className="divide-y divide-border">
              {activity.map((item) => (
                <div key={`${item.agent}-${item.time}`} className="flex items-start gap-3 px-5 py-4">
                  <AvatarMark initials={item.initials} className={item.tint} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[13.5px] font-semibold">{item.agent}</p>
                      <span className="text-[11px] text-muted-foreground">{item.time}</span>
                    </div>
                    <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{item.text}</p>
                  </div>
                  {item.state === "risk" ? <AlertTriangle className="mt-1 h-4 w-4 text-amber-600" /> : <CheckCircle2 className="mt-1 h-4 w-4 text-emerald-600" />}
                </div>
              ))}
            </div>
          </div>

          <div className="surface card-shadow p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="section-label">COST THIS MONTH</p>
                <p className="mt-4 text-[34px] font-semibold leading-none tracking-[-0.05em] tabular">$53.70</p>
              </div>
              <DollarSign className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="mt-6 space-y-5">
              {costRows.map((row) => (
                <div key={row.name}>
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={cn("h-2.5 w-2.5 rounded-full", row.color)} />
                      <span className="text-[13px] font-medium">{row.name}</span>
                    </div>
                    <span className="text-[13px] font-semibold tabular">{row.amount}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className={cn("h-full rounded-full", row.color)} style={{ width: `${row.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <Link href="/analytics">
              <Button variant="outline" className="mt-6 h-10 w-full rounded-full text-[13px] font-semibold">
                See more
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <aside className="space-y-5">
        {railCards.map((card) => (
          <Link key={card.title} href={card.href} className="block">
            <div
              className={cn(
                "soft-rail-card p-5 transition-transform hover:-translate-y-0.5",
                card.tone === "blue" && "border-transparent text-white shadow-xl"
              )}
              style={
                card.tone === "blue"
                  ? {
                      background:
                        "radial-gradient(ellipse at top right, rgba(125, 211, 252, 0.56), transparent 44%), linear-gradient(135deg, #10264b, #506faa)",
                    }
                  : undefined
              }
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className={cn("section-label", card.tone === "blue" && "text-white/70")}>{card.label}</p>
                  <h3 className={cn("mt-6 text-[25px] leading-[1.05] tracking-[-0.045em]", card.tone === "blue" ? "editorial-title" : "font-semibold")}>{card.title}</h3>
                  <p className={cn("mt-3 text-[13px] leading-relaxed", card.tone === "blue" ? "text-white/78" : "text-muted-foreground")}>{card.body}</p>
                </div>
                <ArrowRight className={cn("h-4 w-4 shrink-0", card.tone === "blue" ? "text-white/70" : "text-muted-foreground")} />
              </div>
            </div>
          </Link>
        ))}

        <div className="soft-rail-card p-5">
          <div className="flex items-center justify-between">
            <p className="section-label">WORKSPACE SETUP</p>
            <Sparkles className="h-4 w-4 text-violet-500" />
          </div>
          <div className="mt-5 flex items-center gap-4">
            <div className="grid h-14 w-14 place-items-center rounded-full border-[6px] border-lime-300 text-[12px] font-semibold">4/6</div>
            <div>
              <p className="text-[15px] font-semibold">Get your team context ready</p>
              <p className="mt-1 text-[12px] text-muted-foreground">Add policies, files and approval gates.</p>
            </div>
          </div>
          <Link href="/workspace">
            <Button className="origin-cta mt-5 h-10 w-full rounded-full text-[13px] font-semibold">
              Open workspace
            </Button>
          </Link>
        </div>

        <div className="soft-rail-card p-5">
          <div className="flex items-center justify-between">
            <p className="section-label">ACTIVITY CURVE</p>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </div>
          <svg viewBox="0 0 430 100" className="mt-5 h-[100px] w-full overflow-visible">
            <path d={activityPath} fill="none" stroke="rgb(14 165 233)" strokeWidth="3" strokeLinecap="round" />
            <path d="M 0 84 C 80 84 140 78 210 70 C 275 62 340 50 430 42" fill="none" stroke="rgb(210 205 196)" strokeWidth="2" strokeDasharray="4 6" />
          </svg>
          <div className="mt-3 flex items-center gap-2 text-[12px] text-muted-foreground">
            <Zap className="h-3.5 w-3.5 text-violet-500" />
            Peak automation window: 10:00-14:00
          </div>
        </div>
      </aside>
    </div>
  )
}

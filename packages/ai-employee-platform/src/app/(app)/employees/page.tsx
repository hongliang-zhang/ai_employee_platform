"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Search,
  Plus,
  MessageSquare,
  Settings2,
  MoreHorizontal,
  Zap,
  ArrowUpRight,
  Users,
  Sparkles,
} from "lucide-react"
import Link from "next/link"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

const employees = [
  {
    id: "1",
    name: "Customer Support Agent",
    role: "Support",
    description: "Handles customer inquiries, resolves tickets, and escalates complex issues to Linear.",
    status: "active" as const,
    model: "GLM-5 Turbo",
    sessions: 145,
    lastActive: "2 min ago",
    successRate: 96.5,
    channels: ["Slack", "Email"],
    initials: "CS",
    gradient: "from-blue-500 to-blue-700",
    skills: ["Web Search", "Linear", "Email", "Knowledge Base"],
  },
  {
    id: "2",
    name: "Data Analyst",
    role: "Analytics",
    description: "Analyzes business data, generates reports, and surfaces insights from your data warehouse.",
    status: "active" as const,
    model: "GLM-5 Turbo",
    sessions: 89,
    lastActive: "18 min ago",
    successRate: 94.2,
    channels: ["Slack"],
    initials: "DA",
    gradient: "from-emerald-500 to-emerald-700",
    skills: ["SQL", "Python", "Google Sheets", "Notion"],
  },
  {
    id: "3",
    name: "Sales Assistant",
    role: "Sales",
    description: "Helps with lead generation, outreach emails, and CRM data enrichment.",
    status: "testing" as const,
    model: "GLM-4.7 Flash",
    sessions: 12,
    lastActive: "1h ago",
    successRate: 87.5,
    channels: [],
    initials: "SA",
    gradient: "from-orange-500 to-orange-600",
    skills: ["HubSpot", "Email", "LinkedIn"],
  },
  {
    id: "4",
    name: "Sprint Facilitator",
    role: "Engineering",
    description: "Writes retro summaries, tracks sprint velocity, and preps meeting agendas.",
    status: "inactive" as const,
    model: "GLM-4.7 Flash",
    sessions: 0,
    lastActive: "Never",
    successRate: 0,
    channels: [],
    initials: "SF",
    gradient: "from-slate-400 to-slate-600",
    skills: ["Linear", "Notion", "GitHub"],
  },
]

const statusConfig = {
  active: {
    label: "Active",
    dot: "bg-emerald-500",
    text: "text-emerald-700",
    bg: "bg-emerald-50",
    border: "border-emerald-200/80",
  },
  testing: {
    label: "Testing",
    dot: "bg-amber-400",
    text: "text-amber-700",
    bg: "bg-amber-50",
    border: "border-amber-200/80",
  },
  inactive: {
    label: "Inactive",
    dot: "bg-gray-300",
    text: "text-muted-foreground",
    bg: "bg-muted",
    border: "border-border",
  },
}

export default function EmployeesPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [filter, setFilter] = useState<"all" | "active" | "testing" | "inactive">("all")

  const filtered = employees.filter((emp) => {
    const matchSearch =
      emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.role.toLowerCase().includes(searchQuery.toLowerCase())
    const matchFilter = filter === "all" || emp.status === filter
    return matchSearch && matchFilter
  })

  const counts = {
    all: employees.length,
    active: employees.filter((e) => e.status === "active").length,
    testing: employees.filter((e) => e.status === "testing").length,
    inactive: employees.filter((e) => e.status === "inactive").length,
  }

  return (
    <div className="px-8 py-8 max-w-6xl">

      {/* Header */}
      <div className="mb-7 flex items-start justify-between">
        <div className="flex items-start gap-4">
          <div className="icon-box icon-box-primary h-11 w-11">
            <Users className="h-[19px] w-[19px]" />
          </div>
          <div>
            <h1 className="text-[26px] font-extrabold tracking-tight leading-none" style={{ letterSpacing: "-0.03em" }}>
              AI Team
            </h1>
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              <span className="font-semibold text-emerald-400">{counts.active} active</span>
              <span className="text-border mx-1.5">·</span>
              {counts.testing} testing
              <span className="text-border mx-1.5">·</span>
              {counts.inactive} inactive
            </p>
          </div>
        </div>
        <Link href="/hire">
          <Button
            className="h-9 gap-2 px-4 text-[13px] font-semibold"
            style={{
              background: "linear-gradient(135deg, hsl(238 62% 51%), hsl(220 65% 54%))",
              boxShadow: "0 4px 16px hsl(238 62% 51% / 0.3), 0 1px 0 hsl(238 62% 72% / 0.2) inset",
            }}
          >
            <Plus className="h-4 w-4" />
            Hire Employee
          </Button>
        </Link>
      </div>

      {/* Filters + Search */}
      <div className="mb-6 flex items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40 pointer-events-none" />
          <input
            placeholder="Search by name or role…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 w-56 rounded-[10px] border border-border/60 bg-muted/40 pl-8 pr-3 text-[13px] placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20 focus:border-[hsl(var(--primary))]/40 transition-all"
          />
        </div>

        <div className="flex items-center gap-0.5 rounded-[10px] border border-border/50 bg-muted/30 p-0.5">
          {(["all", "active", "testing", "inactive"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-[12px] font-semibold transition-all capitalize",
                filter === f ? "text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
              style={filter === f ? {
                background: "linear-gradient(135deg, hsl(238 62% 51%), hsl(220 65% 54%))",
                boxShadow: "0 2px 8px hsl(238 62% 51% / 0.25)",
              } : undefined}
            >
              {f !== "all" && (
                <span className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  f === "active" ? "bg-emerald-500" : f === "testing" ? "bg-amber-400" : "bg-zinc-500",
                )} />
              )}
              {f}
              {f !== "all" && counts[f] > 0 && (
                <span className={cn("text-[10px]", filter === f ? "opacity-70" : "text-muted-foreground/50")}>{counts[f]}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/50 py-20 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
            <Zap className="h-5 w-5 text-muted-foreground/40" />
          </div>
          <p className="text-[13px] font-semibold text-muted-foreground">No employees found</p>
          <p className="mt-1 text-[12px] text-muted-foreground/60">
            {searchQuery ? "Try a different search term" : "Hire your first AI employee to get started"}
          </p>
          {!searchQuery && (
            <Link href="/hire">
              <Button size="sm" className="mt-4 gap-1.5 text-xs">
                <Plus className="h-3.5 w-3.5" /> Hire Employee
              </Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((emp) => {
            const sc = statusConfig[emp.status]
            return (
              <div
                key={emp.id}
                className="group relative surface card-shadow hover:card-shadow-hover hover:-translate-y-0.5 transition-all duration-200 overflow-hidden"
              >
                <div className="relative p-5">
                  {/* Top row */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3.5">
                      <div
                        className={cn(
                          "flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px] bg-gradient-to-br text-[12px] font-extrabold text-white",
                          emp.gradient
                        )}
                        style={{ boxShadow: "0 4px 12px rgb(0 0 0 / 0.3), inset 0 1px 0 rgb(255 255 255 / 0.15)" }}
                      >
                        {emp.initials}
                      </div>
                      <div>
                        <h3 className="text-[14.5px] font-bold leading-tight tracking-tight">{emp.name}</h3>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-[11.5px] text-muted-foreground font-medium">{emp.role}</span>
                          <span className="text-border/60">·</span>
                          <span className={cn(
                            "flex items-center gap-1 text-[11px] font-semibold rounded-full px-2 py-0.5 border",
                            sc.text, sc.bg, sc.border
                          )}>
                            <span className={cn("h-1.5 w-1.5 rounded-full", sc.dot, emp.status === "active" && "live-dot")} />
                            {sc.label}
                          </span>
                        </div>
                      </div>
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40 text-[13px]">
                        <DropdownMenuItem>Edit</DropdownMenuItem>
                        <DropdownMenuItem>Duplicate</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem>Pause</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive">Remove</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* Description */}
                  <p className="text-[12.5px] text-muted-foreground leading-relaxed mb-4 line-clamp-2">
                    {emp.description}
                  </p>

                  {/* Metrics */}
                  <div className="flex items-center gap-5 mb-4 py-3 border-y border-border/30">
                    <div>
                      <p className="kpi-label mb-1">Sessions</p>
                      <p className="text-[20px] font-extrabold tabular tracking-tight leading-none">{emp.sessions > 0 ? emp.sessions : "—"}</p>
                    </div>
                    <div>
                      <p className="kpi-label mb-1">Success</p>
                      <p className={cn(
                        "text-[20px] font-extrabold tabular tracking-tight leading-none",
                        emp.successRate >= 90 ? "text-emerald-400" : emp.successRate >= 80 ? "text-amber-400" : "text-muted-foreground/40"
                      )}>
                        {emp.successRate > 0 ? `${emp.successRate}%` : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="kpi-label mb-1">Last active</p>
                      <p className="text-[13px] font-semibold text-muted-foreground">{emp.lastActive}</p>
                    </div>
                    <div className="ml-auto text-right">
                      <p className="kpi-label mb-1">Model</p>
                      <p className="text-[11px] font-semibold text-muted-foreground/70">{emp.model}</p>
                    </div>
                  </div>

                  {/* Skills */}
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {emp.skills.map((skill) => (
                      <span
                        key={skill}
                        className="rounded-[6px] border border-border/50 bg-muted/40 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground/80"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <Link href={`/employees/${emp.id}`} className="flex-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full h-8 text-[12.5px] gap-1.5 border-border/60 font-semibold hover:bg-muted/60"
                      >
                        <ArrowUpRight className="h-3.5 w-3.5" />
                        View Profile
                      </Button>
                    </Link>
                    <Button
                      size="sm"
                      className="flex-1 h-8 text-[12.5px] gap-1.5 font-semibold"
                      style={{ background: "linear-gradient(135deg, hsl(238 62% 51%), hsl(220 65% 54%))" }}
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                      Chat
                    </Button>
                    <Link href="/workspace">
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground">
                        <Settings2 className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            )
          })}

          {/* Add new card */}
          <Link href="/hire">
            <div className="group flex h-full min-h-[260px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border/40 p-5 text-center transition-all hover:border-[hsl(var(--primary))]/40 hover:bg-[hsl(var(--primary))]/[0.025] hover:-translate-y-0.5 duration-200">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-[12px] border-2 border-dashed border-border/40 group-hover:border-[hsl(var(--primary))]/40 transition-colors">
                <Plus className="h-5 w-5 text-muted-foreground/35 group-hover:text-[hsl(var(--primary))] transition-colors" />
              </div>
              <p className="text-[14px] font-bold text-muted-foreground group-hover:text-foreground transition-colors">
                Hire new employee
              </p>
              <p className="mt-1 text-[12px] text-muted-foreground/50">
                Choose from templates or describe
              </p>
              <div className="mt-4 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <Sparkles className="h-3 w-3 text-[hsl(var(--primary))]" />
                <span className="text-[11.5px] font-semibold text-[hsl(var(--primary))]">Powered by AI</span>
              </div>
            </div>
          </Link>
        </div>
      )}
    </div>
  )
}

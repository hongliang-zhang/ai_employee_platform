"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Plus,
  Users,
  BookOpen,
  Settings2,
  ChevronRight,
  ArrowLeft,
  HardDrive,
  Key,
  Shield,
  UserPlus,
  MessageSquare,
  Activity,
  Trash2,
  ExternalLink,
  DownloadCloud,
  X,
  Search,
  Check,
  Zap,
} from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"

const agentPool = [
  { id: "1", name: "Customer Support Agent", role: "Support", initials: "CS", gradient: "from-blue-500 to-blue-700", status: "active" as const },
  { id: "2", name: "Data Analyst", role: "Analytics", initials: "DA", gradient: "from-emerald-500 to-emerald-700", status: "active" as const },
  { id: "3", name: "Sales Assistant", role: "Sales", initials: "SA", gradient: "from-orange-500 to-orange-600", status: "testing" as const },
  { id: "4", name: "Sprint Facilitator", role: "Engineering", initials: "SF", gradient: "from-slate-400 to-slate-600", status: "inactive" as const },
]

function AddMemberModal({
  teamName,
  existingMemberIds,
  onClose,
  onAdd,
}: {
  teamName: string
  existingMemberIds: string[]
  onClose: () => void
  onAdd: (agentId: string) => void
}) {
  const [query, setQuery] = useState("")
  const [addedIds, setAddedIds] = useState<string[]>([])

  const filtered = agentPool.filter(
    (a) =>
      !existingMemberIds.includes(a.id) &&
      (a.name.toLowerCase().includes(query.toLowerCase()) ||
        a.role.toLowerCase().includes(query.toLowerCase()))
  )

  const handleAdd = (id: string) => {
    setAddedIds((prev) => [...prev, id])
    onAdd(id)
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-[460px] bg-card rounded-2xl border border-border shadow-2xl flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
          <div>
            <p className="text-[14px] font-semibold">Add Member</p>
            <p className="text-[11px] text-muted-foreground">{teamName}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground/50 hover:text-foreground transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 pt-4 pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
            <Input
              placeholder="Search agents..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9 h-9 text-sm"
              autoFocus
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-2 space-y-2">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-center">
              <p className="text-[13px] text-muted-foreground/60">No available agents</p>
              <p className="text-[11px] text-muted-foreground/40 mt-1">All agents are already in this team, or no match found.</p>
            </div>
          ) : (
            filtered.map((agent) => {
              const isAdded = addedIds.includes(agent.id)
              const statusColor = agent.status === "active" ? "bg-emerald-500" : agent.status === "testing" ? "bg-amber-400" : "bg-zinc-400"
              return (
                <div
                  key={agent.id}
                  className="flex items-center gap-3 rounded-xl border border-border/50 bg-background p-3.5 hover:border-border transition-colors"
                >
                  <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-[11px] font-bold text-white", agent.gradient)}>
                    {agent.initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold">{agent.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={cn("h-1.5 w-1.5 rounded-full", statusColor)} />
                      <span className="text-[11px] text-muted-foreground">{agent.role}</span>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={isAdded ? "outline" : "default"}
                    className={cn("h-7 gap-1 text-[11px] shrink-0", isAdded && "text-emerald-400 border-emerald-500/30")}
                    onClick={() => !isAdded && handleAdd(agent.id)}
                    disabled={isAdded}
                  >
                    {isAdded ? <><Check className="h-3 w-3" /> Added</> : <><Plus className="h-3 w-3" /> Add</>}
                  </Button>
                </div>
              )
            })
          )}
        </div>

        <div className="shrink-0 flex items-center justify-between px-5 py-4 border-t border-border/60 bg-muted/20">
          <Link href="/hire" onClick={onClose}>
            <Button variant="ghost" size="sm" className="gap-1.5 text-[12px] text-muted-foreground">
              <Zap className="h-3.5 w-3.5" /> Hire new agent
            </Button>
          </Link>
          <Button size="sm" onClick={onClose} className="px-5">
            Done
          </Button>
        </div>
      </div>
    </>
  )
}

type TeamMember = {
  id: string
  name: string
  initials: string
  gradient: string
  role: string
  status: "active" | "testing" | "inactive"
  sessionsToday: number
  lastActive: string
}

type Team = {
  id: string
  name: string
  description: string
  members: TeamMember[]
  sharedKnowledge: number
  activeToday: number
  color: string
  gradientFrom: string
  gradientTo: string
}

type TeamFile = {
  id: string
  name: string
  type: string
  size: string
  updated: string
}

const teams: Team[] = [
  {
    id: "support",
    name: "Support Team",
    description: "Handles inbound customer inquiries, billing issues, and ticket triage across all channels.",
    color: "bg-blue-600",
    gradientFrom: "from-blue-500",
    gradientTo: "to-blue-700",
    sharedKnowledge: 12,
    activeToday: 47,
    members: [
      {
        id: "1",
        name: "Customer Support Agent",
        initials: "CS",
        gradient: "from-blue-500 to-blue-700",
        role: "Tier-1 Support",
        status: "active",
        sessionsToday: 34,
        lastActive: "2 min ago",
      },
      {
        id: "es",
        name: "Email Support Agent",
        initials: "ES",
        gradient: "from-blue-400 to-blue-600",
        role: "Email Specialist",
        status: "testing",
        sessionsToday: 13,
        lastActive: "18 min ago",
      },
    ],
  },
  {
    id: "data",
    name: "Data Team",
    description: "Runs automated analytics, generates weekly reports, and monitors data pipelines.",
    color: "bg-emerald-600",
    gradientFrom: "from-emerald-500",
    gradientTo: "to-emerald-700",
    sharedKnowledge: 8,
    activeToday: 21,
    members: [
      {
        id: "2",
        name: "Data Analyst",
        initials: "DA",
        gradient: "from-emerald-500 to-emerald-700",
        role: "Analytics & Reporting",
        status: "active",
        sessionsToday: 21,
        lastActive: "5 min ago",
      },
    ],
  },
  {
    id: "sales",
    name: "Sales & Growth Team",
    description: "Drives outbound prospecting, lead qualification, and personalised outreach campaigns.",
    color: "bg-orange-500",
    gradientFrom: "from-orange-500",
    gradientTo: "to-orange-600",
    sharedKnowledge: 6,
    activeToday: 9,
    members: [
      {
        id: "3",
        name: "Sales Assistant",
        initials: "SA",
        gradient: "from-orange-500 to-orange-600",
        role: "Outbound Prospecting",
        status: "testing",
        sessionsToday: 9,
        lastActive: "1 hr ago",
      },
    ],
  },
]

const sharedKnowledgeByTeam: Record<string, TeamFile[]> = {
  support: [
    { id: "sk1", name: "customer_faq.md", type: "Markdown", size: "24 KB", updated: "2 days ago" },
    { id: "sk2", name: "refund_policy.pdf", type: "PDF", size: "1.2 MB", updated: "1 week ago" },
    { id: "sk3", name: "response_templates.json", type: "JSON", size: "45 KB", updated: "3 days ago" },
    { id: "sk4", name: "escalation_matrix.xlsx", type: "Spreadsheet", size: "180 KB", updated: "2 weeks ago" },
  ],
  data: [
    { id: "dk1", name: "data_dictionary.md", type: "Markdown", size: "62 KB", updated: "4 days ago" },
    { id: "dk2", name: "report_templates.xlsx", type: "Spreadsheet", size: "340 KB", updated: "1 week ago" },
    { id: "dk3", name: "pipeline_config.yaml", type: "YAML", size: "12 KB", updated: "Today" },
  ],
  sales: [
    { id: "sl1", name: "icp_profile.md", type: "Markdown", size: "18 KB", updated: "3 days ago" },
    { id: "sl2", name: "email_sequences.json", type: "JSON", size: "55 KB", updated: "Yesterday" },
    { id: "sl3", name: "competitor_matrix.xlsx", type: "Spreadsheet", size: "210 KB", updated: "5 days ago" },
  ],
}

const teamTemplates = [
  {
    id: "support",
    name: "Customer Operations",
    description: "Ticket triage, refund decisions, escalation rules, and customer-facing responses.",
    gradientFrom: "from-blue-500",
    gradientTo: "to-blue-700",
    files: [
      { name: "support_playbook.md", type: "Markdown", size: "18 KB" },
      { name: "refund_policy.pdf", type: "PDF", size: "960 KB" },
      { name: "escalation_matrix.xlsx", type: "Spreadsheet", size: "132 KB" },
    ],
  },
  {
    id: "growth",
    name: "Revenue Operations",
    description: "Lead research, CRM hygiene, outbound sequencing, and deal handoff context.",
    gradientFrom: "from-orange-500",
    gradientTo: "to-orange-600",
    files: [
      { name: "icp_profile.md", type: "Markdown", size: "21 KB" },
      { name: "email_sequences.json", type: "JSON", size: "54 KB" },
      { name: "crm_field_map.csv", type: "CSV", size: "36 KB" },
    ],
  },
  {
    id: "analysis",
    name: "Analytics Pod",
    description: "Metric definitions, report templates, pipeline notes, and anomaly response rules.",
    gradientFrom: "from-emerald-500",
    gradientTo: "to-emerald-700",
    files: [
      { name: "metrics_dictionary.md", type: "Markdown", size: "42 KB" },
      { name: "weekly_report_template.xlsx", type: "Spreadsheet", size: "280 KB" },
      { name: "pipeline_runbook.yaml", type: "YAML", size: "14 KB" },
    ],
  },
  {
    id: "blank",
    name: "Blank Team",
    description: "Start with a minimal shared file system and add context as the team learns.",
    gradientFrom: "from-slate-500",
    gradientTo: "to-slate-700",
    files: [
      { name: "team_context.md", type: "Markdown", size: "4 KB" },
      { name: "operating_rules.md", type: "Markdown", size: "6 KB" },
    ],
  },
]

function agentToMember(agentId: string): TeamMember | null {
  const agent = agentPool.find((a) => a.id === agentId)
  if (!agent) return null

  return {
    id: agent.id,
    name: agent.name,
    initials: agent.initials,
    gradient: agent.gradient,
    role: agent.role,
    status: agent.status,
    sessionsToday: agent.status === "active" ? 8 : agent.status === "testing" ? 3 : 0,
    lastActive: agent.status === "inactive" ? "Never" : "Just now",
  }
}

function buildTeamFiles(templateId: string, teamId: string): TeamFile[] {
  const template = teamTemplates.find((item) => item.id === templateId) ?? teamTemplates[0]
  return template.files.map((file, index) => ({
    id: `${teamId}-file-${index + 1}`,
    name: file.name,
    type: file.type,
    size: file.size,
    updated: "Just now",
  }))
}

function NewTeamModal({
  onClose,
  onCreate,
}: {
  onClose: () => void
  onCreate: (team: Team, files: TeamFile[]) => void
}) {
  const [teamName, setTeamName] = useState("")
  const [description, setDescription] = useState("")
  const [templateId, setTemplateId] = useState(teamTemplates[0].id)
  const [memberIds, setMemberIds] = useState<string[]>([])

  const template = teamTemplates.find((item) => item.id === templateId) ?? teamTemplates[0]
  const previewFiles = buildTeamFiles(template.id, "preview")
  const canCreate = teamName.trim().length >= 2

  const toggleMember = (agentId: string) => {
    setMemberIds((current) =>
      current.includes(agentId) ? current.filter((id) => id !== agentId) : [...current, agentId]
    )
  }

  const createTeam = () => {
    if (!canCreate) return
    const slug = teamName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
    const teamId = `${slug || "team"}-${Date.now()}`
    const files = buildTeamFiles(template.id, teamId)
    const members = memberIds
      .map((id) => agentToMember(id))
      .filter((member): member is TeamMember => Boolean(member))

    onCreate(
      {
        id: teamId,
        name: teamName.trim(),
        description: description.trim() || template.description,
        color: "bg-slate-700",
        gradientFrom: template.gradientFrom,
        gradientTo: template.gradientTo,
        sharedKnowledge: files.length,
        activeToday: members.reduce((total, member) => total + member.sessionsToday, 0),
        members,
      },
      files
    )
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/25 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-50 flex max-h-[86vh] w-[760px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[22px] border border-border bg-card shadow-2xl">
        <div className="flex items-start justify-between border-b border-border/60 px-6 py-5">
          <div>
            <p className="text-[18px] font-semibold tracking-[-0.02em]">Create team workspace</p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Set up the shared file system agents will read as team context.
            </p>
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid flex-1 min-h-0 grid-cols-[1.05fr_0.95fr] overflow-y-auto">
          <div className="space-y-5 border-r border-border/60 p-6">
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Team identity</p>
              <Input
                value={teamName}
                onChange={(event) => setTeamName(event.target.value)}
                placeholder="e.g., Finance Operations"
                className="h-10 bg-white text-sm"
                autoFocus
              />
              <Input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="What should this team be responsible for?"
                className="h-10 bg-white text-sm"
              />
            </div>

            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Starter file system</p>
              <div className="grid gap-2">
                {teamTemplates.map((item) => {
                  const selected = item.id === templateId
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setTemplateId(item.id)}
                      className={cn(
                        "flex items-start gap-3 rounded-[14px] border bg-white p-3 text-left transition-all",
                        selected ? "border-foreground shadow-sm" : "border-border/70 hover:border-border"
                      )}
                    >
                      <div className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white", item.gradientFrom, item.gradientTo)}>
                        <BookOpen className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[12.5px] font-semibold">{item.name}</p>
                          {selected && <Check className="h-3.5 w-3.5 text-foreground" />}
                        </div>
                        <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{item.description}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="space-y-5 bg-[hsl(var(--sidebar-bg))] p-6">
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Initial members</p>
              <div className="space-y-2">
                {agentPool.map((agent) => {
                  const selected = memberIds.includes(agent.id)
                  return (
                    <button
                      key={agent.id}
                      type="button"
                      onClick={() => toggleMember(agent.id)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-[14px] border bg-white p-3 text-left transition-all",
                        selected ? "border-foreground shadow-sm" : "border-border/70 hover:border-border"
                      )}
                    >
                      <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-[10px] font-bold text-white", agent.gradient)}>
                        {agent.initials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-semibold">{agent.name}</p>
                        <p className="text-[11px] text-muted-foreground">{agent.role}</p>
                      </div>
                      <div className={cn("flex h-5 w-5 items-center justify-center rounded-full border", selected ? "border-foreground bg-foreground text-white" : "border-border")}>
                        {selected && <Check className="h-3 w-3" />}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="rounded-[16px] border border-border bg-white p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[12px] font-semibold">File preview</p>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {previewFiles.length} files
                </span>
              </div>
              <div className="space-y-2">
                {previewFiles.map((file) => (
                  <div key={file.id} className="flex items-center gap-2.5 rounded-lg border border-border/50 px-2.5 py-2">
                    <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11.5px] font-medium">{file.name}</p>
                      <p className="text-[10px] text-muted-foreground">{file.type} · {file.size}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-border/60 bg-card/90 px-6 py-4">
          <p className="text-[11px] text-muted-foreground">
            You can add more files and members after creation.
          </p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} className="h-8 text-xs">
              Cancel
            </Button>
            <Button size="sm" onClick={createTeam} disabled={!canCreate} className="h-8 gap-1.5 px-4 text-xs">
              <Plus className="h-3.5 w-3.5" /> Create Team
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}

function StatusDot({ status }: { status: TeamMember["status"] }) {
  const colors: Record<TeamMember["status"], string> = {
    active: "bg-emerald-500",
    testing: "bg-amber-400",
    inactive: "bg-zinc-400",
  }
  const labels: Record<TeamMember["status"], string> = {
    active: "Active",
    testing: "Testing",
    inactive: "Inactive",
  }
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${colors[status]}`} />
      <span className="text-[11px] text-muted-foreground">{labels[status]}</span>
    </span>
  )
}

function MemberAvatar({ member, size = "md" }: { member: TeamMember; size?: "sm" | "md" | "lg" }) {
  const dims = size === "sm" ? "h-7 w-7 text-[9px]" : size === "lg" ? "h-12 w-12 text-sm" : "h-9 w-9 text-[11px]"
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${member.gradient} font-bold text-white ring-2 ring-background ${dims}`}
    >
      {member.initials}
    </div>
  )
}

function TeamCard({ team, onOpen }: { team: Team; onOpen: () => void }) {
  return (
    <div className="surface card-shadow p-5 flex flex-col gap-4 hover:card-shadow-hover transition-all group">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${team.gradientFrom} ${team.gradientTo} shadow-sm`}>
            <Users className="h-4.5 w-4.5 text-white h-[18px] w-[18px]" />
          </div>
          <div>
            <h3 className="text-[14px] font-semibold leading-tight">{team.name}</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">{team.members.length} member{team.members.length !== 1 ? "s" : ""}</p>
          </div>
        </div>
      </div>

      <p className="text-[12px] text-muted-foreground leading-relaxed line-clamp-2">{team.description}</p>

      <div className="flex items-center gap-3">
        <div className="flex -space-x-2">
          {team.members.map((m) => (
            <MemberAvatar key={m.id} member={m} size="sm" />
          ))}
          {team.members.length < 4 && (
            <div className="flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-border/70 bg-muted text-muted-foreground ring-2 ring-background">
              <Plus className="h-3 w-3" />
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 border-t border-border pt-3">
        <div className="flex items-center gap-1.5">
          <Activity className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[11px] text-muted-foreground"><span className="font-medium text-foreground">{team.activeToday}</span> sessions today</span>
        </div>
        <div className="flex items-center gap-1.5">
          <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[11px] text-muted-foreground"><span className="font-medium text-foreground">{team.sharedKnowledge}</span> files</span>
        </div>
      </div>

      <Button
        size="sm"
        variant="outline"
        className="h-8 w-full text-xs gap-1.5 group-hover:border-border transition-colors"
        onClick={onOpen}
      >
        Open Team
        <ChevronRight className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

function TeamDetail({
  team,
  files,
  onBack,
  onAddMember,
}: {
  team: Team
  files: TeamFile[]
  onBack: () => void
  onAddMember: (teamId: string, agentId: string) => void
}) {
  const [addMemberOpen, setAddMemberOpen] = useState(false)

  return (
    <div className="flex h-full gap-0">
      <div className="w-72 shrink-0 border-r border-border bg-[hsl(var(--sidebar-bg))] flex flex-col">
        <div className="p-5 border-b border-border space-y-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3 w-3" />
            All Teams
          </button>
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${team.gradientFrom} ${team.gradientTo} shadow-sm`}>
              <Users className="h-[18px] w-[18px] text-white" />
            </div>
            <div>
              <p className="text-[13px] font-semibold">{team.name}</p>
              <p className="text-[11px] text-muted-foreground">{team.members.length} member{team.members.length !== 1 ? "s" : ""}</p>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">{team.description}</p>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Members</p>
          {team.members.map((m) => (
            <div
              key={m.id}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-muted/50 transition-colors"
            >
              <MemberAvatar member={m} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-medium truncate">{m.name}</p>
                <StatusDot status={m.status} />
              </div>
            </div>
          ))}
          <div className="px-2.5 pt-1">
            <button
              onClick={() => setAddMemberOpen(true)}
              className="flex items-center gap-2 text-[11px] text-muted-foreground hover:text-foreground transition-colors py-1.5"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Add Member
            </button>
          </div>
        </div>

        <div className="p-4 border-t border-border grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-white p-2.5 text-center border border-border">
            <p className="text-[18px] font-bold leading-none">{team.activeToday}</p>
            <p className="text-[10px] text-muted-foreground mt-1">Sessions today</p>
          </div>
          <div className="rounded-xl bg-white p-2.5 text-center border border-border">
            <p className="text-[18px] font-bold leading-none">{team.sharedKnowledge}</p>
            <p className="text-[10px] text-muted-foreground mt-1">Context files</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <Tabs defaultValue="members" className="space-y-5">
          <TabsList className="h-8">
            <TabsTrigger value="members" className="text-xs h-7 gap-1.5">
              <Users className="h-3 w-3" /> Members
            </TabsTrigger>
            <TabsTrigger value="knowledge" className="text-xs h-7 gap-1.5">
              <BookOpen className="h-3 w-3" /> Team File System
            </TabsTrigger>
            <TabsTrigger value="settings" className="text-xs h-7 gap-1.5">
              <Settings2 className="h-3 w-3" /> Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="members" className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[12px] text-muted-foreground">{team.members.length} member{team.members.length !== 1 ? "s" : ""} · Agents share the same team context</p>
              <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setAddMemberOpen(true)}>
                <UserPlus className="h-3.5 w-3.5" /> Add Member
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {team.members.map((m) => (
                <div
                  key={m.id}
                  className="surface card-shadow p-4 space-y-3 hover:card-shadow-hover transition-all"
                >
                  <div className="flex items-center gap-3">
                    <MemberAvatar member={m} size="lg" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold truncate">{m.name}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{m.role}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <StatusDot status={m.status} />
                    <span className="text-[11px] text-muted-foreground">Last active {m.lastActive}</span>
                  </div>
                  <div className="flex items-center gap-3 rounded-lg bg-muted/50 px-3 py-2">
                    <Activity className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-[12px]"><span className="font-semibold">{m.sessionsToday}</span> <span className="text-muted-foreground">sessions today</span></span>
                  </div>
                  <Link href={`/employees/${m.id}`}>
                    <Button variant="outline" size="sm" className="h-7 w-full text-xs gap-1.5">
                      <Settings2 className="h-3 w-3" /> Configure
                    </Button>
                  </Link>
                </div>
              ))}

              <div
                onClick={() => setAddMemberOpen(true)}
                className="rounded-[18px] border border-dashed border-border bg-white/60 p-4 flex flex-col items-center justify-center gap-2 min-h-[180px] text-center hover:bg-white transition-colors cursor-pointer group"
              >
                <div className="h-10 w-10 rounded-full border border-dashed border-border flex items-center justify-center group-hover:border-muted-foreground transition-colors">
                  <Plus className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-[12px] text-muted-foreground">Add a new agent<br />to this team</p>
              </div>
            </div>
          </TabsContent>

          {addMemberOpen && (
            <AddMemberModal
              teamName={team.name}
              existingMemberIds={team.members.map((m) => m.id)}
              onClose={() => setAddMemberOpen(false)}
              onAdd={(agentId) => onAddMember(team.id, agentId)}
            />
          )}

          <TabsContent value="knowledge" className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[12px] text-muted-foreground">{files.length} files · Read by every agent before work starts</p>
              <Button size="sm" className="h-8 gap-1.5 text-xs">
                <DownloadCloud className="h-3.5 w-3.5" /> Upload file
              </Button>
            </div>
            <div className="space-y-2">
              {files.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center gap-3 rounded-[16px] border border-border bg-white p-3.5 hover:shadow-sm transition-all group"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted shrink-0">
                    <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium">{f.name}</p>
                    <p className="text-[11px] text-muted-foreground">{f.type} · {f.size} · Updated {f.updated}</p>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="settings" className="space-y-4">
            <div className="rounded-xl border border-border/50 bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Key className="h-4 w-4 text-muted-foreground" />
                  <p className="text-[13px] font-semibold">Shared Credentials</p>
                </div>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
                  <Plus className="h-3 w-3" /> Add
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">Credentials shared across all members in this team. AES-256-GCM encrypted.</p>
              <div className="space-y-2">
                {[
                  { name: "Slack Workspace OAuth", type: "OAuth 2.0", status: "active" },
                  { name: "Zendesk API Token", type: "API Key", status: "active" },
                ].map((cred) => (
                  <div key={cred.name} className="flex items-center justify-between rounded-lg border border-border/40 px-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted">
                        <Key className="h-3 w-3 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-[12px] font-medium">{cred.name}</p>
                        <p className="text-[10px] text-muted-foreground">{cred.type}</p>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block" />
                      {cred.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-border/50 bg-card p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <p className="text-[13px] font-semibold">Team Approval Policies</p>
              </div>
              <p className="text-[11px] text-muted-foreground">Override individual policies with team-wide gates.</p>
              <div className="space-y-2">
                {[
                  { action: "Send external email", policy: "Always ask" },
                  { action: "Delete records in shared systems", policy: "Always ask" },
                  { action: "Escalate to human agent", policy: "Always allow" },
                ].map((item) => (
                  <div key={item.action} className="flex items-center justify-between rounded-lg border border-border/40 px-3 py-2.5">
                    <span className="text-[12px]">{item.action}</span>
                    <span className="text-[11px] font-medium text-muted-foreground">{item.policy}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 space-y-2">
              <p className="text-[13px] font-semibold text-destructive">Danger Zone</p>
              <p className="text-[11px] text-muted-foreground">Permanently delete this team and remove all shared resources.</p>
              <Button variant="destructive" size="sm" className="h-8 text-xs">Delete Team</Button>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

export default function WorkspacePage() {
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)
  const [workspaceTeams, setWorkspaceTeams] = useState<Team[]>(teams)
  const [teamFiles, setTeamFiles] = useState<Record<string, TeamFile[]>>(sharedKnowledgeByTeam)
  const [newTeamOpen, setNewTeamOpen] = useState(false)

  const selectedTeam = workspaceTeams.find((t) => t.id === selectedTeamId) ?? null
  const selectedTeamFiles = selectedTeam ? teamFiles[selectedTeam.id] ?? [] : []

  const handleAddMember = (teamId: string, agentId: string) => {
    const member = agentToMember(agentId)
    if (!member) return

    setWorkspaceTeams((current) =>
      current.map((team) => {
        if (team.id !== teamId || team.members.some((existing) => existing.id === agentId)) {
          return team
        }
        return {
          ...team,
          members: [...team.members, member],
        }
      })
    )
  }

  const handleCreateTeam = (team: Team, files: TeamFile[]) => {
    setWorkspaceTeams((current) => [team, ...current])
    setTeamFiles((current) => ({ ...current, [team.id]: files }))
    setSelectedTeamId(team.id)
    setNewTeamOpen(false)
  }

  if (selectedTeam) {
    return (
      <div className="flex h-full flex-col">
        <TeamDetail
          team={selectedTeam}
          files={selectedTeamFiles}
          onBack={() => setSelectedTeamId(null)}
          onAddMember={handleAddMember}
        />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-[1320px] p-8 space-y-6">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <div className="icon-box icon-box-primary h-11 w-11">
              <Zap className="h-[19px] w-[19px]" />
            </div>
            <div>
              <h1 className="text-[30px] font-semibold leading-none tracking-[-0.03em]">Workspace</h1>
              <p className="text-[13.5px] text-muted-foreground mt-2">Each team has a shared file system agents use as common context.</p>
            </div>
          </div>
          <Button
            size="sm"
            className="origin-cta h-9 gap-2 rounded-full px-4 text-[13px] font-semibold"
            onClick={() => setNewTeamOpen(true)}
          >
            <Plus className="h-4 w-4" /> New Team
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Teams", value: workspaceTeams.length, icon: Users, boxClass: "icon-box-primary" },
            { label: "Total Agents", value: workspaceTeams.reduce((a, t) => a + t.members.length, 0), icon: MessageSquare, boxClass: "icon-box-blue" },
            { label: "Context Files", value: workspaceTeams.reduce((a, t) => a + t.sharedKnowledge, 0), icon: BookOpen, boxClass: "icon-box-emerald" },
          ].map(({ label, value, icon: Icon, boxClass }) => (
            <div key={label} className="surface card-shadow px-5 py-4 flex items-center gap-4">
              <div className={cn("icon-box h-10 w-10", boxClass)}>
                <Icon className="h-[17px] w-[17px]" />
              </div>
              <div>
                <p className="stat-value-sm">{value}</p>
                <p className="text-[12px] text-muted-foreground font-medium mt-0.5">{label}</p>
              </div>
            </div>
          ))}
        </div>

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">Teams</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {workspaceTeams.map((team) => (
              <TeamCard key={team.id} team={team} onOpen={() => setSelectedTeamId(team.id)} />
            ))}

            <div
              className="rounded-xl border border-dashed border-border/50 bg-card/50 p-5 flex flex-col items-center justify-center gap-2.5 min-h-[200px] text-center hover:border-border hover:bg-card cursor-pointer transition-colors group"
              onClick={() => setNewTeamOpen(true)}
            >
              <div className="h-10 w-10 rounded-xl border border-dashed border-border flex items-center justify-center group-hover:border-muted-foreground transition-colors">
                <Plus className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-[13px] font-medium">New Team</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Group agents around<br />a shared purpose</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      {newTeamOpen && (
        <NewTeamModal
          onClose={() => setNewTeamOpen(false)}
          onCreate={handleCreateTeam}
        />
      )}
    </div>
  )
}

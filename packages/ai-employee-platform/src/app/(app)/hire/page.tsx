"use client"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  MessageSquare,
  BarChart3,
  ShoppingCart,
  Code2,
  FileText,
  Headphones,
  Search,
  ArrowRight,
  ArrowLeft,
  Check,
  Sparkles,
  ChevronRight,
  Plus,
  X,
  Zap,
  Globe,
  Mail,
  Github,
  Database,
  Send,
  Bot,
  User,
  UploadCloud,
  Link2,
  Cpu,
  Terminal,
  Hash,
  Star,
} from "lucide-react"
import { cn } from "@/lib/utils"

const STEPS = [
  { id: 1, label: "Choose role" },
  { id: 2, label: "Configure" },
  { id: 3, label: "Apps & Skills" },
  { id: 4, label: "Test chat" },
]

const models = [
  {
    id: "glm-5.1",
    name: "GLM-5.1",
    desc: "旗舰推理模型，超强复杂任务处理能力",
    badge: "Flagship",
    badgeColor: "bg-violet-100 text-violet-700",
    perf: { speed: 72, quality: 98, costEff: 30 },
  },
  {
    id: "glm-5-turbo",
    name: "GLM-5 Turbo",
    desc: "高效均衡，日常任务首选",
    badge: "Recommended",
    badgeColor: "bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]",
    perf: { speed: 86, quality: 92, costEff: 58 },
  },
  {
    id: "glm-5v-turbo",
    name: "GLM-5V Turbo",
    desc: "视觉+语言多模态，理解图表与截图",
    badge: "Vision",
    badgeColor: "bg-blue-100 text-blue-700",
    perf: { speed: 80, quality: 90, costEff: 55 },
  },
  {
    id: "glm-4.7-flash",
    name: "GLM-4.7 Flash",
    desc: "超低延迟，高频简单任务专属",
    badge: "Fast",
    badgeColor: "bg-emerald-100 text-emerald-700",
    perf: { speed: 98, quality: 76, costEff: 96 },
  },
]

const templates = [
  {
    id: "customer-support",
    name: "Customer Support Agent",
    role: "Support",
    description: "处理入站客户咨询、解决工单，并将复杂问题升级给人工。",
    icon: Headphones,
    gradient: "from-blue-500 to-blue-700",
    apps: ["Slack", "Email", "Linear"],
    skills: ["Knowledge Base Q&A", "Intent Classification"],
    model: "glm-5-turbo",
    popular: true,
  },
  {
    id: "data-analyst",
    name: "Data Analyst",
    role: "Analytics",
    description: "分析数据集，生成报告，自动挖掘业务洞察。",
    icon: BarChart3,
    gradient: "from-emerald-500 to-emerald-700",
    apps: ["Google Sheets", "Notion", "Database"],
    skills: ["SQL Query", "Chart Generation", "Anomaly Detection"],
    model: "glm-5.1",
    popular: true,
  },
  {
    id: "sales-sdr",
    name: "Sales SDR",
    role: "Sales",
    description: "调研线索，起草个性化邮件，并丰富你的 CRM 数据。",
    icon: ShoppingCart,
    gradient: "from-orange-500 to-orange-600",
    apps: ["HubSpot", "Email", "Web Search"],
    skills: ["Lead Research", "Email Drafting"],
    model: "glm-5-turbo",
    popular: true,
  },
  {
    id: "developer-assistant",
    name: "Developer Assistant",
    role: "Engineering",
    description: "审查代码，撰写文档，管理 GitHub Issues 和 PR。",
    icon: Code2,
    gradient: "from-slate-500 to-slate-700",
    apps: ["GitHub", "Linear", "Notion"],
    skills: ["Code Review", "Documentation Writing"],
    model: "glm-5.1",
  },
  {
    id: "contract-tracker",
    name: "Contract Tracker",
    role: "Legal / Ops",
    description: "追踪合同截止日期，提取关键条款，自动标记续约提醒。",
    icon: FileText,
    gradient: "from-amber-500 to-amber-600",
    apps: ["Notion", "Google Drive", "Email"],
    skills: ["Document Analysis", "Deadline Tracking"],
    model: "glm-5-turbo",
  },
  {
    id: "sprint-facilitator",
    name: "Sprint Facilitator",
    role: "Engineering",
    description: "撰写回顾报告，追踪速度，整理 Sprint 计划素材。",
    icon: Zap,
    gradient: "from-purple-500 to-purple-600",
    apps: ["Linear", "Slack", "Notion"],
    skills: ["Meeting Summarization", "Velocity Tracking"],
    model: "glm-4.7-flash",
  },
]

const availableApps = [
  { id: "slack", name: "Slack", icon: Hash, category: "Communication", connected: true },
  { id: "email", name: "Email", icon: Mail, category: "Communication", connected: true },
  { id: "github", name: "GitHub", icon: Github, category: "Dev Tools", connected: false },
  { id: "linear", name: "Linear", icon: Zap, category: "Dev Tools", connected: true },
  { id: "hubspot", name: "HubSpot", icon: BarChart3, category: "CRM", connected: false },
  { id: "notion", name: "Notion", icon: FileText, category: "Productivity", connected: true },
  { id: "database", name: "SQL Database", icon: Database, category: "Data", connected: false },
  { id: "google-drive", name: "Google Drive", icon: Globe, category: "Productivity", connected: false },
]

const builtinSkills = [
  {
    id: "web-search",
    name: "Web Search",
    desc: "搜索互联网获取最新信息",
    icon: Globe,
  },
  {
    id: "code-interpreter",
    name: "Code Interpreter",
    desc: "执行 Python，分析数据，生成图表",
    icon: Terminal,
  },
  {
    id: "knowledge-base",
    name: "Knowledge Base",
    desc: "检索已上传到团队的文档知识库",
    icon: FileText,
  },
  {
    id: "image-analysis",
    name: "Image Analysis",
    desc: "理解截图、图表和照片（需 Vision 模型）",
    icon: Cpu,
  },
]

interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

export default function HirePage() {
  const [step, setStep] = useState(1)
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)
  const [naturalLanguageInput, setNaturalLanguageInput] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [employeeName, setEmployeeName] = useState("")
  const [selectedModel, setSelectedModel] = useState("glm-5-turbo")
  const [jobSpec, setJobSpec] = useState("")
  const [systemPrompt, setSystemPrompt] = useState("")

  const [step3Tab, setStep3Tab] = useState<"apps" | "skills" | "tools">("apps")
  const [selectedApps, setSelectedApps] = useState<string[]>([])
  const [selectedBuiltinSkills, setSelectedBuiltinSkills] = useState<string[]>([])
  const [customSkills, setCustomSkills] = useState<{ id: string; name: string }[]>([])
  const [skillInput, setSkillInput] = useState("")
  const [customTools, setCustomTools] = useState<{ id: string; name: string; endpoint: string }[]>([])
  const [toolName, setToolName] = useState("")
  const [toolEndpoint, setToolEndpoint] = useState("")

  const [chatInput, setChatInput] = useState("")
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: "你好！我已就绪。有什么我可以帮你做的吗？" },
  ])
  const [isSending, setIsSending] = useState(false)

  const selectedTemplateData = templates.find((t) => t.id === selectedTemplate)

  const handleSelectTemplate = (id: string) => {
    setSelectedTemplate(id)
    const t = templates.find((x) => x.id === id)
    if (t) {
      setEmployeeName(t.name)
      setSelectedModel(t.model)
      setSelectedApps(t.apps.map((a) => a.toLowerCase().replace(/\s+/g, "-")))
      setSelectedBuiltinSkills(["web-search", "knowledge-base"])
      setSystemPrompt(
        `You are a ${t.name} for the company. Your role is ${t.role}.\n\n${t.description}\n\nAlways be professional and confirm before taking irreversible actions.`
      )
      setJobSpec(
        `Role: ${t.name}\nDepartment: ${t.role}\n\nResponsibilities:\n- ${t.description}\n\nKPIs:\n- Completion rate > 90%\n- Response time < 2 min\n- Satisfaction > 4/5`
      )
    }
  }

  const handleSend = () => {
    if (!chatInput.trim()) return
    const msg = chatInput.trim()
    setChatInput("")
    setChatMessages((prev) => [...prev, { role: "user", content: msg }])
    setIsSending(true)
    setTimeout(() => {
      setChatMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `好的，我来处理这个：「${msg}」。作为 ${employeeName || "AI 员工"}，我会立刻跟进并给你反馈。`,
        },
      ])
      setIsSending(false)
    }, 1200)
  }

  const addCustomSkill = () => {
    if (!skillInput.trim()) return
    setCustomSkills((prev) => [...prev, { id: `cs-${Date.now()}`, name: skillInput.trim() }])
    setSkillInput("")
  }

  const addCustomTool = () => {
    if (!toolName.trim() || !toolEndpoint.trim()) return
    setCustomTools((prev) => [
      ...prev,
      { id: `ct-${Date.now()}`, name: toolName.trim(), endpoint: toolEndpoint.trim() },
    ])
    setToolName("")
    setToolEndpoint("")
  }

  const canProceed1 = selectedTemplate !== null || naturalLanguageInput.trim().length > 10
  const canProceed2 = employeeName.trim().length > 0 && systemPrompt.trim().length > 0

  const filteredTemplates = templates.filter(
    (t) =>
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.role.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <div className="shrink-0 border-b border-border/60 bg-card/80 px-8 py-5" style={{ backdropFilter: "blur(8px)" }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[22px] font-extrabold tracking-tight leading-none" style={{ letterSpacing: "-0.03em" }}>Hire AI Employee</h1>
            <p className="text-[12.5px] text-muted-foreground mt-1.5">几分钟内配置好你的新团队成员</p>
          </div>
          <div className="flex items-center">
            {STEPS.map((s, i) => (
              <div key={s.id} className="flex items-center">
                <button
                  onClick={() => step > s.id && setStep(s.id)}
                  className={cn(
                    "flex flex-col items-center gap-1",
                    step > s.id ? "cursor-pointer" : "cursor-default"
                  )}
                >
                  <div
                    className={cn(
                      "flex h-[26px] w-[26px] items-center justify-center rounded-full text-[11px] font-bold transition-all",
                      step === s.id
                        ? "bg-[hsl(var(--primary))] text-white shadow-[0_2px_8px_hsl(238_42%_54%/0.35)]"
                        : step > s.id
                        ? "bg-emerald-500 text-white"
                        : "bg-muted text-muted-foreground/40 border border-border/50"
                    )}
                  >
                    {step > s.id ? <Check className="h-3 w-3" /> : s.id}
                  </div>
                  <span
                    className={cn(
                      "text-[10px] font-medium whitespace-nowrap transition-colors",
                      step === s.id
                        ? "text-foreground"
                        : step > s.id
                        ? "text-muted-foreground"
                        : "text-muted-foreground/35"
                    )}
                  >
                    {s.label}
                  </span>
                </button>
                {i < STEPS.length - 1 && (
                  <div className="mb-3.5 mx-2 h-px w-10 rounded-full transition-all"
                    style={{
                      background: step > s.id
                        ? "hsl(142 76% 45% / 0.5)"
                        : step === s.id
                        ? "hsl(var(--primary) / 0.25)"
                        : "hsl(var(--border) / 0.6)"
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-8 py-8 max-w-5xl">

          {/* ── Step 1: Choose role ── */}
          {step === 1 && (
            <div className="space-y-8">
              <div className="rounded-2xl border border-[hsl(var(--primary))]/20 bg-[hsl(var(--accent))]/50 p-5">
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--primary))] shadow-sm">
                    <Sparkles className="h-5 w-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="text-[14px] font-semibold mb-0.5">用自然语言描述你的需求</p>
                    <p className="text-[12px] text-muted-foreground mb-3">告诉我们你需要什么，我们来帮你配置。</p>
                    <div className="flex gap-2.5">
                      <Input
                        placeholder="e.g., 我需要一个处理客户邮件并把复杂问题发到 Linear 的助手..."
                        value={naturalLanguageInput}
                        onChange={(e) => {
                          setNaturalLanguageInput(e.target.value)
                          if (e.target.value) setSelectedTemplate(null)
                        }}
                        className="flex-1 h-10 text-sm bg-white/70 border-[hsl(var(--primary))]/20"
                      />
                      <Button
                        className="h-10 gap-1.5 px-5"
                        disabled={naturalLanguageInput.trim().length < 10}
                        onClick={() => setStep(2)}
                      >
                        <Sparkles className="h-3.5 w-3.5" /> Generate
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex-1 h-px bg-border/50" />
                <span className="text-[11px] text-muted-foreground/50 font-medium uppercase tracking-wide">
                  或选择模板
                </span>
                <div className="flex-1 h-px bg-border/50" />
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
                <Input
                  placeholder="搜索角色模板..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9 text-sm"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredTemplates.map((t) => {
                  const Icon = t.icon
                  const isSelected = selectedTemplate === t.id
                  return (
                    <button
                      key={t.id}
                      onClick={() => handleSelectTemplate(t.id)}
                      className={cn(
                        "group relative flex flex-col items-start rounded-2xl border p-5 text-left transition-all",
                        isSelected
                          ? "border-[hsl(var(--primary))]/50 bg-[hsl(var(--accent))]/70 shadow-md ring-1 ring-[hsl(var(--primary))]/30"
                          : "border-border/60 bg-card hover:border-border card-shadow hover:card-shadow-hover"
                      )}
                    >
                      {t.popular && !isSelected && (
                        <span className="absolute right-4 top-4 flex items-center gap-0.5 rounded-full bg-[hsl(var(--primary))]/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[hsl(var(--primary))]">
                          <Star className="h-2.5 w-2.5 fill-current" /> Popular
                        </span>
                      )}
                      {isSelected && (
                        <div className="absolute right-4 top-4 flex h-6 w-6 items-center justify-center rounded-full bg-[hsl(var(--primary))] shadow-sm">
                          <Check className="h-3.5 w-3.5 text-white" />
                        </div>
                      )}
                      <div
                        className={cn(
                          "mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br shadow-sm",
                          t.gradient
                        )}
                      >
                        <Icon className="h-6 w-6 text-white" />
                      </div>
                      <p className="text-[14px] font-semibold leading-snug">{t.name}</p>
                      <p className="mt-1.5 text-[12px] text-muted-foreground leading-relaxed line-clamp-2">
                        {t.description}
                      </p>
                      <div className="mt-4 flex flex-wrap gap-1.5">
                        {t.apps.slice(0, 3).map((a) => (
                          <span
                            key={a}
                            className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                          >
                            {a}
                          </span>
                        ))}
                        {t.apps.length > 3 && (
                          <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                            +{t.apps.length - 3}
                          </span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Step 2: Configure ── */}
          {step === 2 && (
            <div className="grid gap-8 md:grid-cols-2">
              {/* Left: name + model */}
              <div className="space-y-6">
                <div>
                  <Label htmlFor="emp-name" className="text-[13px] font-semibold mb-2 block">
                    Agent 名称
                  </Label>
                  <Input
                    id="emp-name"
                    value={employeeName}
                    onChange={(e) => setEmployeeName(e.target.value)}
                    placeholder="e.g., Customer Support Agent"
                    className="h-10"
                  />
                </div>

                <div>
                  <Label className="text-[13px] font-semibold mb-3 block">AI 模型</Label>
                  <div className="space-y-2.5">
                    {models.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => setSelectedModel(m.id)}
                        className={cn(
                          "flex w-full items-start gap-3.5 rounded-xl border px-4 py-3.5 text-left transition-all",
                          selectedModel === m.id
                            ? "border-[hsl(var(--primary))]/50 bg-[hsl(var(--accent))]/60 ring-1 ring-[hsl(var(--primary))]/30"
                            : "border-border/60 bg-card hover:border-border hover:bg-muted/20 card-shadow"
                        )}
                      >
                        <div
                          className={cn(
                            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg mt-0.5",
                            selectedModel === m.id ? "bg-[hsl(var(--primary))]" : "bg-muted"
                          )}
                        >
                          <Cpu
                            className={cn(
                              "h-4 w-4",
                              selectedModel === m.id ? "text-white" : "text-muted-foreground/60"
                            )}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-[13px] font-semibold">{m.name}</p>
                            <span
                              className={cn(
                                "rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide",
                                m.badgeColor
                              )}
                            >
                              {m.badge}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground leading-snug">{m.desc}</p>
                          {/* Mini perf bars */}
                          <div className="flex gap-2.5 mt-2.5">
                            {[
                              { label: "Speed", value: m.perf.speed },
                              { label: "Quality", value: m.perf.quality },
                              { label: "Cost eff.", value: m.perf.costEff },
                            ].map((bar) => (
                              <div key={bar.label} className="flex-1">
                                <div className="flex justify-between text-[9px] text-muted-foreground/50 mb-0.5">
                                  <span>{bar.label}</span>
                                </div>
                                <div className="h-1 rounded-full bg-muted overflow-hidden">
                                  <div
                                    className={cn(
                                      "h-full rounded-full transition-all",
                                      selectedModel === m.id
                                        ? "bg-[hsl(var(--primary))]"
                                        : "bg-muted-foreground/30"
                                    )}
                                    style={{ width: `${bar.value}%` }}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                        {selectedModel === m.id && (
                          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--primary))] mt-0.5">
                            <Check className="h-3 w-3 text-white" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right: prompts */}
              <div className="space-y-5">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label htmlFor="system-prompt" className="text-[13px] font-semibold">
                      System Prompt
                    </Label>
                    <span className="text-[10px] text-muted-foreground/40">
                      {systemPrompt.length} chars
                    </span>
                  </div>
                  <textarea
                    id="system-prompt"
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    className="flex min-h-[200px] w-full rounded-xl border border-border/60 bg-background px-4 py-3 text-[12.5px] leading-relaxed ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none font-mono"
                    placeholder="You are a helpful AI assistant..."
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label htmlFor="job-spec" className="text-[13px] font-semibold">
                      Job Spec
                    </Label>
                    <span className="text-[10px] text-muted-foreground/40">Role & KPIs</span>
                  </div>
                  <textarea
                    id="job-spec"
                    value={jobSpec}
                    onChange={(e) => setJobSpec(e.target.value)}
                    className="flex min-h-[160px] w-full rounded-xl border border-border/60 bg-background px-4 py-3 text-[13px] leading-relaxed ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
                    placeholder="职责、KPI、约束条件..."
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── Step 3: Apps & Skills ── */}
          {step === 3 && (
            <div className="space-y-5">
              {/* Sub-tabs */}
              <div className="flex items-center gap-0.5 border-b border-border/50">
                {(["apps", "skills", "tools"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setStep3Tab(tab)}
                    className={cn(
                      "relative py-2.5 px-1 mr-5 text-[13px] font-medium transition-colors",
                      step3Tab === tab
                        ? "text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {tab === "apps" ? "Apps" : tab === "skills" ? "Skills" : "Tools"}
                    {step3Tab === tab && (
                      <span className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full bg-[hsl(var(--primary))]" />
                    )}
                  </button>
                ))}
              </div>

              {/* Apps */}
              {step3Tab === "apps" && (
                <div>
                  <p className="text-[13px] text-muted-foreground mb-5">
                    选择此 Agent 可以访问的应用和集成。
                  </p>
                  <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                    {availableApps.map((app) => {
                      const Icon = app.icon
                      const selected = selectedApps.includes(app.id)
                      return (
                        <button
                          key={app.id}
                          onClick={() =>
                            setSelectedApps((prev) =>
                              selected ? prev.filter((a) => a !== app.id) : [...prev, app.id]
                            )
                          }
                          className={cn(
                            "flex items-center gap-3 rounded-xl border p-4 text-left transition-all",
                            selected
                              ? "border-[hsl(var(--primary))]/50 bg-[hsl(var(--accent))]/60 ring-1 ring-[hsl(var(--primary))]/30"
                              : "border-border/60 bg-card hover:border-border card-shadow"
                          )}
                        >
                          <div
                            className={cn(
                              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                              selected ? "bg-[hsl(var(--primary))]" : "bg-muted"
                            )}
                          >
                            <Icon
                              className={cn(
                                "h-4.5 w-4.5 h-[18px] w-[18px]",
                                selected ? "text-white" : "text-muted-foreground/60"
                              )}
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="text-[13px] font-medium">{app.name}</p>
                              {app.connected && (
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                              )}
                            </div>
                            <p className="text-[11px] text-muted-foreground">{app.category}</p>
                          </div>
                          {selected && (
                            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--primary))]">
                              <Check className="h-3 w-3 text-white" />
                            </div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Skills */}
              {step3Tab === "skills" && (
                <div className="space-y-8">
                  {/* Built-in */}
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/50 mb-3">
                      内置能力
                    </p>
                    <div className="grid gap-3 md:grid-cols-2">
                      {builtinSkills.map((skill) => {
                        const Icon = skill.icon
                        const selected = selectedBuiltinSkills.includes(skill.id)
                        return (
                          <button
                            key={skill.id}
                            onClick={() =>
                              setSelectedBuiltinSkills((prev) =>
                                selected ? prev.filter((s) => s !== skill.id) : [...prev, skill.id]
                              )
                            }
                            className={cn(
                              "flex items-start gap-3 rounded-xl border p-4 text-left transition-all",
                              selected
                                ? "border-[hsl(var(--primary))]/50 bg-[hsl(var(--accent))]/60 ring-1 ring-[hsl(var(--primary))]/30"
                                : "border-border/60 bg-card hover:border-border card-shadow"
                            )}
                          >
                            <div
                              className={cn(
                                "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl mt-0.5",
                                selected ? "bg-[hsl(var(--primary))]" : "bg-muted"
                              )}
                            >
                              <Icon
                                className={cn(
                                  "h-4.5 w-4.5 h-[18px] w-[18px]",
                                  selected ? "text-white" : "text-muted-foreground/60"
                                )}
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] font-semibold">{skill.name}</p>
                              <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
                                {skill.desc}
                              </p>
                            </div>
                            {selected && (
                              <Check className="h-4 w-4 text-[hsl(var(--primary))] shrink-0 mt-0.5" />
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Custom skills */}
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/50 mb-3">
                      自定义 Skill
                    </p>
                    <div className="space-y-3">
                      {/* Add by description */}
                      <div className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
                        <p className="text-[13px] font-medium">描述一个 Skill</p>
                        <div className="flex gap-2">
                          <Input
                            placeholder="e.g., 根据合同内容提取关键条款和截止日期"
                            value={skillInput}
                            onChange={(e) => setSkillInput(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && addCustomSkill()}
                            className="flex-1 h-9 text-sm"
                          />
                          <Button
                            size="sm"
                            className="h-9 gap-1 shrink-0"
                            onClick={addCustomSkill}
                            disabled={!skillInput.trim()}
                          >
                            <Plus className="h-3.5 w-3.5" /> Add
                          </Button>
                        </div>
                      </div>

                      {/* Upload spec */}
                      <div
                        className="rounded-xl border border-dashed border-border/60 bg-muted/20 p-6 text-center cursor-pointer hover:bg-muted/40 transition-colors"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <input ref={fileInputRef} type="file" className="hidden" accept=".json,.yaml,.yml" />
                        <UploadCloud className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                        <p className="text-[13px] font-medium text-muted-foreground">上传 Skill Spec</p>
                        <p className="text-[11px] text-muted-foreground/50 mt-0.5">
                          OpenAPI / YAML / JSON · 最大 10MB
                        </p>
                      </div>

                      {customSkills.length > 0 && (
                        <div className="space-y-2">
                          {customSkills.map((s) => (
                            <div
                              key={s.id}
                              className="flex items-center gap-3 rounded-xl border border-border/50 bg-card px-4 py-2.5"
                            >
                              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[hsl(var(--primary))]/10 shrink-0">
                                <Zap className="h-3.5 w-3.5 text-[hsl(var(--primary))]" />
                              </div>
                              <span className="text-[13px] font-medium flex-1">{s.name}</span>
                              <button
                                onClick={() =>
                                  setCustomSkills((prev) => prev.filter((x) => x.id !== s.id))
                                }
                                className="text-muted-foreground/30 hover:text-destructive transition-colors"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Tools */}
              {step3Tab === "tools" && (
                <div className="space-y-5">
                  <p className="text-[13px] text-muted-foreground">
                    定义 Agent 在任务执行中可以调用的自定义 API 工具。
                  </p>

                  <div className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
                    <p className="text-[13px] font-semibold">添加 API 工具</p>
                    <Input
                      placeholder="工具名称，e.g., Get Invoice Status"
                      value={toolName}
                      onChange={(e) => setToolName(e.target.value)}
                      className="h-9 text-sm"
                    />
                    <div className="flex gap-2">
                      <div className="flex items-center rounded-lg border border-border/60 bg-muted/30 px-3 shrink-0">
                        <span className="text-[11px] font-mono text-muted-foreground">POST</span>
                      </div>
                      <Input
                        placeholder="https://api.example.com/invoices/{id}"
                        value={toolEndpoint}
                        onChange={(e) => setToolEndpoint(e.target.value)}
                        className="flex-1 h-9 text-sm font-mono"
                      />
                      <Button
                        size="sm"
                        className="h-9 gap-1 shrink-0"
                        onClick={addCustomTool}
                        disabled={!toolName.trim() || !toolEndpoint.trim()}
                      >
                        <Plus className="h-3.5 w-3.5" /> Add
                      </Button>
                    </div>
                  </div>

                  {customTools.length === 0 ? (
                    <div className="flex flex-col items-center py-14 text-center">
                      <Link2 className="h-8 w-8 text-muted-foreground/20 mb-3" />
                      <p className="text-[13px] text-muted-foreground/60">暂无自定义工具</p>
                      <p className="text-[11px] text-muted-foreground/40 mt-0.5">
                        Tools 让 Agent 调用你自己的 API
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {customTools.map((t) => (
                        <div
                          key={t.id}
                          className="flex items-center gap-3 rounded-xl border border-border/50 bg-card px-4 py-2.5"
                        >
                          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted shrink-0">
                            <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-medium">{t.name}</p>
                            <p className="text-[11px] font-mono text-muted-foreground/60 truncate">
                              {t.endpoint}
                            </p>
                          </div>
                          <button
                            onClick={() =>
                              setCustomTools((prev) => prev.filter((x) => x.id !== t.id))
                            }
                            className="text-muted-foreground/30 hover:text-destructive transition-colors"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Step 4: Test chat ── */}
          {step === 4 && (
            <div className="space-y-5">
              <div className="rounded-2xl border border-border/60 overflow-hidden bg-card card-shadow-hover">
                {/* Chat header */}
                <div className="flex items-center gap-3 border-b border-border/50 bg-muted/20 px-5 py-4">
                  <div
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br shrink-0 shadow-sm",
                      selectedTemplateData?.gradient ?? "from-[hsl(var(--primary))] to-indigo-700"
                    )}
                  >
                    <Bot className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="text-[14px] font-semibold">{employeeName || "AI Employee"}</p>
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block" />
                      测试模式 · {models.find((m) => m.id === selectedModel)?.name ?? selectedModel}
                    </p>
                  </div>
                  <span className="ml-auto rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                    Sandbox
                  </span>
                </div>

                {/* Messages */}
                <div className="h-[400px] overflow-y-auto px-5 py-5 space-y-4 bg-background">
                  {chatMessages.map((msg, i) => (
                    <div
                      key={i}
                      className={cn("flex gap-3", msg.role === "user" ? "justify-end" : "justify-start")}
                    >
                      {msg.role === "assistant" && (
                        <div
                          className={cn(
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br mt-0.5 shadow-sm",
                            selectedTemplateData?.gradient ?? "from-[hsl(var(--primary))] to-indigo-700"
                          )}
                        >
                          <Bot className="h-3.5 w-3.5 text-white" />
                        </div>
                      )}
                      <div
                        className={cn(
                          "max-w-[72%] rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed",
                          msg.role === "user"
                            ? "bg-foreground text-background rounded-br-md"
                            : "bg-muted text-foreground rounded-bl-md"
                        )}
                      >
                        {msg.content}
                      </div>
                      {msg.role === "user" && (
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--primary))]/10 mt-0.5">
                          <User className="h-3.5 w-3.5 text-[hsl(var(--primary))]" />
                        </div>
                      )}
                    </div>
                  ))}
                  {isSending && (
                    <div className="flex gap-3 justify-start">
                      <div
                        className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br shadow-sm",
                          selectedTemplateData?.gradient ?? "from-[hsl(var(--primary))] to-indigo-700"
                        )}
                      >
                        <Bot className="h-3.5 w-3.5 text-white" />
                      </div>
                      <div className="rounded-2xl rounded-bl-md bg-muted px-4 py-3.5">
                        <span className="flex gap-1.5 items-center">
                          <span
                            className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-bounce"
                            style={{ animationDelay: "0ms" }}
                          />
                          <span
                            className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-bounce"
                            style={{ animationDelay: "150ms" }}
                          />
                          <span
                            className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-bounce"
                            style={{ animationDelay: "300ms" }}
                          />
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Input */}
                <div className="border-t border-border/50 bg-card/50 p-4">
                  <div className="flex gap-2.5 items-end">
                    <textarea
                      rows={1}
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault()
                          handleSend()
                        }
                      }}
                      placeholder="向你的 AI 员工发送消息..."
                      className="flex-1 w-full rounded-xl border border-border/60 bg-background px-4 py-2.5 text-[13px] ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none min-h-[42px] max-h-32 leading-relaxed"
                    />
                    <Button
                      size="icon"
                      onClick={handleSend}
                      disabled={!chatInput.trim() || isSending}
                      className="h-10 w-10 rounded-xl shrink-0"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground/30 mt-2 text-center">
                    Shift+Enter 换行 · Enter 发送
                  </p>
                </div>
              </div>

              {/* Summary */}
              <div className="rounded-2xl border border-border/50 bg-card p-5 card-shadow">
                <div className="flex items-center gap-2 mb-4">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/50">
                    准备就绪
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  {[
                    { label: "Name", value: employeeName || "—" },
                    {
                      label: "Model",
                      value: models.find((m) => m.id === selectedModel)?.name ?? selectedModel,
                    },
                    { label: "Apps", value: `${selectedApps.length} connected` },
                    {
                      label: "Skills",
                      value: `${selectedBuiltinSkills.length + customSkills.length} active`,
                    },
                  ].map((item) => (
                    <div key={item.label}>
                      <p className="text-[10px] text-muted-foreground/40 uppercase tracking-wide mb-0.5">
                        {item.label}
                      </p>
                      <p className="text-[14px] font-semibold">{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-border/60 bg-card/60 px-8 py-4">
        <div className="flex items-center justify-between max-w-5xl">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setStep((s) => s - 1)}
            disabled={step === 1}
            className="gap-1.5"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </Button>
          {step < 4 ? (
            <Button
              size="sm"
              onClick={() => setStep((s) => s + 1)}
              disabled={
                step === 1 ? !canProceed1 : step === 2 ? !canProceed2 : false
              }
              className="gap-1.5 px-6"
            >
              Continue <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button size="sm" className="gap-1.5 px-6 bg-emerald-600 hover:bg-emerald-700">
              <Check className="h-3.5 w-3.5" /> Hire Employee
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

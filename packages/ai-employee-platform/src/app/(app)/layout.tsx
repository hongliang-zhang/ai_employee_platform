"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard, Users, UserPlus, Wrench, GitBranch,
  BarChart3, TrendingUp, Settings, ChevronDown, Bell, Zap,
  CheckCircle2, AlertTriangle, Info,
} from "lucide-react"
import { useState } from "react"
import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const navSections = [
  {
    label: "Overview",
    items: [{ href: "/", icon: LayoutDashboard, label: "Dashboard" }],
  },
  {
    label: "Workforce",
    items: [
      { href: "/employees", icon: Users, label: "AI Employee Team" },
      { href: "/hire", icon: UserPlus, label: "Hire" },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/workspace", icon: Wrench, label: "Workspace" },
      { href: "/collaboration", icon: GitBranch, label: "Collaboration" },
    ],
  },
  {
    label: "Insights",
    items: [
      { href: "/analytics", icon: BarChart3, label: "Analytics" },
      { href: "/performance", icon: TrendingUp, label: "Performance" },
    ],
  },
]

const notifications = [
  { id: "n1", type: "warning", title: "Sales Assistant 需要审批", desc: "删除 45 条重复线索", time: "3分钟前", read: false },
  { id: "n2", type: "warning", title: "Customer Support Agent 需要审批", desc: "向客户退款 $124.00", time: "12分钟前", read: false },
  { id: "n3", type: "error", title: "Data Analyst 会话失败", desc: "超时连接 Linear 数据库", time: "1小时前", read: false },
  { id: "n4", type: "success", title: "周报已生成", desc: "Data Analyst 完成了 Q4 汇总报告", time: "2小时前", read: true },
  { id: "n5", type: "info", title: "Sales Assistant 已上线", desc: "雇用测试通过，已激活", time: "昨天", read: true },
]

function NavItem({ href, icon: Icon, label, active }: { href: string; icon: React.ElementType; label: string; active: boolean }) {
  return (
    <Link href={href}>
      <div
        className={cn(
          "flex items-center gap-2.5 rounded-[8px] px-2.5 py-[7px] text-[13px] font-medium transition-all duration-100",
          active
            ? "bg-[hsl(240_5%_10%)] text-[hsl(220_13%_93%)]"
            : "text-[hsl(var(--sidebar-text))] hover:bg-[hsl(240_5%_8%)] hover:text-[hsl(220_13%_80%)]"
        )}
      >
        <Icon
          className={cn("h-[15px] w-[15px] shrink-0 transition-all", active ? "opacity-90" : "opacity-35")}
        />
        {label}
      </div>
    </Link>
  )
}

function Sidebar() {
  const pathname = usePathname()
  const [notifOpen, setNotifOpen] = useState(false)
  const [readIds, setReadIds] = useState<Set<string>>(new Set(notifications.filter(n => n.read).map(n => n.id)))
  const unreadCount = notifications.filter(n => !readIds.has(n.id)).length
  const isActive = (href: string) => href === "/" ? pathname === "/" : pathname.startsWith(href)
  const markAllRead = () => setReadIds(new Set(notifications.map(n => n.id)))

  return (
    <aside
      className="flex h-screen w-[220px] flex-shrink-0 flex-col"
      style={{ background: "hsl(var(--sidebar-bg))", borderRight: "1px solid hsl(var(--sidebar-border))" }}
    >
      {/* Logo */}
      <div
        className="flex h-[52px] items-center justify-between px-4"
        style={{ borderBottom: "1px solid hsl(var(--sidebar-border))" }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-[28px] w-[28px] items-center justify-center rounded-[8px]"
            style={{
              background: "linear-gradient(135deg, hsl(237 58% 55%), hsl(220 65% 50%))",
              boxShadow: "0 0 12px hsl(237 58% 55% / 0.35)",
            }}
          >
            <Zap className="h-[13px] w-[13px] text-white" />
          </div>
          <span className="text-[13.5px] font-semibold tracking-tight" style={{ color: "hsl(220 13% 88%)", letterSpacing: "-0.01em" }}>
            AI Employee
          </span>
        </div>

        <DropdownMenu open={notifOpen} onOpenChange={setNotifOpen}>
          <DropdownMenuTrigger asChild>
            <button
              className="relative flex h-7 w-7 items-center justify-center rounded-[7px] transition-colors hover:bg-[hsl(240_5%_9%)]"
              style={{ color: "hsl(var(--sidebar-text))" }}
            >
              <Bell className="h-[14px] w-[14px]" />
              {unreadCount > 0 && (
                <span
                  className="absolute -right-0.5 -top-0.5 flex h-[14px] w-[14px] items-center justify-center rounded-full text-[8px] font-bold text-white"
                  style={{ background: "hsl(237 58% 62%)" }}
                >
                  {unreadCount}
                </span>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="start" className="w-80 p-0" sideOffset={8}>
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
              <p className="text-sm font-semibold">通知</p>
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="text-xs font-medium" style={{ color: "hsl(var(--primary))" }}>全部标为已读</button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notifications.map((n) => {
                const isRead = readIds.has(n.id)
                const Icon = n.type === "success" ? CheckCircle2 : n.type === "info" ? Info : AlertTriangle
                const iconColor = n.type === "warning" ? "text-amber-500" : n.type === "error" ? "text-red-500" : n.type === "success" ? "text-emerald-500" : "text-blue-500"
                return (
                  <div
                    key={n.id}
                    onClick={() => setReadIds(prev => new Set([...Array.from(prev), n.id]))}
                    className={cn("flex gap-2.5 px-3 py-2.5 cursor-pointer hover:bg-muted/50 transition-colors border-b border-border/40 last:border-0", !isRead && "bg-accent/40")}
                  >
                    <Icon className={cn("h-4 w-4 shrink-0 mt-0.5", iconColor)} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className={cn("text-xs font-medium truncate", !isRead ? "text-foreground" : "text-muted-foreground")}>{n.title}</p>
                        {!isRead && <span className="h-1.5 w-1.5 rounded-full shrink-0 bg-[hsl(var(--primary))]" />}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{n.desc}</p>
                      <p className="text-[10px] text-muted-foreground/60 mt-0.5">{n.time}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2.5 py-4 space-y-5">
        {navSections.map((section) => (
          <div key={section.label}>
            <p className="mb-1.5 px-2.5 section-label">{section.label}</p>
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <NavItem key={item.href} href={item.href} icon={item.icon} label={item.label} active={isActive(item.href)} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom */}
      <div className="px-2.5 pb-3 pt-2 space-y-0.5" style={{ borderTop: "1px solid hsl(var(--sidebar-border))" }}>
        <NavItem href="/settings" icon={Settings} label="Settings" active={isActive("/settings")} />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex w-full items-center gap-2.5 rounded-[8px] px-2 py-1.5 text-[13px] font-medium transition-colors hover:bg-[hsl(240_5%_8%)]"
              style={{ color: "hsl(var(--sidebar-text))" }}
            >
              <div className="relative">
                <Avatar className="h-[26px] w-[26px] shrink-0">
                  <AvatarFallback className="text-white text-[10px] font-bold" style={{ background: "linear-gradient(135deg, hsl(237 58% 55%), hsl(220 65% 50%))" }}>
                    HL
                  </AvatarFallback>
                </Avatar>
                <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500 border border-[hsl(var(--sidebar-bg))]" />
              </div>
              <span className="flex-1 text-left truncate text-[hsl(220_13%_75%)]">Hongliang</span>
              <ChevronDown className="h-3 w-3 shrink-0 opacity-30" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-52">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium">Hongliang Zhang</p>
                <p className="text-xs text-muted-foreground">zhanghl.ai@gmail.com</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Profile</DropdownMenuItem>
            <DropdownMenuItem>Billing</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive">Sign out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  )
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-[hsl(var(--background))]">
      <Sidebar />
      <main className="flex-1 overflow-y-auto app-main">
        {children}
      </main>
    </div>
  )
}

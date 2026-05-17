"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Building2,
  Users,
  Key,
  CreditCard,
  Shield,
  Plus,
  Trash2,
  Copy,
  Eye,
  EyeOff,
  ChevronRight,
} from "lucide-react"

const teamMembers = [
  { id: "1", name: "Hongliang Zhang", email: "zhanghl.ai@gmail.com", role: "Owner", avatar: "HL" },
  { id: "2", name: "Alice Chen", email: "alice@company.com", role: "Admin", avatar: "AC" },
  { id: "3", name: "Bob Liu", email: "bob@company.com", role: "Member", avatar: "BL" },
]

const apiKeys = [
  { id: "k1", name: "Production API Key", prefix: "crews_live_...a4f2", created: "2026-03-15", lastUsed: "Today" },
  { id: "k2", name: "Development Key", prefix: "crews_test_...b9c1", created: "2026-04-01", lastUsed: "2 days ago" },
]

export default function SettingsPage() {
  const [showKey, setShowKey] = useState<string | null>(null)

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage your organization, team, and access</p>
      </div>

      <Tabs defaultValue="organization" className="space-y-5">
        <TabsList className="h-8">
          <TabsTrigger value="organization" className="text-xs h-7">Organization</TabsTrigger>
          <TabsTrigger value="team" className="text-xs h-7">Team</TabsTrigger>
          <TabsTrigger value="api" className="text-xs h-7">API Keys</TabsTrigger>
          <TabsTrigger value="billing" className="text-xs h-7">Billing</TabsTrigger>
        </TabsList>

        {/* ── Organization ── */}
        <TabsContent value="organization">
          <Card className="border-border/60">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                Organization Profile
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Organization Name</Label>
                  <Input defaultValue="My Company" className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Slug</Label>
                  <div className="flex h-8 items-center rounded-lg border border-border bg-muted px-3 text-sm text-muted-foreground">
                    crews.app/<span className="text-foreground font-medium">my-company</span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Industry</Label>
                  <Input defaultValue="Technology" className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Company Size</Label>
                  <Input defaultValue="11-50 employees" className="h-8 text-sm" />
                </div>
              </div>
              <div className="flex justify-end">
                <Button size="sm" className="h-8 text-xs">Save changes</Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60 mt-4">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-sm text-destructive">
                <Shield className="h-4 w-4" />
                Danger Zone
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between rounded-lg border border-destructive/30 p-3">
                <div>
                  <p className="text-sm font-medium">Delete organization</p>
                  <p className="text-xs text-muted-foreground">Permanently delete all employees, data, and billing.</p>
                </div>
                <Button variant="outline" size="sm" className="h-7 text-xs text-destructive border-destructive/30 hover:bg-destructive/10">
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Team ── */}
        <TabsContent value="team">
          <Card className="border-border/60">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    Team Members
                  </CardTitle>
                  <CardDescription className="text-xs mt-0.5">{teamMembers.length} members</CardDescription>
                </div>
                <Button size="sm" className="h-8 gap-1.5 text-xs">
                  <Plus className="h-3.5 w-3.5" /> Invite member
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {teamMembers.map((m) => (
                <div key={m.id} className="flex items-center gap-3 rounded-lg border border-border/60 p-3 hover:border-border transition-colors">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100">
                    <span className="text-xs font-bold text-indigo-700">{m.avatar}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{m.name}</p>
                    <p className="text-xs text-muted-foreground">{m.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={m.role === "Owner" ? "default" : m.role === "Admin" ? "secondary" : "outline"} className="text-[10px]">
                      {m.role}
                    </Badge>
                    {m.role !== "Owner" && (
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── API Keys ── */}
        <TabsContent value="api">
          <Card className="border-border/60">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Key className="h-4 w-4 text-muted-foreground" />
                    API Keys
                  </CardTitle>
                  <CardDescription className="text-xs mt-0.5">Use these to trigger employees from external systems</CardDescription>
                </div>
                <Button size="sm" className="h-8 gap-1.5 text-xs">
                  <Plus className="h-3.5 w-3.5" /> New key
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {apiKeys.map((k) => (
                <div key={k.id} className="flex items-center gap-3 rounded-lg border border-border/60 p-3 hover:border-border transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{k.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <code className="text-xs text-muted-foreground font-mono">
                        {showKey === k.id ? "crews_live_sk_a4f2e8b1c9..." : k.prefix}
                      </code>
                      <button
                        onClick={() => setShowKey(showKey === k.id ? null : k.id)}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showKey === k.id ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      </button>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">Created {k.created} · Last used {k.lastUsed}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Billing ── */}
        <TabsContent value="billing">
          <Card className="border-border/60 mb-4">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <CreditCard className="h-4 w-4 text-muted-foreground" />
                Current Plan
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between p-4 rounded-xl bg-gradient-to-br from-indigo-600 to-indigo-700 text-white">
                <div>
                  <p className="text-sm font-semibold">Growth Plan</p>
                  <p className="text-xs text-white/70 mt-0.5">5 AI employees · Unlimited sessions</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold">$99</p>
                  <p className="text-xs text-white/70">per month</p>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                {[
                  { label: "AI Employees", used: 3, limit: 5 },
                  { label: "Sessions this month", used: 616, limit: 2000 },
                  { label: "API calls", used: 1240, limit: 5000 },
                ].map((item) => (
                  <div key={item.label}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">{item.label}</span>
                      <span className="font-medium">{item.used} / {item.limit.toLocaleString()}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-indigo-600 transition-all"
                        style={{ width: `${(item.used / item.limit) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Upgrade Plan</CardTitle>
              <CardDescription className="text-xs">Unlock more employees and higher limits</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-2">
                {[
                  { name: "Pro", price: "$249", employees: "15 employees", highlight: false },
                  { name: "Enterprise", price: "Custom", employees: "Unlimited", highlight: true },
                ].map((plan) => (
                  <div key={plan.name} className={`rounded-xl border p-4 ${plan.highlight ? "border-indigo-400 bg-indigo-50" : "border-border"}`}>
                    <p className="text-sm font-semibold">{plan.name}</p>
                    <p className="text-xl font-bold mt-1">{plan.price}<span className="text-xs font-normal text-muted-foreground">/mo</span></p>
                    <p className="text-xs text-muted-foreground mt-1">{plan.employees}</p>
                    <Button size="sm" className={`mt-3 h-7 w-full text-xs ${plan.highlight ? "" : "variant-outline"}`} variant={plan.highlight ? "default" : "outline"}>
                      {plan.highlight ? "Contact sales" : "Upgrade"}
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

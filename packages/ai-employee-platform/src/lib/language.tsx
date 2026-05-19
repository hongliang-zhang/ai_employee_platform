"use client"

import { createContext, useContext, useEffect, useMemo, useState } from "react"

export type Language = "en" | "zh"

type Dictionary = Record<string, { en: string; zh: string }>

const dictionary: Dictionary = {
  "app.name": { en: "AI Employee", zh: "AI 员工" },
  "nav.overview": { en: "Overview", zh: "总览" },
  "nav.dashboard": { en: "Dashboard", zh: "仪表盘" },
  "nav.workforce": { en: "Workforce", zh: "员工团队" },
  "nav.team": { en: "AI Employee Team", zh: "AI 员工团队" },
  "nav.hire": { en: "Hire", zh: "招聘" },
  "nav.operations": { en: "Operations", zh: "运营" },
  "nav.workspace": { en: "Workspace", zh: "工作区" },
  "nav.collaboration": { en: "Collaboration", zh: "协作" },
  "nav.insights": { en: "Insights", zh: "洞察" },
  "nav.analytics": { en: "Analytics", zh: "分析" },
  "nav.performance": { en: "Performance", zh: "绩效" },
  "nav.settings": { en: "Settings", zh: "设置" },
  "top.getReward": { en: "Get $25", zh: "领取 $25" },
  "top.help": { en: "Help", zh: "帮助" },
  "top.settings": { en: "Settings", zh: "设置" },
  "language.label": { en: "Language", zh: "语言" },
  "language.english": { en: "English", zh: "English" },
  "language.chinese": { en: "中文", zh: "中文" },
  "dashboard.greeting": { en: "Good afternoon, Hongliang", zh: "下午好，Hongliang" },
  "dashboard.subtitle": { en: "SLMobbin Workspace · AI Employee operating system", zh: "SLMobbin Workspace · AI 员工操作系统" },
  "dashboard.hire": { en: "Hire employee", zh: "招聘员工" },
  "workspace.title": { en: "Workspace", zh: "工作区" },
  "workspace.subtitle": { en: "Each team has a shared file system agents use as common context.", zh: "每个团队都有共享文件系统，Agent 会把它作为共同上下文。" },
  "workspace.newTeam": { en: "New Team", zh: "新建团队" },
  "workspace.teams": { en: "Teams", zh: "团队" },
  "workspace.totalAgents": { en: "Total Agents", zh: "Agent 总数" },
  "workspace.contextFiles": { en: "Context Files", zh: "上下文文件" },
  "workspace.newTeamHint": { en: "Group agents around a shared purpose", zh: "围绕共同目标组织 Agent" },
  "workspace.createTitle": { en: "Create team workspace", zh: "创建团队工作区" },
  "workspace.createSubtitle": { en: "Set up the shared file system agents will read as team context.", zh: "设置 Agent 会作为团队上下文读取的共享文件系统。" },
  "workspace.teamIdentity": { en: "Team identity", zh: "团队信息" },
  "workspace.namePlaceholder": { en: "e.g., Finance Operations", zh: "例如：财务运营" },
  "workspace.descriptionPlaceholder": { en: "What should this team be responsible for?", zh: "这个团队负责什么？" },
  "workspace.starterFs": { en: "Starter file system", zh: "初始文件系统" },
  "workspace.initialMembers": { en: "Initial members", zh: "初始成员" },
  "workspace.filePreview": { en: "File preview", zh: "文件预览" },
  "workspace.createFootnote": { en: "You can add more files and members after creation.", zh: "创建后仍可继续添加文件和成员。" },
  "workspace.cancel": { en: "Cancel", zh: "取消" },
  "workspace.createTeam": { en: "Create Team", zh: "创建团队" },
  "workspace.allTeams": { en: "All Teams", zh: "全部团队" },
  "workspace.members": { en: "Members", zh: "成员" },
  "workspace.teamFileSystem": { en: "Team File System", zh: "团队文件系统" },
  "workspace.addMember": { en: "Add Member", zh: "添加成员" },
  "workspace.uploadFile": { en: "Upload file", zh: "上传文件" },
  "workspace.filesRead": { en: "files · Read by every agent before work starts", zh: "个文件 · 每个 Agent 工作前都会读取" },
  "collaboration.title": { en: "Collaboration", zh: "协作" },
  "collaboration.subtitle": { en: "Manage human-AI workflows and task execution", zh: "管理人机协作流程与任务执行" },
  "collaboration.tasks": { en: "Tasks", zh: "任务" },
  "collaboration.approvals": { en: "Approvals", zh: "审批" },
  "collaboration.scheduled": { en: "Scheduled", zh: "定时任务" },
  "collaboration.recent": { en: "Recent task activity across your AI team", zh: "AI 团队最近的任务动态" },
  "collaboration.assignTask": { en: "Assign Task", zh: "分配任务" },
  "collaboration.needsHuman": { en: "Needs Human", zh: "需要人工" },
  "collaboration.automated": { en: "Automated", zh: "自动执行" },
}

type LanguageContextValue = {
  language: Language
  setLanguage: (language: Language) => void
  t: (key: string) => string
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>("en")

  useEffect(() => {
    const saved = window.localStorage.getItem("ai-employee-language")
    if (saved === "zh" || saved === "en") {
      setLanguageState(saved)
    }
  }, [])

  const setLanguage = (nextLanguage: Language) => {
    setLanguageState(nextLanguage)
    window.localStorage.setItem("ai-employee-language", nextLanguage)
  }

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage,
      t: (key) => dictionary[key]?.[language] ?? key,
    }),
    [language]
  )

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (!context) {
    throw new Error("useLanguage must be used within LanguageProvider")
  }
  return context
}

export function LanguageText({ id }: { id: string }) {
  const { t } = useLanguage()
  return <>{t(id)}</>
}

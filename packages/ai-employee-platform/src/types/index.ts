export interface AIEmployee {
  id: string
  name: string
  role: string
  description: string
  avatar?: string
  status: 'active' | 'inactive' | 'testing'
  model: string
  environment: 'limited' | 'unrestricted'
  skills: string[]
  createdAt: string
  updatedAt: string
}

export interface EmployeeTemplate {
  id: string
  name: string
  role: string
  description: string
  category: string
  systemPrompt: string
  skills: string[]
  icon?: string
}

export interface Session {
  id: string
  employeeId: string
  status: 'running' | 'completed' | 'failed'
  startTime: string
  endTime?: string
  messages: Message[]
  tokenUsage: number
}

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
  toolCalls?: ToolCall[]
}

export interface ToolCall {
  id: string
  name: string
  arguments: Record<string, any>
  result?: any
}

export interface Analytics {
  totalSessions: number
  totalTokens: number
  successRate: number
  averageResponseTime: number
  activeEmployees: number
}

export interface Credential {
  id: string
  name: string
  type: string
  lastUsed?: string
}

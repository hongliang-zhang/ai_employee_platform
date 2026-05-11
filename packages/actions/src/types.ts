export interface ActionDefinition {
  name: string
  description: string
  inputSchema: JSONSchema
  execute(input: unknown, context: ActionContext): Promise<unknown>
}

export interface ActionContext {
  agentId: string
  conversationId: string
}

export type JSONSchema = {
  type: string
  properties?: Record<string, { type: string; description?: string }>
  required?: string[]
  [key: string]: unknown
}

export interface ActionDefinition {
  name: string
  description: string
  inputSchema: {
    type: string
    properties?: Record<string, { type: string; description?: string }>
    required?: string[]
    [key: string]: unknown
  }
}

export type PiTextBlock = { type: 'text'; text: string }
export type PiToolCallBlock = { type: 'toolCall'; name: string; id: string; input: unknown }
export type PiToolResultBlock = { type: 'toolResult'; toolUseId: string; content: PiTextBlock[] }
export type PiContentBlock = PiTextBlock | PiToolCallBlock | PiToolResultBlock

export interface SessionEvent {
  role: 'user' | 'assistant' | 'toolResult'
  content: PiContentBlock[]
}

export interface EmitResult {
  conversation_id: string
  appended: { seq: string; role: string; created_at: string }[]
  last_event_id: string
}

export interface ListResult {
  conversation_id: string
  events: (SessionEvent & { seq: string; created_at: string })[]
  last_event_id: string | null
}

export interface PresignOperation {
  action: 'upload' | 'download'
  path: string
}

export interface PresignedUrl {
  path: string
  url: string
  expires_in: number
}

export interface RemoteFile {
  path: string
  size: number
  last_modified: string
}

export class GatewayClient {
  constructor(
    private readonly gatewayUrl: string,
    private readonly token: string,
  ) {}

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.token}`,
    }
  }

  private async request<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.gatewayUrl}${path}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      const code = (data as any)?.error?.code ?? `http_${res.status}`
      throw new Error(code)
    }
    return res.json() as Promise<T>
  }

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.gatewayUrl}${path}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${this.token}` },
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      const code = (data as any)?.error?.code ?? `http_${res.status}`
      throw new Error(code)
    }
    return res.json() as Promise<T>
  }

  async emitEvents(
    expectedLastEventId: string | null,
    events: SessionEvent[],
  ): Promise<EmitResult> {
    return this.request('/gateway/events/emit', {
      expected_last_event_id: expectedLastEventId,
      events,
    })
  }

  async listEvents(afterEventId?: string): Promise<ListResult> {
    return this.request('/gateway/events/list', afterEventId ? { after_event_id: afterEventId } : {})
  }

  async presignUrls(operations: PresignOperation[]): Promise<PresignedUrl[]> {
    const data = await this.request<{ urls: PresignedUrl[] }>('/gateway/storage/presign', { operations })
    return data.urls
  }

  async listFiles(prefix: 'shared' | 'conversation'): Promise<RemoteFile[]> {
    const data = await this.request<{ files: RemoteFile[] }>('/gateway/storage/list', { prefix })
    return data.files
  }

  async invokeAction(action: string, input: unknown): Promise<unknown> {
    const res = await this.request<{ result: unknown }>('/gateway/actions/invoke', { action, input })
    return res.result
  }

  async listActions(): Promise<ActionDefinition[]> {
    const res = await this.get<{ actions: ActionDefinition[] }>('/gateway/actions/list')
    return res.actions
  }
}

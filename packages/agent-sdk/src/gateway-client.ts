export interface GatewayMessage {
  role: string
  content: Array<{ type: string; text?: string; [key: string]: unknown }>
  source: 'sandbox'
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

  async appendMessages(
    expectedLastMessageId: string | null,
    messages: GatewayMessage[],
  ): Promise<{ last_message_id: string }> {
    return this.request('/gateway/messages/append', {
      expected_last_message_id: expectedLastMessageId,
      messages,
    })
  }

  async presignUrls(operations: PresignOperation[]): Promise<PresignedUrl[]> {
    const data = await this.request<{ urls: PresignedUrl[] }>('/gateway/storage/presign', { operations })
    return data.urls
  }

  async listFiles(prefix: 'shared' | 'conversation'): Promise<RemoteFile[]> {
    const data = await this.request<{ files: RemoteFile[] }>('/gateway/storage/list', { prefix })
    return data.files
  }
}

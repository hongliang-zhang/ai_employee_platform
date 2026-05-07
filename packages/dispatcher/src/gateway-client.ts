export interface AppendResult {
  conversation_id: string
  appended: { id: string; role: string; created_at: string }[]
  last_message_id: string
}

export interface LoadResult {
  conversation_id: string
  messages: { id: string; role: string; content: any[]; source: string; created_at: string }[]
  last_message_id: string | null
}

export function createGatewayClient(gatewayUrl: string, _defaultToken?: string) {
  const base = gatewayUrl.replace(/\/$/, '')

  async function post(path: string, body: unknown, token: string): Promise<any> {
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    })
    const data = await res.json()
    if (!res.ok) {
      throw new Error(data?.error?.code ?? `HTTP ${res.status}`)
    }
    return data
  }

  return {
    // 把 IM 里收到的用户消息写入会话历史
    async appendMessages(
      expectedLastMessageId: string | null,
      messages: any[],
      token: string
    ): Promise<AppendResult> {
      return post('/gateway/messages/append', { expected_last_message_id: expectedLastMessageId, messages }, token)
    },

    async loadMessages(
      afterMessageId: string | null | undefined,
      token: string
    ): Promise<LoadResult> {
      return post('/gateway/messages/load', afterMessageId ? { after_message_id: afterMessageId } : {}, token)
    },
  }
}

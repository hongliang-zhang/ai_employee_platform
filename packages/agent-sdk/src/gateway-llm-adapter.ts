import type {
  ApiProvider,
  AssistantMessage,
  AssistantMessageEventStream,
  Context,
  SimpleStreamOptions,
} from '@mariozechner/pi-ai'

const GATEWAY_PROVIDER = 'gateway' as const
const GATEWAY_LLM_API = 'gateway-llm' as const

function makeAssistantMessage(
  text: string,
  modelId: string,
  inputTokens: number,
  outputTokens: number,
  stopReason: 'stop' | 'error' = 'stop',
  errorMessage?: string,
): AssistantMessage {
  const zeroUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }
  return {
    role: 'assistant',
    content: text ? [{ type: 'text', text }] : [],
    api: GATEWAY_LLM_API,
    provider: GATEWAY_PROVIDER,
    model: modelId,
    usage: { ...zeroUsage, input: inputTokens, output: outputTokens, totalTokens: inputTokens + outputTokens },
    stopReason,
    errorMessage,
    timestamp: Date.now(),
  } as unknown as AssistantMessage
}

export function createGatewayLlmProvider(
  gatewayUrl: string,
  token: string,
): ApiProvider<typeof GATEWAY_LLM_API, SimpleStreamOptions> {
  const baseUrl = gatewayUrl.replace(/\/$/, '')

  function streamSimple(
    model: { id: string; api: string },
    context: Context,
    _options?: SimpleStreamOptions,
  ): AssistantMessageEventStream {
    return (async function* () {
      const emptyPartial = makeAssistantMessage('', model.id, 0, 0)
      yield { type: 'start' as const, partial: emptyPartial }

      const messages = context.messages.map((m: any) => ({ role: m.role, content: m.content }))

      const res = await fetch(`${baseUrl}/gateway/llm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ model: model.id, messages }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const errMsg = (data as any)?.error?.message ?? `http_${res.status}`
        const errMessage = makeAssistantMessage('', model.id, 0, 0, 'error', errMsg)
        yield { type: 'error' as const, reason: 'error' as const, error: errMessage }
        return
      }

      const data = await res.json() as {
        message: { role: string; content: any[]; tool_calls: any[] }
        usage: { input_tokens: number; output_tokens: number; total_tokens: number }
      }

      const textBlock = data.message.content.find((b: any) => b.type === 'text')
      const text = textBlock?.text ?? ''
      const { input_tokens, output_tokens } = data.usage

      const partial = makeAssistantMessage(text, model.id, input_tokens, output_tokens)
      yield { type: 'text_start' as const, contentIndex: 0, partial }
      yield { type: 'text_delta' as const, contentIndex: 0, delta: text, partial }
      yield { type: 'text_end' as const, contentIndex: 0, content: text, partial }
      yield { type: 'done' as const, reason: 'stop' as const, message: partial }
    })() as AssistantMessageEventStream
  }

  return {
    api: GATEWAY_LLM_API,
    stream: streamSimple as any,
    streamSimple,
  }
}

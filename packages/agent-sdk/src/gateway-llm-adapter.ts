import type {
  Api,
  ApiProvider,
  AssistantMessage as PiAssistantMessage,
  AssistantMessageEventStream as PiAssistantMessageEventStream,
  Context,
  Provider,
  SimpleStreamOptions,
} from '@mariozechner/pi-ai'
import { createAssistantMessageEventStream } from '@mariozechner/pi-ai'
import { logger } from './logger.js'

const GATEWAY_PROVIDER = 'gateway' as const
const GATEWAY_LLM_API = 'gateway-llm' as const

function makeAssistantMessage(
  text: string,
  modelId: string,
  inputTokens: number,
  outputTokens: number,
  stopReason: 'stop' | 'error' = 'stop',
  errorMessage?: string,
): PiAssistantMessage {
  const zeroUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }
  return {
    role: 'assistant',
    content: text ? [{ type: 'text', text }] : [],
    api: GATEWAY_LLM_API as Api,
    provider: GATEWAY_PROVIDER as Provider,
    model: modelId,
    usage: { ...zeroUsage, input: inputTokens, output: outputTokens, totalTokens: inputTokens + outputTokens },
    stopReason,
    errorMessage,
    timestamp: Date.now(),
  } as PiAssistantMessage
}

export function createGatewayLlmProvider(
  gatewayUrl: string,
  token: string,
): ApiProvider<typeof GATEWAY_LLM_API, SimpleStreamOptions> {
  const baseUrl = gatewayUrl.replace(/\/$/, '')

  function streamSimple(
    model: { id: string; api: string },
    context: Context,
    _options?: SimpleStreamOptions, // options ignored: gateway /llm is non-streaming
  ): PiAssistantMessageEventStream {
    const stream = createAssistantMessageEventStream()

    // Run async; push events into the AssistantMessageEventStream
    // so agent-loop can call .result() to get the final message.
    ;(async () => {
      const emptyPartial = makeAssistantMessage('', model.id, 0, 0)
      stream.push({ type: 'start', partial: emptyPartial })

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
        stream.push({ type: 'error', reason: 'error', error: errMessage })
        return
      }

      const data = await res.json() as {
        message: { role: string; content: any[]; tool_calls: any[] }
        usage: { input_tokens: number; output_tokens: number; total_tokens: number }
      }

      const textBlock = data.message.content.find((b: any) => b.type === 'text')
      const text = textBlock?.text ?? ''
      const { input_tokens, output_tokens } = data.usage

      if (data.message.tool_calls && data.message.tool_calls.length > 0) {
          logger.warn({ event: 'gateway_llm.tool_calls_ignored' })
      }

      const partial = makeAssistantMessage(text, model.id, input_tokens, output_tokens)
      stream.push({ type: 'text_start', contentIndex: 0, partial })
      stream.push({ type: 'text_delta', contentIndex: 0, delta: text, partial })
      stream.push({ type: 'text_end', contentIndex: 0, content: text, partial })
      stream.push({ type: 'done', reason: 'stop', message: partial })
    })().catch((err) => {
      logger.error({ event: 'gateway_llm.stream_error', error: String(err) })
      const errMessage = makeAssistantMessage('', model.id, 0, 0, 'error', String(err))
      // streamSimple returns the stream synchronously, so async failures must be
      // propagated to callers through the stream's terminal error event. Rethrowing
      // here would only create an unhandled rejection after the stream is returned.
      stream.push({ type: 'error', reason: 'error', error: errMessage })
    })

    return stream
  }

  return {
    api: GATEWAY_LLM_API,
    // Gateway /llm is non-streaming; stream() degrades to streamSimple() since
    // tool-call handling is not needed for the current gateway model.
    stream: streamSimple as any,
    streamSimple,
  }
}

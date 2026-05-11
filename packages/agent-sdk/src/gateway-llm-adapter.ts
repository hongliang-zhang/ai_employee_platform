import type {
  Api,
  ApiProvider,
  AssistantMessage as PiAssistantMessage,
  AssistantMessageEventStream as PiAssistantMessageEventStream,
  Context,
  Provider,
  SimpleStreamOptions,
  TextContent,
  ToolCall as PiToolCall,
} from '@mariozechner/pi-ai'
import { createAssistantMessageEventStream } from '@mariozechner/pi-ai'
import { logger } from './logger.js'

const GATEWAY_PROVIDER = 'gateway' as const
const GATEWAY_LLM_API = 'gateway-llm' as const

function makeAssistantMessage(
  text: string,
  toolCalls: PiToolCall[],
  modelId: string,
  inputTokens: number,
  outputTokens: number,
  stopReason: 'stop' | 'toolUse' | 'error' = 'stop',
  errorMessage?: string,
): PiAssistantMessage {
  const zeroUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }
  const content: (TextContent | PiToolCall)[] = []
  if (text) content.push({ type: 'text', text })
  for (const tc of toolCalls) content.push(tc)
  return {
    role: 'assistant',
    content,
    api: GATEWAY_LLM_API as Api,
    provider: GATEWAY_PROVIDER as Provider,
    model: modelId,
    usage: { ...zeroUsage, input: inputTokens, output: outputTokens, totalTokens: inputTokens + outputTokens },
    stopReason,
    errorMessage,
    timestamp: Date.now(),
  } as PiAssistantMessage
}

// Convert a raw tool_call from the gateway (OpenAI-compatible format) to pi-ai's ToolCall.
// OpenAI returns arguments as a JSON string; pi-ai expects a parsed object.
function parseRawToolCall(tc: any): PiToolCall {
  const args = tc.function?.arguments
  return {
    type: 'toolCall',
    id: tc.id ?? '',
    name: tc.function?.name ?? tc.name ?? '',
    arguments: typeof args === 'string' ? JSON.parse(args) : (args ?? {}),
  }
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
      const emptyPartial = makeAssistantMessage('', [], model.id, 0, 0)
      stream.push({ type: 'start', partial: emptyPartial })

      // Convert messages, preserving tool_calls and tool_result roles for multi-turn
      const messages = context.messages.map((m: any) => {
        if (m.role === 'assistant' && Array.isArray(m.content)) {
          const toolCalls = m.content.filter((b: any) => b.type === 'toolCall')
          if (toolCalls.length > 0) {
            return {
              role: 'assistant',
              content: m.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('') || null,
              tool_calls: toolCalls.map((tc: PiToolCall) => ({
                id: tc.id,
                type: 'function',
                function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
              })),
            }
          }
        }
        if (m.role === 'toolResult') {
          return {
            role: 'tool',
            tool_call_id: m.toolCallId,
            content: m.content.map((b: any) => b.text ?? '').join(''),
          }
        }
        return { role: m.role, content: m.content }
      })

      // Convert pi-ai Tool[] to OpenAI function format.
      // NOTE: Gateway currently forwards tools as-is to the upstream LLM without format conversion.
      // This means the format here is tightly coupled to the upstream provider (currently glm-5.1,
      // which is OpenAI-compatible). If the upstream switches to Anthropic or another provider with
      // a different tool schema format, both this adapter and gateway/routes/llm.ts need to be updated.
      // Long-term fix: gateway should own the format conversion based on the model/provider.
      const tools = context.tools?.length
        ? context.tools.map(t => ({
            type: 'function',
            function: { name: t.name, description: t.description, parameters: t.parameters },
          }))
        : undefined

      const res = await fetch(`${baseUrl}/gateway/llm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ model: model.id, messages, ...(tools ? { tools } : {}) }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const errMsg = (data as any)?.error?.message ?? `http_${res.status}`
        const errMessage = makeAssistantMessage('', [], model.id, 0, 0, 'error', errMsg)
        stream.push({ type: 'error', reason: 'error', error: errMessage })
        return
      }

      const data = await res.json() as {
        message: { role: string; content: any[]; tool_calls: any[] }
        usage: { input_tokens: number; output_tokens: number; total_tokens: number }
      }

      const textBlock = data.message.content?.find((b: any) => b.type === 'text')
      const text = textBlock?.text ?? ''
      const { input_tokens, output_tokens } = data.usage

      const rawToolCalls: any[] = data.message.tool_calls ?? []
      const piToolCalls: PiToolCall[] = rawToolCalls.map(parseRawToolCall)
      const hasToolCalls = piToolCalls.length > 0
      const stopReason = hasToolCalls ? 'toolUse' as const : 'stop' as const

      const partial = makeAssistantMessage(text, piToolCalls, model.id, input_tokens, output_tokens, stopReason)

      if (text) {
        const textIndex = 0
        stream.push({ type: 'text_start', contentIndex: textIndex, partial })
        stream.push({ type: 'text_delta', contentIndex: textIndex, delta: text, partial })
        stream.push({ type: 'text_end', contentIndex: textIndex, content: text, partial })
      }

      // Emit toolcall_end for each tool call so pi-coding-agent can execute them
      piToolCalls.forEach((toolCall, i) => {
        const contentIndex = text ? i + 1 : i
        stream.push({ type: 'toolcall_end', contentIndex, toolCall, partial })
      })

      stream.push({ type: 'done', reason: stopReason, message: partial })
    })().catch((err) => {
      logger.error({ event: 'gateway_llm.stream_error', error: String(err) })
      const errMessage = makeAssistantMessage('', [], model.id, 0, 0, 'error', String(err))
      // streamSimple returns the stream synchronously, so async failures must be
      // propagated to callers through the stream's terminal error event. Rethrowing
      // here would only create an unhandled rejection after the stream is returned.
      stream.push({ type: 'error', reason: 'error', error: errMessage })
    })

    return stream
  }

  return {
    api: GATEWAY_LLM_API,
    stream: streamSimple as any,
    streamSimple,
  }
}

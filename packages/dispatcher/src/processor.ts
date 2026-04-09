import type { NormalizedMessage } from './normalize.js'
import pino from 'pino'
import { createId } from '@paralleldrive/cuid2'

const logger = pino({ transport: { target: 'pino-pretty' } })

interface Agent {
  id: string
  e2b_template_id: string
  port: number
  idle_timeout_ms: number
}

export function createProcessor(deps: {
  conversation: ReturnType<typeof import('./conversation.js').createConversationManager>
  jobs: ReturnType<typeof import('./inbound-jobs.js').createInboundJobsManager>
  gateway: ReturnType<typeof import('./gateway-client.js').createGatewayClient>
  sandbox: ReturnType<typeof import('./sandbox.js').createSandboxOrchestrator>
  telegram: ReturnType<typeof import('./telegram.js').createTelegramClient>
  jwt: ReturnType<typeof import('./jwt.js').createJwtSigner>
  agent: Agent
}) {
  const { conversation, jobs, gateway, sandbox, telegram, jwt, agent } = deps
  const UNAVAILABLE_MSG = '服务暂时不可用，请稍后重试'

  return {
    async handle(msg: NormalizedMessage): Promise<void> {
      const traceId = 'tr_' + createId()
      logger.info({ event: 'message.received', trace_id: traceId, channel_key: msg.channel_key, external_message_id: msg.external_message_id })

      // [2] UPSERT conversation (must precede inbound_jobs insert for FK)
      const { conversationId } = await conversation.upsert({
        agentId: agent.id,
        channelKey: msg.channel_key,
        externalChatId: msg.external_chat_id,
        externalThreadKey: msg.external_thread_key,
      })

      // [3] Dedup
      const inserted = await jobs.tryInsert(msg.channel_key, msg.external_message_id, conversationId)
      if (!inserted) {
        logger.info({ event: 'message.deduplicated', trace_id: traceId, external_message_id: msg.external_message_id })
        return
      }

      // [4] Append user message to gateway history
      const expectedLastId = conversation.getLastMessageId(conversationId)
      const dispatcherToken = jwt.signDispatcherToken(conversationId, agent.id)

      let appendResult
      try {
        appendResult = await retryWithBackoff(() =>
          gateway.appendMessages(
            conversationId,
            expectedLastId,
            [{ role: 'user', content: [{ type: 'text', text: msg.content.text }], source: 'im', external_message_id: msg.external_message_id }],
            dispatcherToken
          )
        )
        conversation.setLastMessageId(conversationId, appendResult.last_message_id)
      } catch (err) {
        await jobs.markFailed(msg.channel_key, msg.external_message_id)
        await telegram.sendMessage(msg.external_chat_id, UNAVAILABLE_MSG)
        return
      }

      // [5] Mark processing
      await jobs.markProcessing(msg.channel_key, msg.external_message_id)

      // [6] Get or create sandbox
      const sandboxToken = jwt.signSandboxToken(conversationId, agent.id)
      let sandboxEntry
      try {
        await telegram.sendChatAction(msg.external_chat_id)
        sandboxEntry = await sandbox.getOrCreate(conversationId, agent.e2b_template_id, agent.port, sandboxToken, agent.idle_timeout_ms)
      } catch (err) {
        logger.error({ event: 'sandbox.error', trace_id: traceId, conversation_id: conversationId, error: String(err) })
        await jobs.markFailed(msg.channel_key, msg.external_message_id)
        await telegram.sendMessage(msg.external_chat_id, UNAVAILABLE_MSG)
        return
      }

      // [7] POST /chat
      let reply: string
      try {
        const chatRes = await fetch(`${sandboxEntry.chatUrl}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Trace-Id': traceId },
          body: JSON.stringify({ message: msg.content.text }),
          signal: AbortSignal.timeout(60_000),
        })
        if (!chatRes.ok) throw new Error(`sandbox returned ${chatRes.status}`)
        const chatBody: any = await chatRes.json()
        reply = chatBody.reply
      } catch (err) {
        logger.error({ event: 'chat.error', trace_id: traceId, conversation_id: conversationId, error: String(err) })
        await jobs.markFailed(msg.channel_key, msg.external_message_id)
        await telegram.sendMessage(msg.external_chat_id, UNAVAILABLE_MSG)
        return
      }

      // [8] Deliver reply
      await telegram.sendMessage(msg.external_chat_id, reply)
      logger.info({ event: 'reply.delivered', trace_id: traceId, conversation_id: conversationId })

      // [9] Mark done
      await jobs.markDone(msg.channel_key, msg.external_message_id)
    },
  }
}

async function retryWithBackoff<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < maxAttempts; i++) {
    try { return await fn() } catch (err) {
      lastErr = err
      await new Promise(r => setTimeout(r, 200 * 2 ** i))
    }
  }
  throw lastErr
}

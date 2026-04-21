import type { NormalizedMessage } from './normalize.js'
import type { IMClient } from './im-client.js'
import pino from 'pino'
import { createId } from '@paralleldrive/cuid2'
import { retryWithBackoff } from './utils.js'

const logger = pino({ transport: { target: 'pino-pretty' } })

interface Agent {
  id: string
  e2bTemplateId: string
  port: number
  idleTimeoutMs: number
}

export function createProcessor(deps: {
  conversation: ReturnType<typeof import('./conversation.js').createConversationManager>
  jobs: ReturnType<typeof import('./inbound-jobs.js').createInboundJobsManager>
  gateway: ReturnType<typeof import('./gateway-client.js').createGatewayClient>
  sandbox: ReturnType<typeof import('./sandbox.js').createSandboxOrchestrator>
  im: IMClient
  jwt: ReturnType<typeof import('./jwt.js').createJwtSigner>
  agent: Agent
}) {
  const { conversation, jobs, gateway, sandbox, im, jwt, agent } = deps
  const UNAVAILABLE_MSG = '服务暂时不可用，请稍后重试'

  return {
    async handle(msg: NormalizedMessage): Promise<void> {
      const traceId = 'tr_' + createId()
      const handleStart = Date.now()
      logger.info({ event: 'message.received', trace_id: traceId, channel_key: msg.channel_key, external_message_id: msg.external_message_id })

      // Upsert conversation — must happen before inbound_jobs insert (FK constraint)
      const { conversationId } = await conversation.upsert({
        agentId: agent.id,
        channelKey: msg.channel_key,
        externalChatId: msg.external_chat_id,
        externalThreadKey: msg.external_thread_key,
      })

      // Dedup — drop if already seen
      const inserted = await jobs.tryInsert(msg.channel_key, msg.external_message_id, conversationId)
      if (!inserted) {
        logger.info({ event: 'message.deduplicated', trace_id: traceId, external_message_id: msg.external_message_id })
        return
      }

      // Shared failure handler: log, mark job failed, notify user
      const fail = async (event: string, err: unknown) => {
        logger.error({ event, trace_id: traceId, conversation_id: conversationId, error: String(err) })
        await jobs.markFailed(msg.channel_key, msg.external_message_id)
        await im.sendMessage(msg.external_chat_id, UNAVAILABLE_MSG)
      }

      // Append user message to conversation history
      const dispatcherToken = jwt.signDispatcherToken(conversationId, agent.id)
      try {
        const result = await retryWithBackoff(() =>
          gateway.appendMessages(
            conversationId,
            conversation.getLastMessageId(conversationId),
            [{ role: 'user', content: [{ type: 'text', text: msg.content.text }], source: 'im', external_message_id: msg.external_message_id }],
            dispatcherToken
          )
        )
        conversation.setLastMessageId(conversationId, result.last_message_id)
      } catch (err) {
        await fail('append.error', err)
        return
      }

      await jobs.markProcessing(msg.channel_key, msg.external_message_id)
      await im.sendChatAction(msg.external_chat_id)

      // Dispatch to sandbox — on 5xx, destroy stale entry so the next attempt recreates it
      const sandboxToken = jwt.signSandboxToken(conversationId, agent.id)
      let reply: string
      const dispatchStart = Date.now()
      try {
        reply = await retryWithBackoff(async () => {
          const entry = await sandbox.getOrCreate(conversationId, agent.e2bTemplateId, agent.port, sandboxToken, agent.idleTimeoutMs)
          const chatStart = Date.now()
          const res = await fetch(`${entry.chatUrl}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Trace-Id': traceId },
            body: JSON.stringify({
              message: msg.content.text,
              last_message_id: conversation.getLastMessageId(conversationId),
            }),
            signal: AbortSignal.timeout(120_000),
          })
          if (!res.ok) {
            if (res.status >= 500) {
              logger.warn({ event: 'sandbox.stale', trace_id: traceId, status: res.status })
              await sandbox.destroy(conversationId)
            }
            throw new Error(`sandbox returned ${res.status}`)
          }
          logger.info({ event: 'sandbox.chat', trace_id: traceId, conversation_id: conversationId, duration_ms: Date.now() - chatStart })
          return ((await res.json()) as any).reply as string
        }, 2)
      } catch (err) {
        await fail('chat.error', err)
        return
      }

      await im.sendMessage(msg.external_chat_id, reply)
      logger.info({ event: 'reply.delivered', trace_id: traceId, conversation_id: conversationId, dispatch_ms: Date.now() - dispatchStart, total_ms: Date.now() - handleStart })
      await jobs.markDone(msg.channel_key, msg.external_message_id)

      // Sync cache: sandbox appended an assistant message; update lastMessageId so the next
      // user message uses the correct expected_last_message_id for optimistic concurrency.
      // Fire-and-forget — user must type a new message before this matters.
      gateway.loadMessages(conversationId, conversation.getLastMessageId(conversationId), dispatcherToken)
        .then(loaded => { if (loaded.last_message_id) conversation.setLastMessageId(conversationId, loaded.last_message_id) })
        .catch(err => logger.warn({ event: 'sync.warn', trace_id: traceId, conversation_id: conversationId, error: String(err) }))
    },
  }
}

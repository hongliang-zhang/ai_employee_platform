import type { NormalizedMessage } from './lib/normalize.js'
import type { IMClient } from './im/client.js'
import pino from 'pino'
import { createId } from '@paralleldrive/cuid2'
import { retryWithBackoff } from './lib/utils.js'

const logger = pino({ transport: { target: 'pino-pretty' } })

interface Agent {
  id: string
  e2bTemplateId: string
  port: number
  idleTimeoutMs: number
}

export function createProcessor(deps: {
  conversation: ReturnType<typeof import('./conversation.js').createConversationManager>
  imMessageTracker: ReturnType<typeof import('./im-message-tracker.js').createImMessageTracker>
  gateway: ReturnType<typeof import('./gateway-client.js').createGatewayClient>
  sandbox: import('./sandbox.js').SandboxOrchestrator
  im: IMClient
  jwt: ReturnType<typeof import('./lib/jwt.js').createJwtSigner>
  agent: Agent
}) {
  const { conversation, imMessageTracker, gateway, sandbox, im, jwt, agent } = deps
  const UNAVAILABLE_MSG = '服务暂时不可用，请稍后重试'

  async function claimMessage(msg: NormalizedMessage, traceId: string): Promise<string | null> {
    // Get/create conversation — must happen before IM message tracker insert (FK constraint)
    const conversationId = await conversation.getOrCreate({
      agentId: agent.id,
      imConfigId: msg.imConfigId,
      chatId: msg.chatId,
      topicId: msg.topicId,
    })

    // Claim this IM message before any side effects. Only the dispatcher that
    // owns the receipt may append history or dispatch to the sandbox; receipts
    // that are already done, actively processing, or failed are skipped.
    const claim = await imMessageTracker.tryClaim(msg.imConfigId, msg.messageId, conversationId)
    if (!claim.claimed) {
      logger.info({ event: 'message.skipped', trace_id: traceId, message_id: msg.messageId, reason: claim.reason })
      return null
    }

    return conversationId
  }

  async function failMessage(msg: NormalizedMessage, conversationId: string, traceId: string, event: string, err: unknown): Promise<void> {
    logger.error({ event, trace_id: traceId, conversation_id: conversationId, error: String(err) })
    await imMessageTracker.markFailed(msg.imConfigId, msg.messageId)
    await im.sendMessage(msg.chatId, UNAVAILABLE_MSG)
  }

  async function appendUserMessage(msg: NormalizedMessage, conversationId: string, dispatcherToken: string): Promise<void> {
    const result = await retryWithBackoff(() =>
      gateway.appendMessages(
        conversation.getLastMessageId(conversationId),
        [{ role: 'user', content: [{ type: 'text', text: msg.content.text }], source: 'im', message_id: msg.messageId }],
        dispatcherToken
      )
    )
    conversation.setLastMessageId(conversationId, result.last_message_id)
  }

  function syncLastMessageId(conversationId: string, traceId: string, dispatcherToken: string): void {
    // Sync cache: sandbox appended an assistant message; update lastMessageId so the next
    // user message uses the correct expected_last_message_id for optimistic concurrency.
    // Fire-and-forget — user must type a new message before this matters.
    gateway.loadMessages(conversation.getLastMessageId(conversationId), dispatcherToken)
      .then(loaded => { if (loaded.last_message_id) conversation.setLastMessageId(conversationId, loaded.last_message_id) })
      .catch(err => logger.warn({ event: 'sync.warn', trace_id: traceId, conversation_id: conversationId, error: String(err) }))
  }

  return {
    async handle(msg: NormalizedMessage): Promise<void> {
      const traceId = 'tr_' + createId()
      const handleStart = Date.now()
      logger.info({ event: 'message.received', trace_id: traceId, im_config_id: msg.imConfigId, message_id: msg.messageId })

      const conversationId = await claimMessage(msg, traceId)
      if (!conversationId) return

      const dispatcherToken = jwt.signDispatcherToken(conversationId, agent.id)
      try {
        await appendUserMessage(msg, conversationId, dispatcherToken)
      } catch (err) {
        await failMessage(msg, conversationId, traceId, 'append.error', err)
        return
      }

      await im.sendChatAction(msg.chatId, { messageId: msg.messageId })

      const sandboxToken = jwt.signSandboxToken(conversationId, agent.id)
      const dispatchStart = Date.now()
      let reply: string
      try {
        reply = await sandbox.chat({
          conversationId,
          templateId: agent.e2bTemplateId,
          port: agent.port,
          sessionToken: sandboxToken,
          message: msg.content.text,
          lastMessageId: conversation.getLastMessageId(conversationId),
          traceId,
        })
      } catch (err) {
        await failMessage(msg, conversationId, traceId, 'chat.error', err)
        return
      }

      await im.sendMessage(msg.chatId, reply)
      logger.info({ event: 'reply.delivered', trace_id: traceId, conversation_id: conversationId, dispatch_ms: Date.now() - dispatchStart, total_ms: Date.now() - handleStart })
      await imMessageTracker.markDone(msg.imConfigId, msg.messageId)
      syncLastMessageId(conversationId, traceId, dispatcherToken)
    },
  }
}

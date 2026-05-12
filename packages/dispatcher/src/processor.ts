import type { NormalizedMessage } from './lib/normalize.js'
import type { IMClient } from './im/client.js'
import pino from 'pino'
import { createId } from '@paralleldrive/cuid2'

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
  sandbox: import('./sandbox.js').SandboxOrchestrator
  im: IMClient
  jwt: ReturnType<typeof import('./lib/jwt.js').createJwtSigner>
  agent: Agent
}) {
  const { conversation, imMessageTracker, sandbox, im, jwt, agent } = deps
  const UNAVAILABLE_MSG = '服务暂时不可用，请稍后重试'

  async function claimMessage(msg: NormalizedMessage, traceId: string): Promise<string | null> {
    const conversationId = await conversation.getOrCreate({
      agentId: agent.id,
      imConfigId: msg.imConfigId,
      chatId: msg.chatId,
      topicId: msg.topicId,
    })

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

  return {
    async handle(msg: NormalizedMessage): Promise<void> {
      const traceId = 'tr_' + createId()
      const handleStart = Date.now()
      logger.info({ event: 'message.received', trace_id: traceId, im_config_id: msg.imConfigId, message_id: msg.messageId })

      const conversationId = await claimMessage(msg, traceId)
      if (!conversationId) return

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
          traceId,
        })
      } catch (err) {
        await failMessage(msg, conversationId, traceId, 'chat.error', err)
        return
      }

      await im.sendMessage(msg.chatId, reply)
      logger.info({ event: 'reply.delivered', trace_id: traceId, conversation_id: conversationId, dispatch_ms: Date.now() - dispatchStart, total_ms: Date.now() - handleStart })
      await imMessageTracker.markDone(msg.imConfigId, msg.messageId)
    },
  }
}

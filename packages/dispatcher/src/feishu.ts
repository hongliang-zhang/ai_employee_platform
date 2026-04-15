// packages/dispatcher/src/feishu.ts
import * as lark from '@larksuiteoapi/node-sdk'
import pino from 'pino'
import type { IMClient } from './im-client.js'
import type { NormalizedMessage } from './normalize.js'
import { normalizeFeishuEvent } from './normalize.js'

const logger = pino({ transport: { target: 'pino-pretty' } })

export function createFeishuClient(
  appId: string,
  appSecret: string,
  botOpenId: string
): {
  client: IMClient
  start: (
    onMessage: (msg: NormalizedMessage) => Promise<void>,
    channelKey: string
  ) => Promise<void>
} {
  const larkClient = new lark.Client({ appId, appSecret })

  const client: IMClient = {
    async sendMessage(chatId: string, text: string): Promise<void> {
      await larkClient.im.message.create({
        params: { receive_id_type: 'chat_id' },
        data: {
          receive_id: chatId,
          msg_type: 'text',
          content: JSON.stringify({ text }),
        },
      })
    },

    async sendChatAction(_chatId: string): Promise<void> {
      // Feishu has no typing indicator — no-op
    },
  }

  async function start(
    onMessage: (msg: NormalizedMessage) => Promise<void>,
    channelKey: string
  ): Promise<void> {
    const wsClient = new lark.WSClient({ appId, appSecret })

    // await ensures connection failures throw so the process exits instead of hanging silently
    await wsClient.start({
      eventDispatcher: new lark.EventDispatcher({}).register({
        'im.message.receive_v1': async (data: any) => {
          const msg = normalizeFeishuEvent(data, channelKey, botOpenId)
          if (!msg) return
          await onMessage(msg).catch(err =>
            logger.error({ event: 'feishu.processor.error', error: String(err) })
          )
        },
      }),
    })
  }

  return { client, start }
}

// packages/dispatcher/src/im/feishu.ts
import * as lark from '@larksuiteoapi/node-sdk'
import pino from 'pino'
import type { IMClient } from './client.js'
import type { NormalizedMessage } from '../lib/normalize.js'
import { normalizeFeishuEvent } from '../lib/normalize.js'

const logger = pino({ transport: { target: 'pino-pretty' } })

export function createFeishuClient(
  appId: string,
  appSecret: string,
  botOpenId: string
): {
  client: IMClient
  listen: (
    onMessage: (msg: NormalizedMessage) => Promise<void>,
    imConfigId: string
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

    async sendChatAction(_chatId: string, _context?: { messageId?: string }): Promise<void> {
      // Feishu does not provide a typing indicator equivalent for bot messages.
      // Do not emulate typing with message reactions; reactions are user-visible state.
    },
  }

  async function listen(
    onMessage: (msg: NormalizedMessage) => Promise<void>,
    imConfigId: string
  ): Promise<void> {
    //  lark.WSClient 是飞书 SDK 封装好的 WebSocket 客户端。它在内部做了：
    //  1. 用 appId / appSecret 向飞书服务器认证
    //  2. 建立 WebSocket 长连接
    //  3. 自动重连、心跳保活
    const wsClient = new lark.WSClient({ appId, appSecret })

    // await ensures connection failures throw so the process exits instead of hanging silently
    await wsClient.start({
      eventDispatcher: new lark.EventDispatcher({}).register({
        'im.message.receive_v1': async (data: any) => {
          const msg = normalizeFeishuEvent(data, imConfigId, botOpenId)
          if (!msg) return
          await onMessage(msg).catch(err =>
            logger.error({ event: 'feishu.processor.error', error: String(err) })
          )
        },
      }),
    })
  }

  return { client, listen }
}

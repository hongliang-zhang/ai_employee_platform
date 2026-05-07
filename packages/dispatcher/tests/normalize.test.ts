import { describe, it, expect } from 'vitest'
import { normalizeTelegramUpdate, normalizeFeishuEvent } from '../src/lib/normalize.js'

describe('normalizeTelegramUpdate', () => {
  it('normalizes a private message', () => {
    const result = normalizeTelegramUpdate(
      {
        update_id: 987654321,
        message: {
          message_id: 42,
          from: { id: 12345, first_name: 'Alice' },
          chat: { id: 99887766, type: 'private' },
          text: 'Hello',
        },
      },
      'im:cfg_abc'
    )
    expect(result).toEqual({
      imConfigId: 'im:cfg_abc',
      chatId: '99887766',
      topicId: '',
      messageId: '42',
      sender: { userId: '12345', displayName: 'Alice' },
      content: { type: 'text', text: 'Hello' },
    })
  })

  it('returns null for non-text messages', () => {
    const result = normalizeTelegramUpdate(
      { update_id: 1, message: { message_id: 1, from: { id: 1 }, chat: { id: 1, type: 'private' }, sticker: {} } },
      'im:cfg_abc'
    )
    expect(result).toBeNull()
  })

  it('returns null for updates without message', () => {
    const result = normalizeTelegramUpdate({ update_id: 1, edited_message: {} }, 'im:cfg_abc')
    expect(result).toBeNull()
  })
})

// --- Feishu tests ---

function makeFeishuEvent(overrides: {
  chatType?: string
  messageType?: string
  content?: string
  mentions?: Array<{ key: string; id?: { open_id?: string }; name?: string }>
  senderOpenId?: string | null
} = {}) {
  return {
    message: {
      message_id: 'om_msg_001',
      chat_id: 'oc_chat_abc',
      chat_type: overrides.chatType ?? 'p2p',
      message_type: overrides.messageType ?? 'text',
      content: overrides.content ?? JSON.stringify({ text: 'hello' }),
      mentions: overrides.mentions ?? [],
    },
    sender: {
      sender_id: overrides.senderOpenId === null
        ? {}
        : { open_id: overrides.senderOpenId ?? 'ou_sender_001' },
    },
  }
}

const BOT_OPEN_ID = 'ou_bot_xyz'
const CHANNEL_KEY = 'im:cfg_feishu'

describe('normalizeFeishuEvent', () => {
  it('normalizes a DM text message', () => {
    const result = normalizeFeishuEvent(makeFeishuEvent(), CHANNEL_KEY, BOT_OPEN_ID)
    expect(result).toEqual({
      imConfigId: CHANNEL_KEY,
      chatId: 'oc_chat_abc',
      topicId: '',
      messageId: 'om_msg_001',
      sender: { userId: 'ou_sender_001', displayName: null },
      content: { type: 'text', text: 'hello' },
    })
  })

  it('strips bot mention placeholder from group message text', () => {
    const result = normalizeFeishuEvent(
      makeFeishuEvent({
        chatType: 'group',
        content: JSON.stringify({ text: '@_bot_1 what is 2+2?' }),
        mentions: [{ key: '@_bot_1', id: { open_id: BOT_OPEN_ID }, name: 'Bot' }],
      }),
      CHANNEL_KEY,
      BOT_OPEN_ID
    )
    expect(result).not.toBeNull()
    expect(result!.content.text).toBe('what is 2+2?')
  })

  it('returns null for group message without @bot mention', () => {
    const result = normalizeFeishuEvent(
      makeFeishuEvent({
        chatType: 'group',
        content: JSON.stringify({ text: 'just chatting' }),
        mentions: [],
      }),
      CHANNEL_KEY,
      BOT_OPEN_ID
    )
    expect(result).toBeNull()
  })

  it('returns null for non-text message type', () => {
    const result = normalizeFeishuEvent(
      makeFeishuEvent({ messageType: 'image' }),
      CHANNEL_KEY,
      BOT_OPEN_ID
    )
    expect(result).toBeNull()
  })

  it('returns null when sender open_id is missing', () => {
    const result = normalizeFeishuEvent(
      makeFeishuEvent({ senderOpenId: null }),
      CHANNEL_KEY,
      BOT_OPEN_ID
    )
    expect(result).toBeNull()
  })

  it('treats chat_type "private" as group — requires @bot mention', () => {
    const withoutMention = normalizeFeishuEvent(
      makeFeishuEvent({ chatType: 'private', mentions: [] }),
      CHANNEL_KEY,
      BOT_OPEN_ID
    )
    expect(withoutMention).toBeNull()

    const withMention = normalizeFeishuEvent(
      makeFeishuEvent({
        chatType: 'private',
        content: JSON.stringify({ text: '@_bot_1 hello' }),
        mentions: [{ key: '@_bot_1', id: { open_id: BOT_OPEN_ID }, name: 'Bot' }],
      }),
      CHANNEL_KEY,
      BOT_OPEN_ID
    )
    expect(withMention).not.toBeNull()
  })
})

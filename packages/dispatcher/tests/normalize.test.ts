import { describe, it, expect } from 'vitest'
import { normalizeTelegramUpdate } from '../src/normalize.js'

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
      channel_key: 'im:cfg_abc',
      external_chat_id: '99887766',
      external_thread_key: '',
      external_message_id: '42',
      author: { external_user_id: '12345', display_name: 'Alice' },
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

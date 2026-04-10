import { describe, it, expect } from 'vitest'
import { createEncryptor } from '../src/encrypt.js'

const KEY = '0'.repeat(64) // 32 bytes as hex

describe('createEncryptor', () => {
  it('round-trips plaintext through encrypt/decrypt', () => {
    const enc = createEncryptor(KEY)
    const cipher = enc.encrypt('my-secret-token')
    const plain = enc.decrypt(cipher)
    expect(plain).toBe('my-secret-token')
  })

  it('produces different ciphertext each time (random IV)', () => {
    const enc = createEncryptor(KEY)
    const a = enc.encrypt('same')
    const b = enc.encrypt('same')
    expect(a).not.toBe(b)
  })
})

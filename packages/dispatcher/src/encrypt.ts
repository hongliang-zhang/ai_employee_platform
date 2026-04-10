import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

export function createEncryptor(hexKey: string) {
  const key = Buffer.from(hexKey, 'hex')
  if (key.length !== 32) throw new Error('BOT_TOKEN_ENC_KEY must be 32 bytes (64 hex chars)')

  return {
    encrypt(plaintext: string): string {
      const iv = randomBytes(12)
      const cipher = createCipheriv('aes-256-gcm', key, iv)
      const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
      const tag = cipher.getAuthTag()
      // Format: iv(12):tag(16):ciphertext — all base64
      return [iv, tag, encrypted].map(b => b.toString('base64')).join(':')
    },
    decrypt(ciphertext: string): string {
      const [ivB64, tagB64, encB64] = ciphertext.split(':')
      const iv = Buffer.from(ivB64, 'base64')
      const tag = Buffer.from(tagB64, 'base64')
      const enc = Buffer.from(encB64, 'base64')
      const decipher = createDecipheriv('aes-256-gcm', key, iv)
      decipher.setAuthTag(tag)
      return decipher.update(enc) + decipher.final('utf8')
    },
  }
}

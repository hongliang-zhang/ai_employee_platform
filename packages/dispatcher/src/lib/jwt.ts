import jwt from 'jsonwebtoken'

export function createJwtSigner(secret: string) {
  return {
    signSandboxToken(conversationId: string, agentId: string): string {
      return jwt.sign(
        { conversation_id: conversationId, agent_id: agentId, caller: 'sandbox' },
        secret,
        { expiresIn: '24h' }
      )
    },
    signDispatcherToken(conversationId: string, agentId: string): string {
      return jwt.sign(
        { conversation_id: conversationId, agent_id: agentId, caller: 'dispatcher' },
        secret,
        { expiresIn: '60s' }
      )
    },
  }
}

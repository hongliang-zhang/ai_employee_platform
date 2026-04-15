// packages/dispatcher/src/im-client.ts
export interface IMClient {
  sendMessage(chatId: string, text: string): Promise<void>
  sendChatAction(chatId: string): Promise<void>
}

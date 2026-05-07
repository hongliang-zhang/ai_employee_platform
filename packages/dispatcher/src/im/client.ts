export interface ChatActionContext {
  messageId?: string
}

export interface IMClient {
  sendMessage(chatId: string, text: string): Promise<void> // 给用户发送文本消息（bot的回复）
  sendChatAction(chatId: string, context?: ChatActionContext): Promise<void> // 发送"正在输入"提示，优化用户体验
}

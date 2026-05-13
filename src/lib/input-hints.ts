import { isMac } from '@/lib/shortcut-registry'

export type MessageInputHintScope = 'chat' | 'agent'

export function buildMessageInputHint(sendWithCmdEnter: boolean, scope: MessageInputHintScope): string {
  const sendHint = sendWithCmdEnter
    ? `${isMac ? '⌘' : 'Ctrl'}+Enter 发送，Enter 换行`
    : 'Enter 发送，Shift+Enter 换行'

  const capabilityHint = scope === 'agent'
    ? '@ 引用文件，/ 调用 Skill，$ 引用 Chat，# 调用 MCP'
    : '@ 引用文件，/ 调用 Skill，$ 引用 Chat'

  return `输入消息... (${sendHint}，${capabilityHint})`
}

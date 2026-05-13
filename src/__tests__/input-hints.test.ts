import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/shortcut-registry', () => ({
  isMac: false,
}))

describe('input hints', () => {
  it('builds the Chat Windows hint for enter-send mode', async () => {
    const { buildMessageInputHint } = await import('@/lib/input-hints')

    expect(buildMessageInputHint(false, 'chat')).toBe(
      '输入消息... (Enter 发送，Shift+Enter 换行，@ 引用文件，/ 调用 Skill，$ 引用 Chat)',
    )
  })

  it('builds the Agent Windows hint for ctrl-enter-send mode', async () => {
    const { buildMessageInputHint } = await import('@/lib/input-hints')

    expect(buildMessageInputHint(true, 'agent')).toBe(
      '输入消息... (Ctrl+Enter 发送，Enter 换行，@ 引用文件，/ 调用 Skill，$ 引用 Chat，# 调用 MCP)',
    )
  })
})

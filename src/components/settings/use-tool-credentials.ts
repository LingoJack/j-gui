/**
 * useToolCredentials - 封装工具设置共用的加载、开关与测试逻辑
 *
 * WebSearchSettings 和 NanoBananaSettings 在 handleBlurSave、handleToggle、
 * handleTest 以及加载状态周围共享约 150 行样板代码，这个 hook 将通用模式集中到一处。
 */

import * as React from 'react'
import { useSetAtom } from 'jotai'
import { chatToolsAtom } from '@/atoms/chat-tool-atoms'
import * as ipc from '@/lib/ipc'

interface TestResult {
  success: boolean
  message: string
}

export function useToolCredentials(toolId: string) {
  const setChatTools = useSetAtom(chatToolsAtom)
  const [testing, setTesting] = React.useState(false)
  const [testResult, setTestResult] = React.useState<TestResult | null>(null)

  const refreshTools = React.useCallback(async () => {
    try {
      const tools = await ipc.getChatTools()
      setChatTools(tools)
    } catch (err) {
      console.error('[ToolSettings] 刷新工具列表失败:', err)
    }
  }, [setChatTools])

  const handleToggle = React.useCallback(
    async (checked: boolean) => {
      try {
        await ipc.updateChatToolState(toolId, { enabled: checked })
        await refreshTools()
      } catch (error) {
        console.error(`[${toolId}] 切换失败:`, error)
      }
    },
    [toolId, refreshTools],
  )

  const handleTest = React.useCallback(async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await ipc.testChatTool(toolId, {})
      setTestResult(result)
    } catch (error) {
      setTestResult({
        success: false,
        message: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setTesting(false)
    }
  }, [toolId])

  return { testing, testResult, handleToggle, handleTest, refreshTools }
}

import * as React from 'react'
import { useAtomValue } from 'jotai'
import {
  Reasoning,
  ReasoningTrigger,
  ReasoningToggleText,
  ReasoningContent,
} from '@/components/ai-elements/reasoning'
import { thinkingExpandedAtom } from '@/atoms/chat-atoms'

interface ChatReasoningBlockProps {
  /** 推理/思考文本 */
  reasoning: string
  /** 是否正在流式输出推理内容 */
  isStreaming?: boolean
}

export function ChatReasoningBlock({
  reasoning,
  isStreaming = false,
}: ChatReasoningBlockProps): React.ReactElement {
  const thinkingExpanded = useAtomValue(thinkingExpandedAtom)
  const [open, setOpen] = React.useState(() => isStreaming || thinkingExpanded)

  React.useEffect(() => {
    setOpen(isStreaming || thinkingExpanded)
  }, [isStreaming, thinkingExpanded])

  return (
    <Reasoning
      isStreaming={isStreaming}
      open={open}
      onOpenChange={setOpen}
      defaultOpen={isStreaming}
    >
      <ReasoningTrigger>
        <span className="inline-flex items-center gap-2">
          <span>思考内容</span>
          <ReasoningToggleText />
        </span>
      </ReasoningTrigger>
      <ReasoningContent>{reasoning}</ReasoningContent>
    </Reasoning>
  )
}

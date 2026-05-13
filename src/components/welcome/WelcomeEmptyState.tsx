/**
 * WelcomeEmptyState — 对话/会话空状态引导
 *
 * 在没有会话时展示：
 * 1. 个性化时段问候
 * 2. 平台感知的小提示
 * 3. 简短正文提示，提醒模式切换留在左上角
 */

import * as React from 'react'
import { useAtomValue } from 'jotai'
import { Lightbulb } from 'lucide-react'
import { userProfileAtom } from '@/atoms/user-profile'
import { resolvedThemeAtom } from '@/atoms/theme'
import { getRandomTip, getPlatform, type Tip } from '@/lib/tips'
import JDarkLogo from '../../../logo/J-dark.png'
import JWhiteLogo from '../../../logo/J-white.png'

/** 根据小时返回时段问候 */
function getGreeting(hour: number): string {
  if (hour < 6) return '夜深了'
  if (hour < 12) return '早上好'
  if (hour < 18) return '下午好'
  return '晚上好'
}

export function WelcomeEmptyState(): React.ReactElement {
  const userProfile = useAtomValue(userProfileAtom)
  const resolvedTheme = useAtomValue(resolvedThemeAtom)

  // 稳定的随机提示（组件挂载时选一条）
  const [tip] = React.useState<Tip>(() => getRandomTip(getPlatform()))

  const hour = new Date().getHours()
  const greeting = getGreeting(hour)
  const displayName = userProfile.userName || '用户'
  const brandLogo = resolvedTheme === 'dark' ? JWhiteLogo : JDarkLogo

  return (
    <div className="w-full space-y-5 animate-in fade-in duration-500">
      <img
        src={brandLogo}
        alt="j-gui"
        className="h-14 w-14 rounded-2xl object-contain"
      />
      <div className="space-y-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-muted-foreground/70">
          工作台已就绪
        </p>
        <div className="space-y-2">
          <h1 className="text-[30px] font-semibold tracking-tight text-foreground">
            {displayName}，{greeting}
          </h1>
          <p className="max-w-[520px] text-sm leading-6 text-muted-foreground">
            从左上角切换 Chat 或 Agent，正文只保留当前可执行的入口，不再重复堆模式说明。
          </p>
        </div>
      </div>

      <div className="inline-flex max-w-full items-center gap-2.5 rounded-full border border-border/60 bg-muted/35 px-4 py-2 text-[13px] text-muted-foreground">
        <Lightbulb size={14} className="flex-shrink-0 text-amber-500/80" />
        <span className="truncate">{tip.text}</span>
      </div>
    </div>
  )
}

/**
 * WelcomeEmptyState — 对话/会话空状态引导
 *
 * 在没有会话时展示：
 * 1. 个性化时段问候
 * 2. 轮换展示的诗词/名言
 * 3. 平台感知的小提示
 */

import * as React from 'react'
import { useAtomValue } from 'jotai'
import { userProfileAtom } from '@/atoms/user-profile'
import { getRandomTip, getPlatform, type Tip } from '@/lib/tips'

interface WelcomeQuote {
  id: string
  text: string
  author: string
}

const WELCOME_QUOTES: WelcomeQuote[] = [
  { id: 'sushi-1', text: '长风破浪会有时，直挂云帆济沧海。', author: '李白《行路难》' },
  { id: 'sushi-2', text: '山重水复疑无路，柳暗花明又一村。', author: '陆游《游山西村》' },
  { id: 'sushi-3', text: '路虽远，行则将至；事虽难，做则必成。', author: '《荀子》' },
  { id: 'sushi-4', text: '为天地立心，为生民立命，为往圣继绝学，为万世开太平。', author: '张载' },
  { id: 'sushi-5', text: '天行健，君子以自强不息。', author: '《周易》' },
]

/** 根据小时返回时段问候 */
function getGreeting(hour: number): string {
  if (hour < 6) return '夜深了'
  if (hour < 12) return '早上好'
  if (hour < 18) return '下午好'
  return '晚上好'
}

export function WelcomeEmptyState(): React.ReactElement {
  const userProfile = useAtomValue(userProfileAtom)

  // 稳定的随机提示（组件挂载时选一条）
  const [tip] = React.useState<Tip>(() => getRandomTip(getPlatform()))
  const [quoteIndex, setQuoteIndex] = React.useState(() =>
    Math.floor(Math.random() * WELCOME_QUOTES.length),
  )

  React.useEffect(() => {
    const timer = window.setInterval(() => {
      setQuoteIndex((current) => (current + 1) % WELCOME_QUOTES.length)
    }, 5 * 60 * 1000)

    return () => window.clearInterval(timer)
  }, [])

  const hour = new Date().getHours()
  const greeting = getGreeting(hour)
  const displayName = userProfile.userName || '用户'
  const quote = WELCOME_QUOTES[quoteIndex] ?? WELCOME_QUOTES[0]

  return (
    <div className="w-full space-y-5 animate-in fade-in duration-500">
      <div className="space-y-3">
        <div className="space-y-2">
          <h1 className="text-[30px] font-semibold tracking-tight text-foreground">
            {displayName}，{greeting}
          </h1>
          <div className="max-w-[560px] space-y-2">
            <p className="text-lg leading-8 text-foreground/88">
              {quote.text}
            </p>
            <p className="text-sm text-muted-foreground">
              {quote.author}
            </p>
          </div>
        </div>
      </div>

      <div className="inline-flex max-w-full items-center gap-2.5 rounded-full border border-border/60 bg-muted/35 px-4 py-2 text-[13px] text-muted-foreground">
        <span className="flex-shrink-0 font-medium text-foreground/80">Tips:</span>
        <span className="truncate">{tip.text}</span>
      </div>
    </div>
  )
}

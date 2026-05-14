import * as React from 'react'

interface LayoutFlipTransitionOptions {
  /** 触发布局前后对比的 key */
  depsKey: string
  /** 动画时长，单位毫秒 */
  durationMs: number
  /** X 轴锚点。主内容在左侧栏开合时应保持右边缘稳定，避免视觉跳闪。 */
  anchor?: 'left' | 'right'
  /** 动画期间使用前后较大的宽度，避免纯平移时右侧露出空白。 */
  preserveLargestWidth?: boolean
}

/**
 * 把布局尺寸/位置的突变转换成 GPU transform 动画。
 *
 * 侧栏开合时布局应立即落到最终状态，避免 width/margin 每帧触发重排；
 * 这个 hook 只在视觉层用 FLIP 补一段 transform 过渡。
 */
export function useLayoutFlipTransition<T extends HTMLElement>({
  depsKey,
  durationMs,
  anchor = 'left',
  preserveLargestWidth = false,
}: LayoutFlipTransitionOptions): React.RefObject<T | null> {
  const ref = React.useRef<T | null>(null)
  const previousRectRef = React.useRef<DOMRect | null>(null)
  const animationFrameRef = React.useRef<number | null>(null)

  React.useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    let cancelled = false
    const clearInlineAnimationStyles = (): void => {
      element.style.transition = ''
      element.style.transform = ''
      element.style.transformOrigin = ''
      element.style.willChange = ''
      element.style.width = ''
    }

    const nextRect = element.getBoundingClientRect()
    const previousRect = previousRectRef.current
    previousRectRef.current = nextRect

    if (!previousRect) return

    const deltaX = anchor === 'right'
      ? previousRect.right - nextRect.right
      : previousRect.left - nextRect.left
    const deltaY = previousRect.top - nextRect.top
    const moved = Math.abs(deltaX) > 0.5 || Math.abs(deltaY) > 0.5

    if (!moved) return

    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current)
    }

    element.style.transition = 'none'
    element.style.transformOrigin = 'top left'
    element.style.willChange = 'transform'
    if (preserveLargestWidth) {
      element.style.width = `${Math.max(previousRect.width, nextRect.width)}px`
    }
    element.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0)`

    animationFrameRef.current = requestAnimationFrame(() => {
      if (cancelled) return
      animationFrameRef.current = null
      element.style.transition = `transform ${durationMs}ms ease-in-out`
      element.style.transform = 'translate3d(0, 0, 0)'
    })

    const timer = window.setTimeout(() => {
      if (element.style.transform === 'translate3d(0, 0, 0)') {
        clearInlineAnimationStyles()
      }
    }, durationMs + 50)

    return () => {
      cancelled = true
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
      window.clearTimeout(timer)
      clearInlineAnimationStyles()
    }
  }, [anchor, durationMs, depsKey, preserveLargestWidth])

  React.useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [])

  return ref
}

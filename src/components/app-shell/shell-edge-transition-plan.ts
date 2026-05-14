export interface TransitionRect {
  top: number
  height: number
  left: number
  right: number
  width: number
}

export interface ClipAnimationPlan {
  source: 'previous' | 'next'
  edge: 'left' | 'right'
  from: number
  to: number
  translateFrom: number
  translateTo: number
}

function diff(value: number): number {
  return Math.abs(Math.round(value))
}

export function planMainSlotTransition(
  previousRect: TransitionRect,
  nextRect: TransitionRect,
): ClipAnimationPlan | null {
  if (Math.round(previousRect.left) !== Math.round(nextRect.left)) {
    const delta = diff(nextRect.left - previousRect.left)
    if (delta === 0) return null
    return nextRect.left > previousRect.left
      ? { source: 'previous', edge: 'left', from: 0, to: delta, translateFrom: 0, translateTo: 0 }
      : { source: 'next', edge: 'left', from: delta, to: 0, translateFrom: 0, translateTo: 0 }
  }

  if (Math.round(previousRect.right) !== Math.round(nextRect.right)) {
    const delta = diff(nextRect.right - previousRect.right)
    if (delta === 0) return null
    return nextRect.right < previousRect.right
      ? { source: 'previous', edge: 'right', from: 0, to: delta, translateFrom: 0, translateTo: 0 }
      : { source: 'next', edge: 'right', from: delta, to: 0, translateFrom: 0, translateTo: 0 }
  }

  return null
}

export function planLeftSidebarTransition(
  previousRect: TransitionRect,
  nextRect: TransitionRect,
): ClipAnimationPlan | null {
  const delta = diff(nextRect.width - previousRect.width)
  if (delta === 0) return null
  return nextRect.width > previousRect.width
    ? { source: 'next', edge: 'right', from: delta, to: 0, translateFrom: 0, translateTo: 0 }
    : { source: 'previous', edge: 'right', from: 0, to: delta, translateFrom: 0, translateTo: 0 }
}

export function planRightSidebarTransition(
  previousRect: TransitionRect,
  nextRect: TransitionRect,
): ClipAnimationPlan | null {
  const delta = diff(nextRect.width - previousRect.width)
  if (delta === 0) return null
  return nextRect.width > previousRect.width
    ? { source: 'next', edge: 'left', from: delta, to: 0, translateFrom: 0, translateTo: 0 }
    : { source: 'previous', edge: 'left', from: 0, to: delta, translateFrom: 0, translateTo: 0 }
}

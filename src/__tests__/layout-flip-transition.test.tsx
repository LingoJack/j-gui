import * as React from 'react'
import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useLayoutFlipTransition } from '@/hooks/useLayoutFlipTransition'

function FlipProbe({
  depsKey,
  anchor,
  preserveLargestWidth,
}: {
  depsKey: string
  anchor?: 'left' | 'right'
  preserveLargestWidth?: boolean
}): React.ReactElement {
  const ref = useLayoutFlipTransition<HTMLDivElement>({
    depsKey,
    durationMs: 250,
    anchor,
    preserveLargestWidth,
  })
  return <div ref={ref} data-testid="flip-probe" />
}

describe('useLayoutFlipTransition', () => {
  let rects: DOMRect[]
  let rafCallbacks: Map<number, FrameRequestCallback>
  let nextRafId: number

  beforeEach(() => {
    rafCallbacks = new Map()
    nextRafId = 1
    rects = [
      new DOMRect(280, 8, 800, 600),
      new DOMRect(48, 8, 1032, 600),
    ]
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => rects.shift() ?? rects[rects.length - 1]!)
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      const id = nextRafId
      nextRafId += 1
      rafCallbacks.set(id, callback)
      return id
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => {
      rafCallbacks.delete(id)
    }))
  })

  function flushAnimationFrame(id: number): void {
    const callback = rafCallbacks.get(id)
    if (!callback) return
    rafCallbacks.delete(id)
    callback(0)
  }

  function pendingAnimationFrameIds(): number[] {
    return [...rafCallbacks.keys()]
  }

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('animates a regular left-anchored move with a GPU transform', () => {
    rects = [
      new DOMRect(48, 8, 1032, 600),
      new DOMRect(280, 8, 800, 600),
    ]
    const { rerender, getByTestId } = render(<FlipProbe depsKey="collapsed" />)

    act(() => {
      rerender(<FlipProbe depsKey="expanded" />)
    })

    expect(getByTestId('flip-probe').style.transform).toBe('translate3d(-232px, 0px, 0)')

    act(() => {
      flushAnimationFrame(pendingAnimationFrameIds()[0]!)
    })

    expect(getByTestId('flip-probe').style.transform).toBe('translate3d(0, 0, 0)')
  })

  it('anchors right-edge layout changes so left sidebar expansion does not pull the content back from the left', () => {
    const { rerender, getByTestId } = render(<FlipProbe depsKey="expanded" anchor="right" />)

    act(() => {
      rerender(<FlipProbe depsKey="collapsed" anchor="right" />)
    })

    expect(getByTestId('flip-probe').style.transform).toBe('')
  })

  it('anchors left-edge layout changes so right sidebar expansion does not pull the content away from the left', () => {
    rects = [
      new DOMRect(48, 8, 1032, 600),
      new DOMRect(48, 8, 704, 600),
    ]
    const { rerender, getByTestId } = render(<FlipProbe depsKey="panel-closed" anchor="left" />)

    act(() => {
      rerender(<FlipProbe depsKey="panel-open" anchor="left" />)
    })

    expect(getByTestId('flip-probe').style.transform).toBe('')
  })

  it('can preserve the larger visual width while translating from the previous left edge', () => {
    rects = [
      new DOMRect(280, 8, 800, 600),
      new DOMRect(48, 8, 1032, 600),
    ]
    const { rerender, getByTestId } = render(
      <FlipProbe depsKey="expanded" preserveLargestWidth />,
    )

    act(() => {
      rerender(<FlipProbe depsKey="collapsed" preserveLargestWidth />)
    })

    expect(getByTestId('flip-probe').style.transform).toBe('translate3d(232px, 0px, 0)')
    expect(getByTestId('flip-probe').style.width).toBe('1032px')
  })

  it('cleans inline transform styles when an animation is interrupted', () => {
    rects = [
      new DOMRect(48, 8, 1032, 600),
      new DOMRect(280, 8, 800, 600),
      new DOMRect(280, 8, 800, 600),
    ]
    const { rerender, getByTestId } = render(<FlipProbe depsKey="collapsed" />)

    act(() => {
      rerender(<FlipProbe depsKey="expanded" />)
    })

    expect(getByTestId('flip-probe').style.willChange).toBe('transform')

    act(() => {
      rerender(<FlipProbe depsKey="stable" />)
    })

    expect(pendingAnimationFrameIds()).toHaveLength(0)
    expect(getByTestId('flip-probe').style.willChange).toBe('')
    expect(getByTestId('flip-probe').style.transform).toBe('')
    expect(getByTestId('flip-probe').style.transition).toBe('')
  })

  it('does not let a cancelled animation frame write styles back after cleanup', () => {
    rects = [
      new DOMRect(48, 8, 1032, 600),
      new DOMRect(280, 8, 800, 600),
      new DOMRect(280, 8, 800, 600),
    ]
    const { rerender, getByTestId } = render(<FlipProbe depsKey="collapsed" />)

    act(() => {
      rerender(<FlipProbe depsKey="expanded" />)
    })
    const staleRafId = pendingAnimationFrameIds()[0]!

    act(() => {
      rerender(<FlipProbe depsKey="stable" />)
    })
    act(() => {
      flushAnimationFrame(staleRafId)
    })

    expect(getByTestId('flip-probe').style.willChange).toBe('')
    expect(getByTestId('flip-probe').style.transform).toBe('')
    expect(getByTestId('flip-probe').style.transition).toBe('')
  })
})

import * as React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { TabErrorBoundary } from '@/components/tabs/TabErrorBoundary'

function CrashOnDemand({ shouldCrash }: { shouldCrash: boolean }): React.ReactElement {
  if (shouldCrash) {
    throw new Error('boom')
  }
  return <div data-testid="boundary-child">ok</div>
}

describe('TabErrorBoundary layout', () => {
  it('keeps a full-height flex wrapper during normal rendering', () => {
    const { container } = render(
      <TabErrorBoundary sessionId="chat-1">
        <div data-testid="boundary-child">ok</div>
      </TabErrorBoundary>,
    )

    const wrapper = container.firstElementChild
    expect(wrapper).toHaveClass('flex')
    expect(wrapper).toHaveClass('flex-col')
    expect(wrapper).toHaveClass('h-full')
    expect(wrapper).toHaveClass('min-h-0')
    expect(wrapper).toHaveClass('flex-1')
    expect(screen.getByTestId('boundary-child')).toBeInTheDocument()
  })

  it('keeps the error fallback as a full-height layout container and can recover', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    function Harness(): React.ReactElement {
      const [shouldCrash, setShouldCrash] = React.useState(true)
      return (
        <>
          <button type="button" onClick={() => setShouldCrash(false)}>
            recover
          </button>
          <TabErrorBoundary sessionId="chat-1">
            <CrashOnDemand shouldCrash={shouldCrash} />
          </TabErrorBoundary>
        </>
      )
    }

    const { container } = render(<Harness />)
    const wrapper = container.querySelector('.text-muted-foreground')
    expect(wrapper).toHaveClass('flex')
    expect(wrapper).toHaveClass('flex-col')
    expect(wrapper).toHaveClass('h-full')
    expect(wrapper).toHaveClass('min-h-0')

    fireEvent.click(screen.getByRole('button', { name: 'recover' }))
    fireEvent.click(screen.getByRole('button', { name: '重新加载' }))

    expect(screen.getByTestId('boundary-child')).toBeInTheDocument()
    consoleError.mockRestore()
  })
})

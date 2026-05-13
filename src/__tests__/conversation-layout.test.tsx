import * as React from 'react'
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { Conversation } from '@/components/ai-elements/conversation'

describe('Conversation layout', () => {
  it('keeps the root container as a flex column so empty states can push inputs to the bottom', () => {
    const { container } = render(
      <Conversation>
        <div>content</div>
      </Conversation>,
    )

    const root = container.firstElementChild
    expect(root).toHaveClass('flex')
    expect(root).toHaveClass('flex-col')
    expect(root).toHaveClass('min-h-0')
    expect(root).toHaveClass('flex-1')
  })
})

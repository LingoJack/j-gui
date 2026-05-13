import * as React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ContextDivider } from '@/components/ai-elements/context-divider'

describe('ContextDivider', () => {
  it('renders an explicit rewind action for clearing context', () => {
    const onDelete = vi.fn()

    render(
      <ContextDivider
        messageId="msg-1"
        onDelete={onDelete}
      />,
    )

    expect(screen.getByText('清除上下文')).toBeInTheDocument()

    const rewindButton = screen.getByRole('button', { name: '撤回清除上下文' })
    expect(rewindButton).toHaveTextContent('撤回')
    expect(rewindButton).toHaveClass('h-6')

    fireEvent.click(rewindButton)
    expect(onDelete).toHaveBeenCalledWith('msg-1')
  })
})

import * as React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { ChatMessageItem } from '@/components/chat/ChatMessageItem'
import { channelsAtom, thinkingExpandedAtom } from '@/atoms/chat-atoms'

vi.mock('@/components/chat/CopyButton', () => ({
  CopyButton: () => <div data-testid="copy-button" />,
}))

vi.mock('@/components/chat/MigrateToAgentButton', () => ({
  MigrateToAgentButton: () => <div data-testid="migrate-button" />,
}))

vi.mock('@/components/chat/DeleteMessageDialog', () => ({
  DeleteMessageDialog: () => null,
}))

vi.mock('@/components/chat/InlineEditForm', () => ({
  InlineEditForm: () => <div data-testid="inline-edit-form" />,
}))

vi.mock('@/components/chat/ChatToolActivityIndicator', () => ({
  ChatToolActivityIndicator: () => null,
}))

describe('ChatMessageItem branding fallback', () => {
  it('uses the conversation model when a persisted assistant message has no model field', () => {
    const store = createStore()
    store.set(channelsAtom, [
      {
        id: 'channel-deepseek',
        name: 'DeepSeek',
        provider: 'deepseek',
        baseUrl: 'https://api.deepseek.com/anthropic',
        apiKey: '',
        enabled: true,
        createdAt: 0,
        updatedAt: 0,
        models: [{ id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', enabled: true }],
      },
    ])

    render(
      <Provider store={store}>
        <ChatMessageItem
          message={{
            id: 'assistant-1',
            role: 'assistant',
            content: '你好',
            createdAt: Date.now(),
          }}
          fallbackModelId="deepseek-v4-pro"
        />
      </Provider>,
    )

    expect(screen.getByText('DeepSeek')).toBeInTheDocument()
  })

  it('shows a textual reasoning expand toggle for assistant thinking content', () => {
    const store = createStore()
    store.set(channelsAtom, [])

    render(
      <Provider store={store}>
        <ChatMessageItem
          message={{
            id: 'assistant-1',
            role: 'assistant',
            content: '最终回答',
            reasoning: '先分析问题',
            createdAt: Date.now(),
          }}
        />
      </Provider>,
    )

    expect(screen.getByRole('button', { name: /思考内容/ })).toBeInTheDocument()
    expect(screen.getByText('展开思考')).toBeInTheDocument()
  })

  it('honors the global thinking expanded preference in Chat reasoning blocks', () => {
    const store = createStore()
    store.set(channelsAtom, [])
    store.set(thinkingExpandedAtom, true)

    render(
      <Provider store={store}>
        <ChatMessageItem
          message={{
            id: 'assistant-1',
            role: 'assistant',
            content: '最终回答',
            reasoning: '先分析问题',
            createdAt: Date.now(),
          }}
        />
      </Provider>,
    )

    expect(screen.getByRole('button', { name: /思考内容/ })).toBeInTheDocument()
    expect(screen.getByText('收起')).toBeInTheDocument()
    expect(screen.getByText('先分析问题')).toBeInTheDocument()
  })
})

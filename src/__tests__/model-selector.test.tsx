import * as React from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { ModelSelector } from '@/components/chat/ModelSelector'
import { channelsAtom, channelsLoadedAtom } from '@/atoms/chat-atoms'

describe('ModelSelector', () => {
  it('shows the selected model name in the trigger', () => {
    const store = createStore()
    store.set(channelsLoadedAtom, true)
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
        models: [
          { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', enabled: true },
        ],
      },
    ])

    render(
      <Provider store={store}>
        <ModelSelector
          externalSelectedModel={{
            channelId: 'channel-deepseek',
            modelId: 'deepseek-v4-pro',
          }}
        />
      </Provider>,
    )

    expect(screen.getByRole('button', { name: /DeepSeek V4 Pro/i })).toBeInTheDocument()
  })
})

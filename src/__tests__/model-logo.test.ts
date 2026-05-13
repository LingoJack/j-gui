import { describe, expect, it } from 'vitest'
import { resolveAssistantBranding } from '@/lib/model-logo'

describe('resolveAssistantBranding', () => {
  it('prefers the matched channel provider brand over the raw model name', () => {
    const branding = resolveAssistantBranding('deepseek-v4-pro', [
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

    expect(branding.label).toBe('DeepSeek')
    expect(branding.provider).toBe('deepseek')
  })

  it('can still infer the provider when only historical model id remains', () => {
    const branding = resolveAssistantBranding('gpt-5', [])

    expect(branding.label).toBe('OpenAI')
    expect(branding.provider).toBe('openai')
  })
})

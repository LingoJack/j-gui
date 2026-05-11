import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from '@/App'

describe('App shell context wiring', () => {
  it('renders with the shared empty context value instead of a type assertion', () => {
    expect(() => render(<App />)).not.toThrow()
  })
})

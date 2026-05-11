import { vi } from 'vitest'
import '@testing-library/jest-dom/vitest'

// 为测试环境模拟 Tauri API
class MockChannel {
  onmessage: ((event: any) => void) | null = null
}

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockRejectedValue(new Error('Tauri not available in test')),
  Channel: MockChannel,
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
  emit: vi.fn(),
}))

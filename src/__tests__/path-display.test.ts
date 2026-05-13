import { describe, expect, it } from 'vitest'
import {
  buildCompactDisplayPath,
  getDisplayPathBasename,
  normalizeDisplayPath,
} from '@/lib/path-display'

describe('path-display helpers', () => {
  it('strips the Windows extended-path prefix for UI display', () => {
    expect(normalizeDisplayPath('\\\\?\\E:\\Coding\\Agent Skills\\playwright')).toBe(
      'E:\\Coding\\Agent Skills\\playwright',
    )
  })

  it('extracts the basename from Windows paths with backslashes', () => {
    expect(getDisplayPathBasename('\\\\?\\E:\\Coding\\Agent Skills\\playwright')).toBe('playwright')
  })

  it('builds a compact breadcrumb without reintroducing the Windows prefix', () => {
    expect(buildCompactDisplayPath('\\\\?\\E:\\Coding\\Agent Skills\\playwright')).toBe(
      '...\\Agent Skills\\playwright',
    )
  })
})

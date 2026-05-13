/**
 * 路径展示辅助：
 * - 去掉 Windows 扩展路径前缀（\\?\）
 * - 在不改变真实路径语义的前提下，生成适合 UI 展示的名称和面包屑
 */

const WINDOWS_EXTENDED_PATH_PREFIX = /^(\\\\\?\\|\/\/\?\/)/

export function normalizeDisplayPath(path: string): string {
  return path.replace(WINDOWS_EXTENDED_PATH_PREFIX, '')
}

function splitDisplayPath(path: string): string[] {
  return normalizeDisplayPath(path).split(/[\\/]+/).filter(Boolean)
}

export function getDisplayPathBasename(path: string): string {
  const normalized = normalizeDisplayPath(path)
  const segments = splitDisplayPath(path)
  return segments[segments.length - 1] ?? normalized
}

export function buildCompactDisplayPath(path: string, maxSegments = 2): string {
  const normalized = normalizeDisplayPath(path)
  const segments = splitDisplayPath(path)
  const separator = normalized.includes('\\') ? '\\' : '/'

  if (segments.length <= maxSegments) {
    return normalized
  }

  return `...${separator}${segments.slice(-maxSegments).join(separator)}`
}

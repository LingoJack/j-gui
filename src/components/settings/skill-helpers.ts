/**
 * skill-helpers - Shared types and utility functions for Skill UI components
 *
 * Extracted from AgentSettings.tsx to avoid duplication and enable
 * direct imports from test files.
 */

import type { SkillMeta } from '@proma/shared'

// ===== Types =====

export type SkillSourceType = 'workspace' | 'jcli' | 'global'

export interface SkillGroup {
  prefix: string
  skills: SkillMeta[]
}

// ===== Source Badge Helpers =====

export function getSkillSourceType(source: string): SkillSourceType {
  if (source === 'user' || source === 'project') return 'jcli'
  if (source.startsWith('global:')) return 'global'
  return 'workspace'
}

export function getSkillSourceBadge(sourceType: SkillSourceType): { label: string; className: string } {
  switch (sourceType) {
    case 'jcli':
      return { label: 'j-cli', className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' }
    case 'global':
      return { label: 'global', className: 'bg-orange-500/10 text-orange-600 dark:text-orange-400' }
    case 'workspace':
      return { label: 'workspace', className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' }
  }
}

export function externalSkillSlug(dirPath: string): string {
  return dirPath.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? 'unknown'
}

// ===== Skill Grouping =====

export function groupSkillsByPrefix(skills: SkillMeta[]): SkillGroup[] {
  const prefixMap = new Map<string, SkillMeta[]>()

  for (const skill of skills) {
    const dashIdx = skill.slug.indexOf('-')
    const prefix = dashIdx > 0 ? skill.slug.slice(0, dashIdx) : ''
    const key = prefix || skill.slug
    const list = prefixMap.get(key) ?? []
    list.push(skill)
    prefixMap.set(key, list)
  }

  const groups: SkillGroup[] = []
  const standalone: SkillMeta[] = []

  for (const [prefix, list] of prefixMap) {
    if (list.length >= 2) {
      groups.push({ prefix, skills: list })
    } else {
      standalone.push(...list)
    }
  }

  if (standalone.length > 0) {
    groups.push({ prefix: '', skills: standalone })
  }

  return groups
}

export function shortName(slug: string, prefix: string): string {
  if (!prefix) return slug
  return slug.startsWith(prefix + '-') ? slug.slice(prefix.length + 1) : slug
}

// ===== Skill Content Helpers =====

export function extractSkillBody(content: string): string {
  const match = content.match(/^---\s*\n[\s\S]*?\n---\s*\n([\s\S]*)$/)
  return match?.[1] ?? content
}

export function rebuildSkillMd(
  originalContent: string,
  updates: { name?: string; description?: string; body?: string },
): string {
  const fmMatch = originalContent.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/)
  if (!fmMatch) return originalContent

  let fmBlock = fmMatch[1] ?? ''
  const currentBody = fmMatch[2] ?? ''

  if (updates.name !== undefined) {
    fmBlock = /^name:/m.test(fmBlock)
      ? fmBlock.replace(/^name:.*$/m, `name: ${updates.name}`)
      : `name: ${updates.name}\n${fmBlock}`
  }
  if (updates.description !== undefined) {
    fmBlock = /^description:/m.test(fmBlock)
      ? fmBlock.replace(/^description:.*$/m, `description: ${updates.description}`)
      : `${fmBlock}\ndescription: ${updates.description}`
  }

  const newBody = updates.body !== undefined ? updates.body : currentBody
  return `---\n${fmBlock}\n---\n${newBody}`
}

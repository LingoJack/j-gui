import { describe, it, expect, vi } from 'vitest'
import * as ipc from '@/lib/ipc'
import {
  getSkillSourceType,
  getSkillSourceBadge,
  externalSkillSlug,
} from '@/components/settings/skill-helpers'

describe('Dual-source skills — helpers', () => {
  describe('getSkillSourceType', () => {
    it('returns jcli for user source', () => {
      expect(getSkillSourceType('user')).toBe('jcli')
    })

    it('returns jcli for project source', () => {
      expect(getSkillSourceType('project')).toBe('jcli')
    })

    it('returns global for global-prefixed source', () => {
      expect(getSkillSourceType('global:.claude/agents/skills/my-skill')).toBe('global')
      expect(getSkillSourceType('global:.agent/skills/another')).toBe('global')
    })

    it('returns workspace for unknown source', () => {
      expect(getSkillSourceType('workspace')).toBe('workspace')
      expect(getSkillSourceType('')).toBe('workspace')
    })
  })

  describe('getSkillSourceBadge', () => {
    it('returns j-cli label with blue class', () => {
      const badge = getSkillSourceBadge('jcli')
      expect(badge.label).toBe('j-cli')
      expect(badge.className).toContain('blue')
    })

    it('returns global label with orange class', () => {
      const badge = getSkillSourceBadge('global')
      expect(badge.label).toBe('global')
      expect(badge.className).toContain('orange')
    })

    it('returns workspace label with emerald class', () => {
      const badge = getSkillSourceBadge('workspace')
      expect(badge.label).toBe('workspace')
      expect(badge.className).toContain('emerald')
    })
  })

  describe('externalSkillSlug', () => {
    it('extracts last directory from Unix path', () => {
      expect(externalSkillSlug('/home/user/.jdata/agent/skills/my-skill')).toBe('my-skill')
    })

    it('extracts last directory from Windows path', () => {
      expect(externalSkillSlug('C:\\Users\\test\\.claude\\agents\\skills\\my-skill')).toBe('my-skill')
    })

    it('extracts last directory from relative path', () => {
      expect(externalSkillSlug('.agent/skills/another-skill')).toBe('another-skill')
    })

    it('returns unknown for empty path', () => {
      expect(externalSkillSlug('')).toBe('unknown')
    })
  })
})

describe('Dual-source skills — IPC wrappers', () => {
  it('listSkills invokes list_skills command', async () => {
    const mockInvoke = vi.mocked(
      (await import('@tauri-apps/api/core')).invoke,
    )
    mockInvoke.mockResolvedValueOnce([
      { name: 'Test Skill', description: 'A test', source: 'user', dirPath: '/path/to/skill' },
    ])

    const result = await ipc.listSkills()
    expect(mockInvoke).toHaveBeenCalledWith('list_skills')
    expect(result).toHaveLength(1)
    expect(result[0]?.name).toBe('Test Skill')
  })

  it('scanGlobalSkills invokes scan_global_skills command', async () => {
    const mockInvoke = vi.mocked(
      (await import('@tauri-apps/api/core')).invoke,
    )
    mockInvoke.mockResolvedValueOnce([
      { name: 'Global Skill', description: 'From global', source: 'global:.claude/agents/skills/gs', dirPath: '/path/gs' },
    ])

    const result = await ipc.scanGlobalSkills()
    expect(mockInvoke).toHaveBeenCalledWith('scan_global_skills')
    expect(result).toHaveLength(1)
    expect(result[0]?.name).toBe('Global Skill')
  })

  it('copySkillToWorkspace invokes copy_skill_to_workspace command', async () => {
    const mockInvoke = vi.mocked(
      (await import('@tauri-apps/api/core')).invoke,
    )
    mockInvoke.mockResolvedValueOnce(undefined)

    const result = await ipc.copySkillToWorkspace('/source/dir', 'my-workspace', 'my-skill')
    expect(mockInvoke).toHaveBeenCalledWith('copy_skill_to_workspace', {
      sourceDir: '/source/dir',
      workspaceSlug: 'my-workspace',
      skillSlug: 'my-skill',
    })
    expect(result).toBeUndefined()
  })
})

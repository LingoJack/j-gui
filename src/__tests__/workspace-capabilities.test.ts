import { describe, expect, it } from 'vitest'
import { mergeWorkspaceCapabilities } from '@/lib/workspace-capabilities'

describe('mergeWorkspaceCapabilities', () => {
  it('merges workspace, j-cli, and global skills into one visible capability set', () => {
    const merged = mergeWorkspaceCapabilities(
      {
        mcpServers: [
          { name: 'workspace-mcp', enabled: true, type: 'stdio' },
        ],
        skills: [
          { slug: 'workspace-skill', name: 'Workspace Skill', description: 'workspace', enabled: true },
        ],
      },
      [
        { name: 'global-mcp', transport: 'http', disabled: false },
      ],
      [
        { name: 'jcli skill', description: 'from j-cli', dirPath: 'C:\\skills\\jcli-skill' },
        { name: 'global skill', description: 'from global', dirPath: 'C:\\global\\global-skill' },
      ],
    )

    expect(merged.mcpServers).toEqual([
      { name: 'workspace-mcp', enabled: true, type: 'stdio' },
      { name: 'global-mcp', enabled: true, type: 'http' },
    ])

    expect(merged.skills.map((skill) => skill.slug)).toEqual([
      'workspace-skill',
      'jcli-skill',
      'global-skill',
    ])
  })

  it('keeps workspace-defined skills authoritative when slugs collide', () => {
    const merged = mergeWorkspaceCapabilities(
      {
        mcpServers: [],
        skills: [
          { slug: 'shared-skill', name: 'Workspace Version', description: 'workspace', enabled: false },
        ],
      },
      [],
      [
        { name: 'External Version', description: 'external', dirPath: 'C:\\skills\\shared-skill' },
      ],
    )

    expect(merged.skills).toEqual([
      { slug: 'shared-skill', name: 'Workspace Version', description: 'workspace', enabled: false },
    ])
  })
})

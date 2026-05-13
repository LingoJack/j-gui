import type { WorkspaceCapabilities } from '@jgui/shared'

interface JCliMcpServer {
  name: string
  transport: WorkspaceCapabilities['mcpServers'][number]['type']
  disabled: boolean
}

interface ExternalSkillEntry {
  name: string
  description: string
  dirPath: string
}

function externalSkillSlug(dirPath: string): string {
  return dirPath.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? 'unknown'
}

/**
 * 合并工作区能力与 j-cli / 全局能力，保证侧边栏计数、补全入口、设置页口径一致。
 */
export function mergeWorkspaceCapabilities(
  workspaceCapabilities: WorkspaceCapabilities,
  jcliMcpServers: JCliMcpServer[],
  externalSkills: ExternalSkillEntry[],
): WorkspaceCapabilities {
  const mergedMcp = new Map<string, WorkspaceCapabilities['mcpServers'][number]>(
    workspaceCapabilities.mcpServers.map((server) => [server.name, server]),
  )

  for (const server of jcliMcpServers) {
    if (!mergedMcp.has(server.name)) {
      mergedMcp.set(server.name, {
        name: server.name,
        enabled: !server.disabled,
        type: server.transport,
      })
    }
  }

  const mergedSkills = new Map<string, WorkspaceCapabilities['skills'][number]>(
    workspaceCapabilities.skills.map((skill) => [skill.slug, skill]),
  )

  for (const skill of externalSkills) {
    const slug = externalSkillSlug(skill.dirPath)
    if (!mergedSkills.has(slug)) {
      mergedSkills.set(slug, {
        slug,
        name: skill.name,
        description: skill.description,
        enabled: true,
      })
    }
  }

  return {
    mcpServers: [...mergedMcp.values()],
    skills: [...mergedSkills.values()],
  }
}

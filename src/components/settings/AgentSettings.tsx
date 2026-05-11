/**
 * AgentSettings - Agent 设置页面
 *
 * 标签布局：
 * 1. Skills — 主从视图（左列列表 + 右列详情 + 内联编辑）
 * 2. MCP 服务器 — 管理当前工作区的 MCP 服务器配置
 * 3. 内置工具 — 只读展示内置工具状态
 */

import * as React from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { Plus, Plug, Pencil, Trash2, Sparkles, FolderOpen, MessageSquare, ShieldCheck, Globe, Terminal, Database } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import {
  agentWorkspacesAtom,
  currentAgentWorkspaceIdAtom,
  agentChannelIdAtom,
  agentSessionsAtom,
  currentAgentSessionIdAtom,
  agentPendingPromptAtom,
  workspaceCapabilitiesVersionAtom,
} from '@/atoms/agent-atoms'
import { settingsOpenAtom } from '@/atoms/settings-tab'
import { appModeAtom } from '@/atoms/app-mode'
import type { McpServerEntry, SkillMeta, OtherWorkspaceSkillsGroup, WorkspaceMcpConfig } from '@jgui/shared'
import { SettingsSection, SettingsCard, SettingsRow } from './primitives'
import { McpServerForm } from './McpServerForm'
import { SkillListPanel } from './SkillListPanel'
import { SkillDetailPanel } from './SkillDetailPanel'
import { BuiltinAgentTools } from './BuiltinAgentTools'
import { getSkillSourceType, getSkillSourceBadge, externalSkillSlug } from './skill-helpers'
import * as ipc from '@/lib/ipc'

// ===== 类型 =====

type ViewMode = 'list' | 'create' | 'edit'

interface JCliMcpServer {
  name: string
  transport: string
  command?: string
  args?: string[]
  url?: string
  env?: Record<string, string>
  disabled: boolean
}

interface EditingServer {
  name: string
  entry: McpServerEntry
}

interface ExternalSkill {
  name: string
  description: string
  source: string
  dirPath: string
}

// ===== 主体组件 =====

export function AgentSettings(): React.ReactElement {
  const workspaces = useAtomValue(agentWorkspacesAtom)
  const currentWorkspaceId = useAtomValue(currentAgentWorkspaceIdAtom)
  const agentChannelId = useAtomValue(agentChannelIdAtom)
  const setAgentSessions = useSetAtom(agentSessionsAtom)
  const setCurrentSessionId = useSetAtom(currentAgentSessionIdAtom)
  const setPendingPrompt = useSetAtom(agentPendingPromptAtom)
  const setSettingsOpen = useSetAtom(settingsOpenAtom)
  const setAppMode = useSetAtom(appModeAtom)
  const bumpCapabilitiesVersion = useSetAtom(workspaceCapabilitiesVersionAtom)

  const currentWorkspace = workspaces.find((w) => w.id === currentWorkspaceId)
  const workspaceSlug = currentWorkspace?.slug ?? ''

  // 标签页和视图状态
  const [activeTab, setActiveTab] = React.useState('skills')
  const [viewMode, setViewMode] = React.useState<ViewMode>('list')
  const [editingServer, setEditingServer] = React.useState<EditingServer | null>(null)

  // MCP 数据源选择
  const [mcpSource, setMcpSource] = React.useState<'workspace' | 'jcli'>('workspace')

  // 数据状态
  const [mcpConfig, setMcpConfig] = React.useState<WorkspaceMcpConfig>({ servers: {} })
  const [jCliMcpServers, setJCliMcpServers] = React.useState<JCliMcpServer[]>([])
  const [skills, setSkills] = React.useState<SkillMeta[]>([])
  const [skillsDir, setSkillsDir] = React.useState('')
  const [jCliSkills, setJCliSkills] = React.useState<ExternalSkill[]>([])
  const [globalSkills, setGlobalSkills] = React.useState<ExternalSkill[]>([])
  const [scanningGlobal, setScanningGlobal] = React.useState(false)
  const [importingExternal, setImportingExternal] = React.useState<string | null>(null)
  const [otherWorkspaces, setOtherWorkspaces] = React.useState<OtherWorkspaceSkillsGroup[]>([])
  const [showImportDialog, setShowImportDialog] = React.useState(false)
  const [importingSkill, setImportingSkill] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [selectedSkillSlug, setSelectedSkillSlug] = React.useState<string | null>(null)

  const importGenRef = React.useRef(0)

  const selectedSkill = skills.find((s) => s.slug === selectedSkillSlug) ?? null

  const loadData = React.useCallback(async () => {
    if (!workspaceSlug) {
      setLoading(false)
      return
    }
    try {
      const [config, skillList, dir, jCliList, jCliMcp] = await Promise.all([
        ipc.getWorkspaceMcpConfig(workspaceSlug),
        ipc.getWorkspaceSkills(workspaceSlug),
        ipc.getWorkspaceSkillsDir(workspaceSlug),
        ipc.listSkills().catch(() => [] as ExternalSkill[]),
        ipc.listMcpServers(),
      ])
      setMcpConfig(config)
      setSkills(skillList)
      setSkillsDir(dir)
      setJCliSkills(jCliList)
      setJCliMcpServers(jCliMcp)
    } catch (error) {
      console.error('[Agent 设置] 加载工作区配置失败:', error)
    } finally {
      setLoading(false)
    }
  }, [workspaceSlug])

  const loadOtherWorkspaces = React.useCallback(async (): Promise<OtherWorkspaceSkillsGroup[]> => {
    if (!workspaceSlug) return []
    try {
      return await ipc.getOtherWorkspaceSkills(workspaceSlug)
    } catch (error) {
      console.error('[Agent 设置] 加载其他工作区 Skill 失败:', error)
      return []
    }
  }, [workspaceSlug])

  React.useEffect(() => {
    if (showImportDialog) {
      const gen = ++importGenRef.current
      void loadOtherWorkspaces().then((result) => {
        if (importGenRef.current === gen) setOtherWorkspaces(result)
      })
    }
  }, [showImportDialog, loadOtherWorkspaces])

  React.useEffect(() => { loadData() }, [loadData])

  if (!currentWorkspace) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <FolderOpen size={48} className="text-muted-foreground/50 mb-4" />
        <p className="text-sm text-muted-foreground">请先在 Agent 模式下选择或创建一个工作区</p>
      </div>
    )
  }

  const configDirName = import.meta.env.DEV ? 'jgui-dev' : 'jgui'

  const buildMcpPrompt = (): string => {
    const configPath = `~/${configDirName}/agent-workspaces/${workspaceSlug}/mcp.json`
    // 清洗 env/headers 的值，避免凭据泄露给 LLM
    const sanitized = {
      servers: Object.fromEntries(Object.entries(mcpConfig.servers).map(([k, v]) => [k, {
        ...v, env: v.env ? Object.keys(v.env).reduce((acc, key) => ({ ...acc, [key]: '***' }), {}) : undefined,
        headers: v.headers ? Object.keys(v.headers).reduce((acc, key) => ({ ...acc, [key]: '***' }), {}) : undefined,
      }]))
    }
    const currentConfig = JSON.stringify(sanitized, null, 2)
    return `请帮我配置当前工作区的 MCP 服务器，你要主动来帮我实现，你可以采用联网搜索深度研究来尝试，当前环境已经有 Claude Agent SDK 了，除非不确定的时候才来问我，否则默认将帮我完成安装，而不是指导我。

## 工作区信息
- 工作区: ${currentWorkspace.name}
- MCP 配置文件: ${configPath}

## 当前配置
\`\`\`json
${currentConfig}
\`\`\`

## 配置格式
mcp.json 格式如下：
\`\`\`json
{
  "servers": {
    "服务器名称": {
      "type": "stdio | http | sse",
      "command": "可执行命令",
      "args": ["参数1", "参数2"],
      "env": { "KEY": "VALUE" },
      "url": "http://...",
      "headers": { "Key": "Value" },
      "enabled": true
    }
  }
}
\`\`\`
其中 stdio 类型使用 command/args/env，http/sse 类型使用 url/headers。

请读取当前配置文件，根据我的需求添加或修改 MCP 服务器，然后写回文件。`
  }

  const buildSkillPrompt = (): string => {
    const skillsDirPath = `~/${configDirName}/agent-workspaces/${workspaceSlug}/skills/`
    const skillList = skills.length > 0
      ? skills.map((s) => `- ${s.name}: ${s.description ?? '无描述'}`).join('\n')
      : '暂无 Skill'
    return `请帮我配置当前工作区的 Skills，你要主动来帮我实现，你可以采用联网搜索深度研究来尝试，当前环境已经有 Claude Agent SDK 了，除非不确定的时候才来问我，否则默认将帮我完成安装，而不是指导我。

## 工作区信息
- 工作区: ${currentWorkspace.name}
- Skills 目录: ${skillsDirPath}

## Skill 格式
每个 Skill 是 skills/ 目录下的一个子目录，目录名即 slug。
目录内包含 SKILL.md 文件，格式：

\`\`\`markdown
---
name: Skill 显示名称
description: 简要描述
---

Skill 的详细指令内容...
\`\`\`

## 当前 Skills
${skillList}

请查看 skills/ 目录了解现有配置，根据我的需求创建或编辑 Skill。`
  }

  const handleConfigViaChat = async (promptMessage: string): Promise<void> => {
    if (!agentChannelId) {
      alert('请先在渠道设置中选择 Agent 供应商')
      return
    }
    try {
      const session = await ipc.createAgentSession(undefined, agentChannelId, currentWorkspaceId ?? undefined)
      const sessions = await ipc.listAgentSessions()
      setAgentSessions(sessions)
      setCurrentSessionId(session.id)
      setPendingPrompt({ sessionId: session.id, message: promptMessage })
      setAppMode('agent')
      setSettingsOpen(false)
    } catch (error) {
      console.error('[Agent 设置] 创建配置会话失败:', error)
      toast.error('创建配置会话失败')
    }
  }

  // MCP 相关处理函数
  const handleDeleteMcp = async (serverName: string): Promise<void> => {
    const entry = mcpConfig.servers[serverName]
    if (entry?.isBuiltin) return
    if (!confirm(`确定删除 MCP 服务器「${serverName}」？此操作不可恢复。`)) return
    try {
      const newServers = { ...mcpConfig.servers }
      delete newServers[serverName]
      const newConfig: WorkspaceMcpConfig = { servers: newServers }
      await ipc.saveWorkspaceMcpConfig(workspaceSlug, newConfig)
      setMcpConfig(newConfig)
      bumpCapabilitiesVersion((v) => v + 1)
    } catch (error) {
      console.error('[Agent 设置] 删除 MCP 服务器失败:', error)
      toast.error('删除 MCP 服务器失败')
    }
  }

  const handleToggleMcp = async (serverName: string): Promise<void> => {
    try {
      const entry = mcpConfig.servers[serverName]
      if (!entry) return
      const newConfig: WorkspaceMcpConfig = {
        servers: { ...mcpConfig.servers, [serverName]: { ...entry, enabled: !entry.enabled } },
      }
      await ipc.saveWorkspaceMcpConfig(workspaceSlug, newConfig)
      setMcpConfig(newConfig)
      bumpCapabilitiesVersion((v) => v + 1)
    } catch (error) {
      console.error('[Agent 设置] 切换 MCP 服务器状态失败:', error)
      toast.error('切换 MCP 服务器状态失败')
    }
  }

  // Skill 相关处理函数
  const handleDeleteSkill = async (skillSlug: string, skillName: string): Promise<void> => {
    if (!confirm(`确定删除 Skill「${skillName}」？此操作不可恢复。`)) return
    try {
      await ipc.deleteWorkspaceSkill(workspaceSlug, skillSlug)
      setSkills((prev) => prev.filter((s) => s.slug !== skillSlug))
      if (selectedSkillSlug === skillSlug) setSelectedSkillSlug(null)
      bumpCapabilitiesVersion((v) => v + 1)
    } catch (error) {
      console.error('[Agent 设置] 删除 Skill 失败:', error)
      toast.error('删除 Skill 失败')
    }
  }

  const handleToggleSkill = async (skillSlug: string, enabled: boolean): Promise<void> => {
    try {
      await ipc.toggleWorkspaceSkill(workspaceSlug, skillSlug, enabled)
      setSkills((prev) => prev.map((s) => s.slug === skillSlug ? { ...s, enabled } : s))
      bumpCapabilitiesVersion((v) => v + 1)
    } catch (error) {
      console.error('[Agent 设置] 切换 Skill 状态失败:', error)
      toast.error('切换 Skill 状态失败')
    }
  }

  const handleImportSkill = async (sourceSlug: string, skillSlug: string): Promise<void> => {
    if (!workspaceSlug || importingSkill) return
    setImportingSkill(skillSlug)
    try {
      const imported = await ipc.importSkillFromWorkspace(workspaceSlug, sourceSlug, skillSlug)
      setSkills((prev) => prev.some((s) => s.slug === imported.slug) ? prev : [...prev, imported])
      setSelectedSkillSlug(imported.slug)
      bumpCapabilitiesVersion((v) => v + 1)
      setShowImportDialog(false)
      toast.success(`已导入 Skill: ${imported.name}`)
    } catch (error) {
      console.error('[Agent 设置] 导入 Skill 失败:', error)
      const message = error instanceof Error ? error.message : '未知错误'
      toast.error('导入 Skill 失败', { description: message })
    } finally {
      setImportingSkill(null)
    }
  }

  const handleScanGlobal = async (): Promise<void> => {
    if (scanningGlobal) return
    setScanningGlobal(true)
    try {
      const skills = await ipc.scanGlobalSkills()
      setGlobalSkills(skills)
    } catch (error) {
      console.error('[Agent 设置] 扫描全局 Skill 失败:', error)
      toast.error('扫描全局 Skill 失败')
    } finally {
      setScanningGlobal(false)
    }
  }

  const handleImportExternal = async (sourceDir: string, name: string): Promise<void> => {
    if (!workspaceSlug || importingExternal) return
    const slug = externalSkillSlug(sourceDir)
    setImportingExternal(slug)
    try {
      await ipc.copySkillToWorkspace(sourceDir, workspaceSlug, slug)
      toast.success(`已导入 Skill: ${name}`)
      // 导入后刷新工作区技能列表
      const skillList = await ipc.getWorkspaceSkills(workspaceSlug)
      setSkills(skillList)
      setSelectedSkillSlug(slug)
      bumpCapabilitiesVersion((v) => v + 1)
    } catch (error) {
      console.error('[Agent 设置] 导入 Skill 失败:', error)
      const message = error instanceof Error ? error.message : '未知错误'
      toast.error('导入 Skill 失败', { description: message })
    } finally {
      setImportingExternal(null)
    }
  }

  const handleSkillContentSaved = (): void => {
    loadData()
    bumpCapabilitiesVersion((v) => v + 1)
  }

  const handleFormSaved = (): void => {
    setViewMode('list')
    setEditingServer(null)
    setActiveTab('mcp')
    loadData()
    bumpCapabilitiesVersion((v) => v + 1)
  }

  const handleFormCancel = (): void => {
    setViewMode('list')
    setEditingServer(null)
    setActiveTab('mcp')
  }

  // MCP 表单提前返回分支
  if (viewMode === 'create' || viewMode === 'edit') {
    return (
      <McpServerForm
        server={editingServer}
        workspaceSlug={workspaceSlug}
        onSaved={handleFormSaved}
        onCancel={handleFormCancel}
      />
    )
  }

  const serverEntries = Object.entries(mcpConfig.servers ?? {}).filter(
    ([name]) => name !== 'memos-cloud',
  )

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="relative flex rounded-xl bg-muted p-1">
          <div
            className={cn(
              'mode-slider absolute top-1 bottom-1 w-[calc(33.333%-3px)] rounded-lg bg-background shadow-sm transition-transform duration-300 ease-in-out',
              activeTab === 'skills' && 'translate-x-0',
              activeTab === 'mcp' && 'translate-x-[100%]',
              activeTab === 'tools' && 'translate-x-[200%]',
            )}
          />
          {[
            { value: 'skills', label: 'Skills' },
            { value: 'mcp', label: 'MCP' },
            { value: 'tools', label: '内置工具' },
          ].map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setActiveTab(value)}
              className={cn(
                'relative z-[1] flex-1 flex items-center justify-center rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-200',
                activeTab === value
                  ? 'mode-btn-selected text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ===== Skills 标签页 ===== */}
        <TabsContent value="skills" className="mt-4 space-y-4">
          <SettingsSection
            title="Skills"
            description={`当前工作区: ${currentWorkspace.name}`}
            action={
              <div className="flex items-center gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="sm" onClick={() => handleConfigViaChat(buildSkillPrompt())}>
                      <MessageSquare size={14} />
                      <span>AI 配置</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs text-xs">
                    j-gui Agent 内置 Skills Finder，你可以在 Agent 模式下要求 j-gui 帮你联网查找某类 Skills 并安装到当前的工作区使用；也可以跟 j-gui Agent 一起探讨，利用 j-gui Agent 内置的 Skills Creator 来一起创建高质量可复用的 Skills 到当前的工作区
                  </TooltipContent>
                </Tooltip>
                <Button size="sm" variant="outline" onClick={() => void handleScanGlobal()}>
                  <Globe size={16} />
                  <span>{scanningGlobal ? '扫描中...' : '扫描全局'}</span>
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowImportDialog(true)}>
                  <Plus size={16} />
                  <span>从其他工作区导入</span>
                </Button>
                {skillsDir && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => ipc.openFile(skillsDir)}
                        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                      >
                        <FolderOpen size={16} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>打开 Skills 目录</TooltipContent>
                  </Tooltip>
                )}
              </div>
            }
          >
            {loading ? (
              <div className="text-sm text-muted-foreground py-8 text-center">加载中...</div>
            ) : (
              <>
                {/* 工作区 Skills 主从视图 */}
                <div className="flex border border-border rounded-lg overflow-hidden" style={{ minHeight: 420 }}>
                  <SkillListPanel
                    skills={skills}
                    selectedSlug={selectedSkillSlug}
                    onSelect={setSelectedSkillSlug}
                    onDelete={handleDeleteSkill}
                    onToggle={handleToggleSkill}
                    skillsDir={skillsDir}
                  />
                  <div className="flex-1 overflow-y-auto">
                    {selectedSkill ? (
                      <SkillDetailPanel
                        skill={selectedSkill}
                        workspaceSlug={workspaceSlug}
                        onSaved={handleSkillContentSaved}
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                        {skills.length === 0 ? '暂无 Skill — 可从下方 j-cli/全局来源导入' : '选择一个 Skill 查看详情'}
                      </div>
                    )}
                  </div>
                </div>

                {/* j-cli Skills */}
                {jCliSkills.length > 0 && (
                  <ExternalSkillsSection
                    title="j-cli Skills"
                    icon={<Terminal size={16} className="text-blue-500" />}
                    skills={jCliSkills}
                    importingExternal={importingExternal}
                    onImport={handleImportExternal}
                    onSelect={(dirPath) => {
                      const slug = externalSkillSlug(dirPath)
                      const existing = skills.find((s) => s.slug === slug)
                      if (existing) setSelectedSkillSlug(slug)
                    }}
                  />
                )}

                {/* 全局 Skills */}
                {globalSkills.length > 0 && (
                  <ExternalSkillsSection
                    title="全局 Skills"
                    icon={<Database size={16} className="text-orange-500" />}
                    skills={globalSkills}
                    importingExternal={importingExternal}
                    onImport={handleImportExternal}
                    onSelect={(dirPath) => {
                      const slug = externalSkillSlug(dirPath)
                      const existing = skills.find((s) => s.slug === slug)
                      if (existing) setSelectedSkillSlug(slug)
                    }}
                  />
                )}
              </>
            )}
          </SettingsSection>
        </TabsContent>

        {/* ===== MCP 标签页 ===== */}
        <TabsContent value="mcp" className="mt-4 space-y-4">
          <SettingsSection
            title="MCP 服务器"
            description={mcpSource === 'workspace' ? `当前工作区: ${currentWorkspace.name}` : undefined}
            action={
              <div className="flex items-center gap-2">
                <div className="flex rounded-lg bg-muted p-0.5">
                  <button
                    onClick={() => setMcpSource('workspace')}
                    className={cn(
                      'px-2.5 py-1 text-xs font-medium rounded-md transition-colors',
                      mcpSource === 'workspace'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    工作区 MCP
                  </button>
                  <button
                    onClick={() => setMcpSource('jcli')}
                    className={cn(
                      'px-2.5 py-1 text-xs font-medium rounded-md transition-colors',
                      mcpSource === 'jcli'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    j-cli MCP
                  </button>
                </div>
                {mcpSource === 'workspace' && (
                  <>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="sm" onClick={() => handleConfigViaChat(buildMcpPrompt())}>
                          <MessageSquare size={14} />
                          <span>AI 配置</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-xs text-xs">
                        j-gui Agent 可以帮助你联网查找公开的 MCP 并配置到当前工作区，你可以在 Agent 模式下用自然语言表达你想要的 MCP 并要求安装到当前工作区即可；也可以跟 j-gui Agent 一起探讨创建你的专属 MCP 到当前工作区
                      </TooltipContent>
                    </Tooltip>
                    <Button size="sm" variant="outline" onClick={() => { setActiveTab('mcp'); setViewMode('create') }}>
                      <Plus size={16} />
                      <span>添加服务器</span>
                    </Button>
                  </>
                )}
              </div>
            }
          >
            {loading ? (
              <div className="text-sm text-muted-foreground py-8 text-center">加载中...</div>
            ) : mcpSource === 'workspace' ? (
              serverEntries.length === 0 ? (
                <SettingsCard divided={false}>
                  <div className="text-sm text-muted-foreground py-12 text-center">
                    还没有配置任何 MCP 服务器，点击上方"添加服务器"开始
                  </div>
                </SettingsCard>
              ) : (
                <SettingsCard>
                  {serverEntries.map(([name, entry]) => (
                    <McpServerRow
                      key={name}
                      name={name}
                      entry={entry}
                      onEdit={() => { setEditingServer({ name, entry }); setViewMode('edit') }}
                      onDelete={() => handleDeleteMcp(name)}
                      onToggle={() => handleToggleMcp(name)}
                    />
                  ))}
                </SettingsCard>
              )
            ) : (
              <JCliMcpView servers={jCliMcpServers} />
            )}
          </SettingsSection>
        </TabsContent>

        {/* ===== 内置工具标签页 ===== */}
        <TabsContent value="tools" className="mt-4">
          <BuiltinAgentTools />
        </TabsContent>
      </Tabs>

      <ImportSkillFromWorkspaceDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        otherWorkspaces={otherWorkspaces}
        installedSkills={skills}
        importingSkill={importingSkill}
        onImport={handleImportSkill}
      />
    </div>
  )
}

// ===== MCP 服务器行 =====

const TRANSPORT_LABELS: Record<string, string> = { stdio: 'stdio', http: 'HTTP', sse: 'SSE' }

interface McpServerRowProps {
  name: string
  entry: McpServerEntry
  onEdit: () => void
  onDelete: () => void
  onToggle: () => void
}

function McpServerRow({ name, entry, onEdit, onDelete, onToggle }: McpServerRowProps): React.ReactElement {
  const isBuiltin = entry.isBuiltin === true
  return (
    <SettingsRow
      label={name}
      icon={<Plug size={18} className="text-blue-500" />}
      description={entry.type === 'stdio' ? entry.command : entry.url}
      className="group"
    >
      <div className="flex items-center gap-2">
        {isBuiltin && (
          <span className="flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium">
            <ShieldCheck size={12} />
            内置
          </span>
        )}
        <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground font-medium">
          {TRANSPORT_LABELS[entry.type] ?? entry.type}
        </span>
        <button onClick={onEdit} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors opacity-0 group-hover:opacity-100" title="编辑">
          <Pencil size={14} />
        </button>
        {!isBuiltin && (
          <button onClick={onDelete} className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100" title="删除">
            <Trash2 size={14} />
          </button>
        )}
        <Switch checked={entry.enabled} onCheckedChange={onToggle} />
      </div>
    </SettingsRow>
  )
}

// ===== Skill 列表面板 - 已拆到 SkillListPanel.tsx =====

// ===== Skill 详情面板 - 已拆到 SkillDetailPanel.tsx =====

// ===== Skill 详情面板 - 已拆到 SkillDetailPanel.tsx =====

// ===== j-cli MCP 视图（只读） =====

interface JCliMcpViewProps {
  servers: JCliMcpServer[]
}

function JCliMcpView({ servers }: JCliMcpViewProps): React.ReactElement {
  if (servers.length === 0) {
    return (
      <SettingsCard divided={false}>
        <div className="text-sm text-muted-foreground py-12 text-center">
          暂无 j-cli MCP 服务器
        </div>
      </SettingsCard>
    )
  }

  return (
    <SettingsCard>
      {servers.map((server) => {
        const transportInfo = server.transport === 'stdio'
          ? `${server.command ?? ''} ${(server.args ?? []).join(' ')}`
          : server.url ?? ''

        return (
          <SettingsRow
            key={server.name}
            label={server.name}
            icon={<Plug size={18} className="text-blue-500" />}
            description={transportInfo}
          >
            <div className="flex items-center gap-2">
              <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground font-medium">
                {TRANSPORT_LABELS[server.transport] ?? server.transport}
              </span>
              {server.disabled && (
                <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-red-500/10 text-red-600 dark:text-red-400 font-medium">
                  已禁用
                </span>
              )}
            </div>
          </SettingsRow>
        )
      })}
    </SettingsCard>
  )
}

// ===== 外部 Skills 区域（j-cli / global） =====

interface ExternalSkillsSectionProps {
  title: string
  icon: React.ReactElement
  skills: ExternalSkill[]
  importingExternal: string | null
  onImport: (sourceDir: string, name: string) => Promise<void>
  onSelect: (dirPath: string) => void
}

function ExternalSkillsSection({ title, icon, skills, importingExternal, onImport, onSelect }: ExternalSkillsSectionProps): React.ReactElement {
  return (
    <div className="pt-4">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h4 className="text-sm font-medium text-foreground">{title}</h4>
        <span className="text-xs text-muted-foreground ml-auto">{skills.length} 个</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {skills.map((skill) => {
          const slug = externalSkillSlug(skill.dirPath)
          const sourceType = getSkillSourceType(skill.source)
          const badge = getSkillSourceBadge(sourceType)
          return (
            <SettingsCard key={slug} divided={false} className="overflow-hidden">
              <div className="flex flex-col gap-3 p-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-amber-500/12 p-2 text-amber-500 shadow-sm">
                    <Sparkles size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="truncate text-sm font-medium text-foreground">{skill.name}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium flex-shrink-0 ${badge.className}`}>
                        {badge.label}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">{slug}</div>
                  </div>
                </div>
                <div className="line-clamp-2 min-h-[32px] text-sm leading-5 text-muted-foreground">
                  {skill.description || '暂无描述'}
                </div>
                <Button
                  size="sm"
                  className="w-full"
                  onClick={() => void onImport(skill.dirPath, skill.name)}
                  disabled={importingExternal !== null}
                >
                  {importingExternal === slug ? '导入中...' : '导入到工作区'}
                </Button>
              </div>
            </SettingsCard>
          )
        })}
      </div>
    </div>
  )
}

// ===== 导入 Skill 对话框 =====

interface ImportSkillFromWorkspaceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  otherWorkspaces: OtherWorkspaceSkillsGroup[]
  installedSkills: SkillMeta[]
  importingSkill: string | null
  onImport: (sourceSlug: string, skillSlug: string) => Promise<void>
}

function ImportSkillFromWorkspaceDialog({
  open,
  onOpenChange,
  otherWorkspaces,
  installedSkills,
  importingSkill,
  onImport,
}: ImportSkillFromWorkspaceDialogProps): React.ReactElement {
  const installedSlugs = React.useMemo(
    () => new Set(installedSkills.map((skill) => skill.slug)),
    [installedSkills],
  )

  const availableWorkspaces = React.useMemo(
    () =>
      otherWorkspaces
        .map((workspace) => ({
          ...workspace,
          skills: workspace.skills.filter((skill) => !installedSlugs.has(skill.slug)),
        }))
        .filter((workspace) => workspace.skills.length > 0),
    [otherWorkspaces, installedSlugs],
  )
  const [selectedWorkspaceSlug, setSelectedWorkspaceSlug] = React.useState('')

  const selectedWorkspace = React.useMemo(
    () => availableWorkspaces.find((workspace) => workspace.workspaceSlug === selectedWorkspaceSlug) ?? null,
    [availableWorkspaces, selectedWorkspaceSlug],
  )

  React.useEffect(() => {
    if (!open || availableWorkspaces.length === 0) {
      setSelectedWorkspaceSlug('')
      return
    }
    setSelectedWorkspaceSlug((current) =>
      availableWorkspaces.some((workspace) => workspace.workspaceSlug === current)
        ? current
        : availableWorkspaces[0]?.workspaceSlug ?? '',
    )
  }, [availableWorkspaces, open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 overflow-hidden p-0">
        <DialogHeader className="px-6 pb-4 pt-6">
          <DialogTitle>从其他工作区导入 Skill</DialogTitle>
          <DialogDescription>
            从其他工作区中选择 Skill 导入到当前工作区。已安装的同名 Skill 会自动过滤。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto px-6 pb-6 max-h-[60vh]">
          {availableWorkspaces.length === 0 ? (
            <SettingsCard divided={false}>
              <div className="py-10 text-center text-sm text-muted-foreground">
                没有可导入的 Skill。其他工作区暂无 Skill，或者它们都已经安装到当前工作区了。
              </div>
            </SettingsCard>
          ) : (
            <div className="space-y-6">
              <div className="space-y-2">
                <div className="text-sm font-medium text-foreground">选择来源工作区</div>
                <Select value={selectedWorkspaceSlug} onValueChange={setSelectedWorkspaceSlug}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择来源工作区" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableWorkspaces.map((workspace) => (
                      <SelectItem key={workspace.workspaceSlug} value={workspace.workspaceSlug}>
                        {workspace.workspaceName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {(selectedWorkspace ? [selectedWorkspace] : []).map((workspace) => (
                <div key={workspace.workspaceSlug}>
                  <div className="mb-3 flex items-center justify-between gap-3 text-sm text-muted-foreground">
                    <span className="truncate">{workspace.workspaceName}</span>
                    <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-xs font-medium tabular-nums">
                      {workspace.skills.length} 个
                    </span>
                  </div>
                  <div className="pr-1">
                    <div className="grid gap-3 sm:grid-cols-2">
                      {workspace.skills.map((skill) => (
                        <SettingsCard key={skill.slug} divided={false} className="overflow-hidden">
                          <div className="flex h-full flex-col gap-4 p-4">
                            <div className="flex items-start gap-3">
                              <div className="rounded-xl bg-amber-500/12 p-2 text-amber-500 shadow-sm">
                                <Sparkles size={18} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <div className="truncate text-sm font-medium text-foreground">{skill.name}</div>
                                  {skill.version ? (
                                    <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                                      v{skill.version}
                                    </span>
                                  ) : null}
                                </div>
                                <div className="mt-1 text-xs text-muted-foreground">{skill.slug}</div>
                              </div>
                            </div>
                            <div className="line-clamp-3 min-h-[40px] text-sm leading-6 text-muted-foreground">
                              {skill.description ?? '暂无描述'}
                            </div>
                            <Button
                              size="sm"
                              className="w-full"
                              onClick={() => void onImport(workspace.workspaceSlug, skill.slug)}
                              disabled={importingSkill !== null}
                            >
                              {importingSkill === skill.slug ? '导入中...' : '导入'}
                            </Button>
                          </div>
                        </SettingsCard>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

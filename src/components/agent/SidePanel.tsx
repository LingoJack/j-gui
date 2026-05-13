/**
 * SidePanel — Agent 侧面板容器
 *
 * 直接展示文件浏览器，默认打开状态。
 * 切换按钮在面板关闭时显示活动指示点。
 */

import * as React from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { X, FolderOpen, ExternalLink, RefreshCw, ChevronRight, MoreHorizontal, FolderSearch, Pencil, FolderInput, Info, FolderHeart, MessageSquarePlus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  buildCompactDisplayPath,
  getDisplayPathBasename,
  normalizeDisplayPath,
} from '@/lib/path-display'
import { getEffectiveChatWorkspaceId } from '@/lib/chat-workspace'
import { FileBrowser, FileDropZone, FileTypeIcon } from '@/components/file-browser'
import {
  agentSidePanelOpenMapAtom,
  sessionSidePanelOpenAtom,
  workspaceFilesVersionAtom,
  recentlyModifiedPathsAtom,
  currentAgentWorkspaceIdAtom,
  agentWorkspacesAtom,
  agentSessionsAtom,
  agentAttachedDirectoriesMapAtom,
  workspaceAttachedDirectoriesMapAtom,
  agentPendingFilesAtom,
} from '@/atoms/agent-atoms'
import { pendingAttachmentsAtom, type PendingAttachment } from '@/atoms/chat-atoms'
import { currentConversationIdAtom, currentChatWorkspaceIdAtom } from '@/atoms/chat-atoms'
import { detectIsMac, detectIsWindows } from '@/lib/platform'
import type { FileEntry, AgentPendingFile } from '@jgui/shared'
import * as ipc from '@/lib/ipc'

interface SidePanelProps {
  sessionId: string
  sessionPath: string | null
  mode?: 'agent' | 'chat'
}

export function SidePanel({ sessionId, sessionPath, mode = 'agent' }: SidePanelProps): React.ReactElement {
  // per-session 侧面板状态（默认打开）
  const setSidePanelOpenMap = useSetAtom(agentSidePanelOpenMapAtom)
  const isWindows = React.useMemo(() => detectIsWindows(), [])
  const isMac = React.useMemo(() => detectIsMac(), [])
  const openLocationLabel = isWindows
    ? '在资源管理器中打开'
    : isMac
      ? '在 Finder 中打开'
      : '打开所在目录'
  const openWorkspaceLocationLabel = isWindows
    ? '在资源管理器中打开工作区文件目录'
    : isMac
      ? '在 Finder 中打开工作区文件目录'
      : '打开工作区文件目录'

  const isOpen = useAtomValue(sessionSidePanelOpenAtom(sessionId))
  const panelTitle = mode === 'chat' ? '聊天工作区' : '工作区文件'

  // 动画标志：渲染阶段直接计算，同一会话内 isOpen 变化时启用过渡动画，切换会话时即时显示
  const prevIsOpenRef = React.useRef(isOpen)
  const prevSessionIdRef = React.useRef(sessionId)
  const shouldAnimate = prevSessionIdRef.current === sessionId && prevIsOpenRef.current !== isOpen
  // 在渲染后更新 prev 值，以便下次渲染比较
  React.useEffect(() => {
    prevIsOpenRef.current = isOpen
    prevSessionIdRef.current = sessionId
  }, [isOpen, sessionId])

  const setIsOpen = React.useCallback((value: boolean | ((prev: boolean) => boolean)) => {
    setSidePanelOpenMap((prev) => {
      const map = new Map(prev)
      const current = map.get(sessionId) ?? true
      map.set(sessionId, typeof value === 'function' ? value(current) : value)
      return map
    })
  }, [sessionId, setSidePanelOpenMap])

  const filesVersion = useAtomValue(workspaceFilesVersionAtom)
  const setFilesVersion = useSetAtom(workspaceFilesVersionAtom)
  const recentlyModifiedMap = useAtomValue(recentlyModifiedPathsAtom)

  // 派生当前工作区 slug（用于 FileDropZone IPC 调用）
  const currentWorkspaceId = useAtomValue(currentAgentWorkspaceIdAtom)
  const [currentChatWorkspaceId, setCurrentChatWorkspaceId] = useAtom(currentChatWorkspaceIdAtom)
  const workspaces = useAtomValue(agentWorkspacesAtom)
  const agentSessions = useAtomValue(agentSessionsAtom)
  const effectiveWorkspaceId = React.useMemo(() => {
    if (mode === 'chat') {
      return getEffectiveChatWorkspaceId(currentChatWorkspaceId, workspaces)
    }
    const sessionWorkspaceId = agentSessions.find((session) => session.id === sessionId)?.workspaceId
    // 右侧面板的文件根必须优先跟随当前会话，避免手动切了左侧工作区后把活动会话指到错误目录。
    if (sessionWorkspaceId) return sessionWorkspaceId
    if (currentWorkspaceId) return currentWorkspaceId
    return workspaces[0]?.id ?? null
  }, [mode, currentChatWorkspaceId, currentWorkspaceId, agentSessions, sessionId, workspaces])
  const workspaceSlug = workspaces.find((w) => w.id === effectiveWorkspaceId)?.slug ?? null

  // 附加目录列表（会话级）
  const attachedDirsMap = useAtomValue(agentAttachedDirectoriesMapAtom)
  const setAttachedDirsMap = useSetAtom(agentAttachedDirectoriesMapAtom)
  const attachedDirs = attachedDirsMap.get(sessionId) ?? []

  // 附加目录列表（工作区级）
  const wsAttachedDirsMap = useAtomValue(workspaceAttachedDirectoriesMapAtom)
  const setWsAttachedDirsMap = useSetAtom(workspaceAttachedDirectoriesMapAtom)
  const wsAttachedDirs = effectiveWorkspaceId ? (wsAttachedDirsMap.get(effectiveWorkspaceId) ?? []) : []

  // 加载工作区级附加目录
  React.useEffect(() => {
    if (!workspaceSlug || !effectiveWorkspaceId) return
    ipc.getWorkspaceDirectories(workspaceSlug)
      .then((dirs) => {
        setWsAttachedDirsMap((prev) => {
          const map = new Map(prev)
          map.set(effectiveWorkspaceId, dirs)
          return map
        })
      })
      .catch(console.error)
  }, [workspaceSlug, effectiveWorkspaceId, setWsAttachedDirsMap])

  // === 会话级：附加/移除目录 ===

  const attachSessionDir = React.useCallback(async (dirPath: string) => {
    const updated = await ipc.attachDirectory({ sessionId, directoryPath: dirPath })
    setAttachedDirsMap((prev) => {
      const map = new Map(prev)
      map.set(sessionId, updated)
      return map
    })
  }, [sessionId, setAttachedDirsMap])

  const handleAttachFolder = React.useCallback(async () => {
    try {
      const result = await ipc.openFolderDialog()
      if (!result.canceled) {
        for (const dirPath of result.filePaths) {
          await attachSessionDir(dirPath)
        }
      }
    } catch (error) {
      console.error('[SidePanel] 附加文件夹失败:', error)
    }
  }, [attachSessionDir])

  const handleSessionFoldersDropped = React.useCallback(async (folderPaths: string[]) => {
    for (const dirPath of folderPaths) {
      try { await attachSessionDir(dirPath) } catch (error) {
        console.error('[SidePanel] 拖拽附加文件夹失败:', error)
      }
    }
  }, [attachSessionDir])

  const handleDetachDirectory = React.useCallback(async (dirPath: string) => {
    try {
      await ipc.detachDirectory(sessionId, dirPath)
      setAttachedDirsMap((prev) => {
        const map = new Map(prev)
        const updated = (map.get(sessionId) ?? []).filter((path) => path !== dirPath)
        if (updated.length > 0) { map.set(sessionId, updated) } else { map.delete(sessionId) }
        return map
      })
    } catch (error) {
      console.error('[SidePanel] 移除附加目录失败:', error)
    }
  }, [sessionId, setAttachedDirsMap])

  // === 工作区级：附加/移除目录 ===

  const attachWorkspaceDir = React.useCallback(async (dirPath: string) => {
    if (!workspaceSlug || !effectiveWorkspaceId) return
    const updated = await ipc.attachWorkspaceDirectory({ workspaceSlug, directoryPath: dirPath })
    setWsAttachedDirsMap((prev) => {
      const map = new Map(prev)
      map.set(effectiveWorkspaceId, updated)
      return map
    })
  }, [workspaceSlug, effectiveWorkspaceId, setWsAttachedDirsMap])

  const handleAttachWorkspaceFolder = React.useCallback(async () => {
    try {
      const result = await ipc.openFolderDialog()
      if (!result.canceled) {
        for (const dirPath of result.filePaths) {
          await attachWorkspaceDir(dirPath)
        }
      }
    } catch (error) {
      console.error('[SidePanel] 附加工作区文件夹失败:', error)
    }
  }, [attachWorkspaceDir])

  const handleWorkspaceFoldersDropped = React.useCallback(async (folderPaths: string[]) => {
    for (const dirPath of folderPaths) {
      try { await attachWorkspaceDir(dirPath) } catch (error) {
        console.error('[SidePanel] 拖拽附加工作区文件夹失败:', error)
      }
    }
  }, [attachWorkspaceDir])

  const handleDetachWorkspaceDirectory = React.useCallback(async (dirPath: string) => {
    if (!workspaceSlug || !effectiveWorkspaceId) return
    try {
      await ipc.detachWorkspaceDirectory(workspaceSlug, dirPath)
      setWsAttachedDirsMap((prev) => {
        const map = new Map(prev)
        const updated = (map.get(effectiveWorkspaceId) ?? []).filter((path) => path !== dirPath)
        if (updated.length > 0) { map.set(effectiveWorkspaceId, updated) } else { map.delete(effectiveWorkspaceId) }
        return map
      })
    } catch (error) {
      console.error('[SidePanel] 移除工作区附加目录失败:', error)
    }
  }, [workspaceSlug, effectiveWorkspaceId, setWsAttachedDirsMap])

  // 文件上传完成后递增版本号，触发 FileBrowser 刷新
  const handleFilesUploaded = React.useCallback(() => {
    setIsOpen(true)
    setFilesVersion((prev) => prev + 1)
  }, [setFilesVersion, setIsOpen])

  // 手动刷新文件列表
  const handleRefresh = React.useCallback(() => {
    setFilesVersion((prev) => prev + 1)
  }, [setFilesVersion])

  // 添加文件到聊天
  const pendingFiles = useAtomValue(agentPendingFilesAtom)
  const setPendingFiles = useSetAtom(agentPendingFilesAtom)
  const currentConversationId = useAtomValue(currentConversationIdAtom)
  const setPendingAttachments = useSetAtom(pendingAttachmentsAtom)
  const handleChatWorkspaceChange = React.useCallback((workspaceId: string) => {
    setCurrentChatWorkspaceId(workspaceId)
    ipc.updateSettings({ chatWorkspaceId: workspaceId }).catch(console.error)
  }, [setCurrentChatWorkspaceId])
  const handleAddToChat = React.useCallback(async (entry: FileEntry) => {
    if (mode === 'chat') {
      if (!currentConversationId) return
      const ext = entry.name.split('.').pop()?.toLowerCase() ?? ''
      const imageExts = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'])
      const mimeExt = ext === 'jpg' ? 'jpeg' : ext === 'svg' ? 'svg+xml' : ext
      const mediaType = imageExts.has(ext) ? `image/${mimeExt}` : 'application/octet-stream'
      const attachment: PendingAttachment = {
        id: `chat-pending-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        filename: entry.name,
        mediaType,
        localPath: '',
        size: 0,
        sourcePath: entry.path,
      }
      if (imageExts.has(ext)) {
        attachment.previewUrl = `data:${mediaType};base64,${await ipc.readAttachedFile(entry.path)}`
      }
      setPendingAttachments((prev) => prev.some((item) => item.sourcePath === entry.path) ? prev : [...prev, attachment])
      return
    }

    // 先在 setter 外部检查去重，避免在 updater 函数内执行不可逆副作用
    if (pendingFiles.some((f) => f.sourcePath === entry.path)) return

    let previewUrl: string | undefined
    try {
      const base64 = await ipc.readAttachedFile(entry.path)
      const ext = entry.name.split('.').pop()?.toLowerCase() ?? ''
      const imageExts = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'])
      const mimeExt = ext === 'jpg' ? 'jpeg' : ext === 'svg' ? 'svg+xml' : ext
      const mediaType = imageExts.has(ext) ? `image/${mimeExt}` : 'application/octet-stream'

      if (imageExts.has(ext)) {
        const binary = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
        const blob = new Blob([binary], { type: mediaType })
        previewUrl = URL.createObjectURL(blob)
      }

      const pending: AgentPendingFile = {
        id: `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        filename: entry.name,
        mediaType,
        size: Math.round(base64.length * 0.75),
        previewUrl,
        sourcePath: entry.path,
      }

      // 有 sourcePath 的文件发送时直接引用原路径，不需要存 base64
      setPendingFiles((prev) => [...prev, pending])
    } catch (error) {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      console.error('[SidePanel] 添加文件到聊天失败:', error)
    }
  }, [pendingFiles, setPendingFiles, mode, currentConversationId, setPendingAttachments])

  // 面包屑：显示根路径最后两段
  const breadcrumb = React.useMemo(() => {
    if (!sessionPath) return ''
    return buildCompactDisplayPath(sessionPath)
  }, [sessionPath])

  // 工作区文件目录路径
  const [workspaceFilesPath, setWorkspaceFilesPath] = React.useState<string | null>(null)
  const hasWorkspaceMountedSources = wsAttachedDirs.length > 0 || !!workspaceFilesPath
  React.useEffect(() => {
    if (!workspaceSlug) {
      setWorkspaceFilesPath(null)
      return
    }
    ipc.getWorkspaceFilesPath(workspaceSlug).then(setWorkspaceFilesPath).catch(() => setWorkspaceFilesPath(null))
  }, [workspaceSlug])

  // 自动打开：仅响应当前会话自己的文件写入脉冲，避免其他会话的文件变化串扰到这里。
  const sessionFileChanges = recentlyModifiedMap.get(sessionId)
  const sessionFileChangeCount = sessionFileChanges?.size ?? 0
  const prevSessionFileChangeCountRef = React.useRef(sessionFileChangeCount)
  React.useEffect(() => {
    if (sessionFileChangeCount > prevSessionFileChangeCountRef.current && sessionPath) {
      setIsOpen(true)
    }
    prevSessionFileChangeCountRef.current = sessionFileChangeCount
  }, [sessionFileChangeCount, sessionPath, setIsOpen])

  return (
    <div
      className={cn(
        'relative h-full flex-shrink-0 overflow-hidden titlebar-drag-region bg-content-area rounded-2xl shadow-xl',
        shouldAnimate && 'transition-[width] duration-300 ease-in-out',
        isOpen ? 'w-[320px]' : 'w-0',
      )}
    >
      {/* 面板内容 */}
      <div
        className={cn(
          'w-[320px] h-full flex flex-col titlebar-no-drag',
          'pt-0',
          shouldAnimate && 'transition-opacity duration-300',
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none',
        )}
        >
          {/* 文件浏览内容 */}
          {workspaceSlug ? (
            <div className="flex-1 min-h-0 flex flex-col">
                  <div className="tabbar-bg relative flex h-[34px] flex-shrink-0 items-center rounded-t-[18px] border-b border-border/50 px-3 overflow-hidden">
                    <div className="absolute inset-0 rounded-t-[18px] titlebar-drag-region" />
                    <div className="relative z-[1] flex min-w-0 flex-1 items-center gap-2">
                      <span className="select-none text-[12px] font-medium text-muted-foreground pointer-events-none">
                        {mode === 'chat' ? '聊天工作区' : '工作区'}
                      </span>
                    </div>
                  </div>
                  {/* ===== 会话文件区（仅当 sessionPath 存在时显示） ===== */}
                  {sessionPath && (
                    <>
                      <div className="flex items-center gap-1 pl-3 pr-2 h-[32px] flex-shrink-0">
                        <FolderOpen className="size-3 text-muted-foreground" />
                        <span className="text-[11px] font-medium text-muted-foreground">{mode === 'chat' ? '聊天工作区文件' : '会话文件'}</span>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="size-3 text-muted-foreground/50 cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="max-w-[200px]">
                            <p>{mode === 'chat' ? '当前聊天可快速引用的工作区文件' : '当前会话的专属文件，仅本次对话的 Agent 可以访问'}</p>
                          </TooltipContent>
                        </Tooltip>
                        <span
                          className="text-[10px] text-muted-foreground/75 truncate flex-1"
                          title={normalizeDisplayPath(sessionPath)}
                        >
                          {breadcrumb}
                        </span>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5 flex-shrink-0"
                              onClick={() => ipc.openFile(sessionPath).catch(console.error)}
                            >
                              <ExternalLink className="size-2.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">
                            <p>{openLocationLabel}</p>
                          </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5 flex-shrink-0"
                              onClick={handleRefresh}
                            >
                              <RefreshCw className="size-2.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">
                            <p>刷新文件列表</p>
                          </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5 flex-shrink-0"
                              onClick={() => setIsOpen((prev) => !prev)}
                            >
                              <X className="size-2.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">
                            <p>关闭侧面板</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      {/* 会话文件内容区（独立滚动） */}
                      <div className="flex-1 min-h-0 overflow-y-auto">
                        {/* 附加目录列表（可展开目录树） */}
                        {attachedDirs.length > 0 && (
                          <AttachedDirsSection
                            sessionId={sessionId}
                            attachedDirs={attachedDirs}
                            onDetach={handleDetachDirectory}
                            refreshVersion={filesVersion}
                            onAddToChat={handleAddToChat}
                          />
                        )}
                        {/* 会话文件浏览器 */}
                        <>
                          {attachedDirs.length > 0 && (
                            <div className="text-[11px] font-medium text-muted-foreground mb-1 px-3 pt-2">工作文件（存储于该工作区目录）</div>
                          )}
                          <FileBrowser sessionId={sessionId} rootPath={sessionPath} hideToolbar embedded hideEmpty={attachedDirs.length > 0} onAddToChat={handleAddToChat} />
                        </>
                        {/* 会话文件拖拽上传区域 */}
                        <FileDropZone
                          workspaceSlug={workspaceSlug}
                          sessionId={sessionId}
                          target="session"
                          onFilesUploaded={handleFilesUploaded}
                          onAttachFolder={handleAttachFolder}
                          onFoldersDropped={handleSessionFoldersDropped}
                        />
                    </div>
                    {/* ===== 分隔线 ===== */}
                    <div className="mx-3 my-3 border-t border-muted-foreground/20" />
                  </>
                )}

                  {mode === 'chat' && workspaces.length > 0 && (
                    <div className="px-3 pb-2">
                      <Select value={effectiveWorkspaceId ?? undefined} onValueChange={handleChatWorkspaceChange}>
                        <SelectTrigger className="h-8 rounded-xl text-xs">
                          <SelectValue placeholder="选择聊天工作区" />
                        </SelectTrigger>
                        <SelectContent>
                          {workspaces.map((workspace) => (
                            <SelectItem key={workspace.id} value={workspace.id} className="text-xs">
                              {workspace.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* ===== 工作区文件区 ===== */}
                  <div className="flex-1 min-h-0 flex flex-col mx-2 mb-2">
                    <div className="flex items-center gap-1 px-2 h-[32px] flex-shrink-0">
                      <FolderHeart className="size-3 text-muted-foreground" />
                      <span className="text-[11px] font-medium text-muted-foreground">{panelTitle}</span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="size-3 text-muted-foreground/50 cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-[220px]">
                          <p>工作区内所有会话可访问的文件和文件夹，每个新对话都可以自动读取</p>
                        </TooltipContent>
                      </Tooltip>
                      <div className="flex-1" />
                      {workspaceFilesPath && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5 flex-shrink-0"
                              onClick={() => ipc.openFile(workspaceFilesPath).catch(console.error)}
                            >
                              <ExternalLink className="size-2.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">
                            <p>{openWorkspaceLocationLabel}</p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                      {!sessionPath && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 flex-shrink-0 rounded-full"
                              onClick={() => setIsOpen((prev) => !prev)}
                            >
                              <X className="size-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">
                            <p>关闭侧面板</p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                    {/* 工作区文件内容区（独立滚动） */}
                    <div className="flex-1 min-h-0 overflow-y-auto pb-1">
                      {/* 工作区级附加目录 */}
                      {wsAttachedDirs.length > 0 && (
                        <AttachedDirsSection
                          sessionId={sessionId}
                          attachedDirs={wsAttachedDirs}
                          onDetach={handleDetachWorkspaceDirectory}
                          refreshVersion={filesVersion}
                          onAddToChat={handleAddToChat}
                        />
                      )}
                      {!hasWorkspaceMountedSources && (
                        <div className="px-3 py-3">
                          <div className="rounded-2xl border border-dashed border-border/70 bg-muted/25 px-4 py-4">
                            <div className="text-sm font-medium text-foreground">
                              {mode === 'chat' ? '这里是聊天可引用的文件区' : '默认工作区已就绪'}
                            </div>
                            <div className="mt-1 text-xs leading-5 text-muted-foreground">
                              {mode === 'chat'
                                ? '先附加一个常用文件夹，后面在 Chat 里用 @ 或拖拽时都能直接引用。'
                                : 'Agent 新会话会默认落在这里。先附加一个常用文件夹，后续同工作区下的会话都能继续复用。'}
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 rounded-full px-3 text-xs"
                                onClick={handleAttachWorkspaceFolder}
                              >
                                <FolderHeart className="mr-1 size-3.5" />
                                {mode === 'chat' ? '附加文件夹' : '添加工作区文件夹'}
                              </Button>
                              {sessionPath && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 rounded-full px-3 text-xs"
                                  onClick={handleAttachFolder}
                                >
                                  <FolderOpen className="mr-1 size-3.5" />
                                  仅附加到当前会话
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                      {/* 工作区文件浏览器 */}
                      {workspaceFilesPath && (
                        <>
                          {wsAttachedDirs.length > 0 && (
                            <div className="text-[11px] font-medium text-muted-foreground mb-1 px-3 pt-2">工作文件（存储于该工作区目录）</div>
                          )}
                          <FileBrowser sessionId={sessionId} rootPath={workspaceFilesPath} hideToolbar embedded hideEmpty={wsAttachedDirs.length > 0} onAddToChat={handleAddToChat} />
                        </>
                      )}
                      {/* 工作区文件拖拽上传区域 */}
                      <FileDropZone
                        workspaceSlug={workspaceSlug}
                        target="workspace"
                        onFilesUploaded={handleFilesUploaded}
                        onAttachFolder={handleAttachWorkspaceFolder}
                        onFoldersDropped={handleWorkspaceFoldersDropped}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col">
                  {/* 顶部关闭按钮 */}
                  <div className="flex items-center justify-between px-3 h-[36px] flex-shrink-0">
                    <span className="text-[11px] font-medium text-muted-foreground">{panelTitle}</span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 flex-shrink-0 rounded-full"
                          onClick={() => setIsOpen((prev) => !prev)}
                        >
                          <X className="size-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        <p>关闭侧面板</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <div className="flex-1 flex items-center justify-center px-6 text-center text-xs leading-5 text-muted-foreground">
                    工作区仍在初始化。正常情况下会自动进入默认工作区，无需先手动新建。
                  </div>
                </div>
              )}
        </div>
    </div>
  )
}

// ===== 附加目录容器（管理选中状态） =====

interface AttachedDirsSectionProps {
  sessionId: string
  attachedDirs: string[]
  onDetach: (dirPath: string) => void
  /** 文件版本号，用于自动刷新已展开的目录 */
  refreshVersion: number
  onAddToChat?: (entry: FileEntry) => void
}

/** 附加目录区域：统一管理所有子项的选中状态 */
function AttachedDirsSection({ sessionId, attachedDirs, onDetach, refreshVersion, onAddToChat }: AttachedDirsSectionProps): React.ReactElement {
  const [selectedPaths, setSelectedPaths] = React.useState<Set<string>>(new Set())

  const handleSelect = React.useCallback((path: string, ctrlKey: boolean) => {
    setSelectedPaths((prev) => {
      if (ctrlKey) {
        // Ctrl+点击：切换选中
        const next = new Set(prev)
        if (next.has(path)) {
          next.delete(path)
        } else {
          next.add(path)
        }
        return next
      }
      // 普通点击：单选
      return new Set([path])
    })
  }, [])

  return (
    <div className="pt-2.5 pb-1 flex-shrink-0">
      <div className="text-[11px] font-medium text-muted-foreground mb-1 px-3">附加目录（Agent 可以读取并操作此外部文件夹）</div>
      {attachedDirs.map((dir) => (
        <AttachedDirTree
          key={dir}
          dirPath={dir}
          sessionId={sessionId}
          onDetach={() => onDetach(dir)}
          selectedPaths={selectedPaths}
          onSelect={handleSelect}
          refreshVersion={refreshVersion}
          onAddToChat={onAddToChat}
        />
      ))}
    </div>
  )
}

// ===== 附加目录树组件 =====

interface AttachedDirTreeProps {
  dirPath: string
  sessionId: string
  onDetach: () => void
  selectedPaths: Set<string>
  onSelect: (path: string, ctrlKey: boolean) => void
  /** 文件版本号，变化时已展开的目录自动重新加载 */
  refreshVersion: number
  onAddToChat?: (entry: FileEntry) => void
}

/** 附加目录根节点：可展开/收起，带移除按钮 */
function AttachedDirTree({ dirPath, sessionId, onDetach, selectedPaths, onSelect, refreshVersion, onAddToChat }: AttachedDirTreeProps): React.ReactElement {
  const [expanded, setExpanded] = React.useState(false)
  const [children, setChildren] = React.useState<FileEntry[]>([])
  const [loaded, setLoaded] = React.useState(false)

  const dirName = getDisplayPathBasename(dirPath)

  // 当 refreshVersion 变化时，已展开的目录自动重新加载
  React.useEffect(() => {
    if (expanded && loaded) {
      ipc.listAttachedDirectory({ sessionId, dirPath })
        .then((items) => setChildren(items))
        .catch((err) => console.error('[AttachedDirTree] 刷新失败:', err))
    }
  }, [expanded, loaded, refreshVersion, sessionId, dirPath])

  const toggleExpand = async (): Promise<void> => {
    if (!expanded && !loaded) {
      try {
        const items = await ipc.listAttachedDirectory({ sessionId, dirPath })
        setChildren(items)
        setLoaded(true)
      } catch (err) {
        console.error('[AttachedDirTree] 加载失败:', err)
      }
    }
    setExpanded(!expanded)
  }

  return (
    <div>
      <div
        className="flex items-center gap-1 py-1 pl-2 pr-2 text-sm cursor-pointer hover:bg-accent/50 group mx-2 rounded-lg"
        onClick={toggleExpand}
      >
        <ChevronRight
          className={cn(
            'size-3.5 text-muted-foreground flex-shrink-0 transition-transform duration-150',
            expanded && 'rotate-90',
          )}
        />
        <FileTypeIcon name={dirName} isDirectory isOpen={expanded} />
        <span className="text-xs truncate flex-1" title={normalizeDisplayPath(dirPath)}>
          {dirName}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
          onClick={(e) => { e.stopPropagation(); onDetach() }}
        >
          <X className="size-3" />
        </Button>
      </div>
      {expanded && children.length === 0 && loaded && (
        <div className="text-[11px] text-muted-foreground/50 py-1" style={{ paddingLeft: 48 }}>
          空文件夹
        </div>
      )}
      {expanded && children.map((child) => (
        <AttachedDirItem key={child.path} entry={child} depth={1} sessionId={sessionId} selectedPaths={selectedPaths} onSelect={onSelect} refreshVersion={refreshVersion} onAddToChat={onAddToChat} />
      ))}
    </div>
  )
}

interface AttachedDirItemProps {
  entry: FileEntry
  depth: number
  sessionId: string
  selectedPaths: Set<string>
  onSelect: (path: string, ctrlKey: boolean) => void
  /** 文件版本号，变化时已展开的目录自动重新加载 */
  refreshVersion: number
  onAddToChat?: (entry: FileEntry) => void
}

/** 附加目录子项：递归可展开，支持选中 + 三点菜单（含重命名、移动） */
function AttachedDirItem({ entry, depth, sessionId, selectedPaths, onSelect, refreshVersion, onAddToChat }: AttachedDirItemProps): React.ReactElement {
  const [expanded, setExpanded] = React.useState(false)
  const [children, setChildren] = React.useState<FileEntry[]>([])
  const [loaded, setLoaded] = React.useState(false)
  // 重命名状态
  const [isRenaming, setIsRenaming] = React.useState(false)
  const [renameValue, setRenameValue] = React.useState(entry.name)
  const renameInputRef = React.useRef<HTMLInputElement>(null)
  // 当前显示的名称和路径（重命名后更新）
  const [currentName, setCurrentName] = React.useState(entry.name)
  const [currentPath, setCurrentPath] = React.useState(entry.path)

  const isSelected = selectedPaths.has(currentPath)

  // 当 refreshVersion 变化时，已展开的文件夹自动重新加载子项
  React.useEffect(() => {
    if (expanded && loaded && entry.isDirectory) {
      ipc.listAttachedDirectory({ sessionId, dirPath: currentPath })
        .then((items) => setChildren(items))
        .catch((err) => console.error('[AttachedDirItem] 刷新子目录失败:', err))
    }
  }, [expanded, loaded, entry.isDirectory, refreshVersion, sessionId, currentPath])

  const toggleDir = async (): Promise<void> => {
    if (!entry.isDirectory) return
    if (!expanded && !loaded) {
      try {
        const items = await ipc.listAttachedDirectory({ sessionId, dirPath: currentPath })
        setChildren(items)
        setLoaded(true)
      } catch (err) {
        console.error('[AttachedDirItem] 加载子目录失败:', err)
      }
    }
    setExpanded(!expanded)
  }

  const handleClick = (e: React.MouseEvent): void => {
    onSelect(currentPath, e.ctrlKey || e.metaKey)
    if (entry.isDirectory) {
      toggleDir()
    }
  }

  const handleDoubleClick = (): void => {
    if (!entry.isDirectory) {
      ipc.openAttachedFile(currentPath).catch(console.error)
    }
  }

  // 开始重命名
  const startRename = (): void => {
    setRenameValue(currentName)
    setIsRenaming(true)
    // 延迟聚焦，等待 DOM 渲染
    setTimeout(() => renameInputRef.current?.select(), 50)
  }

  // 确认重命名
  const confirmRename = async (): Promise<void> => {
    const newName = renameValue.trim()
    if (!newName || newName === currentName) {
      setIsRenaming(false)
      return
    }
    try {
      await ipc.renameAttachedFile({ filePath: currentPath, newName })
      // 更新本地显示
      const parentDir = currentPath.substring(0, currentPath.lastIndexOf('/'))
      const newPath = `${parentDir}/${newName}`
      // 更新选中状态中的路径
      onSelect(newPath, false)
      setCurrentName(newName)
      setCurrentPath(newPath)
    } catch (err) {
      console.error('[AttachedDirItem] 重命名失败:', err)
    }
    setIsRenaming(false)
  }

  // 取消重命名
  const cancelRename = (): void => {
    setIsRenaming(false)
    setRenameValue(currentName)
  }

  // 移动到文件夹
  const handleMove = async (): Promise<void> => {
    try {
      const result = await ipc.openFolderDialog()
      if (result.canceled || result.filePaths.length === 0) return
      await ipc.moveAttachedFile({ filePath: currentPath, newDirPath: result.filePaths[0] })
      // 移动后更新路径
      const newPath = `${result.filePaths[0]}/${currentName}`
      setCurrentPath(newPath)
    } catch (err) {
      console.error('[AttachedDirItem] 移动失败:', err)
    }
  }

  // 删除文件
  const handleDelete = async (): Promise<void> => {
    if (!window.confirm(`确定要删除 ${currentName} 吗？此操作不可撤销。`)) return
    try {
      await ipc.deleteFile(currentPath)
    } catch (err) {
      console.error('[AttachedDirItem] 删除失败:', err)
    }
  }

  const paddingLeft = 8 + depth * 16

  return (
    <>
      <div
        className={cn(
          'flex items-center gap-1 py-1 pr-2 text-sm cursor-pointer group mx-2 rounded-lg',
          isSelected ? 'bg-accent' : 'hover:bg-accent/50',
        )}
        style={{ paddingLeft }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
      >
        {entry.isDirectory ? (
          <ChevronRight
            className={cn(
              'size-3.5 text-muted-foreground flex-shrink-0 transition-transform duration-150',
              expanded && 'rotate-90',
            )}
          />
        ) : (
          <span className="w-3.5 flex-shrink-0" />
        )}
        <FileTypeIcon name={currentName} isDirectory={entry.isDirectory} isOpen={expanded} />

        {/* 名称：正常显示 / 重命名输入框 */}
        {isRenaming ? (
          <input
            ref={renameInputRef}
            className="text-xs flex-1 min-w-0 bg-background border border-primary rounded px-1 py-0.5 outline-none"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') confirmRename()
              if (e.key === 'Escape') cancelRename()
              e.stopPropagation()
            }}
            onBlur={confirmRename}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="truncate text-xs flex-1">{currentName}</span>
        )}

        {/* 右侧操作按钮占位 */}
        <div
          className={cn(
            'flex-shrink-0',
            !(isSelected && !isRenaming) && !(onAddToChat && !entry.isDirectory && !isRenaming) && 'invisible',
          )}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* 非文件夹未选中：添加到聊天按钮（悬浮时显示） */}
          {onAddToChat && !entry.isDirectory && !isRenaming && !(isSelected && !isRenaming) && (
            <button
              type="button"
              className="h-6 w-6 rounded flex items-center justify-center hover:bg-accent/70 text-muted-foreground hover:text-foreground invisible group-hover:visible"
              title="添加到聊天"
              onClick={() => onAddToChat({ ...entry, path: currentPath, name: currentName })}
            >
              <MessageSquarePlus className="size-3.5" />
            </button>
          )}
          {/* 选中状态：三点菜单 */}
          {isSelected && !isRenaming && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="h-6 w-6 rounded flex items-center justify-center hover:bg-accent/70"
              >
                <MoreHorizontal className="size-3.5" />
              </button>
            </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-40 z-[9999] min-w-0 p-0.5">
                {onAddToChat && !entry.isDirectory && (
                  <DropdownMenuItem
                    className="text-xs py-1 [&>svg]:size-3.5"
                    onSelect={() => onAddToChat({ ...entry, path: currentPath, name: currentName })}
                  >
                    <MessageSquarePlus />
                    添加到聊天
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  className="text-xs py-1 [&>svg]:size-3.5"
                  onSelect={() => ipc.showAttachedInFolder(currentPath).catch(console.error)}
                >
                  <FolderSearch />
                  在文件夹中显示
                </DropdownMenuItem>
                {!entry.isDirectory && (
                  <DropdownMenuItem
                    className="text-xs py-1 [&>svg]:size-3.5"
                    onSelect={() => ipc.openAttachedFile(currentPath).catch(console.error)}
                  >
                    <ExternalLink />
                    打开文件
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  className="text-xs py-1 [&>svg]:size-3.5"
                  onSelect={startRename}
                >
                  <Pencil />
                  重命名
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-xs py-1 [&>svg]:size-3.5"
                  onSelect={handleMove}
                >
                  <FolderInput />
                  移动到...
                </DropdownMenuItem>
                <DropdownMenuSeparator className="my-0.5" />
                <DropdownMenuItem
                  className="text-xs py-1 [&>svg]:size-3.5 text-destructive"
                  onSelect={handleDelete}
                >
                  <Trash2 />
                  删除
                </DropdownMenuItem>
              </DropdownMenuContent>
          </DropdownMenu>
          )}
        </div>
      </div>
      {expanded && children.length === 0 && loaded && (
        <div
          className="text-[11px] text-muted-foreground/50 py-1"
          style={{ paddingLeft: paddingLeft + 24 }}
        >
          空文件夹
        </div>
      )}
      {expanded && children.map((child) => (
        <AttachedDirItem key={child.path} entry={child} depth={depth + 1} sessionId={sessionId} selectedPaths={selectedPaths} onSelect={onSelect} refreshVersion={refreshVersion} onAddToChat={onAddToChat} />
      ))}
    </>
  )
}

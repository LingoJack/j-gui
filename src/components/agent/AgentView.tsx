/**
 * AgentView — Agent 模式主视图容器
 *
 * 职责：
 * - 加载当前 Agent 会话消息
 * - 发送/停止/压缩 Agent 消息（使用 useAgentSendMessage hook）
 * - 附件上传处理（由 hook 管理）
 * - AgentHeader 支持标题编辑 + 文件浏览器切换
 *
 * 注意：IPC 流式事件监听已提升到全局 useGlobalAgentListeners，
 * 本组件为纯展示 + 交互组件。
 *
 * 布局：AgentHeader | AgentMessages | AgentInput + 可选 FileBrowser 侧面板
 */

import * as React from "react";
import { useAtom, useAtomValue, useSetAtom, useStore } from "jotai";
import { toast } from "sonner";
import {
  CornerDownLeft,
  Square,
  Settings,
  Paperclip,
  FolderPlus,
  X,
  Map as MapIcon,
  Sparkles,
} from "lucide-react";
import { AgentMessages } from "./AgentMessages";
import { AgentHeader } from "./AgentHeader";
import { ContextUsageBadge } from "./ContextUsageBadge";
import { PermissionBanner } from "./PermissionBanner";
import { PermissionModeSelector } from "./PermissionModeSelector";
import { AskUserBanner } from "./AskUserBanner";
import { ExitPlanModeBanner } from "./ExitPlanModeBanner";
import { PlanModeDashedBorder } from "./PlanModeDashedBorder";
import { ModelSelector } from "@/components/chat/ModelSelector";
import { AttachmentPreviewItem } from "@/components/chat/AttachmentPreviewItem";
import { ThinkingModePopover } from "@/components/ai-elements/thinking-mode-popover";
import { RichTextInput } from "@/components/ai-elements/rich-text-input";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { CENTERED_MAIN_CONTENT_CLASS } from "@/lib/layout-shell";
import {
  getActiveAccelerator,
  getAcceleratorDisplay,
} from "@/lib/shortcut-registry";

import {
  agentStreamingStatesAtom,
  agentChannelIdAtom,
  agentModelIdAtom,
  agentChannelIdsAtom,
  agentBackendModeAtom,
  agentSessionBackendModeMapAtom,
  agentSessionChannelMapAtom,
  agentSessionModelMapAtom,
  currentAgentWorkspaceIdAtom,
  agentWorkspacesAtom,
  agentMessageRefreshAtom,
  agentSessionsAtom,
  agentAttachedDirectoriesMapAtom,
  workspaceAttachedDirectoriesMapAtom,
  liveMessagesMapAtom,
  agentThinkingAtom,
  agentPermissionModeMapAtom,
  agentDefaultPermissionModeAtom,
  sessionPersistedPermissionModeAtom,
  agentSessionPathMapAtom,
  agentPromptSuggestionsAtom,
  allPendingAskUserRequestsAtom,
  allPendingExitPlanRequestsAtom,
} from "@/atoms/agent-atoms";
import { settingsOpenAtom } from "@/atoms/settings-tab";
import { channelsAtom } from "@/atoms/chat-atoms";
import { useOpenSession } from "@/hooks/useOpenSession";
import { AgentSessionProvider } from "@/contexts/session-context";
import { sendWithCmdEnterAtom } from "@/atoms/shortcut-atoms";
import type { ModelOption } from "@jgui/shared";
import * as ipc from "@/lib/ipc";
import { useAgentSendMessage } from "./useAgentSendMessage";

export function AgentView({
  sessionId,
}: {
  sessionId: string;
}): React.ReactElement {
  // 从 useAgentSendMessage 获取发送相关状态和处理器
  const {
    persistedSDKMessages,
    setPersistedSDKMessages,
    messagesLoaded,
    setMessagesLoaded,
    pendingFiles,
    inputContent,
    setInputContent,
    inputHtmlContent,
    setInputHtmlContent,
    streaming,
    streamState,
    liveMessages,
    stoppedByUser,
    attachedDirs,
    isPlanMode,
    suggestion,
    hasAvailableModel,
    isDragOver,
    agentChannelId,
    agentModelId,
    contextStatus,
    handleSend,
    handleStop,
    handleCompact,
    handleRetry,
    handleRetryInNewSession,
    handleOpenFileDialog,
    handleAttachFolder,
    handleRemoveFile,
    handlePasteFiles,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  } = useAgentSendMessage(sessionId);

  const setStreamingStates = useSetAtom(agentStreamingStatesAtom);
  const setLiveMessagesMap = useSetAtom(liveMessagesMapAtom);
  // Per-session 渠道/模型配置（优先读 session map，回退到全局默认值）
  const sessionChannelMap = useAtomValue(agentSessionChannelMapAtom);
  const sessionModelMap = useAtomValue(agentSessionModelMapAtom);
  const setSessionChannelMap = useSetAtom(agentSessionChannelMapAtom);
  const setSessionModelMap = useSetAtom(agentSessionModelMapAtom);
  const [defaultChannelId, setDefaultChannelId] = useAtom(agentChannelIdAtom);
  const [defaultModelId, setDefaultModelId] = useAtom(agentModelIdAtom);
  const agentBackendMode = useAtomValue(agentBackendModeAtom);
  const sessionBackendModeMap = useAtomValue(agentSessionBackendModeMapAtom);
  const agentChannelIds = useAtomValue(agentChannelIdsAtom);
  const setAgentChannelIds = useSetAtom(agentChannelIdsAtom);
  const [agentThinking, setAgentThinking] = useAtom(agentThinkingAtom);
  const setSettingsOpen = useSetAtom(settingsOpenAtom);
  const globalWorkspaceId = useAtomValue(currentAgentWorkspaceIdAtom);
  const workspaces = useAtomValue(agentWorkspacesAtom);
  const sessions = useAtomValue(agentSessionsAtom);
  const workspaceId = React.useMemo(() => {
    const meta = sessions.find((s) => s.id === sessionId);
    if (!meta) return globalWorkspaceId ?? workspaces[0]?.id ?? null;
    return meta.workspaceId ?? globalWorkspaceId ?? workspaces[0]?.id ?? null;
  }, [sessions, sessionId, globalWorkspaceId, workspaces]);
  const persistedSessionBackendMode = React.useMemo(() => {
    const meta = sessions.find((s) => s.id === sessionId);
    return meta?.backendMode;
  }, [sessions, sessionId]);
  const effectiveSessionBackendMode =
    sessionBackendModeMap.get(sessionId) ??
    persistedSessionBackendMode ??
    agentBackendMode;

  // 已有会话首次打开时，从全局默认值初始化 per-session map
  React.useEffect(() => {
    if (!sessionId) return;
    if (!sessionChannelMap.has(sessionId) && defaultChannelId) {
      setSessionChannelMap((prev) => {
        if (prev.has(sessionId)) return prev;
        const map = new Map(prev);
        map.set(sessionId, defaultChannelId);
        return map;
      });
    }
    if (!sessionModelMap.has(sessionId) && defaultModelId) {
      setSessionModelMap((prev) => {
        if (prev.has(sessionId)) return prev;
        const map = new Map(prev);
        map.set(sessionId, defaultModelId);
        return map;
      });
    }
  }, [
    sessionId,
    sessionChannelMap,
    sessionModelMap,
    defaultChannelId,
    defaultModelId,
    setSessionChannelMap,
    setSessionModelMap,
  ]);

  const permissionModeMap = useAtomValue(agentPermissionModeMapAtom);
  const defaultPermissionMode = useAtomValue(agentDefaultPermissionModeAtom);
  const persistedPermissionMode = useAtomValue(
    sessionPersistedPermissionModeAtom(sessionId),
  );
  const permissionMode =
    permissionModeMap.get(sessionId) ??
    persistedPermissionMode ??
    defaultPermissionMode;
  const isPermissionPlanMode = permissionMode === "plan";
  const store = useStore();
  const setPromptSuggestions = useSetAtom(agentPromptSuggestionsAtom);
  const setAgentSessions = useSetAtom(agentSessionsAtom);
  const openSession = useOpenSession();
  const setAttachedDirsMap = useSetAtom(agentAttachedDirectoriesMapAtom);
  const wsAttachedDirsMap = useAtomValue(workspaceAttachedDirectoriesMapAtom);
  const wsAttachedDirs = React.useMemo(
    () => (workspaceId ? (wsAttachedDirsMap.get(workspaceId) ?? []) : []),
    [workspaceId, wsAttachedDirsMap],
  );

  const sessionPathMap = useAtomValue(agentSessionPathMapAtom);
  const setSessionPathMap = useSetAtom(agentSessionPathMapAtom);
  const sessionPath = sessionPathMap.get(sessionId) ?? null;
  const [workspaceFilesPath, setWorkspaceFilesPath] = React.useState<
    string | null
  >(null);

  // 渠道已选但模型未选时，自动选择第一个可用模型
  const globalChannels = useAtomValue(channelsAtom);

  React.useEffect(() => {
    if (!agentChannelId || agentModelId) return;

    const channel = globalChannels.find(
      (c) => c.id === agentChannelId && c.enabled,
    );
    if (!channel) return;

    const firstModel = channel.models.find((m) => m.enabled);
    if (!firstModel) return;

    // 更新 per-session map
    setSessionModelMap((prev) => {
      const map = new Map(prev);
      map.set(sessionId, firstModel.id);
      return map;
    });
    // 同步全局默认值
    setDefaultModelId(firstModel.id);
    ipc
      .updateSettings({
        agentChannelId,
        agentModelId: firstModel.id,
      })
      .catch(console.error);
  }, [
    agentChannelId,
    agentModelId,
    globalChannels,
    sessionId,
    setSessionModelMap,
    setDefaultModelId,
  ]);

  // 获取当前 session 的工作路径（文件浏览器需要）
  React.useEffect(() => {
    if (!workspaceId) {
      setSessionPathMap((prev) => {
        const map = new Map(prev);
        map.delete(sessionId);
        return map;
      });
      return;
    }

    ipc
      .getAgentSessionPath(sessionId)
      .then((path) => {
        if (path) {
          setSessionPathMap((prev) => {
            const map = new Map(prev);
            map.set(sessionId, path);
            return map;
          });
        } else {
          setSessionPathMap((prev) => {
            const map = new Map(prev);
            map.delete(sessionId);
            return map;
          });
        }
      })
      .catch(() => {
        setSessionPathMap((prev) => {
          const map = new Map(prev);
          map.delete(sessionId);
          return map;
        });
      });
  }, [sessionId, workspaceId, setSessionPathMap]);

  // 获取工作区共享文件目录路径（@ 引用时需要搜索）
  const workspaceSlug =
    workspaces.find((w) => w.id === workspaceId)?.slug ?? null;
  React.useEffect(() => {
    if (!workspaceSlug) {
      setWorkspaceFilesPath(null);
      return;
    }
    ipc
      .getWorkspaceFilesPath(workspaceSlug)
      .then(setWorkspaceFilesPath)
      .catch(() => setWorkspaceFilesPath(null));
  }, [workspaceSlug]);

  // 工作区级目录（workspace shared files + 工作区级附加目录），@ 引用标记为工作区文件
  const workspaceDirs = React.useMemo(() => {
    const dirs: string[] = [];
    if (workspaceFilesPath) dirs.push(workspaceFilesPath);
    for (const d of wsAttachedDirs) {
      if (!dirs.includes(d)) dirs.push(d);
    }
    return dirs;
  }, [workspaceFilesPath, wsAttachedDirs]);

  // 监听消息刷新版本号
  const refreshMap = useAtomValue(agentMessageRefreshAtom);
  const refreshVersion = refreshMap.get(sessionId) ?? 0;
  const [historyLoadError, setHistoryLoadError] = React.useState<string | null>(
    null,
  );

  // 加载当前会话消息
  React.useEffect(() => {
    // 流式运行中不重置 messagesLoaded，避免 streaming UI 消失后出现空窗闪烁
    const isCurrentlyStreaming =
      store.get(agentStreamingStatesAtom).get(sessionId)?.running ?? false;
    if (!isCurrentlyStreaming) {
      setMessagesLoaded(false);
    }
    setHistoryLoadError(null);
    ipc
      .getAgentSessionSDKMessages(sessionId)
      .then((sdkMsgs) => {
        setPersistedSDKMessages(sdkMsgs);
        setMessagesLoaded(true);
        setHistoryLoadError(null);

        // 消息加载完成后，同步清除流式展示状态和实时消息，
        // 确保 React 在一次渲染中同时显示持久化消息并移除流式气泡/实时消息，
        // 避免「实时消息已清 → 持久化消息未到」的空档闪烁
        setStreamingStates((prev) => {
          const state = prev.get(sessionId);
          if (!state || state.running) return prev; // 仍在运行中，不清除
          const map = new Map(prev);
          if (state.inputTokens !== undefined) {
            map.set(sessionId, {
              running: false,
              content: "",
              toolActivities: [],
              teammates: [],
              inputTokens: state.inputTokens,
              outputTokens: state.outputTokens,
              cacheReadTokens: state.cacheReadTokens,
              cacheCreationTokens: state.cacheCreationTokens,
              contextWindow: state.contextWindow,
              model: state.model,
            });
          } else {
            map.delete(sessionId);
          }
          return map;
        });
        setLiveMessagesMap((prev) => {
          if (!prev.has(sessionId)) return prev;
          const streamingState = store
            .get(agentStreamingStatesAtom)
            .get(sessionId);
          if (streamingState?.running) return prev;
          const map = new Map(prev);
          map.delete(sessionId);
          return map;
        });
      })
      .catch((error) => {
        console.error("[AgentView] 加载历史回放失败:", error);
        const message = error instanceof Error ? error.message : "未知错误";
        setPersistedSDKMessages([]);
        setMessagesLoaded(true);
        setHistoryLoadError(message);
      });
  }, [
    sessionId,
    refreshVersion,
    setStreamingStates,
    setLiveMessagesMap,
    store,
    setPersistedSDKMessages,
    setMessagesLoaded,
  ]);

  // 从会话元数据初始化附加目录（仅冷启动水合，后续由 handleAttachFolder/handleDetachDirectory 实时写入）
  React.useEffect(() => {
    const meta = sessions.find((s) => s.id === sessionId);
    const dirs = meta?.attachedDirectories ?? [];
    setAttachedDirsMap((prev) => {
      const existing = prev.get(sessionId);
      if (existing != null) return prev;
      const map = new Map(prev);
      if (dirs.length > 0) {
        map.set(sessionId, dirs);
      }
      return map;
    });
  }, [sessionId, sessions, setAttachedDirsMap]);

  /** ModelSelector 选择回调 */
  const handleModelSelect = React.useCallback(
    (option: ModelOption): void => {
      // 更新当前会话的 per-session 配置
      setSessionChannelMap((prev) => {
        const map = new Map(prev);
        map.set(sessionId, option.channelId);
        return map;
      });
      setSessionModelMap((prev) => {
        const map = new Map(prev);
        map.set(sessionId, option.modelId);
        return map;
      });

      // 自动将选中的渠道加入 Agent 可用渠道白名单
      const updatedChannelIds = agentChannelIds.includes(option.channelId)
        ? agentChannelIds
        : [...agentChannelIds, option.channelId];
      if (updatedChannelIds !== agentChannelIds) {
        setAgentChannelIds(updatedChannelIds);
      }

      // 同时更新全局默认值（新会话继承）
      setDefaultChannelId(option.channelId);
      setDefaultModelId(option.modelId);

      // 持久化到设置
      ipc
        .updateSettings({
          agentChannelId: option.channelId,
          agentModelId: option.modelId,
          agentChannelIds: updatedChannelIds,
        })
        .catch(console.error);
    },
    [
      sessionId,
      setSessionChannelMap,
      setSessionModelMap,
      setDefaultChannelId,
      setDefaultModelId,
      agentChannelIds,
      setAgentChannelIds,
    ],
  );

  /** 构建 externalSelectedModel 给 ModelSelector */
  const externalSelectedModel = React.useMemo(() => {
    if (!agentChannelId || !agentModelId) return null;
    return { channelId: agentChannelId, modelId: agentModelId };
  }, [agentChannelId, agentModelId]);

  /** 分叉会话：从指定消息处创建新会话并自动切换 */
  const handleFork = React.useCallback(
    async (upToMessageUuid: string): Promise<void> => {
      if (streaming) {
        toast.error("当前会话仍在运行中，不能分叉历史");
        return;
      }
      try {
        const meta = await ipc.forkAgentSession({
          sessionId,
          upToMessageUuid,
        });
        setAgentSessions((prev) => [meta, ...prev]);

        // 切换到新会话 tab
        openSession("agent", meta.id, meta.title);

        toast.success("已创建分叉会话", {
          description: meta.title,
        });
      } catch (error) {
        console.error("[AgentView] 分叉会话失败:", error);
        toast.error("分叉会话失败", {
          description: error instanceof Error ? error.message : "未知错误",
        });
      }
    },
    [sessionId, openSession, setAgentSessions, streaming],
  );

  /** 快照回退：同一会话内回退到指定消息点，仅截断对话时间线 */
  const [rewindTargetUuid, setRewindTargetUuid] = React.useState<string | null>(
    null,
  );

  const handleRewindRequest = React.useCallback(
    (assistantMessageUuid: string): void => {
      if (streaming) {
        toast.error("当前会话仍在运行中，不能回退历史");
        return;
      }
      setRewindTargetUuid(assistantMessageUuid);
    },
    [streaming],
  );

  const handleRewindConfirm = React.useCallback(async (): Promise<void> => {
    if (!rewindTargetUuid) return;
    if (streaming) {
      setRewindTargetUuid(null);
      toast.error("当前会话仍在运行中，不能回退历史");
      return;
    }
    const targetUuid = rewindTargetUuid;
    setRewindTargetUuid(null);

    try {
      const result = await ipc.rewindSession({
        sessionId,
        assistantMessageUuid: targetUuid,
      });

      // 刷新消息列表
      store.set(agentMessageRefreshAtom, (prev) => {
        const map = new Map(prev);
        map.set(sessionId, (prev.get(sessionId) ?? 0) + 1);
        return map;
      });

      if (result.fileRewind?.canRewind) {
        const fileCount = result.fileRewind.filesChanged?.length ?? 0;
        toast.success("已回退到此处", {
          description:
            fileCount > 0 ? `${fileCount} 个文件已恢复` : "文件无变化",
        });
      } else if (result.fileRewind?.error) {
        toast.warning("已回退对话", {
          description: result.fileRewind.error,
        });
      } else {
        toast.success("已回退对话");
      }
    } catch (error) {
      console.error("[AgentView] 回退失败:", error);
      toast.error("回退失败", {
        description: error instanceof Error ? error.message : "未知错误",
      });
    }
  }, [rewindTargetUuid, sessionId, store, streaming]);

  const allAskUserRequests = useAtomValue(allPendingAskUserRequestsAtom);
  const allExitPlanRequests = useAtomValue(allPendingExitPlanRequestsAtom);
  const hasBannerOverlay =
    (allAskUserRequests.get(sessionId)?.length ?? 0) > 0 ||
    (allExitPlanRequests.get(sessionId)?.length ?? 0) > 0;

  const sendWithCmdEnter = useAtomValue(sendWithCmdEnterAtom);
  const hasTextInput = inputContent.trim().length > 0;
  const canSend =
    (hasTextInput || pendingFiles.length > 0 || !!suggestion) &&
    agentChannelId !== null &&
    hasAvailableModel &&
    (!streaming || hasTextInput);

  return (
    <>
      <AgentSessionProvider sessionId={sessionId}>
        {/* 主内容区域 */}
        <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden min-w-0">
          {/* Agent Header */}
          <AgentHeader sessionId={sessionId} />

          <div className={CENTERED_MAIN_CONTENT_CLASS}>
            {historyLoadError && (
              <div className="mx-4 mt-3 rounded-lg border border-destructive/30 bg-destructive/[0.05] px-3 py-2 text-sm text-destructive">
                历史回放加载失败：{historyLoadError}
              </div>
            )}

            {/* 消息区域 */}
            <div className="flex min-h-0 flex-1">
              <AgentMessages
                sessionId={sessionId}
                sessionModelId={agentModelId || undefined}
                messagesLoaded={messagesLoaded}
                persistedSDKMessages={persistedSDKMessages}
                streaming={streaming}
                streamState={streamState}
                liveMessages={liveMessages}
                sessionPath={sessionPath}
                attachedDirs={attachedDirs}
                stoppedByUser={stoppedByUser}
                onRetry={handleRetry}
                onRetryInNewSession={handleRetryInNewSession}
                onFork={handleFork}
                onRewind={handleRewindRequest}
                onCompact={handleCompact}
              />
            </div>

            {/* 权限请求横幅 */}
            <PermissionBanner sessionId={sessionId} />

            {/* AskUserQuestion 交互式问答横幅 */}
            <AskUserBanner sessionId={sessionId} />

            {/* Plan 模式指示条 */}
            {isPlanMode && (
              <div className="mx-4 mb-2 flex items-center gap-2 rounded-lg bg-primary/5 px-3 py-2 text-sm text-primary animate-in fade-in slide-in-from-bottom-1 duration-200">
                <MapIcon className="size-4 animate-pulse" />
                <span className="font-medium">Agent 正在规划中...</span>
                <span className="text-xs text-muted-foreground">
                  完成后将请求你的审批
                </span>
              </div>
            )}

            {/* ExitPlanMode 计划审批横幅 */}
            <ExitPlanModeBanner sessionId={sessionId} />

            {/* 输入区域 — 交互横幅显示时隐藏，由横幅替代 */}
            {!hasBannerOverlay && (
              <div
                className="px-2.5 pb-2 md:px-[18px] md:pb-3"
                data-input-mode="agent"
                data-testid="agent-input-dock"
              >
                <div
                  className={cn(
                    "rounded-[17px] border-[0.5px] border-border bg-background/70 backdrop-blur-sm transition-all duration-200",
                    (isPlanMode || isPermissionPlanMode) &&
                      !isDragOver &&
                      "plan-mode-border",
                    isDragOver &&
                      "border-[2px] border-dashed border-[#2ecc71] bg-[#2ecc71]/[0.03]",
                  )}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                {(isPlanMode || isPermissionPlanMode) && !isDragOver && (
                  <PlanModeDashedBorder />
                )}
                {/* 无 Agent 渠道或无可用模型提示 */}
                {(!agentChannelId || !hasAvailableModel) && (
                  <div className="flex items-center gap-2 px-4 py-2 text-sm text-amber-600 dark:text-amber-400">
                    <Settings size={14} />
                    <span>
                      {!agentChannelId
                        ? "请在设置中选择 Agent 供应商"
                        : "暂无可用模型，请在设置中启用 Agent 渠道并配置模型"}
                    </span>
                    <button
                      type="button"
                      className="text-xs underline underline-offset-2 hover:text-foreground transition-colors"
                      onClick={() => setSettingsOpen(true)}
                    >
                      前往设置
                    </button>
                  </div>
                )}

                {/* 附件预览区域 */}
                {pendingFiles.length > 0 && (
                  <div className="flex flex-wrap gap-2 px-3 pt-2.5 pb-1.5">
                    {pendingFiles.map((file) => (
                      <AttachmentPreviewItem
                        key={file.id}
                        filename={file.filename}
                        mediaType={file.mediaType}
                        previewUrl={file.previewUrl}
                        onRemove={() => handleRemoveFile(file.id)}
                      />
                    ))}
                  </div>
                )}

                {/* Agent 建议提示 */}
                {suggestion && !streaming && (
                  <div className="px-3 pt-2.5 pb-1.5">
                    <button
                      type="button"
                      className="group flex items-start gap-2 w-full rounded-lg border border-dashed border-primary/30 bg-primary/[0.03] px-3 py-2.5 text-left text-sm transition-colors hover:border-primary/50 hover:bg-primary/[0.06]"
                      onClick={handleSend}
                    >
                      <Sparkles className="size-4 shrink-0 mt-0.5 text-primary/60 group-hover:text-primary/80" />
                      <span className="flex-1 min-w-0 text-foreground/80 group-hover:text-foreground line-clamp-3">
                        {suggestion}
                      </span>
                      <X
                        className="size-3.5 shrink-0 mt-0.5 text-muted-foreground/40 hover:text-foreground transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPromptSuggestions((prev) => {
                            if (!prev.has(sessionId)) return prev;
                            const map = new Map(prev);
                            map.delete(sessionId);
                            return map;
                          });
                        }}
                      />
                    </button>
                  </div>
                )}

                <RichTextInput
                  value={inputContent}
                  onChange={setInputContent}
                  onSubmit={handleSend}
                  onPasteFiles={handlePasteFiles}
                  placeholder={
                    agentChannelId && hasAvailableModel
                      ? sendWithCmdEnter
                        ? "输入消息... (⌘/Ctrl+Enter 发送，Enter 换行，@ 引用文件，/ 调用 Skill，$ 引用 Chat，# 调用 MCP)"
                        : "输入消息... (Enter 发送，Shift+Enter 换行，@ 引用文件，/ 调用 Skill，$ 引用 Chat，# 调用 MCP)"
                      : !agentChannelId
                        ? "请先在设置中选择 Agent 供应商"
                        : "暂无可用模型，请先在设置中启用渠道"
                  }
                  disabled={!agentChannelId || !hasAvailableModel}
                  autoFocusTrigger={sessionId}
                  collapsible
                  workspacePath={sessionPath}
                  workspaceSlug={workspaceSlug}
                  attachedDirs={workspaceDirs}
                  sessionAttachedDirs={attachedDirs}
                  htmlValue={inputHtmlContent}
                  onHtmlChange={setInputHtmlContent}
                  sendWithCmdEnter={sendWithCmdEnter}
                />

                {/* Footer 工具栏 */}
                <div className="flex items-center justify-between px-2 py-1 h-[48px] gap-4">
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <ModelSelector
                      filterChannelIds={agentChannelIds}
                      externalSelectedModel={externalSelectedModel}
                      onModelSelect={handleModelSelect}
                    />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex h-8 items-center rounded-full border border-border px-3 text-xs text-muted-foreground transition-colors hover:text-foreground"
                          onClick={() => setSettingsOpen(true)}
                        >
                          {effectiveSessionBackendMode === "claude-sdk"
                            ? "Claude SDK"
                            : "j-cli Agent"}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs text-xs">
                        <p>
                          {effectiveSessionBackendMode === "claude-sdk"
                            ? "当前会话最近一次实际启动走 Claude Code 原生 session；仅在具备对应会话元数据时支持 resume / fork-session。"
                            : "当前会话最近一次实际启动走 j-cli agent loop；每轮按当前 transcript 重启。"}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                    <PermissionModeSelector sessionId={sessionId} />
                    {/* 思考模式切换 + 展开偏好 */}
                    <ThinkingModePopover
                      enabled={agentThinking?.type === "adaptive"}
                      showExpandedToggle
                      onToggle={() => {
                        const next =
                          agentThinking?.type === "adaptive"
                            ? { type: "disabled" as const }
                            : { type: "adaptive" as const };
                        setAgentThinking(next);
                        ipc.updateSettings({ agentThinking: next });
                      }}
                    />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-[36px] rounded-full text-foreground/60 hover:text-foreground"
                          onClick={handleOpenFileDialog}
                        >
                          <Paperclip className="size-5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        <p>添加附件</p>
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-[36px] rounded-full text-foreground/60 hover:text-foreground"
                          onClick={handleAttachFolder}
                        >
                          <FolderPlus className="size-5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        <p>附加文件夹</p>
                      </TooltipContent>
                    </Tooltip>
                    <ContextUsageBadge
                      inputTokens={contextStatus.inputTokens}
                      outputTokens={contextStatus.outputTokens}
                      cacheReadTokens={contextStatus.cacheReadTokens}
                      cacheCreationTokens={contextStatus.cacheCreationTokens}
                      contextWindow={contextStatus.contextWindow}
                      isCompacting={contextStatus.isCompacting}
                      isProcessing={streaming}
                      onCompact={handleCompact}
                    />
                    {/* <FeishuNotifyToggle sessionId={sessionId} /> */}
                  </div>

                  <div className="flex items-center gap-1.5">
                    {streaming && !hasTextInput ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-[36px] rounded-full text-destructive hover:!text-[hsl(0,75%,55%)] hover:!bg-[var(--stop-hover-bg)]"
                            onClick={handleStop}
                          >
                            <Square
                              className="size-[16px]"
                              fill="currentColor"
                              strokeWidth={0}
                            />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          <p>
                            停止 Agent (
                            {getAcceleratorDisplay(
                              getActiveAccelerator("stop-generation"),
                            )}
                            )
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className={cn(
                          "size-[36px] rounded-full",
                          canSend
                            ? "text-primary hover:bg-primary/10"
                            : "text-foreground/30 cursor-not-allowed",
                        )}
                        onClick={handleSend}
                        disabled={!canSend}
                      >
                        <CornerDownLeft className="size-[22px]" />
                      </Button>
                    )}
                  </div>
                </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </AgentSessionProvider>

      {/* 回退确认弹窗 */}
      <AlertDialog
        open={rewindTargetUuid !== null}
        onOpenChange={(v) => {
          if (!v) setRewindTargetUuid(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认回退</AlertDialogTitle>
            <AlertDialogDescription>
              回退将截断该消息之后的所有对话。当前版本不会恢复文件现场，此操作不可撤销，确定要回退吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRewindConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              回退
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

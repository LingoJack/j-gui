/**
 * useAgentSendMessage — Agent 消息发送逻辑的钩子封装
 *
 * 从 AgentView 中提取的发送相关逻辑，包括：
 * - handleSend / handleSendUserMessage（自动发送待处理消息）
 * - handleStop / handleCompact / handleRetry / handleRetryInNewSession 等处理逻辑
 * - 附件处理（addFilesAsAttachments / handleOpenFileDialog / handleAttachFolder 等）
 * - 拖放处理（handleDragOver / handleDragLeave / handleDrop）
 * - 待处理消息状态及 isSending 守卫
 */

import * as React from "react";
import { useAtom, useAtomValue, useSetAtom, useStore } from "jotai";
import { toast } from "sonner";
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
  agentPendingPromptAtom,
  agentPendingFilesAtom,
  agentWorkspacesAtom,
  agentStreamErrorsAtom,
  agentSessionDraftsAtom,
  agentSessionDraftHtmlAtom,
  agentPromptSuggestionsAtom,
  agentSessionsAtom,
  agentAttachedDirectoriesMapAtom,
  liveMessagesMapAtom,
  stoppedByUserSessionsAtom,
  agentPlanModeSessionsAtom,
  agentPermissionModeMapAtom,
  agentDefaultPermissionModeAtom,
  sessionPersistedPermissionModeAtom,
  finalizeStreamingActivities,
} from "@/atoms/agent-atoms";
import type { AgentContextStatus } from "@/atoms/agent-atoms";
import { channelsAtom } from "@/atoms/chat-atoms";
import { useOpenSession } from "@/hooks/useOpenSession";
import { draftSessionIdsAtom } from "@/atoms/draft-session-atoms";
import type {
  AgentSendInput,
  AgentPendingFile,
  SDKMessage,
} from "@jgui/shared";
import { fileToBase64 } from "@/lib/file-utils";
import * as ipc from "@/lib/ipc";

/** 稳定的空 SDKMessage 数组引用，避免 ?? [] 每次创建新引用 */
const EMPTY_SDK_MESSAGES: SDKMessage[] = [];

export function useAgentSendMessage(sessionId: string) {
  const [persistedSDKMessages, setPersistedSDKMessages] = React.useState<
    SDKMessage[]
  >([]);
  const setStreamingStates = useSetAtom(agentStreamingStatesAtom);
  const streamingStates = useAtomValue(agentStreamingStatesAtom);
  const streamState = streamingStates.get(sessionId);
  const streaming = streamState?.running ?? false;
  const stoppedByUserSessions = useAtomValue(stoppedByUserSessionsAtom);
  const stoppedByUser = stoppedByUserSessions.has(sessionId);
  const liveMessagesMap = useAtomValue(liveMessagesMapAtom);
  const setLiveMessagesMap = useSetAtom(liveMessagesMapAtom);
  const liveMessages = liveMessagesMap.get(sessionId) ?? EMPTY_SDK_MESSAGES;
  const sessionChannelMap = useAtomValue(agentSessionChannelMapAtom);
  const sessionModelMap = useAtomValue(agentSessionModelMapAtom);
  const [defaultChannelId, setDefaultChannelId] = useAtom(agentChannelIdAtom);
  const [defaultModelId, setDefaultModelId] = useAtom(agentModelIdAtom);
  const agentBackendMode = useAtomValue(agentBackendModeAtom);
  const setAgentSessionBackendModeMap = useSetAtom(
    agentSessionBackendModeMapAtom,
  );
  const agentChannelId = sessionChannelMap.get(sessionId) ?? defaultChannelId;
  const agentModelId = sessionModelMap.get(sessionId) ?? defaultModelId;
  const agentChannelIds = useAtomValue(agentChannelIdsAtom);
  const globalWorkspaceId = useAtomValue(currentAgentWorkspaceIdAtom);
  const sessions = useAtomValue(agentSessionsAtom);
  const currentWorkspaceId = React.useMemo(() => {
    const meta = sessions.find((s) => s.id === sessionId);
    if (!meta) return globalWorkspaceId;
    return meta.workspaceId ?? null;
  }, [sessions, sessionId, globalWorkspaceId]);
  const [pendingPrompt, setPendingPrompt] = useAtom(agentPendingPromptAtom);
  const [pendingFiles, setPendingFiles] = useAtom(agentPendingFilesAtom);
  const workspaces = useAtomValue(agentWorkspacesAtom);
  const setAgentStreamErrors = useSetAtom(agentStreamErrorsAtom);
  const streamErrors = useAtomValue(agentStreamErrorsAtom);
  const agentError = streamErrors.get(sessionId) ?? null;
  const planModeSessions = useAtomValue(agentPlanModeSessionsAtom);
  const isPlanMode = planModeSessions.has(sessionId);
  const permissionModeMap = useAtomValue(agentPermissionModeMapAtom);
  const defaultPermissionMode = useAtomValue(agentDefaultPermissionModeAtom);
  const persistedPermissionMode = useAtomValue(
    sessionPersistedPermissionModeAtom(sessionId),
  );
  const permissionMode =
    permissionModeMap.get(sessionId) ??
    persistedPermissionMode ??
    defaultPermissionMode;
  const store = useStore();
  const suggestionsMap = useAtomValue(agentPromptSuggestionsAtom);
  const suggestion = suggestionsMap.get(sessionId) ?? null;
  const setPromptSuggestions = useSetAtom(agentPromptSuggestionsAtom);
  const setAgentSessions = useSetAtom(agentSessionsAtom);
  const openSession = useOpenSession();
  const setAttachedDirsMap = useSetAtom(agentAttachedDirectoriesMapAtom);
  const attachedDirsMap = useAtomValue(agentAttachedDirectoriesMapAtom);
  const attachedDirs = attachedDirsMap.get(sessionId) ?? [];
  const draftsMap = useAtomValue(agentSessionDraftsAtom);
  const setDraftsMap = useSetAtom(agentSessionDraftsAtom);
  const inputContent = draftsMap.get(sessionId) ?? "";
  const setInputContent = React.useCallback(
    (value: string) => {
      setDraftsMap((prev) => {
        const map = new Map(prev);
        if (value.trim() === "") {
          map.delete(sessionId);
        } else {
          map.set(sessionId, value);
        }
        return map;
      });
    },
    [sessionId, setDraftsMap],
  );
  const draftHtmlMap = useAtomValue(agentSessionDraftHtmlAtom);
  const setDraftHtmlMap = useSetAtom(agentSessionDraftHtmlAtom);
  const inputHtmlContent = draftHtmlMap.get(sessionId) ?? "";
  const setInputHtmlContent = React.useCallback(
    (html: string) => {
      setDraftHtmlMap((prev) => {
        const map = new Map(prev);
        if (!html || html === "<p></p>") {
          map.delete(sessionId);
        } else {
          map.set(sessionId, html);
        }
        return map;
      });
    },
    [sessionId, setDraftHtmlMap],
  );
  const globalChannels = useAtomValue(channelsAtom);
  const hasAvailableModel = React.useMemo(() => {
    const promaOfficial = globalChannels.find((c) => c.id === "proma-official");
    if (promaOfficial?.enabled && promaOfficial.models.some((m) => m.enabled))
      return true;
    if (!agentChannelIds || agentChannelIds.length === 0) return false;
    return globalChannels.some(
      (c) =>
        c.enabled &&
        agentChannelIds.includes(c.id) &&
        c.models.some((m) => m.enabled),
    );
  }, [globalChannels, agentChannelIds]);
  const [messagesLoaded, setMessagesLoaded] = React.useState(false);
  const [errorCopied, setErrorCopied] = React.useState(false);

  // pendingFiles 引用缓存
  const pendingFilesRef = React.useRef(pendingFiles);
  React.useEffect(() => {
    pendingFilesRef.current = pendingFiles;
  }, [pendingFiles]);

  // ===== 附件处理 =====

  const makeUniqueFilename = React.useCallback(
    (originalName: string, existingNames: string[]): string => {
      if (!existingNames.includes(originalName)) return originalName;
      const dotIdx = originalName.lastIndexOf(".");
      const baseName =
        dotIdx > 0 ? originalName.slice(0, dotIdx) : originalName;
      const ext = dotIdx > 0 ? originalName.slice(dotIdx) : "";
      let counter = 1;
      while (existingNames.includes(`${baseName}-${counter}${ext}`)) {
        counter++;
      }
      return `${baseName}-${counter}${ext}`;
    },
    [],
  );

  const addFilesAsAttachments = React.useCallback(
    async (files: File[]): Promise<void> => {
      const usedNames: string[] = pendingFilesRef.current.map(
        (f) => f.filename,
      );
      for (const file of files) {
        try {
          const base64 = await fileToBase64(file);
          const previewUrl = file.type.startsWith("image/")
            ? URL.createObjectURL(file)
            : undefined;
          const uniqueFilename = makeUniqueFilename(file.name, usedNames);
          usedNames.push(uniqueFilename);
          const pending: AgentPendingFile = {
            id: `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            filename: uniqueFilename,
            mediaType: file.type || "application/octet-stream",
            size: file.size,
            previewUrl,
          };
          if (!window.__pendingAgentFileData) {
            window.__pendingAgentFileData = new Map<string, string>();
          }
          window.__pendingAgentFileData.set(pending.id, base64);
          setPendingFiles((prev) => [...prev, pending]);
        } catch (error) {
          console.error("[AgentView] 添加附件失败:", error);
        }
      }
    },
    [makeUniqueFilename, setPendingFiles],
  );

  const handleOpenFileDialog = React.useCallback(async (): Promise<void> => {
    try {
      const result = await ipc.openFileDialog();
      if (result.files.length === 0) return;
      for (const fileInfo of result.files) {
        const previewUrl = fileInfo.mediaType.startsWith("image/")
          ? `data:${fileInfo.mediaType};base64,${fileInfo.data}`
          : undefined;
        const pending: AgentPendingFile = {
          id: `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          filename: fileInfo.filename,
          mediaType: fileInfo.mediaType,
          size: fileInfo.size,
          previewUrl,
        };
        if (!window.__pendingAgentFileData) {
          window.__pendingAgentFileData = new Map<string, string>();
        }
        window.__pendingAgentFileData.set(pending.id, fileInfo.data);
        setPendingFiles((prev) => [...prev, pending]);
      }
    } catch (error) {
      console.error("[AgentView] 文件选择对话框失败:", error);
    }
  }, [setPendingFiles]);

  const handleAttachFolder = React.useCallback(async (): Promise<void> => {
    try {
      const result = await ipc.openFolderDialog();
      if (!result) return;
      const updated = await ipc.attachDirectory({
        sessionId,
        directoryPath: result.path,
      });
      setAttachedDirsMap((prev) => {
        const map = new Map(prev);
        map.set(sessionId, updated);
        return map;
      });
      toast.success(`已附加目录: ${result.name}`);
    } catch (error) {
      console.error("[AgentView] 附加文件夹失败:", error);
      toast.error("附加文件夹失败");
    }
  }, [sessionId, setAttachedDirsMap]);

  const handleRemoveFile = React.useCallback(
    (id: string): void => {
      setPendingFiles((prev) => {
        const file = prev.find((f) => f.id === id);
        if (file?.previewUrl?.startsWith("blob:")) {
          URL.revokeObjectURL(file.previewUrl);
        }
        window.__pendingAgentFileData?.delete(id);
        return prev.filter((f) => f.id !== id);
      });
    },
    [setPendingFiles],
  );

  const handlePasteFiles = React.useCallback(
    (files: File[]): void => {
      addFilesAsAttachments(files);
    },
    [addFilesAsAttachments],
  );

  const [isDragOver, setIsDragOver] = React.useState(false);

  const handleDragOver = React.useCallback((e: React.DragEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = React.useCallback((e: React.DragEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = React.useCallback(
    async (e: React.DragEvent): Promise<void> => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      const droppedFiles = Array.from(e.dataTransfer.files);
      if (droppedFiles.length === 0) return;
      const pathMap = new Map<string, File>();
      const paths: string[] = [];
      for (const f of droppedFiles) {
        try {
          const p = ipc.getPathForFile(f);
          if (p) {
            paths.push(p);
            pathMap.set(p, f);
          }
        } catch {
          /* 无法获取路径时忽略 */
        }
      }
      if (paths.length > 0) {
        try {
          const { directories, files: filePaths } =
            await ipc.checkPathsType(paths);
          for (const dirPath of directories) {
            try {
              const updated = await ipc.attachDirectory({
                sessionId,
                directoryPath: dirPath,
              });
              setAttachedDirsMap((prev) => {
                const map = new Map(prev);
                map.set(sessionId, updated);
                return map;
              });
              const dirName = dirPath.split("/").pop() || dirPath;
              toast.success(`已附加目录: ${dirName}`);
            } catch (error) {
              console.error("[AgentView] 拖拽附加文件夹失败:", error);
            }
          }
          const regularFiles = filePaths
            .map((p) => pathMap.get(p)!)
            .filter(Boolean);
          if (regularFiles.length > 0) {
            addFilesAsAttachments(regularFiles);
          }
        } catch (error) {
          console.error("[AgentView] 路径检测失败，回退处理:", error);
          addFilesAsAttachments(droppedFiles);
        }
      } else {
        addFilesAsAttachments(droppedFiles);
      }
    },
    [sessionId, addFilesAsAttachments, setAttachedDirsMap],
  );

  // ===== 自动发送待处理提示词（handleSendUserMessage）=====

  React.useEffect(() => {
    if (!messagesLoaded) return;
    if (!pendingPrompt) return;
    if (pendingPrompt.sessionId !== sessionId) return;
    if (!agentChannelId || streaming) return;

    const snapshot = {
      message: pendingPrompt.message,
      channelId: agentChannelId,
      modelId: agentModelId || undefined,
    };
    setPendingPrompt(null);

    queueMicrotask(() => {
      const streamStartedAt = Date.now();
      setStreamingStates((prev) => {
        const map = new Map(prev);
        const existing = prev.get(sessionId);
        map.set(sessionId, {
          running: true,
          content: "",
          toolActivities: [],
          teammates: [],
          model: snapshot.modelId,
          startedAt: streamStartedAt,
          inputTokens: existing?.inputTokens,
          contextWindow: existing?.contextWindow,
        });
        return map;
      });

      const tempUserSDKMsg: SDKMessage = {
        type: "user",
        message: {
          content: [{ type: "text", text: snapshot.message }],
        },
        parent_tool_use_id: null,
        _createdAt: Date.now(),
      } as unknown as SDKMessage;
      setPersistedSDKMessages((prev) => [...prev, tempUserSDKMsg]);

      const input: AgentSendInput = {
        sessionId,
        userMessage: snapshot.message,
        channelId: snapshot.channelId,
        modelId: snapshot.modelId,
        startedAt: streamStartedAt,
        permissionModeOverride: permissionMode,
        backendMode: agentBackendMode,
      };
      setAgentSessionBackendModeMap((prev) => {
        const map = new Map(prev);
        map.set(sessionId, agentBackendMode);
        return map;
      });
      ipc.sendAgentMessage(input).catch((error) => {
        console.error("[AgentView] 自动发送配置消息失败:", error);
        setStreamingStates((prev) => {
          const current = prev.get(sessionId);
          if (!current) return prev;
          const map = new Map(prev);
          map.set(sessionId, { ...current, running: false });
          return map;
        });
      });
    });
  }, [
    messagesLoaded,
    pendingPrompt,
    sessionId,
    agentChannelId,
    agentModelId,
    currentWorkspaceId,
    streaming,
    setPendingPrompt,
    setStreamingStates,
    permissionMode,
    agentBackendMode,
    setAgentSessionBackendModeMap,
  ]);

  // ===== 发送消息 =====

  const handleSend = React.useCallback(async (): Promise<void> => {
    const text = inputContent.trim();
    const effectiveText = text || suggestion || "";
    if (
      (!effectiveText && pendingFiles.length === 0) ||
      !agentChannelId ||
      !hasAvailableModel
    )
      return;

    if (streaming) {
      toast.info("Agent 运行中暂不支持继续发送", {
        description:
          pendingFiles.length > 0
            ? "当前后端还不支持流中追加消息或附件，请等待本轮完成后再发送"
            : "当前后端还不支持流中追加消息，请等待本轮完成后再发送",
      });
      return;
    }

    setAgentStreamErrors((prev) => {
      if (!prev.has(sessionId)) return prev;
      const map = new Map(prev);
      map.delete(sessionId);
      return map;
    });

    setPromptSuggestions((prev) => {
      if (!prev.has(sessionId)) return prev;
      const map = new Map(prev);
      map.delete(sessionId);
      return map;
    });

    // 处理附件
    let fileReferences = "";
    if (pendingFiles.length > 0) {
      const workspace = workspaces.find((w) => w.id === currentWorkspaceId);
      if (workspace) {
        const existingFiles = pendingFiles.filter((f) => f.sourcePath);
        const newFiles = pendingFiles.filter((f) => !f.sourcePath);
        const allRefs: Array<{ filename: string; targetPath: string }> = [];
        for (const f of existingFiles) {
          allRefs.push({ filename: f.filename, targetPath: f.sourcePath! });
        }
        if (newFiles.length > 0) {
          const filesToSave = newFiles.map((f) => ({
            filename: f.filename,
            data: window.__pendingAgentFileData?.get(f.id) || "",
          }));
          try {
            const saved = await ipc.saveFilesToAgentSession({
              workspaceSlug: workspace.slug,
              sessionId,
              files: filesToSave,
            });
            allRefs.push(...saved);
          } catch (error) {
            console.error("[AgentView] 保存附件到 session 失败:", error);
          }
        }
        if (allRefs.length > 0) {
          const refs = allRefs
            .map((f) => `- ${f.filename}: ${f.targetPath}`)
            .join("\n");
          fileReferences += `<attached_files>\n${refs}\n</attached_files>\n\n`;
        }
      }
      for (const f of pendingFiles) {
        if (f.previewUrl?.startsWith("blob:"))
          URL.revokeObjectURL(f.previewUrl);
        window.__pendingAgentFileData?.delete(f.id);
      }
      setPendingFiles([]);
    }

    const finalMessage = fileReferences + effectiveText;

    store.set(stoppedByUserSessionsAtom, (prev: Set<string>) => {
      if (!prev.has(sessionId)) return prev;
      const next = new Set(prev);
      next.delete(sessionId);
      return next;
    });

    const streamStartedAt = Date.now();
    setStreamingStates((prev) => {
      const map = new Map(prev);
      const existing = prev.get(sessionId);
      map.set(sessionId, {
        running: true,
        content: "",
        toolActivities: [],
        teammates: [],
        model: agentModelId || undefined,
        startedAt: streamStartedAt,
        inputTokens: existing?.inputTokens,
        contextWindow: existing?.contextWindow,
      });
      return map;
    });

    const tempUserSDKMsg: SDKMessage = {
      type: "user",
      message: {
        content: [{ type: "text", text: finalMessage }],
      },
      parent_tool_use_id: null,
      _createdAt: Date.now(),
    } as unknown as SDKMessage;
    setPersistedSDKMessages((prev) => [...prev, tempUserSDKMsg]);

    const input: AgentSendInput = {
      sessionId,
      userMessage: finalMessage,
      channelId: agentChannelId,
      modelId: agentModelId || undefined,
      startedAt: streamStartedAt,
      permissionModeOverride: permissionMode,
      backendMode: agentBackendMode,
    };
    setAgentSessionBackendModeMap((prev) => {
      const map = new Map(prev);
      map.set(sessionId, agentBackendMode);
      return map;
    });

    setInputContent("");
    setInputHtmlContent("");

    ipc.sendAgentMessage(input).catch((error) => {
      console.error("[AgentView] 发送消息失败:", error);
      setStreamingStates((prev) => {
        const current = prev.get(sessionId);
        if (!current) return prev;
        const map = new Map(prev);
        map.set(sessionId, { ...current, running: false });
        return map;
      });
    });
  }, [
    inputContent,
    pendingFiles,
    attachedDirs,
    sessionId,
    agentChannelId,
    agentModelId,
    currentWorkspaceId,
    workspaces,
    streaming,
    suggestion,
    hasAvailableModel,
    store,
    setStreamingStates,
    setPendingFiles,
    setAgentStreamErrors,
    setPromptSuggestions,
    setInputContent,
    setInputHtmlContent,
    setLiveMessagesMap,
    permissionMode,
    agentBackendMode,
    setAgentSessionBackendModeMap,
  ]);

  // ===== 停止生成 =====

  const handleStop = React.useCallback((): void => {
    setStreamingStates((prev) => {
      const current = prev.get(sessionId);
      if (!current || !current.running) return prev;
      const map = new Map(prev);
      map.set(sessionId, {
        ...current,
        running: false,
        ...finalizeStreamingActivities(
          current.toolActivities,
          current.teammates,
        ),
      });
      return map;
    });
    ipc.stopAgent(sessionId).catch(console.error);
  }, [sessionId, setStreamingStates]);

  // ===== /compact 指令 =====

  const handleCompact = React.useCallback((): void => {
    if (!agentChannelId || streaming) return;
    const streamStartedAt = Date.now();
    const localUuid = crypto.randomUUID();

    const syntheticMsg: import("@jgui/shared").SDKMessage = {
      type: "user",
      uuid: localUuid,
      message: {
        content: [{ type: "text", text: "/compact" }],
      },
      parent_tool_use_id: null,
      _createdAt: streamStartedAt,
    } as unknown as import("@jgui/shared").SDKMessage;

    store.set(liveMessagesMapAtom, (prev) => {
      const map = new Map(prev);
      const current = map.get(sessionId) ?? [];
      map.set(sessionId, [...current, syntheticMsg]);
      return map;
    });

    setStreamingStates((prev) => {
      const map = new Map(prev);
      const current = prev.get(sessionId) ?? {
        running: true,
        content: "",
        toolActivities: [],
        teammates: [],
        model: agentModelId || undefined,
        startedAt: streamStartedAt,
      };
      map.set(sessionId, {
        ...current,
        running: true,
        startedAt: streamStartedAt,
        isCompacting: true,
        compactInFlight: true,
      });
      return map;
    });

    setAgentSessionBackendModeMap((prev) => {
      const map = new Map(prev);
      map.set(sessionId, agentBackendMode);
      return map;
    });
    ipc
      .sendAgentMessage({
        sessionId,
        userMessage: "/compact",
        channelId: agentChannelId,
        modelId: agentModelId || undefined,
        startedAt: streamStartedAt,
        permissionModeOverride: permissionMode,
        backendMode: agentBackendMode,
      })
      .catch((error) => {
        console.error("[AgentView] /compact 发送失败:", error);
        store.set(liveMessagesMapAtom, (prev) => {
          const map = new Map(prev);
          const current = (map.get(sessionId) ?? []).filter(
            (m) => (m as unknown as { uuid?: string }).uuid !== localUuid,
          );
          map.set(sessionId, current);
          return map;
        });
        setStreamingStates((prev) => {
          const map = new Map(prev);
          const current = prev.get(sessionId);
          if (!current) return prev;
          map.set(sessionId, {
            ...current,
            isCompacting: false,
            compactInFlight: false,
          });
          return map;
        });
      });
  }, [
    sessionId,
    agentChannelId,
    agentModelId,
    currentWorkspaceId,
    streaming,
    setStreamingStates,
    store,
    permissionMode,
    agentBackendMode,
    setAgentSessionBackendModeMap,
  ]);

  // ===== 复制错误信息 =====

  const handleCopyError = React.useCallback(async (): Promise<void> => {
    if (!agentError) return;
    try {
      await navigator.clipboard.writeText(agentError);
      setErrorCopied(true);
      setTimeout(() => setErrorCopied(false), 2000);
    } catch (error) {
      console.error("[AgentView] 复制错误信息失败:", error);
    }
  }, [agentError]);

  // ===== 重试 =====

  const handleRetry = React.useCallback((): void => {
    if (!agentChannelId || streaming) return;
    const lastUserMessage = [...persistedSDKMessages]
      .reverse()
      .map(getUserTextFromSDKMessage)
      .find((text): text is string => text !== null);
    if (!lastUserMessage) return;
    setAgentStreamErrors((prev) => {
      if (!prev.has(sessionId)) return prev;
      const map = new Map(prev);
      map.delete(sessionId);
      return map;
    });
    const streamStartedAt = Date.now();
    setStreamingStates((prev) => {
      const map = new Map(prev);
      const existing = prev.get(sessionId);
      map.set(sessionId, {
        running: true,
        content: "",
        toolActivities: [],
        teammates: [],
        model: agentModelId || undefined,
        startedAt: streamStartedAt,
        inputTokens: existing?.inputTokens,
        contextWindow: existing?.contextWindow,
      });
      return map;
    });
    setAgentSessionBackendModeMap((prev) => {
      const map = new Map(prev);
      map.set(sessionId, agentBackendMode);
      return map;
    });
    ipc
      .sendAgentMessage({
        sessionId,
        userMessage: lastUserMessage,
        channelId: agentChannelId,
        modelId: agentModelId || undefined,
        startedAt: streamStartedAt,
        permissionModeOverride: permissionMode,
        backendMode: agentBackendMode,
      })
      .catch(console.error);
  }, [
    persistedSDKMessages,
    sessionId,
    agentChannelId,
    agentModelId,
    currentWorkspaceId,
    streaming,
    setAgentStreamErrors,
    setStreamingStates,
    permissionMode,
    agentBackendMode,
    setAgentSessionBackendModeMap,
  ]);

  // ===== 在新会话中重试 =====

  const handleRetryInNewSession = React.useCallback(async (): Promise<void> => {
    if (!agentChannelId) return;
    try {
      const meta = await ipc.createAgentSession(
        undefined,
        agentChannelId,
        currentWorkspaceId || undefined,
      );
      setAgentSessions((prev) => [meta, ...prev]);
      openSession("agent", meta.id, meta.title);
      const prompt = `上个会话的 id 是 ${sessionId}，可以参考同工作区下的会话继续完成工作`;
      setStreamingStates((prev) => {
        const map = new Map(prev);
        map.set(meta.id, {
          running: true,
          content: "",
          toolActivities: [],
          teammates: [],
          model: agentModelId || undefined,
          startedAt: Date.now(),
        });
        return map;
      });
      setAgentSessionBackendModeMap((prev) => {
        const map = new Map(prev);
        map.set(meta.id, agentBackendMode);
        return map;
      });
      ipc
        .sendAgentMessage({
          sessionId: meta.id,
          userMessage: prompt,
          channelId: agentChannelId,
          modelId: agentModelId || undefined,
          permissionModeOverride: permissionMode,
          backendMode: agentBackendMode,
        })
        .catch(console.error);
    } catch (error) {
      console.error("[AgentView] 在新会话中重试失败:", error);
    }
  }, [
    sessionId,
    agentChannelId,
    agentModelId,
    currentWorkspaceId,
    openSession,
    setAgentSessions,
    setStreamingStates,
    permissionMode,
    agentBackendMode,
    setAgentSessionBackendModeMap,
  ]);

  // ===== 快捷键监听：stop-generation =====

  React.useEffect(() => {
    const handler = (): void => {
      if (streaming) handleStop();
    };
    window.addEventListener("jgui:stop-generation", handler);
    return () => window.removeEventListener("jgui:stop-generation", handler);
  }, [streaming, handleStop]);

  // ===== 快捷键监听：focus-input =====

  React.useEffect(() => {
    const handler = (): void => {
      const proseMirror = document.querySelector(
        '[data-input-mode="agent"] .ProseMirror',
      ) as HTMLElement | null;
      proseMirror?.focus();
    };
    window.addEventListener("jgui:focus-input", handler);
    return () => window.removeEventListener("jgui:focus-input", handler);
  }, []);

  const contextStatus: AgentContextStatus = {
    isCompacting: streamState?.isCompacting ?? false,
    inputTokens: streamState?.inputTokens,
    contextWindow: streamState?.contextWindow,
  };

  return {
    // 状态
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
    agentError,
    errorCopied,
    isDragOver,
    agentChannelId,
    agentModelId,
    permissionMode,
    currentWorkspaceId,
    contextStatus,

    // 处理器
    handleSend,
    handleStop,
    handleCompact,
    handleRetry,
    handleRetryInNewSession,
    handleCopyError,
    handleOpenFileDialog,
    handleAttachFolder,
    handleRemoveFile,
    handlePasteFiles,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    addFilesAsAttachments,
    setIsDragOver,
  };
}

// ===== 工具函数 =====

interface SDKMessageRecord {
  type?: string;
  parent_tool_use_id?: string | null;
  isSynthetic?: boolean;
  message?: {
    content?: unknown;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getUserTextFromSDKMessage(message: SDKMessage): string | null {
  const sdkMessage = message as unknown as SDKMessageRecord;
  if (
    sdkMessage.type !== "user" ||
    sdkMessage.parent_tool_use_id ||
    sdkMessage.isSynthetic
  ) {
    return null;
  }
  const content = sdkMessage.message?.content;
  if (!Array.isArray(content)) return null;
  if (content.some((block) => isRecord(block) && block.type === "tool_result"))
    return null;
  const texts = content
    .filter(
      (block) =>
        isRecord(block) &&
        block.type === "text" &&
        typeof block.text === "string",
    )
    .map((block) => (block as { text: string }).text);
  return texts.length > 0 ? texts.join("\n") : null;
}

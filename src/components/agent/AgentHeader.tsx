import { useState, useEffect, useCallback } from "react";
import { PanelRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface AgentHeaderProps {
  sessionId: string | null;
  title: string;
  providerLabel: string;
  rightPanelOpen: boolean;
  onToggleRightPanel: () => void;
  onTitleChange: (title: string) => void;
  permissionMode: string;
  onPermissionModeChange: (mode: string) => void;
}

const PERMISSION_MODES = [
  { value: "bypassPermissions", label: "Auto" },
  { value: "default", label: "审批" },
  { value: "plan", label: "计划" },
];

export default function AgentHeader({
  sessionId,
  title,
  providerLabel,
  rightPanelOpen,
  onToggleRightPanel,
  onTitleChange,
  permissionMode,
  onPermissionModeChange,
}: AgentHeaderProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(title);

  useEffect(() => {
    if (!isEditing) {
      setEditValue(title);
    }
  }, [title, isEditing]);

  const handleStartEdit = useCallback(() => {
    setEditValue(title);
    setIsEditing(true);
  }, [title]);

  const handleCommitEdit = useCallback(() => {
    const trimmed = editValue.trim();
    if (trimmed && sessionId) {
      onTitleChange(trimmed);
    }
    setIsEditing(false);
  }, [editValue, sessionId, onTitleChange]);

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditValue(title);
  }, [title]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleCommitEdit();
      }
      if (e.key === "Escape") {
        handleCancelEdit();
      }
    },
    [handleCommitEdit, handleCancelEdit],
  );

  return (
    <div className="flex items-center justify-between h-10 px-4 border-b border-border shrink-0 gap-2">
      <div className="flex items-center gap-2 shrink-0 min-w-0">
        {isEditing ? (
          <input
            autoFocus
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleCommitEdit}
            onKeyDown={handleKeyDown}
            className="text-sm font-medium bg-background border border-border rounded px-1 py-0.5 outline-none max-w-[200px]"
          />
        ) : (
          <button
            onClick={handleStartEdit}
            className="text-sm font-medium truncate max-w-[200px] hover:bg-accent rounded px-1 py-0.5 text-left"
            title="点击编辑标题"
          >
            {title}
          </button>
        )}
        <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
          {providerLabel}
        </span>
      </div>

      <div className="flex items-center gap-0.5 bg-muted rounded-md p-0.5">
        {PERMISSION_MODES.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => onPermissionModeChange(value)}
            className={cn(
              "px-2 py-0.5 text-[11px] rounded font-medium transition-colors",
              permissionMode === value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ContextUsageBadge placeholder (#56) */}
      <div className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
        --/--
      </div>

      <button
        onClick={onToggleRightPanel}
        className={cn(
          "p-1 rounded-md hover:bg-accent",
          rightPanelOpen ? "text-foreground bg-accent" : "text-muted-foreground",
        )}
        title="切换文件浏览器"
      >
        <PanelRight size={14} />
      </button>
    </div>
  );
}

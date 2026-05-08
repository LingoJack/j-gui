import { AlertTriangle, Check, X } from "lucide-react";

interface Props {
  toolName: string;
  toolInput: string;
  disabled?: boolean;
  onAllow: () => void;
  onDeny: () => void;
}

export default function PermissionBanner({ toolName, toolInput, disabled = false, onAllow, onDeny }: Props) {
  let preview = toolInput;
  try {
    preview = JSON.stringify(JSON.parse(toolInput), null, 2).slice(0, 300);
  } catch {}

  return (
    <div className="border border-orange-500/30 bg-orange-500/5 rounded-lg p-3 space-y-2 mx-4">
      <div className="flex items-center gap-2">
        <AlertTriangle size={14} className="text-orange-500" />
        <span className="text-sm font-medium">工具执行需要审批</span>
        <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono">
          {toolName}
        </span>
      </div>
      <pre className="text-[11px] bg-muted rounded p-2 overflow-x-auto leading-relaxed max-h-24 overflow-y-auto text-muted-foreground">
        {preview}
      </pre>
      <div className="flex gap-2">
        <button
          onClick={onAllow}
          disabled={disabled}
          className="flex items-center gap-1 px-3 py-1 text-xs rounded-md bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Check size={12} /> 允许 (Enter)
        </button>
        <button
          onClick={onDeny}
          disabled={disabled}
          className="flex items-center gap-1 px-3 py-1 text-xs rounded-md bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <X size={12} /> 拒绝 (Esc)
        </button>
      </div>
    </div>
  );
}

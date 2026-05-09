import { useState } from "react";
import { Wrench, Loader2, Check, X, ChevronDown, ChevronRight } from "lucide-react";

interface Props {
  name: string;
  status: "running" | "done" | "error";
  input?: string;
  output?: string;
}

export default function ChatToolBlock({ name, status, input, output }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-border/50 rounded-md overflow-hidden text-sm my-1">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 w-full px-3 py-1.5 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Wrench size={14} className="text-muted-foreground" />
        <span className="text-xs font-medium flex-1">{name}</span>
        {status === "running" && (
          <Loader2 size={14} className="animate-spin text-primary" />
        )}
        {status === "done" && (
          <Check size={14} className="text-emerald-500" />
        )}
        {status === "error" && (
          <X size={14} className="text-destructive" />
        )}
      </button>
      {expanded && (
        <div className="px-3 py-2 space-y-1">
          {input && (
            <div>
              <span className="text-[10px] text-muted-foreground">输入</span>
              <pre className="text-xs text-muted-foreground bg-muted rounded px-2 py-1 mt-0.5 whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
                {input}
              </pre>
            </div>
          )}
          {output && (
            <div>
              <span className="text-[10px] text-muted-foreground">
                {status === "error" ? "错误" : "输出"}
              </span>
              <pre className={`text-xs bg-muted rounded px-2 py-1 mt-0.5 whitespace-pre-wrap break-all max-h-32 overflow-y-auto ${status === "error" ? "text-destructive" : "text-muted-foreground"}`}>
                {output}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import { ChevronDown, ChevronRight, Wrench, Loader2, Check, X } from "lucide-react";
import type { ToolCall } from "@/atoms/sessions";
import { cn } from "@/lib/utils";

interface Props {
  toolCall: ToolCall;
}

export default function ToolCallDisplay({ toolCall }: Props) {
  const [expanded, setExpanded] = useState(true);

  const statusIcon = () => {
    switch (toolCall.status) {
      case "running":
        return <Loader2 size={14} className="animate-spin text-primary" />;
      case "done":
        return <Check size={14} className="text-emerald-500" />;
      case "error":
        return <X size={14} className="text-destructive" />;
    }
  };

  let inputParsed: string;
  try {
    inputParsed = JSON.stringify(JSON.parse(toolCall.toolInput), null, 2);
  } catch {
    inputParsed = toolCall.toolInput;
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden text-sm">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 w-full px-3 py-2 bg-muted/50 hover:bg-muted transition-colors text-left"
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Wrench size={14} className="text-muted-foreground" />
        <span className="font-medium text-xs">{toolCall.toolName}</span>
        <span className="flex-1" />
        {statusIcon()}
      </button>
      {expanded && (
        <div className="px-3 py-2 space-y-2 text-xs">
          <div>
            <p className="text-muted-foreground mb-1">输入</p>
            <pre className="bg-muted rounded p-2 overflow-x-auto text-[11px] leading-relaxed">
              {inputParsed}
            </pre>
          </div>
          {toolCall.toolOutput !== undefined && (
            <div>
              <p className="text-muted-foreground mb-1">输出</p>
              <pre
                className={cn(
                  "rounded p-2 overflow-x-auto text-[11px] leading-relaxed",
                  toolCall.status === "error" ? "bg-destructive/5 text-destructive" : "bg-muted",
                )}
              >
                {toolCall.toolOutput || "(空)"}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

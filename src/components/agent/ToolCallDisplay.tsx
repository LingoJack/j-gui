import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Wrench,
  Loader2,
  Check,
  X,
} from "lucide-react";
import type { ToolCall } from "@/atoms/sessions";

interface Props {
  toolId: string;
  toolName: string;
  toolInput: string;
  toolOutput?: string | null;
  status: string;
}

/** Try to parse toolInput JSON, return null on failure. */
function parseInput(raw: string): Record<string, unknown> | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Extract a file-path-like value from common key names. */
function extractPath(obj: Record<string, unknown> | null): string | null {
  if (!obj) return null;
  for (const key of ["file_path", "filePath", "path"] as const) {
    const v = obj[key];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
}

/** Extract command string. */
function extractCommand(obj: Record<string, unknown> | null): string | null {
  if (!obj) return null;
  const v = obj["command"];
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** Extract pattern string. */
function extractPattern(obj: Record<string, unknown> | null): string | null {
  if (!obj) return null;
  const v = obj["pattern"];
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** Extract url or query for web tools. */
function extractWebInfo(
  obj: Record<string, unknown> | null,
): { url?: string; query?: string } | null {
  if (!obj) return null;
  const url = typeof obj["url"] === "string" ? obj["url"] : undefined;
  const query = typeof obj["query"] === "string" ? obj["query"] : undefined;
  if (url || query) return { url, query };
  return null;
}

export default function ToolCallDisplay(props: Props) {
  const [expanded, setExpanded] = useState(true);

  const { toolName, toolInput, toolOutput, status } = props;
  const parsed = parseInput(toolInput);

  // --- Status icon ---
  const statusIcon = () => {
    switch (status) {
      case "running":
        return <Loader2 size={14} className="animate-spin text-primary" />;
      case "done":
        return <Check size={14} className="text-emerald-500" />;
      case "error":
        return <X size={14} className="text-destructive" />;
    }
  };

  // --- Header: type-specific summary chip next to tool name ---
  const renderHeaderChip = () => {
    switch (toolName) {
      case "Read": {
        const p = extractPath(parsed);
        return p ? (
          <span className="font-mono text-muted-foreground truncate">{p}</span>
        ) : null;
      }
      case "Write": {
        const p = extractPath(parsed);
        return p ? (
          <span className="font-mono text-muted-foreground truncate">{p}</span>
        ) : null;
      }
      case "Edit": {
        const p = extractPath(parsed);
        return p ? (
          <span className="font-mono text-muted-foreground truncate">{p}</span>
        ) : null;
      }
      case "PowerShell":
      case "Bash": {
        const cmd = extractCommand(parsed);
        return cmd ? (
          <span className="font-mono text-muted-foreground truncate">
            {cmd}
          </span>
        ) : null;
      }
      case "Grep": {
        const pat = extractPattern(parsed);
        return pat ? (
          <span className="font-mono text-muted-foreground truncate">
            {pat}
          </span>
        ) : null;
      }
      case "Glob": {
        const pat = extractPattern(parsed);
        return pat ? (
          <span className="font-mono text-muted-foreground truncate">
            {pat}
          </span>
        ) : null;
      }
      case "WebFetch":
      case "WebSearch": {
        const info = extractWebInfo(parsed);
        if (!info) return null;
        const label = info.query ?? info.url;
        return label ? (
          <span className="font-mono text-muted-foreground truncate">
            {label}
          </span>
        ) : null;
      }
      default:
        return null;
    }
  };

  // --- Body: type-specific result summary ---
  const renderBody = () => {
    // Error state
    if (status === "error") {
      return (
        <div className="px-3 py-2 text-xs">
          <p className="text-destructive">
            {toolOutput || "Error"}
          </p>
        </div>
      );
    }

    // Running — show input detail
    if (status === "running") {
      let inputDetail: string;
      try {
        inputDetail = JSON.stringify(JSON.parse(toolInput), null, 2);
      } catch {
        inputDetail = toolInput;
      }
      return (
        <div className="px-3 py-2 text-xs space-y-2">
          <pre className="bg-muted rounded p-2 overflow-x-auto text-[11px] leading-relaxed">
            {inputDetail}
          </pre>
        </div>
      );
    }

    // Done — type-specific summary
    switch (toolName) {
      case "Read": {
        const p = extractPath(parsed);
        return (
          <div className="px-3 py-2 text-xs text-muted-foreground">
            Read {p ? `from ${p}` : "file"}
          </div>
        );
      }
      case "Write": {
        const p = extractPath(parsed);
        return (
          <div className="px-3 py-2 text-xs text-muted-foreground">
            Wrote to {p ?? "file"}
          </div>
        );
      }
      case "Edit": {
        const p = extractPath(parsed);
        return (
          <div className="px-3 py-2 text-xs text-muted-foreground">
            Edited {p ?? "file"}
          </div>
        );
      }
      case "PowerShell":
      case "Bash": {
        const lines = (toolOutput || "").split("\n").filter(Boolean);
        const preview = lines.slice(0, 3).join("\n");
        return (
          <div className="px-3 py-2 text-xs">
            {preview && (
              <pre className="bg-muted rounded p-2 overflow-x-auto text-[11px] leading-relaxed whitespace-pre-wrap">
                {preview}
                {lines.length > 3 ? "\n…" : ""}
              </pre>
            )}
          </div>
        );
      }
      case "Grep": {
        return (
          <div className="px-3 py-2 text-xs text-muted-foreground">
            {toolOutput ?? "Search complete"}
          </div>
        );
      }
      case "Glob": {
        return (
          <div className="px-3 py-2 text-xs text-muted-foreground">
            {toolOutput ?? "Search complete"}
          </div>
        );
      }
      default:
        // Unknown tool — show raw output if present
        return toolOutput ? (
          <div className="px-3 py-2 text-xs">
            <pre className="bg-muted rounded p-2 overflow-x-auto text-[11px] leading-relaxed">
              {toolOutput}
            </pre>
          </div>
        ) : null;
    }
  };

  return (
    <div className="border border-border rounded-lg overflow-hidden text-sm">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 w-full px-3 py-2 bg-muted/50 hover:bg-muted transition-colors text-left"
      >
        {expanded ? (
          <ChevronDown size={14} />
        ) : (
          <ChevronRight size={14} />
        )}
        <Wrench size={14} className="text-muted-foreground" />
        <span className="font-medium text-xs">{toolName}</span>
        {renderHeaderChip()}
        <span className="flex-1" />
        {statusIcon()}
      </button>
      {expanded && renderBody()}
    </div>
  );
}

/** Also accept the nested toolCall prop for backward compat with AgentMessages. */
export function ToolCallDisplayFromToolCall({
  toolCall,
}: {
  toolCall: ToolCall;
}) {
  return (
    <ToolCallDisplay
      toolId={toolCall.toolId}
      toolName={toolCall.toolName}
      toolInput={toolCall.toolInput}
      toolOutput={toolCall.toolOutput}
      status={toolCall.status}
    />
  );
}

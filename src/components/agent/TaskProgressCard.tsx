import { useState } from "react";
import {
  ListTodo,
  ChevronDown,
  ChevronRight,
  Circle,
  Loader2,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import type { Message } from "@/atoms/sessions";

const TASK_TOOLS = new Set(["TaskCreate", "TaskUpdate", "TodoWrite"]);

interface TaskInfo {
  label: string;
  status: "running" | "done" | "error";
}

function extractTaskSummary(messages: Message[]) {
  const tasks: TaskInfo[] = messages
    .filter((m) => m.toolCall && TASK_TOOLS.has(m.toolCall.toolName))
    .map((m) => {
      let label = m.toolCall!.toolName;
      try {
        const input = JSON.parse(m.toolCall!.toolInput);
        label = input.description || input.task || input.subject || m.toolCall!.toolName;
      } catch {}
      return { label, status: m.toolCall!.status };
    });

  const done = tasks.filter((t) => t.status === "done").length;
  const failed = tasks.filter((t) => t.status === "error").length;
  const completed = done + failed;

  return { tasks, done, failed, completed, total: tasks.length };
}

interface Props {
  messages: Message[];
}

export default function TaskProgressCard({ messages }: Props) {
  const [expanded, setExpanded] = useState(true);
  const { tasks, done, failed, completed, total } = extractTaskSummary(messages);

  if (total === 0) return null;
  const isMany = total > 8;

  return (
    <div className="border border-border rounded-lg overflow-hidden text-sm mx-4 my-2">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 w-full px-3 py-2 bg-muted/50 hover:bg-muted transition-colors text-left"
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <ListTodo size={14} className="text-primary" />
        <span className="font-medium text-xs">任务进度</span>
        <span className="text-[10px] text-muted-foreground">
          {completed}/{total}
        </span>
        <span className="text-[10px] text-muted-foreground/60">
          ({done} 完成{failed > 0 ? `, ${failed} 失败` : ""})
        </span>
        <div className="flex-1 mx-2 h-1.5 bg-muted rounded-full overflow-hidden">
          {/* Completed bar (green) */}
          {completed > 0 && (
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-500 ease-out float-left"
              style={{ width: `${(completed / total) * 100}%` }}
            />
          )}
        </div>
      </button>
      {expanded && (
        <div className="px-3 py-2 space-y-1 max-h-64 overflow-y-auto">
          {(isMany ? tasks.slice(0, 8) : tasks).map((t, i) => (
            <div
              key={i}
              className={`flex items-center gap-2 text-xs transition-opacity duration-300 ${
                t.status === "done"
                  ? "opacity-70"
                  : t.status === "error"
                    ? "opacity-90"
                    : "opacity-100"
              }`}
            >
              {t.status === "done" ? (
                <CheckCircle2 size={12} className="text-emerald-500 shrink-0" />
              ) : t.status === "running" ? (
                <Loader2 size={12} className="animate-spin text-primary shrink-0" />
              ) : t.status === "error" ? (
                <XCircle size={12} className="text-destructive shrink-0" />
              ) : (
                <Circle size={12} className="text-muted-foreground shrink-0" />
              )}
              <span className="truncate">{t.label}</span>
            </div>
          ))}
          {isMany && expanded && (
            <p className="text-[10px] text-muted-foreground text-center pt-1">
              ... 还有 {total - 8} 项
            </p>
          )}
        </div>
      )}
    </div>
  );
}

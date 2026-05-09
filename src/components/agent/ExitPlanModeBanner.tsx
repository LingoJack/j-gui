import { useState, useCallback } from "react";
import {
  ListChecks,
  Play,
  Pencil,
  X,
  MessageSquare,
} from "lucide-react";

interface Props {
  planSummary: string;
  onDecision: (
    decision: "approve_and_run" | "approve_with_manual" | "reject" | "feedback",
    feedback?: string,
  ) => void;
  disabled: boolean;
}

export default function ExitPlanModeBanner({
  planSummary,
  onDecision,
  disabled,
}: Props) {
  const [feedback, setFeedback] = useState("");
  const [showFeedback, setShowFeedback] = useState(false);

  const handleDecision = useCallback(
    (decision: "approve_and_run" | "approve_with_manual" | "reject" | "feedback") => {
      if (decision === "feedback" || decision === "reject") {
        if (showFeedback) {
          onDecision(decision, feedback.trim() || undefined);
        } else {
          setShowFeedback(true);
        }
      } else {
        onDecision(decision);
      }
    },
    [feedback, showFeedback, onDecision],
  );

  return (
    <div className="border border-cyan-500/30 bg-cyan-500/5 rounded-lg p-3 space-y-3 mx-4">
      <div className="flex items-center gap-2">
        <ListChecks size={14} className="text-cyan-500 shrink-0" />
        <span className="text-sm font-medium">AI 执行计划</span>
      </div>
      <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
        {planSummary}
      </p>
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => handleDecision("approve_and_run")}
          disabled={disabled}
          className="flex items-center gap-1 px-3 py-1 text-xs rounded-md bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Play size={12} /> 批准并执行
        </button>
        <button
          onClick={() => handleDecision("approve_with_manual")}
          disabled={disabled}
          className="flex items-center gap-1 px-3 py-1 text-xs rounded-md bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Pencil size={12} /> 批准但手动执行
        </button>
        <button
          onClick={() => handleDecision("reject")}
          disabled={disabled}
          className="flex items-center gap-1 px-3 py-1 text-xs rounded-md bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <X size={12} /> 拒绝
        </button>
        <button
          onClick={() => handleDecision("feedback")}
          disabled={disabled}
          className="flex items-center gap-1 px-3 py-1 text-xs rounded-md bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <MessageSquare size={12} /> 反馈
        </button>
      </div>
      {showFeedback && (
        <div className="flex gap-2">
          <input
            type="text"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="输入修改建议或拒绝原因..."
            disabled={disabled}
            autoFocus
            className="flex-1 text-xs px-2 py-1 rounded border border-border bg-background outline-none focus:border-cyan-500/50 disabled:opacity-50"
          />
          <button
            onClick={() => {
              const decision = feedback.trim()
                ? ("feedback" as const)
                : ("reject" as const);
              onDecision(decision, feedback.trim() || undefined);
            }}
            disabled={disabled}
            className="flex items-center gap-1 px-3 py-1 text-xs rounded-md bg-cyan-500/10 text-cyan-600 hover:bg-cyan-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            确认
          </button>
        </div>
      )}
    </div>
  );
}

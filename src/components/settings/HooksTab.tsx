import { useEffect, useState } from "react";
import { listHooks, type HookInfo } from "@/lib/tauri";
import SettingsSection from "./primitives/SettingsSection";
import SettingsCard from "./primitives/SettingsCard";
import { Zap, Loader2 } from "lucide-react";

const EVENT_LABELS: Record<string, string> = {
  PreSendMessage: "发送消息前",
  PostSendMessage: "发送消息后",
  PreLlmRequest: "LLM请求前",
  PostLlmResponse: "LLM回复后",
  PreToolExecution: "工具执行前",
  PostToolExecution: "工具执行后",
  PostToolExecutionFailure: "工具执行失败后",
  Stop: "停止回复",
  SessionStart: "会话启动",
  SessionEnd: "会话退出",
  PreMicroCompact: "Micro压缩前",
  PostMicroCompact: "Micro压缩后",
  PreAutoCompact: "Auto压缩前",
  PostAutoCompact: "Auto压缩后",
};

export default function HooksTab() {
  const [hooks, setHooks] = useState<HookInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listHooks()
      .then(setHooks)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading)
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="animate-spin" size={20} />
      </div>
    );

  return (
    <SettingsSection title="已加载的 Hooks">
      {hooks.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">
          暂无 Hooks。将 hook 配置放入 ~/.jdata/agent/hooks/ 或项目 .jcli/hooks/ 目录。
        </p>
      ) : (
        <div className="space-y-2">
          {hooks.map((h, i) => (
            <SettingsCard key={h.uniqueId || i}>
              <div className="flex items-start gap-3">
                <Zap size={16} className="text-primary mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{h.name || h.label}</span>
                    <span className="text-[10px] bg-muted px-1 py-0.5 rounded">
                      {EVENT_LABELS[h.event] || h.event}
                    </span>
                    <span className="text-[10px] text-muted-foreground bg-muted px-1 py-0.5 rounded">
                      {h.source}
                    </span>
                    <span className="text-[10px] text-muted-foreground bg-muted px-1 py-0.5 rounded">
                      {h.hookType}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{h.label}</p>
                  {h.timeout && (
                    <span className="text-[10px] text-muted-foreground">超时: {h.timeout}s</span>
                  )}
                  {h.onError && (
                    <span className="text-[10px] text-muted-foreground ml-2">
                      on_error: {h.onError}
                    </span>
                  )}
                </div>
              </div>
            </SettingsCard>
          ))}
        </div>
      )}
    </SettingsSection>
  );
}

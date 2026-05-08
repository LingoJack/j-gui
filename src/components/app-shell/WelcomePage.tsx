import { MessageSquare, Settings } from "lucide-react";

interface Props {
  onOpenSettings: () => void;
  version: string;
}

export default function WelcomePage({ onOpenSettings, version }: Props) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center space-y-4 max-w-sm">
        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto">
          <MessageSquare size={24} className="text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">欢迎使用 j-gui</h2>
          <p className="text-sm text-muted-foreground mt-1">
            j-cli 的桌面 AI 助手，支持 Chat 对话与 Agent 任务执行
          </p>
        </div>
        <div className="bg-muted rounded-lg p-4 text-left text-sm space-y-2">
          <p className="font-medium">开始使用</p>
          <ol className="text-muted-foreground space-y-1 list-decimal list-inside text-xs">
            <li>点击下方按钮打开设置</li>
            <li>添加模型提供方（API Base URL + Key + 模型 ID）</li>
            <li>选中提供方后即可开始对话</li>
          </ol>
        </div>
        <button
          onClick={onOpenSettings}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:opacity-90 transition-opacity"
        >
          <Settings size={16} />
          配置模型提供方
        </button>
        {version && (
          <p className="text-[10px] text-muted-foreground">v{version}</p>
        )}
      </div>
    </div>
  );
}

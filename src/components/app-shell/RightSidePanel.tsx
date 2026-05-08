import { useAtom } from "jotai";
import { rightPanelOpenAtom } from "@/atoms/sidebar";
import { FolderOpen, PanelRightClose } from "lucide-react";

export default function RightSidePanel() {
  const [, setOpen] = useAtom(rightPanelOpenAtom);

  return (
    <aside className="w-[260px] flex flex-col h-full bg-card border-l border-border shrink-0">
      <div className="flex items-center justify-between h-10 px-3 border-b border-border">
        <span className="text-sm font-medium">工作区</span>
        <button
          onClick={() => setOpen(false)}
          className="p-1 rounded hover:bg-accent text-muted-foreground"
        >
          <PanelRightClose size={16} />
        </button>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2">
        <FolderOpen size={32} className="opacity-40" />
        <p className="text-sm">文件浏览器</p>
      </div>
    </aside>
  );
}

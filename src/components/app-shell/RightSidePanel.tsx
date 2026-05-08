import { useState, useEffect } from "react";
import { useAtom } from "jotai";
import { rightPanelOpenAtom } from "@/atoms/sidebar";
import { FolderOpen, PanelRightClose, File, Folder, ChevronRight, ChevronDown, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
}

export default function RightSidePanel() {
  const [, setOpen] = useAtom(rightPanelOpenAtom);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const cwd = useState(() => ".")[0];

  const loadFiles = async (dirPath: string) => {
    try {
      const { readDir } = await import("@tauri-apps/plugin-fs");
      const entries = await readDir(dirPath || ".");
      setFiles(
        entries
          .filter((e) => !e.name?.startsWith(".") && !e.name?.startsWith("node_modules"))
          .map((e) => ({
            name: e.name || "",
            path: `${dirPath}/${e.name}`,
            isDir: e.isDirectory ?? false,
            size: 0,
          })),
      );
    } catch {
      // fs plugin not available or directory read failed
    }
  };

  useEffect(() => {
    loadFiles(cwd);
  }, [cwd]);

  const toggleDir = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  return (
    <aside className="w-[260px] flex flex-col h-full bg-card border-l border-border shrink-0">
      <div className="flex items-center justify-between h-10 px-3 border-b border-border">
        <span className="text-sm font-medium">工作区</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => loadFiles(cwd)}
            className="p-1 rounded hover:bg-accent text-muted-foreground"
            title="刷新"
          >
            <RefreshCw size={14} />
          </button>
          <button
            onClick={() => setOpen(false)}
            className="p-1 rounded hover:bg-accent text-muted-foreground"
          >
            <PanelRightClose size={16} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {files.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-muted-foreground gap-2 py-8">
            <FolderOpen size={24} className="opacity-40" />
            <p className="text-xs">空目录</p>
          </div>
        ) : (
          files.map((f) => (
            <div
              key={f.path}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1 text-xs hover:bg-accent cursor-pointer",
                f.isDir && "font-medium",
              )}
              onClick={() => f.isDir && toggleDir(f.path)}
            >
              {f.isDir ? (
                <>
                  {expanded.has(f.path) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  <Folder size={14} className="text-blue-500 shrink-0" />
                </>
              ) : (
                <>
                  <span className="w-3" />
                  <File size={14} className="text-muted-foreground shrink-0" />
                </>
              )}
              <span className="truncate">{f.name}</span>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}

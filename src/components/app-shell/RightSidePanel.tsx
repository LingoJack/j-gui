import { useState, useEffect, useCallback, memo } from "react";
import { useAtom } from "jotai";
import { rightPanelOpenAtom, rightPanelDirsAtom } from "@/atoms/sidebar";
import {
  FolderOpen,
  File,
  Folder,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  Loader2,
  X,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";

// --- Types ---

interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  size?: number;
  children?: TreeNode[];
  expanded: boolean;
  loaded: boolean;
  loading: boolean;
}

// --- Helpers ---

const IGNORED_DIRS = new Set([".git", "node_modules", "target"]);

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/");
}

function dirName(dirPath: string): string {
  const normalized = normalizePath(dirPath).replace(/\/+$/, "");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || dirPath;
}

function formatSize(bytes: number | undefined): string {
  if (bytes === undefined) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function updateTreeNode(
  nodes: TreeNode[],
  targetPath: string,
  updates: Partial<TreeNode>,
): TreeNode[] {
  return nodes.map((node) => {
    if (node.path === targetPath) return { ...node, ...updates };
    if (node.children) {
      return { ...node, children: updateTreeNode(node.children, targetPath, updates) };
    }
    return node;
  });
}

async function loadDirEntries(dirPath: string): Promise<TreeNode[]> {
  const { readDir, stat: fsStat } = await import("@tauri-apps/plugin-fs");
  const entries = await readDir(dirPath || ".");

  const filtered = entries.filter((e) => {
    if (e.isDirectory && IGNORED_DIRS.has(e.name)) return false;
    return true;
  });

  const nodes: TreeNode[] = await Promise.all(
    filtered.map(async (e) => {
      const fullPath = `${dirPath}/${e.name}`;
      const node: TreeNode = {
        name: e.name,
        path: fullPath,
        isDir: e.isDirectory,
        children: undefined,
        expanded: false,
        loaded: false,
        loading: false,
      };

      if (!e.isDirectory) {
        try {
          const info = await fsStat(fullPath);
          node.size = info.size;
        } catch {
          // size unavailable — leave undefined
        }
      }

      return node;
    }),
  );

  // Directories first, then alphabetical
  nodes.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return nodes;
}

// --- Tree node component (memo'd for performance) ---

interface TreeNodeProps {
  node: TreeNode;
  depth: number;
  onToggle: (path: string) => void;
}

const TreeNodeItem = memo(function TreeNodeItem({ node, depth, onToggle }: TreeNodeProps) {
  return (
    <div key={node.path}>
      <div
        className={cn(
          "flex items-center gap-1.5 px-3 py-1 text-xs hover:bg-accent cursor-pointer select-none",
          node.isDir && "font-medium",
        )}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
        onClick={() => onToggle(node.path)}
      >
        {node.isDir ? (
          <>
            {node.loading ? (
              <Loader2 size={12} className="animate-spin shrink-0" />
            ) : node.expanded ? (
              <ChevronDown size={12} className="shrink-0" />
            ) : (
              <ChevronRight size={12} className="shrink-0" />
            )}
            <Folder size={14} className="text-blue-500 shrink-0" />
          </>
        ) : (
          <>
            <span className="w-3 shrink-0" />
            <File size={14} className="text-muted-foreground shrink-0" />
          </>
        )}
        <span className="truncate flex-1">{node.name}</span>
        {!node.isDir && node.size !== undefined && (
          <span className="text-[10px] text-muted-foreground shrink-0">
            {formatSize(node.size)}
          </span>
        )}
      </div>
      {node.expanded &&
        node.children?.map((child) => (
          <TreeNodeItem key={child.path} node={child} depth={depth + 1} onToggle={onToggle} />
        ))}
    </div>
  );
});

// --- Root directory bar (with remove button) ---

interface RootBarProps {
  name: string;
  path: string;
  expanded: boolean;
  loading: boolean;
  onToggle: (path: string) => void;
  onRemove: (path: string) => void;
}

const RootBar = memo(function RootBar({ name, path, expanded, loading, onToggle, onRemove }: RootBarProps) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium hover:bg-accent cursor-pointer select-none border-b border-border/50 group">
      {loading ? (
        <Loader2 size={12} className="animate-spin shrink-0" />
      ) : expanded ? (
        <ChevronDown size={12} className="shrink-0" onClick={() => onToggle(path)} />
      ) : (
        <ChevronRight size={12} className="shrink-0" onClick={() => onToggle(path)} />
      )}
      <Folder size={14} className="text-blue-500 shrink-0" onClick={() => onToggle(path)} />
      <span className="truncate flex-1" onClick={() => onToggle(path)}>{name}</span>
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(path); }}
        className="p-0.5 rounded hover:bg-muted text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
        title="移除目录"
      >
        <X size={12} />
      </button>
    </div>
  );
});

// --- Component ---

export default function RightSidePanel() {
  const [, setOpen] = useAtom(rightPanelOpenAtom);
  const [dirs, setDirs] = useAtom(rightPanelDirsAtom);
  const [roots, setRoots] = useState<TreeNode[]>([]);

  // Sync root tree nodes from the dirs array
  useEffect(() => {
    setRoots(
      dirs.map((dirPath) => {
        const normalized = normalizePath(dirPath);
        return {
          name: dirName(normalized),
          path: normalized,
          isDir: true,
          children: undefined,
          expanded: false,
          loaded: false,
          loading: false,
        };
      }),
    );
  }, [dirs]);

  const handleAddDir = useCallback(async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ directory: true, multiple: false });
      if (!selected) return;
      const path = normalizePath(typeof selected === "string" ? selected : selected[0]);
      if (path && !dirs.includes(path)) {
        setDirs((prev) => [...prev, path]);
      }
    } catch {
      // dialog cancelled or unavailable
    }
  }, [dirs, setDirs]);

  const handleRemoveDir = useCallback(
    (path: string) => {
      setDirs((prev) => prev.filter((d) => d !== path));
    },
    [setDirs],
  );

  const refreshAll = useCallback(() => {
    // Reset all roots to unloaded state so they reload on next expand
    setRoots((prev) =>
      prev.map((r) => ({
        ...r,
        expanded: false,
        loaded: false,
        loading: false,
        children: undefined,
      })),
    );
  }, []);

  const toggleNode = useCallback(
    (nodePath: string) => {
      setRoots((prev) => {
        const findAndToggle = (nodes: TreeNode[]): TreeNode[] =>
          nodes.map((node) => {
            if (node.path === nodePath) {
              if (!node.isDir) return node;
              const newExpanded = !node.expanded;

              if (newExpanded && !node.loaded) {
                loadDirEntries(node.path).then((children) => {
                  setRoots((p) =>
                    updateTreeNode(p, nodePath, {
                      children,
                      loaded: true,
                      loading: false,
                    }),
                  );
                });
                return { ...node, expanded: true, loading: true };
              }

              return { ...node, expanded: newExpanded };
            }
            if (node.children) {
              return { ...node, children: findAndToggle(node.children) };
            }
            return node;
          });

        return findAndToggle(prev);
      });
    },
    [],
  );

  return (
    <aside className="w-[260px] flex flex-col h-full bg-card border-l border-border shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between h-10 px-3 border-b border-border">
        <span className="text-sm font-medium">文件浏览器</span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={handleAddDir}
            className="flex items-center gap-1 px-1.5 py-1 rounded hover:bg-accent text-muted-foreground text-xs"
            title="添加目录"
          >
            <Plus size={14} />
            添加
          </button>
          <button
            onClick={refreshAll}
            className="p-1 rounded hover:bg-accent text-muted-foreground"
            title="刷新"
          >
            <RefreshCw size={14} />
          </button>
          <button
            onClick={() => setOpen(false)}
            className="p-1 rounded hover:bg-accent text-muted-foreground"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Multi-root file tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {roots.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-muted-foreground gap-2 py-8">
            <FolderOpen size={24} className="opacity-40" />
            <p className="text-xs">点击"添加"添加工作区目录</p>
          </div>
        ) : (
          roots.map((root) => (
            <div key={root.path}>
              <RootBar
                name={root.name}
                path={root.path}
                expanded={root.expanded}
                loading={root.loading}
                onToggle={toggleNode}
                onRemove={handleRemoveDir}
              />
              {root.expanded &&
                root.children?.map((child) => (
                  <TreeNodeItem key={child.path} node={child} depth={0} onToggle={toggleNode} />
                ))}
            </div>
          ))
        )}
      </div>
    </aside>
  );
}

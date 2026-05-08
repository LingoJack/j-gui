import { useState, useEffect, useCallback } from "react";
import { useAtom } from "jotai";
import { rightPanelOpenAtom } from "@/atoms/sidebar";
import {
  FolderOpen,
  File,
  Folder,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  Loader2,
  X,
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

// --- Breadcrumb ---

interface BreadcrumbSegment {
  label: string;
  path: string;
}

function buildBreadcrumbs(currentPath: string): BreadcrumbSegment[] {
  if (currentPath === ".") return [{ label: "~", path: "." }];
  const parts = currentPath.split("/").filter(Boolean);
  const segments = parts.map((part, i) => ({
    label: part,
    path: parts.slice(0, i + 1).join("/"),
  }));
  return [{ label: "~", path: "." }, ...segments];
}

// --- Component ---

export default function RightSidePanel() {
  const [, setOpen] = useAtom(rightPanelOpenAtom);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [currentPath, setCurrentPath] = useState(".");
  const [loading, setLoading] = useState(true);

  const loadRoot = useCallback(async (dirPath: string) => {
    setLoading(true);
    try {
      const nodes = await loadDirEntries(dirPath);
      setTree(nodes);
    } catch {
      setTree([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRoot(currentPath);
  }, [currentPath, loadRoot]);

  const toggleNode = useCallback((nodePath: string) => {
    setTree((prev) => {
      const findAndToggle = (nodes: TreeNode[]): TreeNode[] =>
        nodes.map((node) => {
          if (node.path === nodePath) {
            if (!node.isDir) return node;
            const newExpanded = !node.expanded;

            if (newExpanded && !node.loaded) {
              // Fire async load, update via setTree when complete
              loadDirEntries(node.path).then((children) => {
                setTree((p) =>
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
  }, []);

  const navigateTo = useCallback((path: string) => {
    setCurrentPath(path);
  }, []);

  const breadcrumbs = buildBreadcrumbs(currentPath);

  const renderNode = (node: TreeNode, depth: number): React.ReactNode => {
    return (
      <div key={node.path}>
        <div
          className={cn(
            "flex items-center gap-1.5 px-3 py-1 text-xs hover:bg-accent cursor-pointer select-none",
            node.isDir && "font-medium",
          )}
          style={{ paddingLeft: `${12 + depth * 16}px` }}
          onClick={() => toggleNode(node.path)}
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
          node.children?.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <aside className="w-[260px] flex flex-col h-full bg-card border-l border-border shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between h-10 px-3 border-b border-border">
        <span className="text-sm font-medium">文件浏览器</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => loadRoot(currentPath)}
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

      {/* Breadcrumb */}
      <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-border overflow-x-auto whitespace-nowrap">
        {breadcrumbs.map((seg, i) => (
          <div key={seg.path} className="flex items-center gap-0.5 shrink-0">
            {i > 0 && <ChevronRight size={10} className="shrink-0 text-muted-foreground/50" />}
            <button
              onClick={() => navigateTo(seg.path)}
              className={cn(
                "text-xs hover:text-foreground hover:underline truncate max-w-[100px]",
                i === breadcrumbs.length - 1
                  ? "text-foreground font-medium"
                  : "text-muted-foreground",
              )}
            >
              {seg.label}
            </button>
          </div>
        ))}
      </div>

      {/* File tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={20} className="animate-spin text-muted-foreground" />
          </div>
        ) : tree.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-muted-foreground gap-2 py-8">
            <FolderOpen size={24} className="opacity-40" />
            <p className="text-xs">空目录</p>
          </div>
        ) : (
          tree.map((node) => renderNode(node, 0))
        )}
      </div>
    </aside>
  );
}

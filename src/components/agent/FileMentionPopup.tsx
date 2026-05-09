import { memo } from "react";
import { File, Folder, FileCode, FileText, FileImage, FileJson, FileArchive } from "lucide-react";
import { cn } from "@/lib/utils";

// --- Types ---

export interface FileSuggestion {
  name: string;
  path: string;
  isDir: boolean;
}

interface Props {
  open: boolean;
  suggestions: FileSuggestion[];
  selectedIndex: number;
  onSelect: (file: FileSuggestion) => void;
}

// --- File type icon ---

const CODE_EXTS = new Set(["ts", "tsx", "js", "jsx", "mjs", "cjs", "rs", "go", "py", "java", "c", "cpp", "h", "hpp", "cs", "rb", "php", "swift", "kt", "scala"]);
const TEXT_EXTS = new Set(["md", "txt", "log"]);
const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "bmp"]);
const JSON_EXTS = new Set(["json", "jsonc"]);
const ARCHIVE_EXTS = new Set(["zip", "tar", "gz", "rar", "7z", "bz2", "xz"]);

function getFileTypeIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "css" || ext === "scss" || ext === "less" || ext === "html" || ext === "xml" || CODE_EXTS.has(ext)) return FileCode;
  if (TEXT_EXTS.has(ext)) return FileText;
  if (IMAGE_EXTS.has(ext)) return FileImage;
  if (JSON_EXTS.has(ext)) return FileJson;
  if (ARCHIVE_EXTS.has(ext)) return FileArchive;
  return File;
}

function getFileTypeColor(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const cExts = new Set(["ts", "tsx", "js", "jsx", "rs", "go", "py", "java"]);
  if (cExts.has(ext)) return "text-blue-500";
  if (ext === "md") return "text-purple-500";
  if (IMAGE_EXTS.has(ext)) return "text-pink-500";
  if (ext === "json" || ext === "jsonc") return "text-amber-500";
  if (ext === "css" || ext === "scss" || ext === "less") return "text-sky-500";
  return "text-muted-foreground";
}

// --- Suggestion item ---

interface SuggestionItemProps {
  suggestion: FileSuggestion;
  selected: boolean;
  onSelect: () => void;
}

const SuggestionItem = memo(function SuggestionItem({ suggestion, selected, onSelect }: SuggestionItemProps) {
  const Icon = suggestion.isDir ? Folder : getFileTypeIcon(suggestion.name);
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer select-none",
        selected ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
      )}
      onClick={onSelect}
      onMouseEnter={onSelect}
    >
      <Icon size={14} className={cn("shrink-0", suggestion.isDir ? "text-blue-500" : getFileTypeColor(suggestion.name))} />
      <span className="truncate font-medium">{suggestion.name}</span>
      <span className="truncate text-[10px] text-muted-foreground ml-auto max-w-[160px] text-right">
        {suggestion.path}
      </span>
    </div>
  );
});

// --- Main component ---

export default function FileMentionPopup({ open, suggestions, selectedIndex, onSelect }: Props) {
  if (!open) return null;

  if (suggestions.length === 0) {
    return (
      <div className="absolute bottom-full left-0 right-0 mb-1 z-50 bg-popover border border-border rounded-md shadow-lg">
        <div className="py-4 text-center text-xs text-muted-foreground">未找到文件</div>
      </div>
    );
  }

  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 z-50 bg-popover border border-border rounded-md shadow-lg max-h-[240px] overflow-y-auto">
      {suggestions.map((s, i) => (
        <SuggestionItem
          key={s.path}
          suggestion={s}
          selected={i === selectedIndex}
          onSelect={() => onSelect(s)}
        />
      ))}
    </div>
  );
}

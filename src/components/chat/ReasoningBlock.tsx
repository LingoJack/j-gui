import { useState } from "react";
import { ChevronDown, ChevronRight, Brain } from "lucide-react";

interface Props {
  content: string;
}

export default function ReasoningBlock({ content }: Props) {
  const [expanded, setExpanded] = useState(true);
  return (
    <div className="border border-border/50 rounded-md overflow-hidden text-sm my-1">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 w-full px-3 py-1.5 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Brain size={14} className="text-primary" />
        <span className="text-xs font-medium">思考过程</span>
      </button>
      {expanded && (
        <div className="px-3 py-2 text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
          {content}
        </div>
      )}
    </div>
  );
}

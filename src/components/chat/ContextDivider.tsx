export default function ContextDivider() {
  return (
    <div
      className="flex items-center gap-3 px-4 py-2"
      role="separator"
      aria-label="上下文已清空"
    >
      <div className="flex-1 h-px bg-border" />
      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
        上下文已清空
      </span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

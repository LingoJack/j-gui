import { useEffect, useState } from "react";

interface Props {
  containerRef: React.RefObject<HTMLDivElement | null>;
  messageCount: number;
}

export default function ScrollMinimap({ containerRef, messageCount }: Props) {
  const [scrollTop, setScrollTop] = useState(0);
  const [clientHeight, setClientHeight] = useState(0);
  const [scrollHeight, setScrollHeight] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || messageCount === 0) return;

    const update = () => {
      setScrollTop(el.scrollTop);
      setClientHeight(el.clientHeight);
      setScrollHeight(el.scrollHeight);
    };

    update();
    el.addEventListener("scroll", update);
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [containerRef, messageCount]);

  const handleClick = (e: React.MouseEvent) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const ratio = Math.max(0, Math.min(1, y / rect.height));
    el.scrollTop = ratio * (el.scrollHeight - el.clientHeight);
  };

  if (messageCount === 0 || scrollHeight === 0) {
    return null;
  }

  const viewportTop = (scrollTop / scrollHeight) * 100;
  const viewportHeight = (clientHeight / scrollHeight) * 100;

  return (
    <div
      onClick={handleClick}
      className="absolute right-1 top-2 bottom-2 w-[6px] z-20 cursor-pointer rounded-full hover:bg-accent/50 transition-colors"
      role="scrollbar"
      aria-label="消息滚动缩略图"
    >
      {/* Track background */}
      <div className="absolute inset-0 bg-muted/40 rounded-full" />

      {/* Message position marks */}
      {Array.from({ length: messageCount }).map((_, i) => (
        <div
          key={i}
          className="absolute left-1/2 -translate-x-1/2 w-[3px] h-[3px] rounded-full bg-muted-foreground/40"
          style={{ top: `${((i + 0.5) / messageCount) * 100}%` }}
        />
      ))}

      {/* Viewport indicator */}
      <div
        className="absolute w-full rounded-full bg-muted-foreground/40"
        style={{
          top: `${viewportTop}%`,
          height: `${Math.max(viewportHeight, 3)}%`,
        }}
      />
    </div>
  );
}

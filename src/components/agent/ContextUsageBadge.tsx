interface Props {
  totalTokens?: number | null;
}

/**
 * Small circular ring + token count badge shown next to the Agent header.
 * Displays "—" when no token data is available — does NOT fake a percentage.
 */
export default function ContextUsageBadge({ totalTokens }: Props) {
  if (totalTokens == null) {
    return (
      <span
        className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0"
        title="Token 使用量未知"
      >
        —
      </span>
    );
  }

  // Rough approximation: assume context ~= 200K tokens for the ring arc
  const CAPACITY = 200_000;
  const pct = Math.min(totalTokens / CAPACITY, 1);
  const circumference = 2 * Math.PI * 8;
  const arc = circumference * (1 - pct);

  const displayTokens =
    totalTokens >= 1000
      ? `${(totalTokens / 1000).toFixed(totalTokens >= 10000 ? 0 : 1)}k`
      : String(totalTokens);

  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] text-muted-foreground shrink-0"
      title={`约 ${totalTokens.toLocaleString()} tokens`}
    >
      <svg width="20" height="20" viewBox="0 0 22 22" className="-rotate-90 shrink-0">
        <circle
          cx="11"
          cy="11"
          r="8"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          opacity="0.2"
        />
        <circle
          cx="11"
          cy="11"
          r="8"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray={circumference}
          strokeDashoffset={arc}
          strokeLinecap="round"
          className="transition-all duration-500 ease-out"
        />
      </svg>
      <span className="font-mono">{displayTokens}</span>
    </span>
  );
}

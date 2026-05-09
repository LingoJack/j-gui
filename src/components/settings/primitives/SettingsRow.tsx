import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SettingsRowProps {
  label?: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

export default function SettingsRow({ label, description, children, className }: SettingsRowProps) {
  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      {(label || description) && (
        <div className="shrink-0">
          {label && <span className="text-sm">{label}</span>}
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
      )}
      <div className="flex-1 flex justify-end">{children}</div>
    </div>
  );
}

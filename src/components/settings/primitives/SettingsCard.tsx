import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SettingsCardProps {
  children: ReactNode;
  className?: string;
}

export default function SettingsCard({ children, className }: SettingsCardProps) {
  return (
    <div className={cn("border border-border rounded-lg p-4 space-y-3", className)}>
      {children}
    </div>
  );
}

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SettingsSectionProps {
  title?: string;
  children: ReactNode;
  className?: string;
}

export default function SettingsSection({ title, children, className }: SettingsSectionProps) {
  return (
    <div className={cn("space-y-2", className)}>
      {title && <h3 className="text-sm font-medium">{title}</h3>}
      {children}
    </div>
  );
}

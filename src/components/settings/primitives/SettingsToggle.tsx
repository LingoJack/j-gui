import { cn } from "@/lib/utils";

interface SettingsToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export default function SettingsToggle({ checked, onChange }: SettingsToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "w-9 h-5 rounded-full transition-colors relative shrink-0",
        checked ? "bg-primary" : "bg-muted"
      )}
    >
      <div
        className={cn(
          "w-4 h-4 rounded-full bg-white shadow-sm absolute top-0.5 transition-transform",
          checked ? "translate-x-[16px]" : "translate-x-0.5"
        )}
      />
    </button>
  );
}

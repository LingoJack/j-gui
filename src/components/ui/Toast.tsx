import { useEffect, useCallback } from "react";
import { useAtom } from "jotai";
import { toastsAtom, registerToast, type Toast as ToastType } from "@/atoms/toast";
import { X, AlertCircle, CheckCircle, Info } from "lucide-react";
import { cn } from "@/lib/utils";

const iconMap = {
  error: AlertCircle,
  success: CheckCircle,
  info: Info,
};

const colorMap = {
  error: "border-destructive/50 bg-destructive/10 text-destructive",
  success: "border-emerald-500/50 bg-emerald-500/10 text-emerald-600",
  info: "border-primary/50 bg-primary/10 text-primary",
};

function ToastItem({ toast, onRemove }: { toast: ToastType; onRemove: (id: string) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onRemove(toast.id), 4000);
    return () => clearTimeout(timer);
  }, [toast.id, onRemove]);

  const Icon = iconMap[toast.type];

  return (
    <div
      className={cn(
        "flex items-start gap-2 px-3 py-2 rounded-lg border shadow-lg text-sm animate-in slide-in-from-right",
        colorMap[toast.type],
      )}
    >
      <Icon size={16} className="shrink-0 mt-0.5" />
      <span className="flex-1">{toast.message}</span>
      <button onClick={() => onRemove(toast.id)} className="shrink-0 opacity-60 hover:opacity-100">
        <X size={14} />
      </button>
    </div>
  );
}

export default function ToastContainer() {
  const [toasts, setToasts] = useAtom(toastsAtom);

  const add = useCallback(
    (message: string, type: ToastType["type"]) => {
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev, { id, message, type }]);
    },
    [setToasts],
  );

  const remove = useCallback(
    (id: string) => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    },
    [setToasts],
  );

  useEffect(() => {
    registerToast(add);
  }, [add]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onRemove={remove} />
      ))}
    </div>
  );
}

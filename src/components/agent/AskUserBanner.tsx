import { useState, useCallback } from "react";
import { HelpCircle, Send } from "lucide-react";

interface Props {
  question: string;
  options: string[];
  onSubmit: (answers: { selectedOptions: string[]; customText?: string }) => void;
  disabled: boolean;
}

export default function AskUserBanner({
  question,
  options,
  onSubmit,
  disabled,
}: Props) {
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [customText, setCustomText] = useState("");

  const toggleOption = useCallback((opt: string) => {
    setSelectedOptions((prev) =>
      prev.includes(opt) ? prev.filter((o) => o !== opt) : [...prev, opt],
    );
  }, []);

  const handleSubmit = useCallback(() => {
    const answers: { selectedOptions: string[]; customText?: string } = {
      selectedOptions,
    };
    if (customText.trim()) {
      answers.customText = customText.trim();
    }
    onSubmit(answers);
  }, [selectedOptions, customText, onSubmit]);

  return (
    <div className="border border-indigo-500/30 bg-indigo-500/5 rounded-lg p-3 space-y-3 mx-4">
      <div className="flex items-center gap-2">
        <HelpCircle size={14} className="text-indigo-500 shrink-0" />
        <span className="text-sm font-medium">AI 需要确认</span>
      </div>
      <p className="text-xs text-muted-foreground">{question}</p>
      {options.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              disabled={disabled}
              onClick={() => toggleOption(opt)}
              className={`px-2.5 py-1 text-xs rounded-md border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                selectedOptions.includes(opt)
                  ? "border-indigo-500 bg-indigo-500/10 text-indigo-600"
                  : "border-border text-muted-foreground hover:bg-accent"
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          type="text"
          value={customText}
          onChange={(e) => setCustomText(e.target.value)}
          placeholder="补充说明（可选）..."
          disabled={disabled}
          className="flex-1 text-xs px-2 py-1 rounded border border-border bg-background outline-none focus:border-indigo-500/50 disabled:opacity-50"
        />
        <button
          onClick={handleSubmit}
          disabled={disabled || selectedOptions.length === 0}
          className="flex items-center gap-1 px-3 py-1 text-xs rounded-md bg-indigo-500/10 text-indigo-600 hover:bg-indigo-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Send size={12} /> 提交
        </button>
      </div>
    </div>
  );
}

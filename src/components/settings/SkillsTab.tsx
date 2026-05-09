import { useEffect, useState } from "react";
import { listSkills, type SkillInfo } from "@/lib/tauri";
import SettingsSection from "./primitives/SettingsSection";
import SettingsCard from "./primitives/SettingsCard";
import { BookOpen, Loader2 } from "lucide-react";

export default function SkillsTab() {
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listSkills()
      .then(setSkills)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading)
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="animate-spin" size={20} />
      </div>
    );

  return (
    <SettingsSection title="已加载的 Skills">
      {skills.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">
          暂无 Skills。将 SKILL.md 放入 ~/.jdata/agent/skills/ 或项目 .jcli/skills/ 目录。
        </p>
      ) : (
        <div className="space-y-2">
          {skills.map((s) => (
            <SettingsCard key={s.name}>
              <div className="flex items-start gap-3">
                <BookOpen size={16} className="text-primary mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{s.name}</span>
                    <span className="text-[10px] text-muted-foreground bg-muted px-1 py-0.5 rounded">
                      {s.source}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.description}</p>
                </div>
              </div>
            </SettingsCard>
          ))}
        </div>
      )}
    </SettingsSection>
  );
}

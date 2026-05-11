/**
 * SkillListPanel - 在主从布局左侧展示分组后的 Skill 列表
 *
 * 从 AgentSettings.tsx 中拆出，以缩小组件体积。
 */

import * as React from 'react'
import { ChevronDown, ChevronRight, Sparkles, FolderOpen, Trash2 } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { groupSkillsByPrefix, shortName, getSkillSourceBadge } from './skill-helpers'
import type { SkillMeta } from '@jgui/shared'
import * as ipc from '@/lib/ipc'

// ===== 属性 =====

export interface SkillListPanelProps {
  skills: SkillMeta[]
  selectedSlug: string | null
  onSelect: (slug: string) => void
  onDelete: (slug: string, name: string) => void
  onToggle: (slug: string, enabled: boolean) => void
  skillsDir: string
}

// ===== 组件 =====

export function SkillListPanel({ skills, selectedSlug, onSelect, onDelete, onToggle, skillsDir }: SkillListPanelProps): React.ReactElement {
  const groups = React.useMemo(() => groupSkillsByPrefix(skills), [skills])
  const [expandedGroups, setExpandedGroups] = React.useState<Set<string>>(() =>
    new Set(groups.filter((g) => g.prefix).map((g) => g.prefix)),
  )

  const toggleGroup = (prefix: string): void => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(prefix)) next.delete(prefix)
      else next.add(prefix)
      return next
    })
  }

  const openSkillFolder = (slug: string): void => {
    if (skillsDir) ipc.openFile(`${skillsDir}/${slug}`)
  }

  return (
    <div className="w-56 flex-shrink-0 border-r border-border overflow-y-auto bg-muted/20">
      {groups.map((group) =>
        group.prefix ? (
          <div key={group.prefix}>
            <button
              onClick={() => toggleGroup(group.prefix)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/40 transition-colors"
            >
              {expandedGroups.has(group.prefix)
                ? <ChevronDown size={12} className="text-muted-foreground flex-shrink-0" />
                : <ChevronRight size={12} className="text-muted-foreground flex-shrink-0" />}
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider truncate flex-1">{group.prefix}</span>
              <span className="text-[10px] tabular-nums text-muted-foreground flex-shrink-0">{group.skills.length}</span>
            </button>
            {expandedGroups.has(group.prefix) && group.skills.map((skill) => (
              <SkillCompactItem
                key={skill.slug}
                skill={skill}
                displayName={shortName(skill.slug, group.prefix)}
                selected={selectedSlug === skill.slug}
                onSelect={() => onSelect(skill.slug)}
                onDelete={() => onDelete(skill.slug, skill.name)}
                onToggle={(enabled) => onToggle(skill.slug, enabled)}
                onOpenFolder={() => openSkillFolder(skill.slug)}
              />
            ))}
          </div>
        ) : (
          group.skills.map((skill) => (
            <SkillCompactItem
              key={skill.slug}
              skill={skill}
              displayName={skill.name}
              selected={selectedSlug === skill.slug}
              onSelect={() => onSelect(skill.slug)}
              onDelete={() => onDelete(skill.slug, skill.name)}
              onToggle={(enabled) => onToggle(skill.slug, enabled)}
              onOpenFolder={() => openSkillFolder(skill.slug)}
            />
          ))
        ),
      )}
    </div>
  )
}

// ===== Skill 紧凑列表项 =====

interface SkillCompactItemProps {
  skill: SkillMeta
  displayName: string
  selected: boolean
  onSelect: () => void
  onDelete: () => void
  onToggle: (enabled: boolean) => void
  onOpenFolder: () => void
}

function SkillCompactItem({ skill, displayName, selected, onSelect, onDelete, onToggle, onOpenFolder }: SkillCompactItemProps): React.ReactElement {
  const sourceBadge = getSkillSourceBadge('workspace')
  return (
    <div
      className={cn(
        'group w-full flex items-center gap-2 px-3 py-2 text-left transition-colors',
        selected ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/40',
        !skill.enabled && 'opacity-50',
      )}
    >
      <Button
        type="button"
        variant="ghost"
        onClick={onSelect}
        className="h-auto flex-1 justify-start gap-2 p-0 hover:bg-transparent"
      >
      <Sparkles size={14} className="text-amber-500 flex-shrink-0" />
      <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium flex-shrink-0 ${sourceBadge.className}`}>
        {sourceBadge.label}
      </span>
      <span className="text-sm truncate flex-1 min-w-0">{displayName}</span>
      </Button>
      <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={onOpenFolder}
          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        >
          <FolderOpen size={12} />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
        >
          <Trash2 size={12} />
        </button>
      </div>
      <Switch
        checked={skill.enabled}
        onCheckedChange={onToggle}
        className="flex-shrink-0 scale-75"
      />
    </div>
  )
}

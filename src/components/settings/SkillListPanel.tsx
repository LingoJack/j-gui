/**
 * SkillListPanel - Master-detail left panel showing grouped skill items
 *
 * Extracted from AgentSettings.tsx to reduce component size.
 */

import * as React from 'react'
import { ChevronDown, ChevronRight, Sparkles, FolderOpen, RefreshCw, Trash2 } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { groupSkillsByPrefix, shortName, getSkillSourceBadge } from './skill-helpers'
import type { SkillMeta } from '@proma/shared'
import * as ipc from '@/lib/ipc'

// ===== Props =====

export interface SkillListPanelProps {
  skills: SkillMeta[]
  selectedSlug: string | null
  onSelect: (slug: string) => void
  onDelete: (slug: string, name: string) => void
  onToggle: (slug: string, enabled: boolean) => void
  onUpdate: (slug: string) => void
  skillsDir: string
}

// ===== Component =====

export function SkillListPanel({ skills, selectedSlug, onSelect, onDelete, onToggle, onUpdate, skillsDir }: SkillListPanelProps): React.ReactElement {
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
                onUpdate={skill.hasUpdate ? () => onUpdate(skill.slug) : undefined}
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
              onUpdate={skill.hasUpdate ? () => onUpdate(skill.slug) : undefined}
            />
          ))
        ),
      )}
    </div>
  )
}

// ===== Skill Compact Item =====

interface SkillCompactItemProps {
  skill: SkillMeta
  displayName: string
  selected: boolean
  onSelect: () => void
  onDelete: () => void
  onToggle: (enabled: boolean) => void
  onOpenFolder: () => void
  onUpdate?: () => void
}

function SkillCompactItem({ skill, displayName, selected, onSelect, onDelete, onToggle, onOpenFolder, onUpdate }: SkillCompactItemProps): React.ReactElement {
  const sourceBadge = getSkillSourceBadge('workspace')
  return (
    <button
      onClick={onSelect}
      className={cn(
        'group w-full flex items-center gap-2 px-3 py-2 text-left transition-colors',
        selected ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/40',
        !skill.enabled && 'opacity-50',
      )}
    >
      <Sparkles size={14} className="text-amber-500 flex-shrink-0" />
      <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium flex-shrink-0 ${sourceBadge.className}`}>
        {sourceBadge.label}
      </span>
      <span className="text-sm truncate flex-1 min-w-0">{displayName}</span>
      <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        {onUpdate && (
          <span
            role="button"
            onClick={(e) => { e.stopPropagation(); onUpdate() }}
            className="p-1 rounded text-blue-500 hover:bg-blue-500/10 cursor-pointer"
          >
            <RefreshCw size={12} />
          </span>
        )}
        <span
          role="button"
          onClick={(e) => { e.stopPropagation(); onOpenFolder() }}
          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 cursor-pointer"
        >
          <FolderOpen size={12} />
        </span>
        <span
          role="button"
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer"
        >
          <Trash2 size={12} />
        </span>
      </div>
      <Switch
        checked={skill.enabled}
        onCheckedChange={(checked) => { onToggle(checked) }}
        onClick={(e) => e.stopPropagation()}
        className="flex-shrink-0 scale-75"
      />
    </button>
  )
}

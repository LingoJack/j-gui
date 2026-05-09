/**
 * AliasSettings - 别名管理设置页
 *
 * 以 section 分组展示别名（path / inner_url / outer_url / script）。
 * 支持添加（inline 表单）和删除（确认后删除）。
 */

import * as React from 'react'
import { Plus, Trash2, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SettingsSection, SettingsCard } from './primitives'
import * as ipc from '@/lib/ipc'

// ============================================================
// Types
// ============================================================

interface AliasEntry {
  section: string
  name: string
  value: string
}

const ALIAS_SECTIONS = ['path', 'inner_url', 'outer_url', 'script'] as const

const SECTION_LABELS: Record<string, string> = {
  path: '路径别名',
  inner_url: '内网 URL 别名',
  outer_url: '外网 URL 别名',
  script: '脚本别名',
}

// ============================================================
// AliasRow
// ============================================================

interface AliasRowProps {
  name: string
  value: string
  onDelete: () => void
}

function AliasRow({ name, value, onDelete }: AliasRowProps): React.ReactElement {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <div className="flex-1 min-w-0 grid grid-cols-[1fr_2fr] gap-2 items-center">
        <code className="text-sm font-medium text-foreground truncate">{name}</code>
        <code className="text-sm text-muted-foreground truncate font-mono">{value}</code>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
        onClick={onDelete}
        title="删除"
      >
        <Trash2 size={14} />
      </Button>
    </div>
  )
}

// ============================================================
// AddAliasForm
// ============================================================

interface AddAliasFormProps {
  name: string
  value: string
  onNameChange: (name: string) => void
  onValueChange: (value: string) => void
  onSave: () => void
  onCancel: () => void
}

function AddAliasForm({
  name,
  value,
  onNameChange,
  onValueChange,
  onSave,
  onCancel,
}: AddAliasFormProps): React.ReactElement {
  return (
    <div className="flex items-center gap-2 px-4 py-2.5">
      <Input
        placeholder="别名名称"
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        className="h-8 text-sm font-mono flex-1"
        maxLength={100}
      />
      <Input
        placeholder="别名值"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        className="h-8 text-sm font-mono flex-[2]"
        maxLength={500}
      />
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 text-emerald-500 hover:text-emerald-600"
        onClick={onSave}
        title="保存"
      >
        <Check size={14} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
        onClick={onCancel}
        title="取消"
      >
        <X size={14} />
      </Button>
    </div>
  )
}

// ============================================================
// AliasSection
// ============================================================

interface AliasSectionProps {
  section: string
  aliases: AliasEntry[]
  adding: boolean
  newName: string
  newValue: string
  onAdd: () => void
  onDelete: (name: string) => void
  onStartAdd: () => void
  onCancelAdd: () => void
  onNameChange: (value: string) => void
  onValueChange: (value: string) => void
}

function AliasSectionComponent({
  section,
  aliases,
  adding,
  newName,
  newValue,
  onAdd,
  onDelete,
  onStartAdd,
  onCancelAdd,
  onNameChange,
  onValueChange,
}: AliasSectionProps): React.ReactElement {
  return (
    <SettingsSection
      title={SECTION_LABELS[section] || section}
      description={section}
    >
      <SettingsCard divided={false}>
        <div className="divide-y divide-border/50">
          {aliases.map((alias) => (
            <AliasRow
              key={`${alias.section}:${alias.name}`}
              name={alias.name}
              value={alias.value}
              onDelete={() => onDelete(alias.name)}
            />
          ))}
          {adding ? (
            <AddAliasForm
              name={newName}
              value={newValue}
              onNameChange={onNameChange}
              onValueChange={onValueChange}
              onSave={onAdd}
              onCancel={onCancelAdd}
            />
          ) : (
            <button
              onClick={onStartAdd}
              className="flex items-center gap-1.5 px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors w-full text-left"
            >
              <Plus size={14} />
              添加别名
            </button>
          )}
        </div>
      </SettingsCard>
    </SettingsSection>
  )
}

// ============================================================
// AliasSettings (main)
// ============================================================

export function AliasSettings(): React.ReactElement {
  const [aliases, setAliases] = React.useState<AliasEntry[]>([])
  const [loading, setLoading] = React.useState(true)
  const [addingSection, setAddingSection] = React.useState<string | null>(null)
  const [newName, setNewName] = React.useState('')
  const [newValue, setNewValue] = React.useState('')

  const loadAliases = React.useCallback(async () => {
    try {
      const result = await ipc.listAliases()
      setAliases(result)
    } catch (err) {
      console.error('[别名设置] 加载失败:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    loadAliases()
  }, [loadAliases])

  const groupedAliases = React.useMemo(() => {
    const groups: Record<string, AliasEntry[]> = {}
    for (const section of ALIAS_SECTIONS) {
      groups[section] = aliases.filter((a) => a.section === section)
    }
    return groups
  }, [aliases])

  const handleAdd = async (section: string): Promise<void> => {
    if (!newName.trim() || !newValue.trim()) return
    try {
      await ipc.setAlias(section, newName.trim(), newValue.trim())
      setNewName('')
      setNewValue('')
      setAddingSection(null)
      await loadAliases()
    } catch (err) {
      console.error('[别名设置] 添加失败:', err)
    }
  }

  const handleDelete = async (section: string, name: string): Promise<void> => {
    if (!window.confirm(`确定要删除别名「${name}」吗？`)) return
    try {
      await ipc.removeAlias(section, name)
      await loadAliases()
    } catch (err) {
      console.error('[别名设置] 删除失败:', err)
    }
  }

  const handleStartAdd = (section: string): void => {
    setNewName('')
    setNewValue('')
    setAddingSection(section)
  }

  const handleCancelAdd = (): void => {
    setAddingSection(null)
    setNewName('')
    setNewValue('')
  }

  if (loading) {
    return <div className="text-sm text-muted-foreground py-8 text-center">加载中...</div>
  }

  return (
    <div className="space-y-6">
      {ALIAS_SECTIONS.map((section) => (
        <AliasSectionComponent
          key={section}
          section={section}
          aliases={groupedAliases[section]}
          adding={addingSection === section}
          newName={newName}
          newValue={newValue}
          onAdd={() => handleAdd(section)}
          onDelete={(name) => handleDelete(section, name)}
          onStartAdd={() => handleStartAdd(section)}
          onCancelAdd={handleCancelAdd}
          onNameChange={setNewName}
          onValueChange={setNewValue}
        />
      ))}
    </div>
  )
}

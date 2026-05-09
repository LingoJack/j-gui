/**
 * YamlConfigSettings - 全局 YAML 配置查看/编辑页
 *
 * 动态展示 backend get_config 返回的所有 section，
 * 支持值编辑、新增键值对和删除键。
 */

import * as React from 'react'
import { ChevronDown, Plus, Trash2, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SettingsSection, SettingsCard } from './primitives'
import * as ipc from '@/lib/ipc'

// ============================================================
// ConfigRow — 单行键值对
// ============================================================

interface ConfigRowProps {
  section: string
  keyName: string
  value: string
  isEditing: boolean
  editValue: string
  onEditValueChange: (val: string) => void
  onStartEdit: () => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onDelete: () => void
}

function ConfigRow({
  section: _section,
  keyName,
  value,
  isEditing,
  editValue,
  onEditValueChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
}: ConfigRowProps): React.ReactElement {
  const inputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isEditing])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onSaveEdit()
    } else if (e.key === 'Escape') {
      onCancelEdit()
    }
  }

  if (isEditing) {
    return (
      <div className="flex items-center gap-3 px-4 py-2.5">
        <code className="text-sm font-medium text-foreground min-w-[100px] truncate">{keyName}</code>
        <div className="flex-1">
          <Input
            ref={inputRef}
            value={editValue}
            onChange={(e) => onEditValueChange(e.target.value)}
            onKeyDown={handleKeyDown}
            className="h-8 text-sm font-mono"
          />
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-emerald-500 hover:text-emerald-600"
          onClick={onSaveEdit}
          title="保存"
        >
          <Check size={14} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={onCancelEdit}
          title="取消"
        >
          <X size={14} />
        </Button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <code className="text-sm font-medium text-foreground min-w-[100px] truncate">{keyName}</code>
      <code
        className="flex-1 text-sm text-muted-foreground truncate font-mono cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5 -mx-1 transition-colors"
        onClick={onStartEdit}
        title="点击编辑"
      >
        {value}
      </code>
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
// AddConfigForm — 行内添加表单
// ============================================================

interface AddConfigFormProps {
  keyName: string
  value: string
  onKeyChange: (val: string) => void
  onValueChange: (val: string) => void
  onSave: () => void
  onCancel: () => void
}

function AddConfigForm({
  keyName,
  value,
  onKeyChange,
  onValueChange,
  onSave,
  onCancel,
}: AddConfigFormProps): React.ReactElement {
  return (
    <div className="flex items-center gap-2 px-4 py-2.5">
      <Input
        placeholder="键名"
        value={keyName}
        onChange={(e) => onKeyChange(e.target.value)}
        className="h-8 text-sm font-mono flex-1"
        maxLength={200}
      />
      <Input
        placeholder="值"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        className="h-8 text-sm font-mono flex-[2]"
        maxLength={2000}
      />
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 text-emerald-500 hover:text-emerald-600"
        onClick={onSave}
        title="保存新增"
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
// SectionEmptyState — 空 section 占位
// ============================================================

function SectionEmptyState(): React.ReactElement {
  return (
    <div className="px-4 py-3 text-sm text-muted-foreground">
      暂无配置项
    </div>
  )
}

// ============================================================
// YamlConfigSection — 单个 section 区块（可折叠）
// ============================================================

interface EditingState {
  section: string
  key: string
  originalValue: string
}

interface YamlConfigSectionProps {
  section: string
  entries: Record<string, string>
  expanded: boolean
  onToggle: () => void
  editing: EditingState | null
  editValue: string
  onEditValueChange: (val: string) => void
  onStartEdit: (key: string, value: string) => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  adding: boolean
  newKey: string
  newValue: string
  onNewKeyChange: (val: string) => void
  onNewValueChange: (val: string) => void
  onAdd: () => void
  onStartAdd: () => void
  onCancelAdd: () => void
  onDelete: (key: string) => void
}

function YamlConfigSection({
  section,
  entries,
  expanded,
  onToggle,
  editing,
  editValue,
  onEditValueChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  adding,
  newKey,
  newValue,
  onNewKeyChange,
  onNewValueChange,
  onAdd,
  onStartAdd,
  onCancelAdd,
  onDelete,
}: YamlConfigSectionProps): React.ReactElement {
  const entryList = Object.entries(entries)

  return (
    <SettingsSection
      title={
        <button
          onClick={onToggle}
          className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-foreground/80 transition-colors"
        >
          <ChevronDown
            size={14}
            className={`transition-transform ${expanded ? '' : '-rotate-90'}`}
          />
          {section}
        </button>
      }
    >
      {expanded && (
        <SettingsCard divided={false}>
          <div className="divide-y divide-border/50">
            {entryList.map(([key, val]) => {
              const isEditing =
                editing !== null &&
                editing.section === section &&
                editing.key === key

              return (
                <ConfigRow
                  key={key}
                  section={section}
                  keyName={key}
                  value={val}
                  isEditing={isEditing}
                  editValue={isEditing ? editValue : val}
                  onEditValueChange={onEditValueChange}
                  onStartEdit={() => onStartEdit(key, val)}
                  onSaveEdit={onSaveEdit}
                  onCancelEdit={onCancelEdit}
                  onDelete={() => onDelete(key)}
                />
              )
            })}
            {entryList.length === 0 && !adding && <SectionEmptyState />}
            {adding ? (
              <AddConfigForm
                keyName={newKey}
                value={newValue}
                onKeyChange={onNewKeyChange}
                onValueChange={onNewValueChange}
                onSave={onAdd}
                onCancel={onCancelAdd}
              />
            ) : (
              <button
                onClick={onStartAdd}
                className="flex items-center gap-1.5 px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors w-full text-left"
              >
                <Plus size={14} />
                添加配置项
              </button>
            )}
          </div>
        </SettingsCard>
      )}
    </SettingsSection>
  )
}

// ============================================================
// YamlConfigSettings (main)
// ============================================================

export function YamlConfigSettings(): React.ReactElement {
  const [config, setConfig] = React.useState<Record<string, Record<string, string>>>({})
  const [loading, setLoading] = React.useState(true)

  // Collapsible state
  const [expandedSections, setExpandedSections] = React.useState<Set<string>>(new Set())

  // Editing state
  const [editing, setEditing] = React.useState<EditingState | null>(null)
  const [editValue, setEditValue] = React.useState('')

  // Adding state
  const [addingSection, setAddingSection] = React.useState<string | null>(null)
  const [newKey, setNewKey] = React.useState('')
  const [newValue, setNewValue] = React.useState('')

  const loadConfig = React.useCallback(async () => {
    try {
      const result = await ipc.getConfig()
      const sections = result.sections
      setConfig(sections)
      // Auto-expand all sections on load
      setExpandedSections(new Set(Object.keys(sections)))
    } catch (err) {
      console.error('[YAML配置] 加载失败:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    loadConfig()
  }, [loadConfig])

  // --- Editing handlers ---

  const handleStartEdit = (section: string, key: string, value: string): void => {
    setEditing({ section, key, originalValue: value })
    setEditValue(value)
  }

  const handleSaveEdit = async (): Promise<void> => {
    if (!editing) return
    try {
      await ipc.setConfig(editing.section, editing.key, editValue)
      setEditing(null)
      setEditValue('')
      await loadConfig()
    } catch (err) {
      console.error('[YAML配置] 保存失败:', err)
    }
  }

  const handleCancelEdit = (): void => {
    setEditing(null)
    setEditValue('')
  }

  // --- Adding handlers ---

  const handleAdd = async (section: string): Promise<void> => {
    if (!newKey.trim() || !newValue.trim()) return
    try {
      await ipc.setConfig(section, newKey.trim(), newValue.trim())
      setNewKey('')
      setNewValue('')
      setAddingSection(null)
      await loadConfig()
    } catch (err) {
      console.error('[YAML配置] 添加失败:', err)
    }
  }

  const handleStartAdd = (section: string): void => {
    setAddingSection(section)
    setNewKey('')
    setNewValue('')
  }

  const handleCancelAdd = (): void => {
    setAddingSection(null)
    setNewKey('')
    setNewValue('')
  }

  // --- Delete handler ---

  const handleDelete = async (section: string, key: string): Promise<void> => {
    if (!window.confirm(`确定要删除「${section}.${key}」吗？`)) return
    try {
      await ipc.setConfig(section, key, '')
      await loadConfig()
    } catch (err) {
      console.error('[YAML配置] 删除失败:', err)
    }
  }

  // --- Toggle handler ---

  const toggleSection = (section: string): void => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(section)) {
        next.delete(section)
      } else {
        next.add(section)
      }
      return next
    })
  }

  const sectionNames = Object.keys(config)

  if (loading) {
    return (
      <div className="text-sm text-muted-foreground py-8 text-center">
        加载中...
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {sectionNames.map((section) => (
        <YamlConfigSection
          key={section}
          section={section}
          entries={config[section]}
          expanded={expandedSections.has(section)}
          onToggle={() => toggleSection(section)}
          editing={editing}
          editValue={editValue}
          onEditValueChange={setEditValue}
          onStartEdit={(key, val) => handleStartEdit(section, key, val)}
          onSaveEdit={handleSaveEdit}
          onCancelEdit={handleCancelEdit}
          adding={addingSection === section}
          newKey={newKey}
          newValue={newValue}
          onNewKeyChange={setNewKey}
          onNewValueChange={setNewValue}
          onAdd={() => handleAdd(section)}
          onStartAdd={() => handleStartAdd(section)}
          onCancelAdd={handleCancelAdd}
          onDelete={(key) => handleDelete(section, key)}
        />
      ))}
    </div>
  )
}

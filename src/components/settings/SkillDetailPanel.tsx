/**
 * SkillDetailPanel - 在主从布局右侧展示 Skill 详情，并支持就地编辑
 *
 * 从 AgentSettings.tsx 中拆出，以缩小组件体积。
 */

import * as React from 'react'
import { Pencil, Save, X, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button } from '@/components/ui/button'
import { SettingsCard } from './primitives'
import { extractSkillBody, rebuildSkillMd } from './skill-helpers'
import type { SkillMeta } from '@jgui/shared'
import * as ipc from '@/lib/ipc'

// ===== 属性 =====

export interface SkillDetailPanelProps {
  skill: SkillMeta
  workspaceSlug: string
  onSaved: () => void
}

// ===== 组件 =====

export function SkillDetailPanel({ skill, workspaceSlug, onSaved }: SkillDetailPanelProps): React.ReactElement {
  const [content, setContent] = React.useState<string | null>(null)
  const [loadingContent, setLoadingContent] = React.useState(false)
  const currentSlugRef = React.useRef(skill.slug)

  const [isEditingMeta, setIsEditingMeta] = React.useState(false)
  const [isEditingBody, setIsEditingBody] = React.useState(false)
  const [editName, setEditName] = React.useState('')
  const [editDescription, setEditDescription] = React.useState('')
  const [editBody, setEditBody] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    currentSlugRef.current = skill.slug
    setIsEditingMeta(false)
    setIsEditingBody(false)
    setLoadingContent(true)

    ipc.readSkillContent(workspaceSlug, skill.slug)
      .then((text) => {
        if (currentSlugRef.current === skill.slug) setContent(text)
      })
      .catch((err) => {
        console.error('[SkillDetail] 加载内容失败:', err)
        if (currentSlugRef.current === skill.slug) setContent(null)
      })
      .finally(() => {
        if (currentSlugRef.current === skill.slug) setLoadingContent(false)
      })
  }, [skill.slug, workspaceSlug])

  const body = React.useMemo(() => extractSkillBody(content ?? ''), [content])

  const startEditMeta = (): void => {
    setEditName(skill.name)
    setEditDescription(skill.description ?? '')
    setIsEditingMeta(true)
  }

  const saveMeta = async (): Promise<void> => {
    if (!content) return
    setSaving(true)
    try {
      const newContent = rebuildSkillMd(content, { name: editName, description: editDescription })
      await ipc.writeSkillContent(workspaceSlug, skill.slug, newContent)
      setContent(newContent)
      setIsEditingMeta(false)
      onSaved()
      toast.success('元数据已保存')
    } catch (err) {
      console.error('[SkillDetail] 保存元数据失败:', err)
      toast.error('保存失败')
    } finally {
      setSaving(false)
    }
  }

  const startEditBody = (): void => {
    setEditBody(body)
    setIsEditingBody(true)
  }

  const saveBody = async (): Promise<void> => {
    if (!content) return
    setSaving(true)
    try {
      const newContent = rebuildSkillMd(content, { body: editBody })
      await ipc.writeSkillContent(workspaceSlug, skill.slug, newContent)
      setContent(newContent)
      setIsEditingBody(false)
      onSaved()
      toast.success('说明已保存')
    } catch (err) {
      console.error('[SkillDetail] 保存说明失败:', err)
      toast.error('保存失败')
    } finally {
      setSaving(false)
    }
  }

  if (loadingContent) {
    return <div className="flex items-center justify-center h-full text-sm text-muted-foreground">加载中...</div>
  }

  const sourceLabel = skill.importSource
    ? `从 ${skill.importSource.sourceWorkspaceName} 导入`
    : '当前工作区'

  return (
    <div className="p-5 space-y-6">
      {/* 头部 */}
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-amber-500/12 p-2.5 text-amber-500 shrink-0">
          <Sparkles size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-foreground">{skill.name}</h3>
          {skill.description && (
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{skill.description}</p>
          )}
        </div>
      </div>

      {/* 元数据区域 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium text-foreground">元数据</h4>
          {!isEditingMeta ? (
            <button onClick={startEditMeta} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
              <Pencil size={12} /> 编辑
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={() => setIsEditingMeta(false)} disabled={saving}>
                <X size={14} /> 取消
              </Button>
              <Button size="sm" onClick={() => void saveMeta()} disabled={saving}>
                <Save size={14} /> {saving ? '保存中...' : '保存'}
              </Button>
            </div>
          )}
        </div>

        <SettingsCard divided>
          <MetadataRow label="标识符" value={skill.slug} />
          {isEditingMeta ? (
            <>
              <MetadataEditRow label="名称" value={editName} onChange={setEditName} />
              <MetadataEditRow label="描述" value={editDescription} onChange={setEditDescription} multiline />
            </>
          ) : (
            <>
              <MetadataRow label="名称" value={skill.name} />
              <MetadataRow label="描述" value={skill.description ?? '无描述'} />
            </>
          )}
          <MetadataRow label="数据源" value={sourceLabel} />
          <MetadataRow label="位置" value={`skills/${skill.slug}`} />
          {skill.version && <MetadataRow label="版本" value={skill.version} />}
        </SettingsCard>
      </div>

      {/* 正文区域 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium text-foreground">说明</h4>
          {!isEditingBody ? (
            <button onClick={startEditBody} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
              <Pencil size={12} /> 编辑
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={() => setIsEditingBody(false)} disabled={saving}>
                <X size={14} /> 取消
              </Button>
              <Button size="sm" onClick={() => void saveBody()} disabled={saving}>
                <Save size={14} /> {saving ? '保存中...' : '保存'}
              </Button>
            </div>
          )}
        </div>

        <SettingsCard divided={false}>
          <div className="p-4">
            {isEditingBody ? (
              <textarea
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                className="w-full min-h-[300px] bg-transparent text-sm font-mono resize-y border border-border rounded-md p-3 focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="输入 Skill 说明内容（支持 Markdown）..."
              />
            ) : (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <Markdown remarkPlugins={[remarkGfm]}>{body || '暂无说明内容'}</Markdown>
              </div>
            )}
          </div>
        </SettingsCard>
      </div>
    </div>
  )
}

// ===== 元数据辅助组件 =====

function MetadataRow({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="flex items-start gap-4 px-4 py-2.5">
      <span className="text-xs text-muted-foreground w-16 flex-shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-foreground flex-1 min-w-0 break-words">{value}</span>
    </div>
  )
}

function MetadataEditRow({ label, value, onChange, multiline }: { label: string; value: string; onChange: (v: string) => void; multiline?: boolean }): React.ReactElement {
  return (
    <div className="flex items-start gap-4 px-4 py-2.5">
      <span className="text-xs text-muted-foreground w-16 flex-shrink-0 pt-2">{label}</span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 min-w-0 text-sm bg-transparent border border-border rounded-md px-2 py-1 resize-y focus:outline-none focus:ring-1 focus:ring-ring"
          rows={3}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 min-w-0 text-sm bg-transparent border border-border rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
        />
      )}
    </div>
  )
}

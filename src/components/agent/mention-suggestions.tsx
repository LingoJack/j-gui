/**
 * MentionSuggestions — Skill / Chat / MCP 的 TipTap Mention Suggestion 统一配置
 *
 * 泛型工厂 createMentionSuggestion 封装公共逻辑（渲染、定位、键盘导航），
 * 通过 MentionSuggestionConfig 注入差异部分（触发字符、数据获取、行渲染）。
 */

import type React from 'react'
import { ReactRenderer } from '@tiptap/react'
import type { SuggestionOptions } from '@tiptap/suggestion'
import { MessageSquareQuote, Sparkles, Server } from 'lucide-react'
import { MentionList } from './MentionList'
import type { MentionListRef } from './MentionList'
import { createMentionPopup, positionPopup } from './mention-popup-utils'
import * as ipc from '@/lib/ipc'
import type { ConversationMeta } from '@jgui/shared'
import { toChatMentionId } from '@/lib/chat-reference'

// ===== 泛型工厂 =====

interface MentionSuggestionConfig<T> {
  /** 触发字符 */
  char: string
  /** 空列表占位文字 */
  emptyText: string
  /** 异步获取列表项 */
  fetchItems: (slug: string, query: string) => Promise<T[]>
  /** 提取唯一 key */
  keyExtractor: (item: T) => string
  /** 渲染列表项 */
  renderItem: (item: T) => React.ReactNode
  /** 选中后传给 command 的 id 和 label */
  toCommand: (item: T) => { id: string; label: string }
}

function createMentionSuggestion<T>(
  config: MentionSuggestionConfig<T>,
  workspaceSlugRef: React.RefObject<string | null>,
  mentionActiveRef: React.MutableRefObject<boolean>,
  mentionItemCountRef: React.MutableRefObject<number>,
): Omit<SuggestionOptions<T>, 'editor'> {
  return {
    char: config.char,
    allowSpaces: false,

    items: async ({ query }): Promise<T[]> => {
      const slug = workspaceSlugRef.current
      if (!slug) return []
      try {
        return await config.fetchItems(slug, (query ?? '').toLowerCase())
      } catch {
        return []
      }
    },

    render: () => {
      let renderer: ReactRenderer<MentionListRef> | null = null
      let popup: HTMLDivElement | null = null

      return {
        onStart(props) {
          mentionActiveRef.current = true
          mentionItemCountRef.current = props.items.length
          renderer = new ReactRenderer(MentionList, {
            props: {
              items: props.items,
              selectedIndex: 0,
              emptyText: config.emptyText,
              keyExtractor: config.keyExtractor,
              renderItem: config.renderItem,
              onSelect: (item: T) => {
                const cmd = config.toCommand(item)
                props.command({ id: cmd.id, label: cmd.label })
              },
            },
            editor: props.editor,
          })
          popup = createMentionPopup(renderer.element)
          positionPopup(popup, props.clientRect?.())
        },

        onUpdate(props) {
          mentionItemCountRef.current = props.items.length
          renderer?.updateProps({
            items: props.items,
            onSelect: (item: T) => {
              const cmd = config.toCommand(item)
              props.command({ id: cmd.id, label: cmd.label })
            },
          })
          positionPopup(popup, props.clientRect?.())
        },

        onKeyDown(props) {
          return renderer?.ref?.onKeyDown({ event: props.event }) ?? false
        },

        onExit() {
          mentionActiveRef.current = false
          mentionItemCountRef.current = 0
          popup?.remove()
          popup = null
          renderer?.destroy()
          renderer = null
        },
      }
    },
  }
}

// ===== Slash / Skill / Chat 引用配置 =====

interface BaseMentionItem {
  id: string
  name: string
  description?: string
}

export type SkillMentionItem = BaseMentionItem

export interface ChatMentionItem extends BaseMentionItem {
  updatedAt: number
}

function buildChatItems(
  conversations: ConversationMeta[],
  query: string,
): ChatMentionItem[] {
  const normalizedQuery = query.trim().toLowerCase()
  return conversations
    .filter((conversation) => !conversation.archived)
    .filter((conversation) => {
      if (!normalizedQuery) return true
      return conversation.title.toLowerCase().includes(normalizedQuery)
    })
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, 6)
    .map((conversation) => ({
      id: toChatMentionId(conversation.id),
      name: conversation.title,
      description: '引用 Chat',
      updatedAt: conversation.updatedAt,
    }))
}

export function createSlashMentionSuggestion(
  workspaceSlugRef: React.RefObject<string | null>,
  mentionActiveRef: React.MutableRefObject<boolean>,
  mentionItemCountRef: React.MutableRefObject<number>,
) {
  return createMentionSuggestion<SkillMentionItem>(
    {
      char: '/',
      emptyText: '无匹配 Skill',
      fetchItems: async (slug, q) => {
        const caps = await ipc.getResolvedWorkspaceCapabilities(slug)
        return caps.skills
          .filter((skill) => skill.enabled)
          .filter((skill) => !q || skill.name.toLowerCase().includes(q) || (skill.slug ?? '').toLowerCase().includes(q))
          .map((skill) => ({
            id: `skill:${skill.slug}`,
            name: skill.name,
            description: skill.description,
          }))
      },
      keyExtractor: (item) => item.id,
      renderItem: (item) => (
        <>
          <Sparkles className="size-3.5 text-violet-500 flex-shrink-0" />
          <span className="truncate font-medium flex-1 min-w-0">{item.name}</span>
          {item.description && (
            <span className="truncate text-[10px] text-muted-foreground/50 max-w-[120px]">{item.description}</span>
          )}
        </>
      ),
      toCommand: (item) => ({ id: item.id, label: item.name }),
    },
    workspaceSlugRef,
    mentionActiveRef,
    mentionItemCountRef,
  )
}

export function createChatMentionSuggestion(
  workspaceSlugRef: React.RefObject<string | null>,
  mentionActiveRef: React.MutableRefObject<boolean>,
  mentionItemCountRef: React.MutableRefObject<number>,
) {
  return createMentionSuggestion<ChatMentionItem>(
    {
      char: '$',
      emptyText: '无匹配 Chat 对话',
      fetchItems: async (_slug, q) => {
        const conversations = await ipc.listConversations()
        return buildChatItems(conversations, q)
      },
      keyExtractor: (item) => item.id,
      renderItem: (item) => (
        <>
          <MessageSquareQuote className="size-3.5 text-sky-500 flex-shrink-0" />
          <span className="truncate font-medium flex-1 min-w-0">{item.name}</span>
          <span className="truncate text-[10px] text-muted-foreground/50 max-w-[120px]">
            引用 Chat
          </span>
        </>
      ),
      toCommand: (item) => ({
        id: item.id,
        label: `Chat · ${item.name}`,
      }),
    },
    workspaceSlugRef,
    mentionActiveRef,
    mentionItemCountRef,
  )
}

// ===== MCP 配置 =====

export interface McpMentionItem {
  id: string
  name: string
  type: string
}

export function createMcpMentionSuggestion(
  workspaceSlugRef: React.RefObject<string | null>,
  mentionActiveRef: React.MutableRefObject<boolean>,
  mentionItemCountRef: React.MutableRefObject<number>,
) {
  return createMentionSuggestion<McpMentionItem>(
    {
      char: '#',
      emptyText: '无匹配 MCP 服务',
      fetchItems: async (slug, q) => {
        const caps = await ipc.getResolvedWorkspaceCapabilities(slug)
        return caps.mcpServers
          .filter((s) => s.enabled)
          .filter((s) => !q || s.name.toLowerCase().includes(q))
          .map((s) => ({ id: s.name, name: s.name, type: s.type }))
      },
      keyExtractor: (item) => item.id,
      renderItem: (item) => (
        <>
          <Server className="size-3.5 text-emerald-500 flex-shrink-0" />
          <span className="truncate font-medium flex-1 min-w-0">{item.name}</span>
          <span className="truncate text-[10px] text-muted-foreground/50 max-w-[120px]">{item.type}</span>
        </>
      ),
      toCommand: (item) => ({ id: item.id, label: item.name }),
    },
    workspaceSlugRef,
    mentionActiveRef,
    mentionItemCountRef,
  )
}

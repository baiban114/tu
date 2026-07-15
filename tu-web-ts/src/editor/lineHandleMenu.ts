import type { FlatTocEntry } from '@/utils/toc/headings'

export type InsertBlockType =
  | 'richtext'
  | 'ref'
  | 'externalResource'
  | 'pdf-excerpt'
  | 'line'
  | 'x6'
  | 'x6-mindmap'
  | 'knowledge-roadmap'
  | 'table'
  | 'multiTable'
  | 'spacer'

export interface InsertOption {
  key: InsertBlockType
  label: string
  icon: string
  keywords: string[]
}

export interface LineHandleMenuItem {
  key: string
  label?: string
  icon?: string
  danger?: boolean
  divider?: boolean
}

export type LineHandleAction =
  | InsertBlockType
  | 'mark-excerpt'
  | 'set-basis'
  | 'add-note'
  | 'create-knowledge-relation'
  | 'mark-heading-source'
  | 'clear-heading-source'
  | 'edit-section-tags'
  | 'section-ai-marking'
  | 'cut'
  | 'copy'
  | 'duplicate'
  | 'clear-formatting'
  | 'delete'

export const insertOptions: InsertOption[] = [
  { key: 'richtext', label: '文本', icon: '📝', keywords: ['text', 'richtext', 'wenben'] },
  { key: 'ref', label: '引用', icon: '🔖', keywords: ['ref', 'reference', 'yinyong'] },
  { key: 'externalResource', label: '外部资源', icon: '▣', keywords: ['resource', 'external', 'book', 'ziyuan', 'tushu'] },
  { key: 'pdf-excerpt', label: 'PDF 摘页', icon: '📄', keywords: ['pdf', '摘页', 'document', 'file'] },
  { key: 'line', label: '时间轴', icon: '🕒', keywords: ['timeline', 'line', 'shijianzhou'] },
  { key: 'x6', label: 'X6 画板', icon: '🧩', keywords: ['x6', 'graph', 'draw', 'huaban'] },
  { key: 'x6-mindmap', label: '思维导图', icon: '◇', keywords: ['mindmap', '思维导图', '脑图', 'tree'] },
  { key: 'knowledge-roadmap', label: '知识库路线图', icon: '🗺️', keywords: ['roadmap', 'knowledge', 'kb', 'zhishiku'] },
  { key: 'table', label: '表格', icon: '▦', keywords: ['table', 'biaoge'] },
  { key: 'multiTable', label: '多维表格', icon: '▤', keywords: ['multi', 'database', 'kanban', 'duowei'] },
  { key: 'spacer', label: '分割空白', icon: '↕', keywords: ['spacer', 'blank', 'kongbai'] },
]

export function buildEditorLineHandleItems(extraActionItems: LineHandleMenuItem[] = []): LineHandleMenuItem[] {
  return [
    { key: 'insert-divider', label: '插入', divider: true },
    ...insertOptions.map((option) => ({ key: option.key, label: option.label, icon: option.icon })),
    { key: 'action-divider', label: '操作', divider: true },
    ...extraActionItems,
    { key: 'mark-excerpt', label: '标记节选', icon: '▣' },
    { key: 'set-basis', label: '设置依据', icon: '◎' },
    { key: 'cut', label: '剪切行', icon: '✂️' },
    { key: 'copy', label: '复制', icon: '📋' },
    { key: 'duplicate', label: '复制行', icon: '📄' },
    { key: 'clear-formatting', label: '清除格式', icon: '🧹' },
    { key: 'delete', label: '删除行', icon: '🗑️', danger: true },
  ]
}

function knowledgeActionItems(kind: 'line' | 'section'): LineHandleMenuItem[] {
  const items: LineHandleMenuItem[] = [
    { key: 'add-note', label: kind === 'section' ? '添加标注（本节）' : '添加标注', icon: '📝' },
    { key: 'create-knowledge-relation', label: '建立关联', icon: '🔗' },
  ]
  if (kind === 'section') {
    items.push({ key: 'section-ai-marking', label: 'AI 分析标记（本节）', icon: '🤖' })
  }
  return items
}

export function getSectionHandleMenuContext(entry: FlatTocEntry) {
  return {
    canMarkHeadingSource: entry.sourceType === 'local',
    canClearHeadingSource: entry.sourceType === 'local' && Boolean(entry.sourceBinding),
    canEditSectionTags: entry.sourceType === 'local' || entry.sourceType === 'ref-group',
  }
}

function sectionMetadataActionItems(context: ReturnType<typeof getSectionHandleMenuContext>): LineHandleMenuItem[] {
  const items: LineHandleMenuItem[] = []
  if (context.canMarkHeadingSource) {
    items.push({ key: 'mark-heading-source', label: '标记来源', icon: '▣' })
  }
  if (context.canClearHeadingSource) {
    items.push({ key: 'clear-heading-source', label: '解除来源', icon: '✕', danger: true })
  }
  if (context.canEditSectionTags) {
    items.push({ key: 'edit-section-tags', label: '节标签', icon: '🏷️' })
  }
  return items
}

export type EditorHandleTarget =
  | { kind: 'line'; pos: number }
  | { kind: 'section'; entryId: string }

export function buildHandleMenuItems(
  target: EditorHandleTarget | null,
  sectionContext?: ReturnType<typeof getSectionHandleMenuContext> | null,
): LineHandleMenuItem[] {
  const kind = target?.kind === 'section' ? 'section' : 'line'
  const extraActionItems = kind === 'section' && sectionContext
    ? [...knowledgeActionItems('section'), ...sectionMetadataActionItems(sectionContext)]
    : knowledgeActionItems(kind)
  const sectionLabels: Record<string, string> = {
    'mark-excerpt': '标记节选（本节）',
    'set-basis': '设置依据（本节）',
    cut: '剪切本节',
    copy: '复制本节',
    duplicate: '复制本节',
    delete: '删除本节',
  }
  return buildEditorLineHandleItems(extraActionItems).map((item) => (
    kind === 'section' && sectionLabels[item.key]
      ? { ...item, label: sectionLabels[item.key] }
      : item
  ))
}

export function buildSectionHandleItems(entry?: FlatTocEntry | null): LineHandleMenuItem[] {
  const context = entry ? getSectionHandleMenuContext(entry) : {
    canMarkHeadingSource: true,
    canClearHeadingSource: false,
    canEditSectionTags: true,
  }
  return buildHandleMenuItems({ kind: 'section', entryId: entry?.id ?? '' }, context)
}

export function isInsertBlockAction(key: string): key is InsertBlockType {
  return insertOptions.some((option) => option.key === key)
}

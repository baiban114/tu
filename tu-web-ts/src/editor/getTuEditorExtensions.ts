import type { Extensions } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Highlight from '@tiptap/extension-highlight'
import Placeholder from '@tiptap/extension-placeholder'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import type { HeadingSourceBinding, TextAnnotation } from '@/api/types'
import { AnnotationDecorations } from './extensions/AnnotationDecorations'
import { BlockActions } from './extensions/BlockActions'
import { SelectionDecorations } from './extensions/SelectionDecorations'
import { SlashCommand } from './extensions/SlashCommand'
import { X6BlockNode } from './extensions/X6BlockNode'
import { TimelineBlockNode } from './extensions/TimelineBlockNode'
import { RefBlockNode } from './extensions/RefBlockNode'
import { ExternalResourceBlockNode } from './extensions/ExternalResourceBlockNode'
import { SpacerBlockNode } from './extensions/SpacerBlockNode'
import { TableBlockNode } from './extensions/TableBlockNode'
import { MultiTableBlockNode } from './extensions/MultiTableBlockNode'
import { ParagraphNode } from './extensions/ParagraphNode'
import { HeadingNode } from './extensions/HeadingNode'
import { CodeBlockNode } from './extensions/CodeBlockNode'
import { HeadingSourceDecorations } from './extensions/HeadingSourceDecorations'
import { HeadingSectionFold } from './extensions/HeadingSectionFold'
import { TagContentFilter } from './extensions/TagContentFilter'
import { TextTagSpanDecorations } from './extensions/TextTagSpanDecorations'
import { TuLink } from './extensions/TuLink'
import { UrlEmbedBlockNode } from './extensions/UrlEmbedBlockNode'
import { PdfExcerptBlockNode } from './extensions/PdfExcerptBlockNode'
import { createHtmlInlineRenderExtension } from './extensions/HtmlInlineRender'
import type { TocCollectContext } from '@/utils/toc/collectFlatTocEntries'
import type { BlockTag, TextTagSpan } from '@/api/types'
import type { SectionTagsMap, SectionTagAnchor } from '@/utils/sectionMetadata'

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

export interface TuEditorExtensionsConfig {
  annotations: TextAnnotation[]
  onAnnotationClick: (payload: { annotationId: string; annotationIds?: string[]; event: MouseEvent }) => void
  onAnnotationsMapped: (annotations: TextAnnotation[]) => void
  onHeadingSourceClick: (
    binding: HeadingSourceBinding,
    context: { blockId: string; title: string; clientX: number; clientY: number },
  ) => void
  getTocContext: () => TocCollectContext | null
  getFoldRevision: () => number
  getSectionTagsMap: () => SectionTagsMap
  getSectionTagAnchors: () => Record<string, SectionTagAnchor>
  getTextTagSpans: () => TextTagSpan[]
  getActiveTagFilter: () => BlockTag | null
  getFilterRevision: () => number
  getTextTagSpanRevision: () => number
  onTextTagSpanClick?: (spanId: string) => void
  onTextTagSpansMapped?: (spans: TextTagSpan[]) => void
  insertOptions: InsertOption[]
  slashSuggestion: {
    items: (props: { query: string }) => InsertOption[]
    render: () => {
      onStart: (props: { range: { from: number; to: number }; query?: string; clientRect?: (() => DOMRect | null) | null }) => void
      onUpdate: (props: { range: { from: number; to: number }; query?: string; clientRect?: (() => DOMRect | null) | null }) => void
      onKeyDown: (props: { event: KeyboardEvent }) => boolean
      onExit: () => void
    }
  }
  /** Supplies schema extensions for HTML inline render + paste parsing */
  getSchemaExtensions?: () => Extensions
}

/** Schema extensions shared by the live editor and @tiptap/html generateJSON. */
export function getTuEditorSchemaExtensions(): Extensions {
  return [
    StarterKit.configure({
      heading: false,
      paragraph: false,
      codeBlock: false,
    }),
    CodeBlockNode,
    HeadingNode.configure({ levels: [1, 2, 3, 4, 5, 6] }),
    Image.configure({ inline: false }),
    TuLink.configure({ openOnClick: false }),
    Highlight.configure({ multicolor: true }),
    Underline,
    TaskList,
    TaskItem.configure({ nested: true }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    X6BlockNode,
    TimelineBlockNode,
    RefBlockNode,
    ExternalResourceBlockNode,
    SpacerBlockNode,
    TableBlockNode,
    MultiTableBlockNode,
    UrlEmbedBlockNode,
    PdfExcerptBlockNode,
    ParagraphNode,
  ] as Extensions
}

/** Full editor extensions including decorations, slash menu, and placeholders. */
export function getTuEditorExtensions(config: TuEditorExtensionsConfig): Extensions {
  const getSchema = config.getSchemaExtensions ?? getTuEditorSchemaExtensions
  return [
    ...getTuEditorSchemaExtensions(),
    createHtmlInlineRenderExtension(getSchema),
    Placeholder.configure({
      placeholder: '输入 / 查看更多选项...',
    }),
    AnnotationDecorations.configure({
      annotations: config.annotations,
      onAnnotationClick: config.onAnnotationClick,
      onAnnotationsMapped: config.onAnnotationsMapped,
    }),
    HeadingSourceDecorations.configure({
      onSourceClick: config.onHeadingSourceClick,
    }),
    HeadingSectionFold.configure({
      getTocContext: config.getTocContext,
      getFoldRevision: config.getFoldRevision,
    }),
    TextTagSpanDecorations.configure({
      getTextTagSpans: config.getTextTagSpans,
      getRevision: config.getTextTagSpanRevision,
      onSpanClick: config.onTextTagSpanClick,
      onSpansMapped: config.onTextTagSpansMapped,
    }),
    TagContentFilter.configure({
      getTocContext: config.getTocContext,
      getSectionTagsMap: config.getSectionTagsMap,
      getSectionTagAnchors: config.getSectionTagAnchors,
      getTextTagSpans: config.getTextTagSpans,
      getActiveTagFilter: config.getActiveTagFilter,
      getFilterRevision: config.getFilterRevision,
    }),
    SelectionDecorations,
    BlockActions,
    SlashCommand.configure({
      suggestion: {
        items: config.slashSuggestion.items,
        render: config.slashSuggestion.render,
      },
    }),
  ] as Extensions
}

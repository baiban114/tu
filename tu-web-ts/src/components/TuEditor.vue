<script setup lang="ts">
import { watch, onBeforeUnmount, onMounted, nextTick, ref, computed, provide, inject, type ComputedRef } from 'vue'
import type { CSSProperties } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import type { Block, ExternalResourceEmbedData, HeadingSourceBinding, TextAnnotation, TextTagSpan, SpannedBlockInfo } from '@/api/types'
import type { JSONContent } from '@tiptap/core'
import { uploadFile } from '@/api/fileStorage'
import {
  annotationDecorationsKey,
  blocksToTipTap,
  tipTapToBlocks,
  getTuEditorExtensions,
  getTuEditorSchemaExtensions,
  createPdfExcerptNodeAttrs,
  createCompareBlockAttrs,
  ANNOTATION_SIDE_MARKERS_META,
} from '@/editor'
import type { CompareSide } from '@/utils/compareBlock'
import {
  findClipboardImageFileOnly,
  insertHtmlFromClipboard,
  sanitizePastedHtml,
} from '@/editor/pasteHtmlContent'
import {
  isHeadingPasteContext,
  pastePlainTextInHeading,
} from '@/editor/pasteInTextblock'
import {
  collectPageMetaForRange,
  parsePageClipboardMeta,
  TU_PAGE_META_MIME,
  type TuPageClipboardMeta,
} from '@/editor/pageMetaClipboard'
import { resolveClipboardHtmlSource } from '@/editor/extensions/HtmlInlineRender'
import { getAnnotationSelectionPayload } from '@/editor/annotationText'
import { createGraphFromSource, createGraphSourceMetadata } from '@/utils/graphSources'
import { createMindmapStarterGraphData } from '@/components/x6'
import { createHeadingBlockId } from '@/utils/headingSource'
import { createBlockquoteBlockId } from '@/utils/blockquoteExcerpt'
import { EDITOR_GUTTER_BTN_SIZE, getContentScrollGutterAnchor, getHandleTriggerBounds, isPointInHandleTriggerZone } from '@/utils/editorGutterLayout'
import type { TocCollectContext } from '@/utils/toc/collectFlatTocEntries'
import { HEADING_SECTION_FOLD_META } from '@/utils/toc/tocSectionFoldActions'
import { textTagSpanDecorationsMetaKey } from '@/editor/extensions/TextTagSpanDecorations'
import { getSectionFoldRevision } from '@/stores/sectionFoldSession'
import { getActiveTagFilter, getTagFilterRevision } from '@/stores/tagFilterSession'
import { dispatchTagFilterRefresh } from '@/utils/tagFilterRefresh'
import type { SectionTagsMap, SectionTagAnchor } from '@/utils/sectionMetadata'
import { useWorkspaceStore } from '@/stores/workspace'
import HoverHandle from './HoverHandle.vue'
import HeadingSectionFoldGutter from './HeadingSectionFoldGutter.vue'
import { fetchResourcePageTitle } from '@/api/externalResource'
import {
  createUrlEmbedBlockId,
  fallbackPageTitleFromUrl,
  URL_EMBED_DEFAULT_HEIGHT,
  URL_EMBED_MAX_HEIGHT,
  URL_EMBED_MIN_HEIGHT,
  type UrlDisplayMode,
} from '@/utils/urlDisplay'
import {
  buildHandleMenuItems,
  getSectionHandleMenuContext,
  insertOptions,
  isInsertBlockAction,
  type EditorHandleAction,
  type EditorHandleTarget,
  type InsertBlockType,
} from '@/editor/lineHandleMenu'
import { collectFlatTocEntries } from '@/utils/toc/collectFlatTocEntries'
import { iterTocFoldSections } from '@/utils/toc/tocSections'
import { findTocFoldAnchorElement } from '@/utils/toc/tocSectionFoldActions'
import { getTocSectionBoundaryPos } from '@/utils/toc/tocSections'
import { resolveFoldSectionEntryIdAtPos } from '@/utils/toc/resolveFoldSectionEntry'
import type { ResolvedPos } from '@tiptap/pm/model'
import { EDITOR_SECTION_HANDLE_KEY } from '@/editor/editorSectionHandleBridge'
import {
  resolveUrlHoverTarget,
  urlHoverTargetsEqual,
  type UrlHoverTarget,
} from '@/editor/urlHoverTarget'

interface Props {
  /** Tiptap document JSON（schema v2 主路径） */
  document?: JSONContent | null
  /** @deprecated 使用 document 替代 */
  blocks?: Block[]
  editable?: boolean
  annotations?: Record<string, TextAnnotation[]>
  hoverHandle?: boolean
  /** 只读模式下仍显示段落手柄并允许标注/节选等（不启用编辑类操作） */
  paragraphGutterActions?: boolean
  /** 在有标注的段落右侧显示「标注」入口按钮 */
  annotationSideMarkers?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  document: null,
  blocks: () => [],
  editable: true,
  annotations: () => ({}),
  hoverHandle: true,
  paragraphGutterActions: undefined,
  annotationSideMarkers: false,
})

const emit = defineEmits<{
  'update:document': [document: JSONContent]
  'content-change': [document: JSONContent]
  /** @deprecated */
  'update:blocks': [blocks: Block[]]
  'selection-change': [hasSelection: boolean, text: string, from?: number, to?: number, blockId?: string, spannedBlockIds?: string[], spannedBlockMetadata?: SpannedBlockInfo[]]
  'selection-pointer-change': [active: boolean]
  'annotation-click': [payload: { annotationId: string; annotationIds?: string[]; event: MouseEvent }]
  'annotations-mapped': [annotations: TextAnnotation[]]
  'block-click': [blockId: string, event: MouseEvent]
  'compound-badge-click': [blockId: string, annotationId: string, clientY: number, clientX: number]
  'open-block-picker': []
  'open-resource-picker': []
  'open-pdf-excerpt-picker': []
  'edit-pdf-excerpt-source': [blockId: string]
  'bind-compare-side': [payload: { blockId: string; side: CompareSide }]
  'open-tag-editor': [blockId: string]
  'heading-source-click': [binding: HeadingSourceBinding, context: { blockId: string; title: string; clientX: number; clientY: number }]
  'blockquote-excerpt-click': [binding: HeadingSourceBinding, context: { blockId: string; title: string; clientX: number; clientY: number }]
  'mark-block-excerpt': [blockId: string]
  'set-block-basis': [blockId: string]
  'section-annotate': [entryId: string]
  'section-mark-excerpt': [entryId: string]
  'section-set-basis': [entryId: string]
  'section-create-knowledge-relation': [entryId: string]
  'section-mark-heading-source': [entryId: string]
  'section-clear-heading-source': [entryId: string]
  'section-edit-section-tags': [entryId: string]
  'section-ai-marking': [entryId: string]
  'line-annotate': [blockId: string]
  'line-create-knowledge-relation': [blockId: string]
  'url-hover-change': [target: UrlHoverTarget | null]
  'text-tag-span-click': [spanId: string]
  'text-tag-spans-mapped': [spans: TextTagSpan[]]
  'page-meta-paste': [meta: TuPageClipboardMeta]
}>()

const editorEl = ref<HTMLElement | null>(null)
const hoverHandleRef = ref<InstanceType<typeof HoverHandle> | null>(null)
const workspaceStore = useWorkspaceStore()
const tocCollectContext = inject<ComputedRef<TocCollectContext> | undefined>('tocCollectContext', undefined)
const activeTagFilter = inject<ComputedRef<import('@/api/types').BlockTag | null> | undefined>('activeTagFilter', undefined)
const sectionTagsMapRef = inject<ComputedRef<SectionTagsMap> | undefined>('sectionTagsMap', undefined)
const sectionTagAnchorsRef = inject<ComputedRef<Record<string, SectionTagAnchor>> | undefined>('sectionTagAnchors', undefined)
const textTagSpansRef = inject<ComputedRef<TextTagSpan[]> | undefined>('textTagSpans', undefined)
const textTagSpanRevisionRef = inject<ComputedRef<number> | undefined>('textTagSpanRevision', undefined)
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let isInternalUpdate = false
let skipNextContentSync = false
let isMounted = false
let pendingRefInsertPos: number | null = null
let pendingExternalResourceInsertPos: number | null = null
let pendingPdfExcerptInsertPos: number | null = null
let selectionPointerDown = false
let lastDocSignature = ''
let urlHoverTimer: ReturnType<typeof setTimeout> | null = null
let urlHoverClearTimer: ReturnType<typeof setTimeout> | null = null
let lastUrlHoverTarget: UrlHoverTarget | null = null
let urlHoverSuppressed = false

// --- Hover Handle ---
const PARAGRAPH_HANDLE_NODE_TYPES = ['paragraph', 'heading', 'list_item', 'blockquote', 'bullet_list', 'ordered_list', 'task_list', 'task_item']
const HANDLE_GUTTER_WIDTH = 44
const hoveredPos = ref<number | null>(null)
const handleVisible = ref(false)
const handleTop = ref(0)
const handleHeight = ref(28)
const handleMenuVisible = ref(false)
let hideHandleTimer: ReturnType<typeof setTimeout> | null = null

const handleFixedLeft = ref(0)
const handleTriggerLeft = ref(0)
const handleTriggerWidth = ref(EDITOR_GUTTER_BTN_SIZE)
const handleTarget = ref<EditorHandleTarget | null>(null)
let hoveredLineEl: HTMLElement | null = null
let scrollContainer: HTMLElement | null = null

const handlePositionStyle = computed<CSSProperties>(() => ({
  position: 'fixed',
  left: `${handleTriggerLeft.value}px`,
  top: `${handleTop.value}px`,
  width: `${handleTriggerWidth.value}px`,
  height: `${handleHeight.value}px`,
  transform: 'none',
  ['--hover-handle-dot-left' as string]: `${handleFixedLeft.value - handleTriggerLeft.value}px`,
}))

const paragraphGutterActionsEnabled = computed(() => props.paragraphGutterActions ?? props.editable)
const gutterReadOnly = computed(() => paragraphGutterActionsEnabled.value && !props.editable)

const activeHandleItems = computed(() => {
  const target = handleTarget.value
  let items = !target || target.kind !== 'section'
    ? buildHandleMenuItems(target)
    : (() => {
      const resolved = resolveSectionEntry(target.entryId)
      const sectionContext = resolved ? getSectionHandleMenuContext(resolved.entry) : null
      return buildHandleMenuItems(target, sectionContext)
    })()

  if (gutterReadOnly.value) {
    const allowed = new Set(['add-note', 'create-knowledge-relation', 'mark-excerpt', 'set-basis'])
    items = items.filter((item) => (
      item.divider ? item.key === 'action-divider' : allowed.has(item.key)
    ))
  }
  return items
})

const slashQuery = ref('')
const slashMenuVisible = ref(false)
const slashMenuTop = ref(0)
const slashMenuLeft = ref(0)

const filteredSlashOptions = computed(() => {
  const keyword = slashQuery.value.trim().toLowerCase()
  if (!keyword) return insertOptions
  return insertOptions.filter((option) => (
    option.label.toLowerCase().includes(keyword)
    || option.key.includes(keyword)
    || option.keywords.some((item) => item.includes(keyword))
  ))
})

const flattenedAnnotations = computed(() => Object.values(props.annotations).flat())

const compoundAnnotationBadges = computed(() => {
  const map: Record<string, { annotationId: string; color: string }[]> = {}
  for (const annotations of Object.values(props.annotations)) {
    for (const ann of annotations) {
      if (ann.kind === 'basis' && (ann.scope === 'compound' || ann.scope === 'block') && ann.spannedBlockIds?.length) {
        for (const bid of ann.spannedBlockIds) {
          if (!map[bid]) map[bid] = []
          map[bid].push({ annotationId: ann.id, color: ann.color || '#81C784' })
        }
      } else if (ann.kind === 'excerpt' && (ann.scope === 'compound' || ann.scope === 'block') && ann.spannedBlockIds?.length) {
        for (const bid of ann.spannedBlockIds) {
          if (!map[bid]) map[bid] = []
          map[bid].push({ annotationId: ann.id, color: ann.color || '#4FC3F7' })
        }
      } else if ((ann.scope === 'compound' || ann.scope === 'block') && ann.spannedBlockIds?.length) {
        for (const bid of ann.spannedBlockIds) {
          if (!map[bid]) map[bid] = []
          map[bid].push({ annotationId: ann.id, color: ann.color || '#FFEB3B' })
        }
      }
    }
  }
  return map
})

provide('compoundAnnotationBadges', compoundAnnotationBadges)

const handleCompoundBadgeClick = (blockId: string, annotationId: string, event: MouseEvent) => {
  emit('compound-badge-click', blockId, annotationId, event.clientY, event.clientX)
}
provide('onCompoundBadgeClick', handleCompoundBadgeClick)

provide('onEditPdfExcerptSource', (blockId: string) => {
  emit('edit-pdf-excerpt-source', blockId)
})

provide('onBindCompareSide', (blockId: string, side: CompareSide) => {
  emit('bind-compare-side', { blockId, side })
})

// --- Lasso (multi-select) ---
const lassoSelectedBlockIds = ref(new Set<string>())
provide('lassoSelectedBlockIds', lassoSelectedBlockIds)

let lassoActive = false
let lassoStartX = 0
let lassoStartY = 0
let lassoListenersAttached = false
const lassoRect = ref<{ left: number; top: number; width: number; height: number } | null>(null)

function updateLassoSelection() {
  const rect = lassoRect.value
  if (!rect || !editorEl.value) return

  const wrappers = editorEl.value.querySelectorAll<HTMLElement>('[data-block-id]')
  const newSelection = new Set<string>()

  wrappers.forEach((el) => {
    const elRect = el.getBoundingClientRect()
    const overlap = !(
      rect.left + rect.width < elRect.left ||
      rect.left > elRect.left + elRect.width ||
      rect.top + rect.height < elRect.top ||
      rect.top > elRect.top + elRect.height
    )
    if (overlap) {
      const bid = el.getAttribute('data-block-id')
      if (bid) newSelection.add(bid)
    }
  })

  lassoSelectedBlockIds.value = newSelection
}

function startLasso(clientX: number, clientY: number) {
  lassoActive = true
  lassoStartX = clientX
  lassoStartY = clientY
  lassoRect.value = { left: clientX, top: clientY, width: 0, height: 0 }
  lassoSelectedBlockIds.value = new Set()

  if (lassoListenersAttached) return
  lassoListenersAttached = true

  document.addEventListener('mousemove', handleLassoMouseMove)
  document.addEventListener('mouseup', handleLassoMouseUp)
}

function handleLassoMouseMove(event: MouseEvent) {
  if (!lassoActive) return
  const x1 = Math.min(lassoStartX, event.clientX)
  const y1 = Math.min(lassoStartY, event.clientY)
  const x2 = Math.max(lassoStartX, event.clientX)
  const y2 = Math.max(lassoStartY, event.clientY)

  if (x2 - x1 < 5 && y2 - y1 < 5) return // Ignore tiny clicks

  lassoRect.value = { left: x1, top: y1, width: x2 - x1, height: y2 - y1 }
  updateLassoSelection()
}

function handleLassoMouseUp() {
  if (!lassoActive) return
  lassoActive = false
  lassoRect.value = null

  if (lassoListenersAttached) {
    lassoListenersAttached = false
    document.removeEventListener('mousemove', handleLassoMouseMove)
    document.removeEventListener('mouseup', handleLassoMouseUp)
  }
}

const handleDocumentKeyDown = (event: KeyboardEvent) => {
  if ((event.key === 'Delete' || event.key === 'Backspace') && lassoSelectedBlockIds.value.size > 0) {
    deleteLassoSelected()
    event.preventDefault()
  }
}

function clearLassoSelection() {
  lassoSelectedBlockIds.value = new Set()
}

function deleteLassoSelected() {
  if (!editor.value || lassoSelectedBlockIds.value.size === 0) return

  const ids = lassoSelectedBlockIds.value
  const doc = editor.value.state.doc

  // Find all top-level node positions matching lasso-selected blockIds
  const positions: number[] = []
  doc.descendants((node, pos) => {
    if (node.isBlock && node.attrs.blockId && ids.has(node.attrs.blockId)) {
      positions.push(pos)
    }
    return true
  })
  positions.sort((a, b) => b - a) // descending → delete from end to avoid offset shifts

  let tr = editor.value.state.tr
  for (const pos of positions) {
    const node = tr.doc.nodeAt(pos)
    if (node) tr = tr.delete(pos, pos + node.nodeSize)
  }
  tr.scrollIntoView()
  editor.value.view.dispatch(tr)
  clearLassoSelection()

  // Immediately flush content sync instead of waiting for 300ms debounce
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  if (isMounted && editor.value) {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    lastDocSignature = getDocSignature()
    emitEditorContent()
  }
}

const getBlockIdAtPos = (pos: number): string | undefined => {
  if (!editor.value) return undefined
  const doc = editor.value.state.doc
  const clamped = Math.max(0, Math.min(pos, doc.content.size))
  const resolved = doc.resolve(clamped)

  for (let depth = resolved.depth; depth >= 1; depth -= 1) {
    const blockId = resolved.node(depth).attrs?.blockId
    if (blockId) return blockId
  }

  const topLevel = resolved.depth >= 1 ? resolved.node(1) : resolved.nodeAfter
  const blockId = topLevel?.attrs?.blockId
  return typeof blockId === 'string' && blockId ? blockId : undefined
}

const TEXT_BLOCK_NODE_TYPES = new Set([
  'paragraph',
  'heading',
  'bulletList',
  'orderedList',
  'blockquote',
  'horizontalRule',
  'taskList',
  'image',
])

const collectSelectionBlockInfo = (from: number, to: number): {
  ids: string[]
  metadata: SpannedBlockInfo[]
} => {
  if (!editor.value) return { ids: [], metadata: [] }
  const seen = new Set<string>()
  const ids: string[] = []
  const metadata: SpannedBlockInfo[] = []
  let hasNonTextBlock = false

  editor.value.state.doc.nodesBetween(from, to, (node) => {
    const blockId = node.attrs?.blockId
    if (!blockId || seen.has(blockId)) return true
    if (!node.isBlock && !node.type.isAtom) return true

    const blockType = node.type.name
    if (!TEXT_BLOCK_NODE_TYPES.has(blockType)) {
      hasNonTextBlock = true
    }
    seen.add(blockId)
    ids.push(blockId)
    metadata.push({
      blockId,
      blockType,
      title: typeof node.attrs?.title === 'string' && node.attrs.title ? node.attrs.title : undefined,
    })
    return true
  })

  return ids.length > 1 || hasNonTextBlock
    ? { ids, metadata }
    : { ids: [], metadata: [] }
}

const getDocSignature = (): string => {
  if (!editor.value) return ''
  return JSON.stringify(editor.value.getJSON())
}

function resolveEditorContent(): JSONContent {
  if (props.document?.type === 'doc') {
    return props.document
  }
  return blocksToTipTap(props.blocks ?? [])
}

function emitEditorContent() {
  if (!editor.value) return
  const json = editor.value.getJSON()
  skipNextContentSync = true
  emit('update:document', json)
  emit('content-change', json)
  if ((props.blocks?.length ?? 0) > 0) {
    emit('update:blocks', tipTapToBlocks(json, props.blocks))
  }
}

function applyExternalDocument(nextDoc: JSONContent) {
  if (!editor.value) return
  isInternalUpdate = true
  try {
    const liveDocJson = editor.value.getJSON()
    if (JSON.stringify(nextDoc) === JSON.stringify(liveDocJson)) {
      lastDocSignature = JSON.stringify(liveDocJson)
      return
    }
    const prevSelection = editor.value.state.selection
    const wasFocused = editor.value.isFocused
    editor.value.commands.setContent(nextDoc, { emitUpdate: false })
    const docSize = editor.value.state.doc.content.size
    const from = Math.min(prevSelection.from, docSize)
    const to = Math.min(prevSelection.to, docSize)
    if (from <= docSize && to <= docSize && from >= 0) {
      try {
        editor.value.commands.setTextSelection({ from, to })
      } catch {
        // ignore invalid selection after rebuild
      }
    }
    if (wasFocused) editor.value.commands.focus(undefined, { scrollIntoView: false })
    lastDocSignature = JSON.stringify(nextDoc)
  } finally {
    isInternalUpdate = false
  }
}

const flushContentChange = () => {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  if (!isMounted || !editor.value) return
  lastDocSignature = getDocSignature()
  emitEditorContent()
}

provide('flushEditorContentChange', flushContentChange)

const getBlockRange = (resolved: any) => {
  const from = resolved.before(1)
  const to = resolved.after(1)
  return { from, to }
}

const generateBlockId = (): string => `block-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const LINE_HANDLE_BLOCK_ID_TYPES = new Set(['paragraph', 'heading', 'blockquote', 'list_item', 'task_item'])

const ensureTopLevelLineBlockId = (resolved: ResolvedPos): string | undefined => {
  const existing = getBlockIdAtPos(resolved.pos)
  if (existing) return existing

  const ed = editor.value
  if (!ed) return undefined

  const topPos = resolved.before(1)
  const topNode = resolved.node(1)
  if (!LINE_HANDLE_BLOCK_ID_TYPES.has(topNode.type.name)) return undefined

  const newId = generateBlockId()
  ed.chain().focus().command(({ tr, dispatch }) => {
    if (dispatch) {
      tr.setNodeMarkup(topPos, undefined, { ...topNode.attrs, blockId: newId })
    }
    return true
  }).run()

  return newId
}

const createExternalBlock = (type: InsertBlockType): Block | null => {
  const id = generateBlockId()
  switch (type) {
    case 'richtext':
      return { id, type: 'richtext', content: '' }
    case 'line':
      return { id, type: 'line', title: '新的时间轴', timelineData: [] }
    case 'x6':
      return {
        id,
        type: 'x6',
        title: '新的画板',
        graphData: {
          nodes: [
            { id: `${id}-node-1`, x: 100, y: 100, width: 80, height: 40, label: '节点 1' },
            { id: `${id}-node-2`, x: 300, y: 100, width: 80, height: 40, label: '节点 2' },
          ],
          edges: [
            { id: `${id}-edge-1`, source: `${id}-node-1`, target: `${id}-node-2` },
          ],
        },
      }
    case 'x6-mindmap':
      return {
        id,
        type: 'x6',
        title: '思维导图',
        graphData: createMindmapStarterGraphData(),
      }
    case 'knowledge-roadmap':
      return {
        id,
        type: 'x6',
        title: '知识库路线图',
        metadata: createGraphSourceMetadata('knowledge-base-pages', {
          sourceId: workspaceStore.currentKbId,
          syncMode: 'bidirectional',
        }),
        graphData: createGraphFromSource('knowledge-base-pages', workspaceStore.pageTree),
      }
    case 'table':
      return {
        id,
        type: 'table',
        title: '新表格',
        tableData: {
          headers: ['列 1', '列 2'],
          rows: [['', '']],
        },
      }
    case 'multiTable':
      return {
        id,
        type: 'multiTable',
        title: '多维表格',
        multiTableData: {
          fields: [],
          records: [],
          views: [
            { id: 'view-table', name: '表格', type: 'table' },
          ],
          activeViewId: 'view-table',
        },
      }
    case 'spacer':
      return { id, type: 'spacer', spacerHeight: 40 }
    case 'ref':
      return { id, type: 'ref', refId: '', refType: 'block' }
    case 'externalResource':
      return {
        id,
        type: 'externalResource',
        title: '外部资源',
        externalResource: {
          resourceItemId: '',
          resourceExcerptId: null,
          mode: 'resource',
          snapshot: { resourceTitle: '' },
        },
      }
    default:
      return null
  }
}

const insertBlockAfterPos = (block: Block, pos: number) => {
  if (!editor.value) return false
  return editor.value.commands.insertExternalBlockAfterPos(block, pos)
}

const insertBlockAtSelection = (block: Block) => {
  if (!editor.value) return false
  return editor.value.commands.insertExternalBlockAtSelection(block)
}

const requestRefInsertAfterPos = (pos: number) => {
  pendingRefInsertPos = pos
  emit('open-block-picker')
}

const requestExternalResourceInsertAfterPos = (pos: number) => {
  pendingExternalResourceInsertPos = pos
  emit('open-resource-picker')
}

const requestPdfExcerptInsertAfterPos = (pos: number) => {
  pendingPdfExcerptInsertPos = pos
  emit('open-pdf-excerpt-picker')
}

const insertExternalBlockAfterPos = (type: InsertBlockType, pos: number) => {
  if (type === 'ref') {
    requestRefInsertAfterPos(pos)
    return
  }
  if (type === 'externalResource') {
    requestExternalResourceInsertAfterPos(pos)
    return
  }
  if (type === 'pdf-excerpt') {
    requestPdfExcerptInsertAfterPos(pos)
    return
  }
  if (type === 'compare') {
    insertCompareBlockAt(pos)
    return
  }

  const block = createExternalBlock(type)
  if (!block) return
  insertBlockAfterPos(block, pos)
}

const insertExternalBlockAtSelection = (type: InsertBlockType) => {
  if (!editor.value) return
  if (type === 'ref') {
    pendingRefInsertPos = editor.value.state.selection.from
    emit('open-block-picker')
    return
  }
  if (type === 'externalResource') {
    pendingExternalResourceInsertPos = editor.value.state.selection.from
    emit('open-resource-picker')
    return
  }
  if (type === 'pdf-excerpt') {
    pendingPdfExcerptInsertPos = editor.value.state.selection.from
    emit('open-pdf-excerpt-picker')
    return
  }
  if (type === 'compare') {
    insertCompareBlockAt(null)
    return
  }

  const block = createExternalBlock(type)
  if (!block) return
  insertBlockAtSelection(block)
}

const completePendingRefInsert = (refId: string, refType: 'block' | 'page') => {
  const block: Block = {
    id: generateBlockId(),
    type: 'ref',
    refId,
    refType,
  }

  if (pendingRefInsertPos != null) {
    insertBlockAfterPos(block, pendingRefInsertPos)
  } else {
    insertBlockAtSelection(block)
  }
  pendingRefInsertPos = null
}

const completePendingExternalResourceInsert = (block: Block) => {
  if (pendingExternalResourceInsertPos != null) {
    insertBlockAfterPos(block, pendingExternalResourceInsertPos)
  } else {
    insertBlockAtSelection(block)
  }
  pendingExternalResourceInsertPos = null
}

/** Reuse the pending external-resource insert caret for a PDF block. */
const insertPdfExcerptUsingExternalResourcePending = (input: {
  fileId: string
  fileName: string
  viewMode?: 'excerpt' | 'full'
  startPage: number
  endPage: number
  height?: number
}) => {
  if (pendingExternalResourceInsertPos != null) {
    pendingPdfExcerptInsertPos = pendingExternalResourceInsertPos
    pendingExternalResourceInsertPos = null
  }
  return insertPdfExcerptBlock(input)
}

const insertImageUsingExternalResourcePending = (src: string) => {
  if (!editor.value || !src.trim()) return false
  const content = {
    type: 'image',
    attrs: { src: src.trim() },
  }
  if (pendingExternalResourceInsertPos != null) {
    const pos = pendingExternalResourceInsertPos
    pendingExternalResourceInsertPos = null
    return editor.value.chain().focus().insertContentAt(pos, content).run()
  }
  return editor.value.chain().focus().setImage({ src: src.trim() }).run()
}

const insertPdfExcerptBlock = (input: {
  fileId: string
  fileName: string
  viewMode?: 'excerpt' | 'full'
  startPage: number
  endPage: number
  height?: number
}) => {
  if (!editor.value) return false
  const content = {
    type: 'pdfExcerptBlock',
    attrs: createPdfExcerptNodeAttrs(input),
  }
  if (pendingPdfExcerptInsertPos != null) {
    const pos = pendingPdfExcerptInsertPos
    pendingPdfExcerptInsertPos = null
    return editor.value.chain().focus().insertContentAt(pos, content).run()
  }
  return editor.value.chain().focus().insertContent(content).run()
}

const insertCompareBlockAt = (pos: number | null) => {
  if (!editor.value) return false
  const content = {
    type: 'compareBlock',
    attrs: createCompareBlockAttrs(),
  }
  if (pos != null) {
    return editor.value.chain().focus().insertContentAt(pos, content).run()
  }
  return editor.value.chain().focus().insertContent(content).run()
}

const updateCompareBlockSide = (
  blockId: string,
  side: CompareSide,
  externalResource: ExternalResourceEmbedData,
) => {
  const ed = editor.value
  if (!ed || !blockId) return false

  let found: { pos: number; node: import('prosemirror-model').Node } | null = null
  ed.state.doc.descendants((node, pos) => {
    if (node.type.name === 'compareBlock' && node.attrs.blockId === blockId) {
      found = { pos, node }
      return false
    }
    return true
  })
  if (!found) return false

  const attrKey = side === 'left' ? 'leftSide' : 'rightSide'
  return ed.chain().focus().command(({ tr, dispatch }) => {
    if (!dispatch) return true
    tr.setNodeMarkup(found!.pos, undefined, {
      ...found!.node.attrs,
      [attrKey]: externalResource,
    })
    return true
  }).run()
}

const updatePdfExcerptBlock = (
  blockId: string,
  input: {
    fileId: string
    fileName: string
    viewMode?: 'excerpt' | 'full'
    startPage: number
    endPage: number
    height?: number
  },
) => {
  const ed = editor.value
  if (!ed || !blockId) return false

  let found: { pos: number; node: import('prosemirror-model').Node } | null = null
  ed.state.doc.descendants((node, pos) => {
    if (node.type.name === 'pdfExcerptBlock' && node.attrs.blockId === blockId) {
      found = { pos, node }
      return false
    }
    return true
  })
  if (!found) return false

  return ed.chain().focus().command(({ tr, dispatch }) => {
    if (!dispatch) return true
    tr.setNodeMarkup(found!.pos, undefined, {
      ...found!.node.attrs,
      ...createPdfExcerptNodeAttrs({ ...input, blockId }),
    })
    return true
  }).run()
}

const handleScrollInEditor = () => {
  if (activeHoverHighlight) refreshHoverHighlight()
  if (!handleVisible.value || !hoveredLineEl || !editorEl.value) return
  if (!document.contains(hoveredLineEl)) {
    clearHandleState()
    return
  }
  handleTop.value = hoveredLineEl.getBoundingClientRect().top
}

const isHandleInteractionTarget = (node: EventTarget | null): boolean => {
  if (!(node instanceof Node)) return false
  if (editorEl.value?.contains(node)) return true
  if (node instanceof HTMLElement) {
    if (node.closest('.heading-section-fold-gutter__btn')) return true
    if (node.closest('.hover-handle')) return true
  }
  return false
}

const clearHandleState = () => {
  handleVisible.value = false
  handleTarget.value = null
  hoveredPos.value = null
  hoveredLineEl = null
  pointerOnHandleControl = false
  clearHoverHighlight()
}

type HoverHighlightTarget =
  | { kind: 'section'; entryId: string }
  | { kind: 'paragraph'; pos: number }

const hoverHighlightBox = ref<{ top: number; left: number; width: number; height: number } | null>(null)
let activeHoverHighlight: HoverHighlightTarget | null = null
/** 指针是否正在折叠钮 / 手柄圆点上（仅此时允许区域高亮） */
let pointerOnHandleControl = false

function measureSectionHighlightBox(entryId: string): { top: number; left: number; width: number; height: number } | null {
  const ed = editor.value
  const range = getSectionRange(entryId)
  if (!ed || ed.isDestroyed || !range) return null

  let top = Infinity
  let bottom = -Infinity
  let left = Infinity
  let right = -Infinity
  let found = false

  ed.state.doc.forEach((_node, offset) => {
    const nodeFrom = offset
    const nodeTo = offset + _node.nodeSize
    if (nodeTo <= range.from || nodeFrom >= range.to) return
    const dom = ed.view.nodeDOM(nodeFrom)
    if (!(dom instanceof HTMLElement)) return
    const rect = dom.getBoundingClientRect()
    found = true
    top = Math.min(top, rect.top)
    bottom = Math.max(bottom, rect.bottom)
    left = Math.min(left, rect.left)
    right = Math.max(right, rect.right)
  })

  if (!found || bottom <= top || right <= left) return null
  return {
    top,
    left,
    width: right - left,
    height: bottom - top,
  }
}

function measureParagraphHighlightBox(pos: number): { top: number; left: number; width: number; height: number } | null {
  const ed = editor.value
  if (!ed || ed.isDestroyed) return null
  const resolved = ed.state.doc.resolve(Math.min(Math.max(pos, 0), ed.state.doc.content.size))
  if (resolved.depth < 1) return null
  const dom = ed.view.nodeDOM(resolved.before(1))
  if (!(dom instanceof HTMLElement)) return null
  const rect = dom.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return null
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  }
}

function measureHoverHighlightBox(target: HoverHighlightTarget) {
  return target.kind === 'section'
    ? measureSectionHighlightBox(target.entryId)
    : measureParagraphHighlightBox(target.pos)
}

function refreshHoverHighlight() {
  if (!activeHoverHighlight) {
    hoverHighlightBox.value = null
    return
  }
  hoverHighlightBox.value = measureHoverHighlightBox(activeHoverHighlight)
  if (!hoverHighlightBox.value) {
    activeHoverHighlight = null
  }
}

function clearHoverHighlight() {
  activeHoverHighlight = null
  hoverHighlightBox.value = null
}

function setHoverHighlight(target: HoverHighlightTarget) {
  if (!pointerOnHandleControl) return
  activeHoverHighlight = target
  hoverHighlightBox.value = measureHoverHighlightBox(target)
  if (!hoverHighlightBox.value) {
    activeHoverHighlight = null
  }
}

const scheduleHideHandle = () => {
  if (hideHandleTimer) return
  // 0ms：仅衔接相邻命中区 leave→enter；便利性靠横向扩大的触发条，不再用长延迟
  hideHandleTimer = setTimeout(() => {
    if (!handleMenuVisible.value) {
      clearHandleState()
    }
    hideHandleTimer = null
  }, 0)
}

const clearHideHandle = () => {
  if (hideHandleTimer) {
    clearTimeout(hideHandleTimer)
    hideHandleTimer = null
  }
}

const handleEditorMouseMove = (event: MouseEvent) => {
  if (!editor.value || !editorEl.value || !paragraphGutterActionsEnabled.value) return
  if (handleMenuVisible.value) return

  const wrapperRect = editorEl.value.getBoundingClientRect()
  const gutter = getContentScrollGutterAnchor(editorEl.value)
  const trigger = gutter ? getHandleTriggerBounds(gutter, { contentLeft: wrapperRect.left }) : null
  const isInsideEditor = event.clientX >= wrapperRect.left
    && event.clientX <= wrapperRect.right
    && event.clientY >= wrapperRect.top
    && event.clientY <= wrapperRect.bottom
  // 装订线触发区：覆盖手柄圆点并向右贴齐正文左缘 + 折叠钮
  const gutterRight = trigger
    ? Math.max(trigger.right, wrapperRect.left)
    : wrapperRect.left
  const isInLeftGutter = Boolean(
    gutter
    && trigger
    && event.clientX >= trigger.left
    && event.clientX < gutterRight
    && event.clientY >= wrapperRect.top
    && event.clientY <= wrapperRect.bottom,
  )
  if (!isInsideEditor && !isInLeftGutter) { scheduleHideHandle(); return }

  if (isInLeftGutter) {
    const section = resolveSectionAtClientY(event.clientY)
    if (section) {
      showHandle({ kind: 'section', entryId: section.entryId }, section.anchorEl)
      return
    }
    // 在手柄条内：按正文同高解析段落，或保留已显示的手柄，避免移向圆点时消失
    if (keepOrResolveHandleInGutter(event.clientY, wrapperRect.left)) return
    scheduleHideHandle()
    return
  }

  const pos = editor.value.view.posAtCoords({ left: event.clientX, top: event.clientY })
  if (!pos) { scheduleHideHandle(); return }

  const resolved = editor.value.state.doc.resolve(pos.pos)
  if (resolved.depth < 1) { scheduleHideHandle(); return }

  const node = resolved.node(1)
  if (!node || !PARAGRAPH_HANDLE_NODE_TYPES.includes(node.type.name)) { scheduleHideHandle(); return }

  const domPos = editor.value.view.nodeDOM(resolved.before(1))
  if (!domPos || !(domPos instanceof HTMLElement)) { scheduleHideHandle(); return }

  const sectionEntryId = tocCollectContext?.value
    ? resolveFoldSectionEntryIdAtPos(editor.value.state.doc, pos.pos, tocCollectContext.value)
    : null
  if (sectionEntryId) {
    showHandle({ kind: 'section', entryId: sectionEntryId }, domPos)
    return
  }

  showHandle({ kind: 'paragraph', pos: pos.pos }, domPos)
}

/** 装订线内：用正文左缘内侧坐标解析同高块；失败则若指针仍在当前手柄竖直范围内则保持 */
function keepOrResolveHandleInGutter(clientY: number, contentLeft: number): boolean {
  const ed = editor.value
  if (!ed || ed.isDestroyed) return false

  const probeX = contentLeft + 4
  const pos = ed.view.posAtCoords({ left: probeX, top: clientY })
  if (pos) {
    const resolved = ed.state.doc.resolve(pos.pos)
    if (resolved.depth >= 1) {
      const node = resolved.node(1)
      if (node && PARAGRAPH_HANDLE_NODE_TYPES.includes(node.type.name)) {
        const domPos = ed.view.nodeDOM(resolved.before(1))
        if (domPos instanceof HTMLElement) {
          const sectionEntryId = tocCollectContext?.value
            ? resolveFoldSectionEntryIdAtPos(ed.state.doc, pos.pos, tocCollectContext.value)
            : null
          if (sectionEntryId) {
            showHandle({ kind: 'section', entryId: sectionEntryId }, domPos)
          } else {
            showHandle({ kind: 'paragraph', pos: pos.pos }, domPos)
          }
          return true
        }
      }
    }
  }

  if (
    handleVisible.value
    && hoveredLineEl
    && clientY >= handleTop.value
    && clientY <= handleTop.value + handleHeight.value
  ) {
    clearHideHandle()
    return true
  }
  return false
}

function showHandle(target: EditorHandleTarget, anchorEl: HTMLElement) {
  if (!editor.value || !editorEl.value || !paragraphGutterActionsEnabled.value) return

  const wrapperRect = editorEl.value.getBoundingClientRect()
  const gutter = getContentScrollGutterAnchor(editorEl.value)
  const trigger = gutter ? getHandleTriggerBounds(gutter, { contentLeft: wrapperRect.left }) : null
  const lineRect = anchorEl.getBoundingClientRect()

  handleTarget.value = target
  hoveredLineEl = anchorEl
  handleFixedLeft.value = trigger?.dotCenterX ?? (wrapperRect.left - 24)
  handleTriggerLeft.value = trigger?.left ?? (handleFixedLeft.value - EDITOR_GUTTER_BTN_SIZE / 2)
  handleTriggerWidth.value = trigger?.width ?? EDITOR_GUTTER_BTN_SIZE
  handleTop.value = lineRect.top
  handleHeight.value = Math.max(EDITOR_GUTTER_BTN_SIZE, lineRect.height)
  if (target.kind === 'paragraph') {
    hoveredPos.value = target.pos
  } else {
    const resolved = resolveSectionEntry(target.entryId)
    hoveredPos.value = resolved
      ? Math.min(resolved.entry.pos + 1, editor.value.state.doc.content.size - 1)
      : null
  }
  handleVisible.value = true
  clearHideHandle()
  // 手柄因正文/装订线出现时清高亮；指针仍在折叠钮/圆点上时保留
  if (!pointerOnHandleControl) {
    clearHoverHighlight()
  }
}

// Lasso mousedown: capture phase so it fires BEFORE ProseMirror's handler and @*.stop
const handleLassoStart = (event: MouseEvent) => {
  if (!props.editable || event.button !== 0) return

  // Detect nodeView clicks (non-Shift) — capture phase bypasses @*.stop on nodeView roots
  if (!event.shiftKey) {
    const target = event.target as HTMLElement
    const nodeView = target.closest('[data-block-id]')
    if (nodeView) {
      const bid = nodeView.getAttribute('data-block-id')
      if (bid) emit('block-click', bid, event)
    }
    // Non-shift click clears lasso selection
    if (lassoSelectedBlockIds.value.size > 0) {
      clearLassoSelection()
    }
    return
  }

  const target = event.target as HTMLElement
  const nodeView = target.closest('[data-block-id]')

  if (nodeView) {
    const bid = nodeView.getAttribute('data-block-id')
    if (bid) {
      const next = new Set(lassoSelectedBlockIds.value)
      if (next.has(bid)) { next.delete(bid) } else { next.add(bid) }
      lassoSelectedBlockIds.value = next
    }
    event.preventDefault()
    event.stopPropagation()
    return
  }

  // Shift+click on empty area: start drag lasso, stop ProseMirror selection
  startLasso(event.clientX, event.clientY)
  event.preventDefault()
  event.stopPropagation()
}

const handleEditorMouseDown = (event: MouseEvent) => {
  if (!props.editable || event.button !== 0) return
  selectionPointerDown = true
  emit('selection-pointer-change', true)
}

const handleDocumentMouseUp = () => {
  if (!selectionPointerDown) return
  selectionPointerDown = false
  emit('selection-pointer-change', false)
}

const handleEditorMouseLeave = (event: MouseEvent) => {
  if (isHandleInteractionTarget(event.relatedTarget)) return
  // 移向装订线/手柄条时不要立刻隐藏（相关目标可能是 content-scroll 空白）
  if (editorEl.value && isClientPointInHandleKeepZone(event.clientX, event.clientY)) {
    clearHideHandle()
    return
  }
  scheduleHideHandle()
}

function isClientPointInHandleKeepZone(clientX: number, clientY: number): boolean {
  if (!editorEl.value) return false
  const gutter = getContentScrollGutterAnchor(editorEl.value)
  if (!gutter) return false
  const wrapperRect = editorEl.value.getBoundingClientRect()
  const trigger = getHandleTriggerBounds(gutter, { contentLeft: wrapperRect.left })
  const vertical = handleVisible.value
    ? { top: handleTop.value, height: handleHeight.value }
    : { top: wrapperRect.top, height: wrapperRect.height }
  return isPointInHandleTriggerZone(clientX, clientY, trigger, vertical)
}

const handleHandleMenuVisibilityChange = (visible: boolean) => {
  handleMenuVisible.value = visible
  if (!visible) scheduleHideHandle()
}

const handleHandleSelect = (key: EditorHandleAction) => {
  const target = handleTarget.value
  if (!editor.value || !target) return
  runHandleAction(target, key)
  clearHandleState()
}

function runHandleAction(target: EditorHandleTarget, key: EditorHandleAction) {
  if (target.kind === 'section') {
    runSectionHandleAction(target.entryId, key)
    return
  }
  const resolved = editor.value!.state.doc.resolve(target.pos)
  if (resolved.depth < 1) return
  runParagraphHandleAction(key, resolved, target.pos)
}

function resolveSectionAtClientY(clientY: number): { entryId: string; anchorEl: HTMLElement } | null {
  const ed = editor.value
  const ctx = tocCollectContext?.value
  if (!ed || !ctx) return null
  const doc = ed.state.doc
  const flat = collectFlatTocEntries(doc, ctx)
  for (const section of iterTocFoldSections(flat, doc)) {
    const anchor = findTocFoldAnchorElement(ed, section.entry)
    if (!anchor) continue
    const rect = anchor.getBoundingClientRect()
    if (clientY >= rect.top && clientY <= rect.bottom) {
      return { entryId: section.entry.id, anchorEl: anchor }
    }
  }
  return null
}

const handleSectionGutterHover = (entryId: string) => {
  const ed = editor.value
  if (!ed) return
  const resolved = resolveSectionEntry(entryId)
  const anchor = resolved ? findTocFoldAnchorElement(ed, resolved.entry) : null
  if (!resolved || !anchor) return
  showHandle({ kind: 'section', entryId }, anchor)
}

const handleSectionGutterLeave = (event?: MouseEvent) => {
  if (event && isHandleInteractionTarget(event.relatedTarget)) return
  scheduleHideHandle()
}

function onSectionHandlePointerEnter(entryId: string) {
  pointerOnHandleControl = true
  setHoverHighlight({ kind: 'section', entryId })
}

function onSectionHandlePointerLeave(event?: MouseEvent) {
  const rel = event?.relatedTarget
  if (rel instanceof HTMLElement && rel.closest('.hover-handle__dot')) return
  pointerOnHandleControl = false
  clearHoverHighlight()
}

function onHoverHandleEnter() {
  clearHideHandle()
}

function onHoverHandleGripEnter() {
  pointerOnHandleControl = true
  const target = handleTarget.value
  if (!target) return
  if (target.kind === 'section') {
    setHoverHighlight({ kind: 'section', entryId: target.entryId })
    return
  }
  setHoverHighlight({ kind: 'paragraph', pos: target.pos })
}

function onHoverHandleGripLeave(event: MouseEvent) {
  const rel = event.relatedTarget
  if (rel instanceof HTMLElement && rel.closest('.heading-section-fold-gutter__btn')) return
  pointerOnHandleControl = false
  clearHoverHighlight()
}

function onHoverHandleLeave(event: MouseEvent) {
  if (handleMenuVisible.value) return
  const rel = event.relatedTarget
  if (rel instanceof HTMLElement && rel.closest('.heading-section-fold-gutter__btn')) return
  pointerOnHandleControl = false
  clearHoverHighlight()
  scheduleHideHandle()
}

provide(EDITOR_SECTION_HANDLE_KEY, {
  onSectionGutterHover: handleSectionGutterHover,
  onSectionGutterLeave: handleSectionGutterLeave,
})

const handleWrapperMouseMove = (event: MouseEvent) => {
  if (!props.editable && !paragraphGutterActionsEnabled.value) return
  if (handleMenuVisible.value) return

  const target = event.target as HTMLElement | null
  const foldBtn = target?.closest('.heading-section-fold-gutter__btn')
  if (foldBtn instanceof HTMLElement) {
    const entryId = foldBtn.dataset.entryId
    if (entryId) handleSectionGutterHover(entryId)
    return
  }

  // 装订线/手柄条在 ProseMirror 外：仍需跟踪，否则移出正文后无法保持段落手柄
  if (!editorEl.value || !paragraphGutterActionsEnabled.value) return
  const wrapperRect = editorEl.value.getBoundingClientRect()
  const gutter = getContentScrollGutterAnchor(editorEl.value)
  if (!gutter) return
  const trigger = getHandleTriggerBounds(gutter, { contentLeft: wrapperRect.left })
  const inTrigger = event.clientX >= trigger.left
    && event.clientX < Math.max(trigger.right, wrapperRect.left)
    && event.clientY >= wrapperRect.top
    && event.clientY <= wrapperRect.bottom
  if (!inTrigger) return

  const section = resolveSectionAtClientY(event.clientY)
  if (section) {
    showHandle({ kind: 'section', entryId: section.entryId }, section.anchorEl)
    return
  }
  if (keepOrResolveHandleInGutter(event.clientY, wrapperRect.left)) return
  if (handleVisible.value) scheduleHideHandle()
}

function resolveSectionEntry(entryId: string) {
  const ed = editor.value
  const ctx = tocCollectContext?.value
  if (!ed || !ctx) return null
  const flat = collectFlatTocEntries(ed.state.doc, ctx)
  const entryIndex = flat.findIndex((item) => item.id === entryId)
  if (entryIndex < 0) return null
  return { flat, entry: flat[entryIndex], entryIndex }
}

function getSectionRange(entryId: string): { from: number; to: number } | null {
  const resolved = resolveSectionEntry(entryId)
  const ed = editor.value
  if (!resolved || !ed) return null
  const { flat, entry, entryIndex } = resolved
  const to = getTocSectionBoundaryPos(flat, entryIndex, ed.state.doc)
  if (to <= entry.pos) return null
  return { from: entry.pos, to }
}

function runParagraphHandleAction(key: EditorHandleAction, resolved: ResolvedPos, cursorPos: number) {
  if (!editor.value) return
  const { from, to } = getBlockRange(resolved)

  if (gutterReadOnly.value && !['add-note', 'create-knowledge-relation', 'mark-excerpt', 'set-basis'].includes(key)) {
    return
  }

  if (isInsertBlockAction(key)) {
    insertExternalBlockAfterPos(key, cursorPos)
    return
  }

  switch (key) {
    case 'add-note': {
      const blockId = ensureTopLevelLineBlockId(resolved)
      if (blockId) emit('line-annotate', blockId)
      break
    }
    case 'create-knowledge-relation': {
      const blockId = ensureTopLevelLineBlockId(resolved)
      if (blockId) emit('line-create-knowledge-relation', blockId)
      break
    }
    case 'mark-excerpt': {
      const blockId = ensureTopLevelLineBlockId(resolved)
      if (blockId) emit('mark-block-excerpt', blockId)
      break
    }
    case 'set-basis': {
      const blockId = ensureTopLevelLineBlockId(resolved)
      if (blockId) emit('set-block-basis', blockId)
      break
    }
    case 'cut': {
      const text = editor.value.state.doc.textBetween(from, to)
      navigator.clipboard.writeText(text).catch(() => {})
      editor.value.chain().focus().deleteRange({ from, to }).run()
      break
    }
    case 'copy': {
      const text = editor.value.state.doc.textBetween(from, to)
      navigator.clipboard.writeText(text).catch(() => {})
      break
    }
    case 'duplicate': {
      const slice = editor.value.state.doc.slice(from, to)
      const json = slice.toJSON()
      if (json) {
        const assignNewId = (node: Record<string, any>) => {
          if (node.attrs?.blockId) {
            node.attrs.blockId = generateBlockId()
          }
          if (node.content) {
            for (const child of node.content) {
              assignNewId(child)
            }
          }
        }
        assignNewId(json)
      }
      editor.value.chain().focus().insertContentAt(to, json).run()
      break
    }
    case 'clear-formatting':
      editor.value.chain().focus().setTextSelection({ from, to }).clearNodes().unsetAllMarks().run()
      break
    case 'delete':
      editor.value.chain().focus().deleteRange({ from, to }).run()
      break
  }
}

function runSectionHandleAction(entryId: string, key: EditorHandleAction) {
  if (!editor.value) return

  if (gutterReadOnly.value && !['add-note', 'create-knowledge-relation', 'mark-excerpt', 'set-basis', 'section-ai-marking'].includes(key)) {
    return
  }

  if (isInsertBlockAction(key)) {
    const resolved = resolveSectionEntry(entryId)
    if (!resolved) return
    const insertPos = Math.min(resolved.entry.pos + 1, editor.value.state.doc.content.size - 1)
    insertExternalBlockAfterPos(key, insertPos)
    return
  }

  switch (key) {
    case 'add-note':
      emit('section-annotate', entryId)
      break
    case 'mark-excerpt':
      emit('section-mark-excerpt', entryId)
      break
    case 'set-basis':
      emit('section-set-basis', entryId)
      break
    case 'create-knowledge-relation':
      emit('section-create-knowledge-relation', entryId)
      break
    case 'mark-heading-source':
      emit('section-mark-heading-source', entryId)
      break
    case 'clear-heading-source':
      emit('section-clear-heading-source', entryId)
      break
    case 'edit-section-tags':
      emit('section-edit-section-tags', entryId)
      break
    case 'section-ai-marking':
      emit('section-ai-marking', entryId)
      break
    case 'cut':
    case 'copy':
    case 'duplicate':
    case 'clear-formatting':
    case 'delete': {
      const range = getSectionRange(entryId)
      if (!range) return
      const { from, to } = range
      if (key === 'cut') {
        const text = editor.value.state.doc.textBetween(from, to)
        navigator.clipboard.writeText(text).catch(() => {})
        editor.value.chain().focus().deleteRange({ from, to }).run()
      } else if (key === 'copy') {
        const text = editor.value.state.doc.textBetween(from, to)
        navigator.clipboard.writeText(text).catch(() => {})
      } else if (key === 'duplicate') {
        const slice = editor.value.state.doc.slice(from, to)
        const json = slice.toJSON()
        if (json) {
          const assignNewId = (node: Record<string, any>) => {
            if (node.attrs?.blockId) node.attrs.blockId = generateBlockId()
            if (node.content) node.content.forEach((child: Record<string, any>) => assignNewId(child))
          }
          assignNewId(json)
        }
        editor.value.chain().focus().insertContentAt(to, json).run()
      } else if (key === 'clear-formatting') {
        editor.value.chain().focus().setTextSelection({ from, to }).clearNodes().unsetAllMarks().run()
      } else if (key === 'delete') {
        editor.value.chain().focus().deleteRange({ from, to }).run()
      }
      break
    }
  }
}

const getSlashClientRect = (props: any) => {
  const rect = props.clientRect?.()
  if (rect) {
    slashMenuTop.value = rect.bottom + 8
    slashMenuLeft.value = rect.left
    return
  }
  slashMenuTop.value = 120
  slashMenuLeft.value = 120
}

const selectSlashOption = (option: (typeof insertOptions)[number]) => {
  if (!editor.value) return
  const range = currentSlashRange
  slashMenuVisible.value = false
  slashQuery.value = ''

  if (range) {
    editor.value.chain().focus().deleteRange(range).run()
  }
  insertExternalBlockAtSelection(option.key)
}

let currentSlashRange: { from: number; to: number } | null = null

function findClipboardImageFile(clipboard: DataTransfer | null): File | null {
  return findClipboardImageFileOnly(clipboard)
}

function writePageMetaToClipboard(view: { state: { doc: import('@tiptap/pm/model').Node; selection: { from: number; to: number } } }, event: Event) {
  const clipboardEvent = event as ClipboardEvent
  if (!clipboardEvent.clipboardData) return
  const { from, to } = view.state.selection
  const meta = collectPageMetaForRange(
    view.state.doc,
    from,
    to,
    sectionTagsMapRef?.value ?? {},
    sectionTagAnchorsRef?.value ?? {},
  )
  if (!meta) return
  clipboardEvent.clipboardData.setData(TU_PAGE_META_MIME, JSON.stringify(meta))
}

const editor = useEditor({
  content: resolveEditorContent(),
  editable: props.editable,
  autofocus: false,
  extensions: getTuEditorExtensions({
    annotations: flattenedAnnotations.value,
    getAnnotations: () => flattenedAnnotations.value,
    getAnnotationSideMarkersEnabled: () => props.annotationSideMarkers,
    onAnnotationClick: (payload) => emit('annotation-click', payload),
    onAnnotationsMapped: (annotations) => emit('annotations-mapped', annotations),
    onHeadingSourceClick: (binding, context) => emit('heading-source-click', binding, context),
    onBlockquoteExcerptClick: (binding, context) => emit('blockquote-excerpt-click', binding, context),
    getTocContext: () => tocCollectContext?.value ?? null,
    getFoldRevision: () => getSectionFoldRevision(),
    getSectionTagsMap: () => sectionTagsMapRef?.value ?? {},
    getSectionTagAnchors: () => sectionTagAnchorsRef?.value ?? {},
    getTextTagSpans: () => textTagSpansRef?.value ?? [],
    getActiveTagFilter: () => {
      void getTagFilterRevision()
      return getActiveTagFilter(workspaceStore.currentPageId)
        ?? activeTagFilter?.value
        ?? null
    },
    getFilterRevision: () => getTagFilterRevision() + (textTagSpanRevisionRef?.value ?? 0),
    getTextTagSpanRevision: () => textTagSpanRevisionRef?.value ?? 0,
    onTextTagSpanClick: (spanId) => emit('text-tag-span-click', spanId),
    onTextTagSpansMapped: (spans) => emit('text-tag-spans-mapped', spans),
    getSchemaExtensions: () => getTuEditorSchemaExtensions(),
    insertOptions,
    slashSuggestion: {
      items: ({ query }: { query: string }) => {
        const keyword = query.trim().toLowerCase()
        if (!keyword) return insertOptions
        return insertOptions.filter((option) => (
          option.label.toLowerCase().includes(keyword)
          || option.key.includes(keyword)
          || option.keywords.some((item) => item.includes(keyword))
        ))
      },
      render: () => ({
        onStart: (props: any) => {
          currentSlashRange = props.range
          slashQuery.value = props.query ?? ''
          slashMenuVisible.value = true
          getSlashClientRect(props)
        },
        onUpdate: (props: any) => {
          currentSlashRange = props.range
          slashQuery.value = props.query ?? ''
          slashMenuVisible.value = true
          getSlashClientRect(props)
        },
        onKeyDown: (props: any) => {
          if (props.event.key === 'Escape') {
            slashMenuVisible.value = false
            slashQuery.value = ''
            currentSlashRange = null
            return true
          }
          if (props.event.key === 'Enter' && filteredSlashOptions.value[0]) {
            selectSlashOption(filteredSlashOptions.value[0])
            return true
          }
          return false
        },
        onExit: () => {
          slashMenuVisible.value = false
          slashQuery.value = ''
          currentSlashRange = null
        },
      }),
    },
  }),
  editorProps: {
    attributes: {
      class: 'tu-editor-content',
      spellcheck: 'false',
    },
    transformPastedHTML(html) {
      return sanitizePastedHtml(html)
    },
    handleDOMEvents: {
      copy(view, event) {
        writePageMetaToClipboard(view, event)
        return false
      },
      cut(view, event) {
        writePageMetaToClipboard(view, event)
        return false
      },
    },
    handlePaste: (_view, event) => {
      if (!props.editable || !editor.value) return false

      const html = event.clipboardData?.getData('text/html') ?? ''
      const plain = event.clipboardData?.getData('text/plain') ?? ''
      const pageMeta = parsePageClipboardMeta(event.clipboardData?.getData(TU_PAGE_META_MIME))

      if (isHeadingPasteContext(editor.value) && plain && !html.trim()) {
        pastePlainTextInHeading(editor.value, plain)
        return true
      }

      if (html.trim() || (plain.trim() && /<[a-z][\s\S]*>/i.test(plain))) {
        const sourceHtml = html.trim()
          ? resolveClipboardHtmlSource(html, plain)
          : plain.trim()
        const handled = insertHtmlFromClipboard(editor.value, sourceHtml, getTuEditorSchemaExtensions())
        if (handled) {
          if (pageMeta) emit('page-meta-paste', pageMeta)
          return true
        }
        return false
      }

      const imageFile = findClipboardImageFile(event.clipboardData)
      if (imageFile) {
        void uploadFile(imageFile)
          .then((result) => {
            if (result.url) {
              editor.value?.chain().focus().setImage({ src: result.url }).run()
            }
          })
          .catch((error: unknown) => {
            console.error('[TuEditor] image upload failed', error)
          })
        return true
      }
      return false
    },
    handleKeyDown: (view, event) => {
      if ((event.key === 'Delete' || event.key === 'Backspace') && lassoSelectedBlockIds.value.size > 0) {
        deleteLassoSelected()
        return true
      }
      return false
    },
  },
  onCreate: () => {
    isInternalUpdate = false
    if (editor.value) {
      editor.value.view.dom.addEventListener('mousemove', handleEditorMouseMove)
      editor.value.view.dom.addEventListener('mousemove', handleEditorUrlMouseMove)
      editor.value.view.dom.addEventListener('mouseleave', handleEditorMouseLeave)
      editor.value.view.dom.addEventListener('mouseleave', handleEditorUrlMouseLeave)
      editor.value.view.dom.addEventListener('mousedown', handleEditorMouseDown)
      document.addEventListener('mouseup', handleDocumentMouseUp, true)
      document.addEventListener('keydown', handleDocumentKeyDown)

      // nextTick so the template ref editorEl is available
      nextTick(() => {
        editorEl.value?.addEventListener('mousedown', handleLassoStart, { capture: true })
        editorEl.value?.addEventListener('mousemove', handleWrapperMouseMove)
      })

      lastDocSignature = getDocSignature()

      scrollContainer = editor.value.view.dom.closest('.content-scroll') as HTMLElement | null
      if (scrollContainer) {
        scrollContainer.addEventListener('scroll', handleScrollInEditor, { passive: true })
      }
    }
  },
  onUpdate: ({ transaction }) => {
    if (isInternalUpdate || !editor.value) return
    if (transaction.getMeta(HEADING_SECTION_FOLD_META)) return
    const currentSignature = getDocSignature()
    if (currentSignature === lastDocSignature) return
    lastDocSignature = currentSignature
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      if (!isMounted || !editor.value) return
      emitEditorContent()
    }, 300)
  },
  onSelectionUpdate: () => {
    if (!isMounted || !editor.value) return
    const { empty, from, to } = editor.value.state.selection
    const payload = empty ? null : getAnnotationSelectionPayload(editor.value.state.doc, from, to)
    const text = payload?.selectedText ?? ''
    const spanned = empty ? { ids: [], metadata: [] } : collectSelectionBlockInfo(from, to)
    emit('selection-change', !empty, text, from, to, payload?.blockId ?? getBlockIdAtPos(from), spanned.ids.length ? spanned.ids : undefined, spanned.metadata.length ? spanned.metadata : undefined)
  },
})

watch(
  () => props.document,
  (newDoc, oldDoc) => {
    if (!editor.value) return
    if (newDoc === oldDoc) return
    if (!newDoc || newDoc.type !== 'doc') return
    if (skipNextContentSync) {
      skipNextContentSync = false
      return
    }
    applyExternalDocument(newDoc)
  },
)

watch(
  () => props.blocks,
  (newBlocks, oldBlocks) => {
    if (!editor.value) return
    if (props.document?.type === 'doc') return
    if (newBlocks === oldBlocks) return
    // If the change originated from our own emit, skip redundant setContent
    // (the editor already has the correct content)
    if (skipNextContentSync) {
      skipNextContentSync = false
      return
    }
    isInternalUpdate = true
    try {
      const content = blocksToTipTap(newBlocks)
      // If the rebuilt doc spec matches the live doc, skip setContent. The
      // round-trip through tipTapToBlocks → blocksToTipTap normalizes attrs
      // the same way Tiptap does, so the comparison stays meaningful even
      // when ProseMirror would have stripped unknown attrs on parse. Without
      // this guard, every metadata-only blocks reassignment (tags, annotation
      // remap, etc.) tears down and rebuilds the doc, which is what made
      // interactive nodes like tables visibly rearrange after typing.
      const liveDocJson = editor.value.getJSON()
      const liveSpec = blocksToTipTap(tipTapToBlocks(liveDocJson, newBlocks))
      if (JSON.stringify(content) === JSON.stringify(liveSpec)) {
        lastDocSignature = JSON.stringify(liveDocJson)
        return
      }
      // Capture caret state before setContent rebuilds the doc — without this,
      // ProseMirror's selection mapping over a full doc replace clamps the
      // caret to the doc end whenever the new structure differs even slightly
      // from the live one (e.g. table cells re-rendered from saved data).
      const prevSelection = editor.value.state.selection
      const wasFocused = editor.value.isFocused
      editor.value.commands.setContent(content, { emitUpdate: false })
      const docSize = editor.value.state.doc.content.size
      const from = Math.min(prevSelection.from, docSize)
      const to = Math.min(prevSelection.to, docSize)
      if (from <= docSize && to <= docSize && from >= 0) {
        try {
          editor.value.commands.setTextSelection({ from, to })
        } catch {
          // Position may land inside a non-text node after the rebuild; let
          // Tiptap fall back to its default selection in that case.
        }
      }
      if (wasFocused) editor.value.commands.focus(undefined, { scrollIntoView: false })
      lastDocSignature = JSON.stringify(content)
    } finally {
      isInternalUpdate = false
    }
  },
)

watch(
  () => props.editable,
  (val) => {
    editor.value?.setEditable(val)
  },
)

watch(
  flattenedAnnotations,
  (annotations) => {
    if (!editor.value) return
    editor.value.view.dispatch(
      editor.value.state.tr.setMeta(annotationDecorationsKey, { annotations }),
    )
    editor.value.view.dispatch(
      editor.value.state.tr.setMeta(ANNOTATION_SIDE_MARKERS_META, true),
    )
  },
  { deep: true },
)

watch(
  () => props.annotationSideMarkers,
  () => {
    if (!editor.value) return
    editor.value.view.dispatch(
      editor.value.state.tr.setMeta(ANNOTATION_SIDE_MARKERS_META, true),
    )
  },
)

watch(
  () => textTagSpanRevisionRef?.value ?? 0,
  () => {
    if (!editor.value) return
    editor.value.view.dispatch(
      editor.value.state.tr.setMeta(textTagSpanDecorationsMetaKey, {
        spans: textTagSpansRef?.value ?? [],
      }),
    )
    editor.value.view.dispatch(editor.value.state.tr)
  },
)

watch(
  () => getTagFilterRevision(),
  () => {
    dispatchTagFilterRefresh(editor.value)
  },
)

watch(
  () => getActiveTagFilter(workspaceStore.currentPageId),
  () => {
    dispatchTagFilterRefresh(editor.value)
  },
)

watch(
  () => sectionTagsMapRef?.value,
  () => {
    dispatchTagFilterRefresh(editor.value)
  },
  { deep: true },
)

watch(
  () => sectionTagAnchorsRef?.value,
  () => {
    dispatchTagFilterRefresh(editor.value)
  },
  { deep: true },
)

watch(editorEl, (el, prev) => {
  prev?.removeEventListener('mousemove', handleWrapperMouseMove)
  el?.addEventListener('mousemove', handleWrapperMouseMove)
})

onMounted(() => {
  isMounted = true
})

onBeforeUnmount(() => {
  isMounted = false
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  if (scrollContainer) {
    scrollContainer.removeEventListener('scroll', handleScrollInEditor)
    scrollContainer = null
  }
  // Clean up lasso listeners if still attached
  document.removeEventListener('keydown', handleDocumentKeyDown)
  if (lassoListenersAttached) {
    lassoListenersAttached = false
    document.removeEventListener('mousemove', handleLassoMouseMove)
    document.removeEventListener('mouseup', handleLassoMouseUp)
  }
  if (editor.value) {
    try {
      const view = (editor.value as any).view
      if (view) {
        view.dom.removeEventListener('mousemove', handleEditorMouseMove)
        view.dom.removeEventListener('mousemove', handleEditorUrlMouseMove)
        view.dom.removeEventListener('mouseleave', handleEditorMouseLeave)
        view.dom.removeEventListener('mouseleave', handleEditorUrlMouseLeave)
        view.dom.removeEventListener('mousedown', handleEditorMouseDown)
        document.removeEventListener('mouseup', handleDocumentMouseUp, true)
        document.removeEventListener('keydown', handleDocumentKeyDown)
        editorEl.value?.removeEventListener('mousedown', handleLassoStart, { capture: true })
        editorEl.value?.removeEventListener('mousemove', handleWrapperMouseMove)
      }
    } catch {
      // view already destroyed by Tiptap internal cleanup
    }
  }
  editor.value?.destroy()
})

function findBlockPos(doc: any, blockId: string): number | null {
  let pos: number | null = null
  doc.descendants((node: any, p: number) => {
    if (node.attrs?.blockId === blockId) { pos = p; return false }
    return true
  })
  return pos
}

function clearUrlHoverTimer() {
  if (urlHoverTimer !== null) {
    clearTimeout(urlHoverTimer)
    urlHoverTimer = null
  }
}

function clearUrlHoverClearTimer() {
  if (urlHoverClearTimer !== null) {
    clearTimeout(urlHoverClearTimer)
    urlHoverClearTimer = null
  }
}

function emitUrlHoverTarget(target: UrlHoverTarget | null) {
  if (urlHoverTargetsEqual(lastUrlHoverTarget, target)) return
  lastUrlHoverTarget = target
  emit('url-hover-change', target)
}

function handleEditorUrlMouseMove(event: MouseEvent) {
  if (!props.editable || !editor.value || urlHoverSuppressed) return
  const resolved = resolveUrlHoverTarget(editor.value, event)
  if (!resolved) {
    clearUrlHoverTimer()
    if (!urlHoverClearTimer) {
      urlHoverClearTimer = setTimeout(() => {
        urlHoverClearTimer = null
        emitUrlHoverTarget(null)
      }, 200)
    }
    return
  }

  clearUrlHoverClearTimer()
  if (urlHoverTargetsEqual(lastUrlHoverTarget, resolved)) return

  clearUrlHoverTimer()
  urlHoverTimer = setTimeout(() => {
    urlHoverTimer = null
    emitUrlHoverTarget(resolved)
  }, 300)
}

function handleEditorUrlMouseLeave() {
  clearUrlHoverTimer()
  if (urlHoverClearTimer !== null) return
  urlHoverClearTimer = setTimeout(() => {
    urlHoverClearTimer = null
    emitUrlHoverTarget(null)
  }, 280)
}

function setUrlHoverSuppressed(value: boolean) {
  urlHoverSuppressed = value
  if (value) {
    clearUrlHoverTimer()
    clearUrlHoverClearTimer()
    emitUrlHoverTarget(null)
  }
}

async function resolvePageTitle(url: string): Promise<string> {
  try {
    const title = await fetchResourcePageTitle(url)
    if (title?.trim()) return title.trim()
  } catch {
    // ignore
  }
  return fallbackPageTitleFromUrl(url)
}

function buildInlineHoverTarget(
  ed: NonNullable<typeof editor.value>,
  from: number,
  to: number,
  url: string,
  displayMode: UrlDisplayMode,
  label?: string,
): UrlHoverTarget | null {
  try {
    const start = ed.view.coordsAtPos(from)
    const end = ed.view.coordsAtPos(to)
    const left = Math.min(start.left, end.left)
    const right = Math.max(start.right, end.right)
    const top = Math.min(start.top, end.top)
    const bottom = Math.max(start.bottom, end.bottom)
    return {
      kind: 'inline',
      url,
      displayMode: displayMode === 'title' ? 'title' : 'link',
      from,
      to,
      label: label ?? ed.state.doc.textBetween(from, to, ''),
      anchorRect: new DOMRect(left, top, right - left, bottom - top),
    }
  } catch {
    return null
  }
}

function buildIframeHoverTarget(
  ed: NonNullable<typeof editor.value>,
  blockId: string,
  url: string,
): UrlHoverTarget | null {
  const pos = findBlockPos(ed.state.doc, blockId)
  if (pos === null) return null
  const node = ed.state.doc.nodeAt(pos)
  const iframeHeight = Number(node?.attrs?.height) || URL_EMBED_DEFAULT_HEIGHT
  const dom = ed.view.nodeDOM(pos)
  if (!(dom instanceof HTMLElement)) return null
  const root = dom.querySelector('.url-embed-block-nv') as HTMLElement | null || dom
  return {
    kind: 'iframe',
    url,
    displayMode: 'iframe',
    from: 0,
    to: 0,
    blockId,
    iframeHeight,
    anchorRect: root.getBoundingClientRect(),
  }
}

function applyUrlEmbedHeight(blockId: string, height: number): UrlHoverTarget | null {
  const ed = editor.value
  if (!ed || !props.editable) return null
  const pos = findBlockPos(ed.state.doc, blockId)
  if (pos === null) return null
  const node = ed.state.doc.nodeAt(pos)
  if (!node || node.type.name !== 'urlEmbedBlock') return null
  const clamped = Math.min(URL_EMBED_MAX_HEIGHT, Math.max(URL_EMBED_MIN_HEIGHT, Math.round(height)))
  ed.view.dispatch(ed.state.tr.setNodeMarkup(pos, undefined, {
    ...node.attrs,
    height: clamped,
  }))
  flushContentChange()
  return buildIframeHoverTarget(ed, blockId, String(node.attrs.url || ''))
}

async function applyUrlDisplayMode(
  target: UrlHoverTarget,
  mode: UrlDisplayMode,
): Promise<UrlHoverTarget | null> {
  const ed = editor.value
  if (!ed || !props.editable) return null

  if (mode === 'iframe') {
    if (target.kind === 'iframe') return target
    const blockId = createUrlEmbedBlockId()
    ed.chain().focus()
      .deleteRange({ from: target.from, to: target.to })
      .insertContentAt(target.from, {
        type: 'urlEmbedBlock',
        attrs: { blockId, url: target.url, height: URL_EMBED_DEFAULT_HEIGHT },
      })
      .run()
    flushContentChange()
    return buildIframeHoverTarget(ed, blockId, target.url)
  }

  if (target.kind === 'iframe') {
    if (!target.blockId) return null
    const pos = findBlockPos(ed.state.doc, target.blockId)
    if (pos === null) return null
    const node = ed.state.doc.nodeAt(pos)
    if (!node) return null
    const titleText = mode === 'title'
      ? await resolvePageTitle(target.url)
      : target.url
    ed.chain().focus()
      .deleteRange({ from: pos, to: pos + node.nodeSize })
      .insertContentAt(pos, {
        type: 'paragraph',
        content: [{
          type: 'text',
          text: titleText,
          marks: [{
            type: 'link',
            attrs: {
              href: target.url,
              displayMode: mode === 'title' ? 'title' : 'link',
            },
          }],
        }],
      })
      .run()
    flushContentChange()
    const from = pos + 1
    const to = from + titleText.length
    return buildInlineHoverTarget(ed, from, to, target.url, mode, titleText)
  }

  const titleText = mode === 'title'
    ? await resolvePageTitle(target.url)
    : target.url

  ed.chain().focus()
    .deleteRange({ from: target.from, to: target.to })
    .insertContentAt(target.from, {
      type: 'text',
      text: titleText,
      marks: [{
        type: 'link',
        attrs: {
          href: target.url,
          displayMode: mode === 'title' ? 'title' : 'link',
        },
      }],
    })
    .run()
  flushContentChange()
  const from = target.from
  const to = from + titleText.length
  return buildInlineHoverTarget(ed, from, to, target.url, mode, titleText)
}

function duplicateBlock(blockId: string) {
  const ed = editor.value
  if (!ed) return
  const pos = findBlockPos(ed.state.doc, blockId)
  if (pos === null) return
  const node = ed.state.doc.nodeAt(pos)
  if (!node) return
  const to = pos + node.nodeSize
  const slice = ed.state.doc.slice(pos, to)
  const json = slice.toJSON()
  if (json) {
    const assignNewId = (n: Record<string, any>) => {
      if (n.attrs?.blockId) n.attrs.blockId = generateBlockId()
      if (n.content) n.content.forEach(assignNewId)
    }
    assignNewId(json)
  }
  ed.chain().focus().insertContentAt(to, json).run()
}

function findHeadingAtSelection(): { pos: number; node: import('@tiptap/pm/model').Node } | null {
  const ed = editor.value
  if (!ed) return null
  const { $from } = ed.state.selection
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth)
    if (node.type.name === 'heading') {
      return { pos: $from.before(depth), node }
    }
  }
  return null
}

defineExpose({
  editor,
  getSelectionAsMarkdown: () => {
    if (!editor.value) return ''
    const { from, to, empty } = editor.value.state.selection
    if (empty) return ''
    return editor.value.state.doc.textBetween(from, to, '\n')
  },
  getSelectionPosition: () => {
    if (!editorEl.value || !editor.value) return undefined
    const { from, to } = editor.value.state.selection
    if (from === to) return undefined
    try {
      const start = editor.value.view.coordsAtPos(from)
      const end = editor.value.view.coordsAtPos(to)
      return {
        top: Math.min(start.top, end.top),
        left: (start.left + end.left) / 2,
      }
    } catch {
      let rect: DOMRect | undefined
      editor.value.state.doc.nodesBetween(from, to, (node, pos) => {
        if (rect || !node.attrs?.blockId) return false
        const dom = editor.value?.view.nodeDOM(pos)
        if (dom instanceof HTMLElement) {
          rect = dom.getBoundingClientRect()
          return false
        }
        return true
      })
      const fallbackRect = rect
      if (!fallbackRect) return undefined
      return {
        top: fallbackRect.top,
        left: fallbackRect.left + fallbackRect.width / 2,
      }
    }
  },
  getSelectionJSON: () => {
    if (!editor.value) return null
    const { from, to, empty } = editor.value.state.selection
    if (empty) return null
    return editor.value.state.doc.slice(from, to).toJSON()
  },
  completePendingRefInsert,
  completePendingExternalResourceInsert,
  focus: () => editor.value?.commands.focus(),
  duplicateBlock,
  flushContentChange,
  isSelectionInHeading: () => Boolean(findHeadingAtSelection()),
  getHeadingSourceBindingAtSelection: () => {
    const found = findHeadingAtSelection()
    return (found?.node.attrs.sourceBinding as HeadingSourceBinding | null) ?? null
  },
  getHeadingTextAtSelection: () => findHeadingAtSelection()?.node.textContent.trim() || '',
  applyHeadingSourceBinding: (binding: HeadingSourceBinding) => {
    const found = findHeadingAtSelection()
    const ed = editor.value
    if (!found || !ed) return false
    const blockId = found.node.attrs.blockId || createHeadingBlockId()
    ed.chain().focus().command(({ tr }) => {
      tr.setNodeMarkup(found.pos, undefined, {
        ...found.node.attrs,
        blockId,
        sourceBinding: binding,
      })
      return true
    }).run()
    return true
  },
  applyHeadingBindingByBlockId: (blockId: string, binding: HeadingSourceBinding) => {
    const ed = editor.value
    if (!ed) return false
    let targetPos = -1
    let targetAttrs: Record<string, unknown> | null = null
    ed.state.doc.descendants((node, pos) => {
      if (node.type.name === 'heading' && node.attrs.blockId === blockId) {
        targetPos = pos
        targetAttrs = { ...(node.attrs as Record<string, unknown>) }
        return false
      }
      return true
    })
    if (targetPos < 0 || !targetAttrs) return false
    const attrs = targetAttrs as Record<string, unknown>
    const resolvedBlockId = String(attrs.blockId || blockId || createHeadingBlockId())
    ed.chain().command(({ tr }) => {
      tr.setNodeMarkup(targetPos, undefined, {
        ...attrs,
        blockId: resolvedBlockId,
        sourceBinding: binding,
      })
      return true
    }).run()
    return true
  },
  applyBlockquoteExcerptBindingByBlockId: (blockId: string, binding: HeadingSourceBinding) => {
    const ed = editor.value
    if (!ed) return false
    let targetPos = -1
    let targetAttrs: Record<string, unknown> | null = null
    ed.state.doc.descendants((node, pos) => {
      if (node.type.name === 'blockquote' && node.attrs.blockId === blockId) {
        targetPos = pos
        targetAttrs = { ...(node.attrs as Record<string, unknown>) }
        return false
      }
      return true
    })
    if (targetPos < 0 || !targetAttrs) return false
    const attrs = targetAttrs as Record<string, unknown>
    const resolvedBlockId = String(attrs.blockId || blockId || createBlockquoteBlockId())
    ed.chain().command(({ tr }) => {
      tr.setNodeMarkup(targetPos, undefined, {
        ...attrs,
        blockId: resolvedBlockId,
        excerptBinding: binding,
      })
      return true
    }).run()
    return true
  },
  clearBlockquoteExcerptBindingByBlockId: (blockId: string) => {
    const ed = editor.value
    if (!ed || !blockId) return false
    let targetPos = -1
    let targetAttrs: Record<string, unknown> | null = null
    ed.state.doc.descendants((node, pos) => {
      if (node.type.name === 'blockquote' && node.attrs.blockId === blockId) {
        targetPos = pos
        targetAttrs = { ...(node.attrs as Record<string, unknown>) }
        return false
      }
      return true
    })
    if (targetPos < 0 || !targetAttrs) return false
    ed.chain().command(({ tr }) => {
      tr.setNodeMarkup(targetPos, undefined, {
        ...(targetAttrs as Record<string, unknown>),
        excerptBinding: null,
      })
      return true
    }).run()
    return true
  },
  clearHeadingSourceBindingByBlockId: (blockId: string) => {
    const ed = editor.value
    if (!ed || !blockId) return false
    let targetPos = -1
    let targetAttrs: Record<string, unknown> | null = null
    ed.state.doc.descendants((node, pos) => {
      if (node.type.name === 'heading' && node.attrs.blockId === blockId) {
        targetPos = pos
        targetAttrs = { ...(node.attrs as Record<string, unknown>) }
        return false
      }
      return true
    })
    if (targetPos < 0 || !targetAttrs) return false
    ed.chain().command(({ tr }) => {
      tr.setNodeMarkup(targetPos, undefined, {
        ...(targetAttrs as Record<string, unknown>),
        sourceBinding: null,
      })
      return true
    }).run()
    return true
  },
  clearHeadingSourceBinding: () => {
    const found = findHeadingAtSelection()
    const ed = editor.value
    if (!found || !ed) return false
    ed.chain().focus().command(({ tr }) => {
      tr.setNodeMarkup(found.pos, undefined, {
        ...found.node.attrs,
        sourceBinding: null,
      })
      return true
    }).run()
    return true
  },
  applyUrlDisplayMode,
  applyUrlEmbedHeight,
  insertPdfExcerptBlock,
  insertPdfExcerptUsingExternalResourcePending,
  insertImageUsingExternalResourcePending,
  updatePdfExcerptBlock,
  updateCompareBlockSide,
  setUrlHoverSuppressed,
  showUrlHoverForInline: (from: number, to: number, url: string, displayMode: UrlDisplayMode = 'link', label?: string) => {
    const ed = editor.value
    if (!ed) return
    const target = buildInlineHoverTarget(ed, from, to, url, displayMode, label)
    if (target) emitUrlHoverTarget(target)
  },
})
</script>

<template>
  <div ref="editorEl" class="tu-editor-wrapper">
    <editor-content :editor="editor" />
    <HeadingSectionFoldGutter
      :editor="editor"
      :wrapper-el="editorEl"
      @section-gutter-hover="handleSectionGutterHover"
      @section-gutter-leave="(event) => handleSectionGutterLeave(event)"
      @section-handle-pointer-enter="onSectionHandlePointerEnter"
      @section-handle-pointer-leave="onSectionHandlePointerLeave"
    />
    <div
      v-if="slashMenuVisible && filteredSlashOptions.length > 0"
      class="slash-command-menu"
      :style="{ top: `${slashMenuTop}px`, left: `${slashMenuLeft}px` }"
      @mousedown.prevent
    >
      <button
        v-for="option in filteredSlashOptions"
        :key="option.key"
        type="button"
        class="slash-command-menu__item"
        @click="selectSlashOption(option)"
      >
        <span class="slash-command-menu__icon">{{ option.icon }}</span>
        <span class="slash-command-menu__label">{{ option.label }}</span>
      </button>
    </div>
    <HoverHandle
      v-if="hoverHandle && handleVisible && editor"
      ref="hoverHandleRef"
      :items="activeHandleItems"
      :style="handlePositionStyle"
      :menu-min-width="'140px'"
      :menu-gap="4"
      @select="(key: string) => handleHandleSelect(key as EditorHandleAction)"
      @menu-visibility-change="handleHandleMenuVisibilityChange"
      @mouseenter="onHoverHandleEnter"
      @mouseleave="onHoverHandleLeave"
      @grip-enter="onHoverHandleGripEnter"
      @grip-leave="onHoverHandleGripLeave"
    />
    <div
      v-if="hoverHighlightBox"
      class="section-hover-highlight-overlay"
      :style="{
        top: `${hoverHighlightBox.top}px`,
        left: `${hoverHighlightBox.left}px`,
        width: `${hoverHighlightBox.width}px`,
        height: `${hoverHighlightBox.height}px`,
      }"
    />
    <div
      v-if="lassoRect"
      class="lasso-selection-rect"
      :style="{
        left: `${lassoRect.left}px`,
        top: `${lassoRect.top}px`,
        width: `${lassoRect.width}px`,
        height: `${lassoRect.height}px`,
      }"
      @mousedown.prevent
      @mouseup.stop
    />
  </div>
</template>

<style scoped>
.tu-editor-wrapper {
  position: relative;
  width: 100%;
  min-height: 200px;
  --tiptap-handle-gutter: 44px;
}

.tu-editor-wrapper :deep(.tu-editor-content) {
  outline: none;
  min-height: 200px;
  padding: 8px 28px 8px 0;
  line-height: 1.7;
  font-size: 15px;
  color: #333;
  box-sizing: border-box;
}

.tu-editor-wrapper :deep(.tu-editor-content p) {
  margin: 0.5em 0;
}

/* Global reset in base.css sets * { font-weight: normal } — restore rich-text marks */
.tu-editor-wrapper :deep(.tu-editor-content strong),
.tu-editor-wrapper :deep(.tu-editor-content b) {
  font-weight: 700;
}

.tu-editor-wrapper :deep(.tu-editor-content em),
.tu-editor-wrapper :deep(.tu-editor-content i) {
  font-style: italic;
}

.tu-editor-wrapper :deep(.tu-editor-content u) {
  text-decoration: underline;
}

.tu-editor-wrapper :deep(.tu-editor-content s),
.tu-editor-wrapper :deep(.tu-editor-content strike),
.tu-editor-wrapper :deep(.tu-editor-content del) {
  text-decoration: line-through;
}

.tu-editor-wrapper :deep(.tu-editor-content h1),
.tu-editor-wrapper :deep(.tu-editor-content h2),
.tu-editor-wrapper :deep(.tu-editor-content h3),
.tu-editor-wrapper :deep(.tu-editor-content h4),
.tu-editor-wrapper :deep(.tu-editor-content h5),
.tu-editor-wrapper :deep(.tu-editor-content h6) {
  margin: 1em 0 0.5em;
  font-weight: 600;
  line-height: 1.3;
}

.tu-editor-wrapper :deep(.heading-section--collapsed) {
  display: none !important;
}

.section-hover-highlight-overlay {
  position: fixed;
  z-index: 4;
  pointer-events: none;
  border-radius: 8px;
  background: rgba(22, 119, 255, 0.08);
  box-shadow: inset 3px 0 0 #1677ff;
}

.tu-editor-wrapper :deep(.tag-filter--hidden) {
  display: none !important;
}

.tu-editor-wrapper :deep(.tag-filter--hidden-inline) {
  display: none !important;
}

.tu-editor-wrapper :deep(.tu-text-tag-span) {
  border-bottom: 2px solid var(--tu-text-tag-color, #1677ff);
  border-radius: 2px;
}

.tu-editor-wrapper :deep(.heading-section--collapsed-embed .ref-page-content),
.tu-editor-wrapper :deep(.heading-section--collapsed-embed .ref-block-card__content),
.tu-editor-wrapper :deep(.heading-section--collapsed-embed .external-resource-card__excerpt-editor) {
  display: none !important;
}

.tu-editor-wrapper :deep(.heading-section--embed-section-collapsed) {
  display: none !important;
}

.tu-editor-wrapper :deep(.tu-editor-content h1) { font-size: 2em; }
.tu-editor-wrapper :deep(.tu-editor-content h2) { font-size: 1.5em; }
.tu-editor-wrapper :deep(.tu-editor-content h3) { font-size: 1.25em; }
.tu-editor-wrapper :deep(.tu-editor-content h4) { font-size: 1.1em; }

.tu-editor-wrapper :deep(.heading-section-meta) {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  width: 100%;
  margin: 2px 0 8px;
  padding: 4px 8px;
  border: 1px solid #bae6fd;
  border-radius: 6px;
  background: #f0f9ff;
  color: #0369a1;
  font-size: 11px;
  line-height: 1.4;
  text-align: left;
  box-sizing: border-box;
}

.tu-editor-wrapper :deep(button.heading-section-meta) {
  cursor: pointer;
}

.tu-editor-wrapper :deep(button.heading-section-meta:hover) {
  background: #e0f2fe;
}

.tu-editor-wrapper :deep(.heading-section-meta--ai) {
  border-color: #93c5fd;
}

.tu-editor-wrapper :deep(.heading-section-meta__chip) {
  display: inline-block;
  max-width: min(100%, 240px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 1px 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.75);
}

.tu-editor-wrapper :deep(.heading-section-meta__ai) {
  padding: 0 4px;
  border-radius: 4px;
  background: #1677ff;
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  line-height: 14px;
}

.tu-editor-wrapper :deep(.heading-section-meta__tag) {
  display: inline-block;
  max-width: min(100%, 160px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 1px 6px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--tag-chip-color, #1677ff) 35%, #fff);
  background: color-mix(in srgb, var(--tag-chip-color, #1677ff) 12%, #fff);
  color: color-mix(in srgb, var(--tag-chip-color, #1677ff) 75%, #000);
}

.tu-editor-wrapper :deep(.heading-section-meta__tag-more) {
  color: #64748b;
  font-size: 11px;
}

/* 兼容旧选择器 / e2e：来源元数据条同时带 heading-source-badge */
.tu-editor-wrapper :deep(.heading-source-badge.heading-section-meta) {
  max-width: none;
  white-space: normal;
}

.tu-editor-wrapper :deep(.blockquote-excerpt-meta) {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  width: 100%;
  margin: 0 0 6px;
  padding: 4px 8px;
  border: 1px solid #bae6fd;
  border-radius: 6px;
  background: #f0f9ff;
  color: #0369a1;
  font-size: 11px;
  line-height: 1.4;
  cursor: pointer;
  text-align: left;
}

.tu-editor-wrapper :deep(.blockquote-excerpt-meta:hover) {
  background: #e0f2fe;
}

.tu-editor-wrapper :deep(.blockquote-excerpt-meta__chip) {
  display: inline-block;
  max-width: min(100%, 240px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 1px 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.75);
}

.tu-editor-wrapper :deep(.blockquote-excerpt-meta__ai) {
  margin-left: 2px;
  padding: 0 4px;
  border-radius: 4px;
  background: #0284c7;
  color: #fff;
  font-size: 9px;
  font-weight: 700;
}

.tu-editor-wrapper :deep(.ProseMirror > p) {
  position: relative;
}

.tu-editor-wrapper :deep(.annotation-side-marker) {
  float: right;
  position: relative;
  z-index: 2;
  margin: 0 0 4px 8px;
  padding: 1px 8px;
  border: 1px solid #fcd34d;
  border-radius: 999px;
  background: #fffbeb;
  color: #92400e;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.4;
  cursor: pointer;
  white-space: nowrap;
}

.tu-editor-wrapper :deep(.annotation-side-marker:hover) {
  background: #fef3c7;
}

.tu-editor-wrapper :deep(.tu-tiptap-annotation--ai) {
  outline: 1px dashed #1677ff;
}

.tu-editor-wrapper :deep(.tu-tiptap-annotation--basis.tu-tiptap-annotation--ai) {
  box-shadow: 0 0 0 2px rgba(22, 119, 255, 0.35) !important;
}

.tu-editor-wrapper :deep(.tu-editor-content ul),
.tu-editor-wrapper :deep(.tu-editor-content ol) {
  padding-left: 1.5em;
  margin: 0.5em 0;
}

.tu-editor-wrapper :deep(.tu-editor-content blockquote) {
  border-left: 3px solid #e0e0e0;
  padding-left: 1em;
  margin: 0.5em 0;
  color: #666;
}

.tu-editor-wrapper :deep(.tu-editor-content code) {
  background: #f5f5f5;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 0.9em;
}

.tu-editor-wrapper :deep(.tu-editor-content pre:not(.tu-code-block-view__pre)) {
  background: #f5f5f5;
  padding: 1em;
  border-radius: 8px;
  overflow-x: auto;
  margin: 0.5em 0;
}

.tu-editor-wrapper :deep(.tu-editor-content pre:not(.tu-code-block-view__pre) code) {
  background: none;
  padding: 0;
}

.tu-editor-wrapper :deep(.tu-editor-content img) {
  max-width: 100%;
  height: auto;
  border-radius: 4px;
}

.tu-editor-wrapper :deep(.tu-editor-content a) {
  color: #1677ff;
  text-decoration: underline;
}

.tu-editor-wrapper :deep(.tu-tiptap-selection-retained) {
  background: rgba(22, 119, 255, 0.22);
}

.tu-editor-wrapper :deep(.tu-editor-content hr) {
  border: none;
  border-top: 1px solid #e0e0e0;
  margin: 1em 0;
}

.tu-editor-wrapper :deep(.tu-editor-content table) {
  border-collapse: collapse;
  width: 100%;
  margin: 0.5em 0;
}

.tu-editor-wrapper :deep(.tu-editor-content th),
.tu-editor-wrapper :deep(.tu-editor-content td) {
  border: 1px solid #e0e0e0;
  padding: 8px 12px;
  text-align: left;
}

.tu-editor-wrapper :deep(.tu-editor-content th) {
  background: #f5f5f5;
  font-weight: 600;
}

.tu-editor-wrapper :deep(.is-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  float: left;
  color: #adb5bd;
  pointer-events: none;
  height: 0;
}

.slash-command-menu {
  position: fixed;
  z-index: 1000003;
  display: flex;
  flex-direction: column;
  min-width: 190px;
  max-width: min(280px, calc(100vw - 24px));
  max-height: min(360px, calc(100vh - 24px));
  overflow: auto;
  padding: 6px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 16px 36px rgba(15, 23, 42, 0.14);
}

.slash-command-menu__item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #1f2937;
  cursor: pointer;
  text-align: left;
  font-size: 14px;
}

.slash-command-menu__item:hover {
  background: #f0f7ff;
  color: #0958d9;
}

.slash-command-menu__icon {
  width: 20px;
  text-align: center;
}

.slash-command-menu__label {
  flex: 1;
  min-width: 0;
}

.lasso-selection-rect {
  position: fixed;
  z-index: 1000000;
  pointer-events: none;
  background: rgba(22, 119, 255, 0.06);
  border: 1px solid rgba(22, 119, 255, 0.35);
  border-radius: 3px;
}
</style>

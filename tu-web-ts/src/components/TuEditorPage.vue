<script setup lang="ts">
import { ref, reactive, watch, computed, onMounted, onBeforeUnmount, nextTick, provide } from 'vue'
import { useRouter } from 'vue-router'
import type { Block, BlockTag, EmbeddedObject, ExternalResourceEmbedData, HeadingSourceBinding, PageContent, TextAnnotation, TextTagSpan, SpannedBlockInfo } from '@/api/types'
import type { JSONContent } from '@tiptap/core'
import { tipTapToBlocks } from '@/editor/converters'
import { resolvePageDocument, toV2PageContent } from '@/editor/pageDocument'
import TuEditor from './TuEditor.vue'
import TocTreeList from './TocTreeList.vue'
import SelectionToolbar from './SelectionToolbar.vue'
import UrlHoverToolbar from './UrlHoverToolbar.vue'
import BlockPicker from './BlockPicker.vue'
import ExternalResourcePicker from './ExternalResourcePicker.vue'
import PdfExcerptPicker, { type PdfExcerptPickerMode, type PdfExcerptSelection } from './PdfExcerptPicker.vue'
import BlockMetadataTagEditor from './BlockMetadataTagEditor.vue'
import PageTagsBar from './PageTagsBar.vue'
import TagFilterBar from './TagFilterBar.vue'
import Toast from './Toast.vue'
import NoteEditor from './NoteEditor.vue'
import NotePopover from './NotePopover.vue'
import KnowledgePointPicker from './KnowledgePointPicker.vue'
import KnowledgeRelationList from './KnowledgeRelationList.vue'
import { useExpandCollapse } from '@/composables/useExpandCollapse'
import { useAnchoredFloating, type FloatingAnchorRect } from '@/composables/useAnchoredFloating'
import { useViewportClampedFixedPanel } from '@/utils/viewportPanel'
import { blockSyncManager } from '@/utils/blockSyncManager'
import { useWorkspaceStore } from '@/stores/workspace'
import { normalizeBlockTags } from '@/utils/blockMetadata'
import { getPageTags } from '@/utils/pageMetadata'
import {
  collectValidSectionTagKeys,
  ensureSectionTagAnchorsForFlat,
  findLocalSectionEntryForTagKey,
  getLocalSectionTagLookupKeys,
  getSectionTagAnchors,
  getSectionTagKey,
  getSectionTags,
  listSectionHeadingBlockIdSyncs,
  pruneOrphanSectionTags,
  reconcileOrphanSectionTagKeys,
  setSectionTagAnchor,
  setSectionTagsInMetadata,
  sectionTagsMapFromMetadata,
  buildSectionTagsByEntryId,
  collectSectionTagsFromMetadata,
} from '@/utils/sectionMetadata'
import { collectFilterableTagsOnPage } from '@/utils/tagFilter'
import { dispatchTagFilterRefresh } from '@/utils/tagFilterRefresh'
import {
  collectTextTagSpanTags,
  createTextTagSpanFromSelection,
  findTextTagSpanAtRange,
  getTextTagSpans,
  removeTextTagSpan,
  resolveTextTagSpan,
  setTextTagSpansInMetadata,
  upsertTextTagSpan,
} from '@/utils/textTagSpanMetadata'
import { collectAvailableTags, fetchKbTagPool } from '@/utils/tagPool'
import {
  clearTagFilterSession,
  getActiveTagFilter,
  getTagFilterRevision,
  setActiveTagFilter,
} from '@/stores/tagFilterSession'
import { createHeadingBlockId } from '@/utils/headingSource'
import { registerExternalUrlFromPaste } from '@/api/externalResource'
import { parseExternalUrl } from '@/utils/externalUrlResource'
import { getAnnotationSelectionPayload } from '@/editor/annotationText'
import { useBlockRegistryStore } from '@/stores/blockRegistry'
import { useOutlineCacheStore } from '@/stores/outlineCache'
import { clearSectionFoldSession } from '@/stores/sectionFoldSession'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import {
  buildHeadingTree,
  type FlatTocEntry,
  type TocTreeItem,
} from '@/utils/toc/headings'
import { collectFlatTocEntries, type TocCollectContext } from '@/utils/toc/collectFlatTocEntries'
import { resolveRefGroupSectionEntry, resolveSectionEntryAtEditor } from '@/utils/sectionTocResolve'
import { getBlockExcerptContent, getTocEntryExcerptContent, collectBasisBlockIds, collectTocEntryBasisBlockIds } from '@/utils/blockExcerptContent'
import { HEADING_SECTION_FOLD_META } from '@/utils/toc/tocSectionFoldActions'
import { isMindmapBlueprint } from '@/components/x6'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { KnowledgeAnchor } from '@/api/types'
import {
  buildBlockAnchor,
  buildSelectionAnchor,
  headingAnchor,
  sectionAnchor,
  type KnowledgeAnchorNavigateHandlers,
} from '@/utils/knowledgeAnchor'
import type { GraphData } from '@/api/types'
import type { UrlHoverTarget } from '@/editor/urlHoverTarget'
import type { UrlDisplayMode } from '@/utils/urlDisplay'
import { PDF_EXCERPT_SCROLL_EVENT, PDF_EXCERPT_DEFAULT_HEIGHT, parsePdfExcerptViewMode } from '@/utils/pdfExcerpt'

type TocItem = TocTreeItem
const NODEVIEW_TYPES = ['x6Block', 'tableBlock', 'multiTableBlock', 'timelineBlock', 'spacerBlock', 'refBlock', 'externalResourceBlock', 'pdfExcerptBlock']

const nodeViewToolbar = reactive({
  visible: false,
  blockId: '',
  sourceType: '',
  refId: '',
  canAddNote: false,
  canPromoteToPage: false,
  isMindmapEmbed: false,
})

const EMBED_TOC_SOURCE_TYPES = new Set(['refBlock', 'externalResourceBlock'])

const tocSettingsPopover = reactive({
  visible: false,
  top: 0,
  left: 0,
})

const tocSettingsForm = reactive({
  titleLevel: 0,
  hideTitle: false,
})

const hideNodeViewToolbar = () => {
  nodeViewToolbar.visible = false
  nodeViewToolbar.canAddNote = false
  nodeViewToolbar.canPromoteToPage = false
  nodeViewToolbar.isMindmapEmbed = false
  tocSettingsPopover.visible = false
}

const getNodeViewToolbarAnchor = (): FloatingAnchorRect | null => {
  if (!nodeViewToolbar.blockId) return null
  const editorDom = tuEditorRef.value?.editor?.view.dom
  const nodeView = editorDom?.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(nodeViewToolbar.blockId)}"]`)
  return nodeView?.getBoundingClientRect() ?? null
}

const {
  position: nodeViewToolbarPosition,
  updatePosition: updateNodeViewToolbarPosition,
} = useAnchoredFloating({
  visible: computed({
    get: () => nodeViewToolbar.visible,
    set: (value) => { nodeViewToolbar.visible = value },
  }),
  getAnchorRect: getNodeViewToolbarAnchor,
  placement: 'top',
  offset: 40,
})

const deleteSelectedNodeView = () => {
  const editor = tuEditorRef.value?.editor
  if (editor && nodeViewToolbar.blockId) {
    editor.commands.deleteBlock(nodeViewToolbar.blockId)
  }
  hideNodeViewToolbar()
}

const duplicateSelectedNodeView = () => {
  if (nodeViewToolbar.blockId) {
    tuEditorRef.value?.duplicateBlock?.(nodeViewToolbar.blockId)
  }
  hideNodeViewToolbar()
}

const navigateToReferencedPage = async () => {
  if (nodeViewToolbar.refId) {
    hideNodeViewToolbar()
    await workspaceStore.selectPage(nodeViewToolbar.refId)
  }
}

const promoteSelectedEmbedToPage = async () => {
  const pageId = workspaceStore.currentPageId
  const blockId = nodeViewToolbar.blockId
  if (!pageId || !blockId) return

  const label = nodeViewToolbar.isMindmapEmbed ? '思维导图页' : '画板页'
  try {
    await ElMessageBox.confirm(
      `将此块升级为独立${label}？升级后将从当前文档中移除该块。`,
      '升级为独立页面',
      {
        confirmButtonText: '升级',
        cancelButtonText: '取消',
        type: 'info',
      },
    )
    hideNodeViewToolbar()
    await workspaceStore.promoteEmbedToPage(pageId, blockId)
    ElMessage.success(`已升级为${label}`)
  } catch {
    // cancelled
  }
}

const findEmbedNodeByBlockId = (blockId: string): { pos: number; node: ProseMirrorNode } | null => {
  const editor = tuEditorRef.value?.editor
  if (!editor || !blockId) return null
  let found: { pos: number; node: ProseMirrorNode } | null = null
  editor.state.doc.descendants((node, pos) => {
    if (node.attrs?.blockId === blockId && EMBED_TOC_SOURCE_TYPES.has(node.type.name)) {
      found = { pos, node }
      return false
    }
    return true
  })
  return found
}

const supportsEmbedTocSettings = (sourceType: string) => EMBED_TOC_SOURCE_TYPES.has(sourceType)

const readEmbedTocSettings = (blockId: string) => {
  const found = findEmbedNodeByBlockId(blockId)
  if (!found) return { titleLevel: 0, hideTitle: false }
  const metadata = (found.node.attrs?.metadata || {}) as { tocSettings?: { titleLevel?: number; hideTitle?: boolean } }
  const tocSettings = metadata.tocSettings || {}
  return {
    titleLevel: Number(found.node.attrs?.headingLevel ?? tocSettings.titleLevel ?? 0),
    hideTitle: Boolean(tocSettings.hideTitle),
  }
}

const openTocSettingsPopover = () => {
  if (!EMBED_TOC_SOURCE_TYPES.has(nodeViewToolbar.sourceType)) return
  const settings = readEmbedTocSettings(nodeViewToolbar.blockId)
  tocSettingsForm.titleLevel = settings.titleLevel
  tocSettingsForm.hideTitle = settings.hideTitle
  tocSettingsPopover.visible = true
  nextTick(() => {
    const toolbar = document.querySelector('.nodeview-toolbar')
    const rect = toolbar?.getBoundingClientRect()
    if (rect) {
      tocSettingsPopover.top = rect.bottom + 8
      tocSettingsPopover.left = rect.left
    }
  })
}

const closeTocSettingsPopover = () => {
  tocSettingsPopover.visible = false
}

const applyTocSettings = () => {
  const editor = tuEditorRef.value?.editor
  const blockId = nodeViewToolbar.blockId
  if (!editor || !blockId) return

  const found = findEmbedNodeByBlockId(blockId)
  if (!found) return

  const existingMetadata = { ...(found.node.attrs?.metadata as Record<string, unknown> || {}) }
  const hideTitle = nodeViewToolbar.sourceType === 'refBlock' && tocSettingsForm.hideTitle
  const titleLevel = hideTitle ? 0 : tocSettingsForm.titleLevel

  editor.chain().focus().command(({ tr, dispatch }) => {
    if (!dispatch) return true
    tr.setNodeMarkup(found!.pos, undefined, {
      ...found!.node.attrs,
      headingLevel: titleLevel,
      metadata: {
        ...existingMetadata,
        tocSettings: {
          titleLevel,
          hideTitle,
        },
      },
    })
    return true
  }).run()

  closeTocSettingsPopover()
}

const handleBlockClick = (blockId: string, event: MouseEvent) => {
  const editor = tuEditorRef.value?.editor
  if (!editor) return

  // Find block type from editor doc
  let typeName = ''
  editor.state.doc.descendants((node) => {
    if (node.attrs?.blockId === blockId) {
      typeName = node.type.name
      return false
    }
    return true
  })
  if (!NODEVIEW_TYPES.includes(typeName)) return

  const nodeViewEl = (event.target as HTMLElement).closest('[data-block-id]')
  if (!nodeViewEl) return
  nodeViewToolbar.canAddNote = canAddNoteFromSelection.value
  nodeViewToolbar.blockId = blockId
  nodeViewToolbar.sourceType = typeName
  nodeViewToolbar.refId = ''
  nodeViewToolbar.canPromoteToPage = false
  nodeViewToolbar.isMindmapEmbed = false
  if (typeName === 'x6Block') {
    editor.state.doc.descendants((node) => {
      if (node.attrs?.blockId === blockId) {
        const graphData = node.attrs.graphData as GraphData | undefined
        nodeViewToolbar.canPromoteToPage = true
        nodeViewToolbar.isMindmapEmbed = isMindmapBlueprint(graphData)
        return false
      }
      return true
    })
  }
  if (typeName === 'refBlock') {
    editor.state.doc.descendants((node) => {
      if (node.attrs?.blockId === blockId && node.attrs?.refId) {
        nodeViewToolbar.refId = node.attrs.refId
        return false
      }
      return true
    })
  }
  nodeViewToolbar.visible = true
  updateNodeViewToolbarPosition()
}

const handleToolbarDocClick = (e: MouseEvent) => {
  const toolbar = document.querySelector('.nodeview-toolbar')
  const tocPopover = document.querySelector('.toc-settings-popover')
  if (toolbar?.contains(e.target as Node)) return
  if (tocPopover?.contains(e.target as Node)) return
  if ((e.target as HTMLElement).closest('[data-block-id]')) return
  hideNodeViewToolbar()
}
const handleToolbarKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') hideNodeViewToolbar()
}

watch(() => nodeViewToolbar.visible, (visible, wasVisible) => {
  if (visible && !wasVisible) {
    nextTick(() => {
      document.addEventListener('click', handleToolbarDocClick)
      document.addEventListener('keydown', handleToolbarKeydown)
    })
  } else if (!visible && wasVisible) {
    document.removeEventListener('click', handleToolbarDocClick)
    document.removeEventListener('keydown', handleToolbarKeydown)
  }
})

const workspaceStore = useWorkspaceStore()
const router = useRouter()
const registryStore = useBlockRegistryStore()
const outlineCacheStore = useOutlineCacheStore()

interface Props {
  contentList: PageContent
  pageTitle?: string
  editable?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  pageTitle: '',
  editable: true,
})

const emit = defineEmits<{
  'content-change': [contentList: PageContent]
  'page-title-change': [title: string]
}>()

// --- Core state ---
const localDocument = ref<JSONContent | null>(null)
const localAnnotations = ref<TextAnnotation[]>([])
const localPageMetadata = ref<Record<string, unknown>>({})
const pageTitleDraft = ref('')
const pageTitleEditing = ref(false)
const tuEditorRef = ref<InstanceType<typeof TuEditor> | null>(null)
const showBlockPicker = ref(false)
const showResourcePicker = ref(false)
const showPdfExcerptPicker = ref(false)
const pdfExcerptPickerMode = ref<PdfExcerptPickerMode>('insert')
const pdfExcerptEditBlockId = ref('')
const pdfExcerptPickerInitial = ref<PdfExcerptSelection | null>(null)

function findPdfExcerptAttrsByBlockId(editor: import('@tiptap/core').Editor, blockId: string) {
  let attrs: Record<string, unknown> | undefined
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'pdfExcerptBlock' && node.attrs.blockId === blockId) {
      attrs = node.attrs as Record<string, unknown>
      return false
    }
    return true
  })
  return attrs
}
const resourcePickerMode = ref<'insert' | 'markExcerpt' | 'bindSource' | 'setBasis'>('insert')
const pendingResourceExcerptText = ref('')
const pendingResourceExcerptTitle = ref('')
const highlightedBlockId = ref<string | null>(null)
const tocExpanded = ref(true)

// TOC / tags: derive legacy Block[] from document for compatibility
const localBlocks = computed<Block[]>(() => {
  if (!localDocument.value) return []
  return tipTapToBlocks(localDocument.value, [])
})

// --- Selection state ---
const hasSelection = ref(false)
const selectedText = ref('')
const selectionBlockIndex = ref(-1)
const selectionBlockId = ref('')
const selectionFrom = ref(0)
const selectionTo = ref(0)
const selectionSpannedBlockIds = ref<string[]>([])
const selectionSpannedBlockMetadata = ref<SpannedBlockInfo[]>([])
const selectionStateVersion = ref(0)

const isSelectionInHeading = computed(() => {
  selectionStateVersion.value
  return tuEditorRef.value?.isSelectionInHeading?.() ?? false
})

const canAddNoteFromSelection = computed(() => {
  return hasSelection.value && (selectedText.value.trim().length > 0 || selectionSpannedBlockIds.value.length > 0)
})

const canMarkResourceExcerptFromSelection = computed(() => {
  return hasSelection.value && selectedText.value.trim().length > 0 && !isSelectionInHeading.value
})

const canSetExcerptBasisFromSelection = computed(() => canMarkResourceExcerptFromSelection.value)

const canMarkHeadingSourceFromSelection = computed(() => {
  return hasSelection.value && isSelectionInHeading.value
})

const canClearHeadingSourceFromSelection = computed(() => {
  selectionStateVersion.value
  return tuEditorRef.value?.getHeadingSourceBindingAtSelection?.() != null
    && (tuEditorRef.value?.isSelectionInHeading?.() ?? false)
    && hasSelection.value
})

const tocContextMenu = ref<{ visible: boolean; top: number; left: number; item: TocItem | null }>({
  visible: false,
  top: 0,
  left: 0,
  item: null,
})

const tocContextMenuSourcePoint = computed(() =>
  tocContextMenu.value.visible
    ? { x: tocContextMenu.value.left, y: tocContextMenu.value.top }
    : null,
)
const { panelRef: tocContextMenuRef, position: tocContextMenuPosition } = useViewportClampedFixedPanel({
  visible: computed(() => tocContextMenu.value.visible),
  getSourcePoint: () => tocContextMenuSourcePoint.value,
})

const getSelectionAnchor = (): FloatingAnchorRect | null => {
  const pos = tuEditorRef.value?.getSelectionPosition?.()
  if (!pos) return null
  return {
    top: pos.top,
    left: pos.left,
    right: pos.left,
    bottom: pos.top,
    width: 0,
    height: 0,
  }
}

// --- Toast ---
const toastMessages = ref<Array<{ id: string; message: string }>>([])
const toastEnabled = ref(true)

// --- Link popover ---
const linkPopoverVisible = ref(false)
const linkPopoverUrl = ref('')
const linkPopoverLabel = ref('')
const linkPopoverUrlInput = ref<HTMLInputElement | null>(null)

const {
  position: linkPopoverPosition,
  updatePosition: updateLinkPopoverPosition,
} = useAnchoredFloating({
  visible: linkPopoverVisible,
  getAnchorRect: getSelectionAnchor,
  placement: 'top',
  offset: 10,
})

// --- URL hover toolbar ---
const urlHoverTarget = ref<UrlHoverTarget | null>(null)
const urlHoverToolbarPinned = ref(false)
let urlHoverPinTimer: ReturnType<typeof setTimeout> | null = null
let urlHoverToolbarHovering = false

const urlHoverToolbarVisible = computed(() => Boolean(urlHoverTarget.value))

// --- Tag editor ---
type TagEditorScope = 'page' | 'block' | 'section' | 'text-span'
const tagEditorState = ref({
  visible: false,
  scope: 'page' as TagEditorScope,
  blockId: '',
  sectionKey: '',
  textSpanId: '',
  top: 0,
  left: 0,
})
const tagEditorBlockTags = ref<BlockTag[]>([])
const kbTagPool = ref<BlockTag[]>([])
const pendingTextTagSpan = ref<TextTagSpan | null>(null)
const textTagSpanRevision = ref(0)

// --- Note / Annotation ---
const noteEditorVisible = ref(false)
const editingAnnotation = ref<TextAnnotation | undefined>()
const pendingNoteBlockId = ref('')
const pendingNoteSelectedText = ref('')
const pendingNoteContextBefore = ref('')
const pendingNoteContextAfter = ref('')
const pendingNoteFrom = ref(0)
const pendingNoteTo = ref(0)
const pendingNoteSpannedBlockIds = ref<string[]>([])
const pendingNoteSpannedBlockMetadata = ref<SpannedBlockInfo[]>([])
const pendingNoteTags = ref<BlockTag[]>([])
const pendingTextTagSpanId = ref('')
let annotationPersistTimer: ReturnType<typeof setTimeout> | null = null

const urlHoverToolbarSuppressed = computed(() => (
  !props.editable
  || linkPopoverVisible.value
  || nodeViewToolbar.visible
  || showResourcePicker.value
  || showPdfExcerptPicker.value
  || noteEditorVisible.value
))

watch([urlHoverToolbarSuppressed, urlHoverToolbarPinned], ([suppressed, pinned]) => {
  tuEditorRef.value?.setUrlHoverSuppressed?.(suppressed || pinned)
}, { immediate: true })

interface PendingBasisTarget {
  selectedText: string
  contextBefore: string
  contextAfter: string
  from?: number
  to?: number
  scope: 'text' | 'block' | 'compound'
  spannedBlockIds?: string[]
  spannedBlockMetadata?: SpannedBlockInfo[]
}

const pendingBasisTarget = ref<PendingBasisTarget | null>(null)

const tiptapEditor = computed(() => tuEditorRef.value?.editor ?? null)

const knowledgeAnchorPickerVisible = ref(false)
const knowledgeSourceAnchor = ref<KnowledgeAnchor | null>(null)
const knowledgeRelationRefreshKey = ref(0)
const headingSourcePopoverVisible = ref(false)
const headingSourcePopoverTop = ref(0)
const headingSourcePopoverLeft = ref(0)
const headingSourcePopoverAnchor = ref<KnowledgeAnchor | null>(null)
const headingSourcePopoverBinding = ref<HeadingSourceBinding | null>(null)

const selectionToolbarSuppressed = computed(() => (
  nodeViewToolbar.visible
  || showResourcePicker.value
  || showPdfExcerptPicker.value
  || noteEditorVisible.value
  || urlHoverToolbarVisible.value
  || tagEditorState.value.visible
  || knowledgeAnchorPickerVisible.value
))

const notePopoverVisible = ref(false)
const notePopoverAnnotation = ref<TextAnnotation | null>(null)
const notePopoverAnnotations = ref<TextAnnotation[]>([])
const notePopoverAnchor = ref<FloatingAnchorRect | null>(null)

const {
  position: notePopoverPosition,
  updatePosition: updateNotePopoverPosition,
} = useAnchoredFloating({
  visible: notePopoverVisible,
  getAnchorRect: () => notePopoverAnchor.value,
  placement: 'below',
  offset: 8,
  floatingWidth: 360,
  floatingHeight: 420,
})

// --- Watchers ---
const emitLocalContentChange = () => {
  if (!localDocument.value) return
  emit('content-change', toV2PageContent(
    localDocument.value,
    localAnnotations.value,
    localPageMetadata.value,
  ))
}

const pageTags = computed(() => getPageTags({
  content: '',
  embeds: [],
  annotations: localAnnotations.value,
  metadata: localPageMetadata.value,
}))

const tagEditorTitle = computed(() => {
  if (tagEditorState.value.scope === 'page') return '编辑页面标签'
  if (tagEditorState.value.scope === 'section') return '编辑节标签'
  if (tagEditorState.value.scope === 'text-span') return '编辑文字标签'
  return '编辑块标签'
})

const currentTextTagSpans = computed(() => getTextTagSpans(localPageMetadata.value))

const currentSectionTags = computed(() => collectSectionTagsFromMetadata(localPageMetadata.value))

const sectionTagsByItemId = computed(() => {
  const editor = tuEditorRef.value?.editor
  if (!editor) return {} as Record<string, BlockTag[]>
  const flat = collectFlatTocEntries(editor.state.doc, tocCollectContext.value)
  return buildSectionTagsByEntryId(flat, localPageMetadata.value, editor.state.doc)
})

const sectionTagsMap = computed(() => sectionTagsMapFromMetadata(localPageMetadata.value))
const sectionTagAnchors = computed(() => getSectionTagAnchors(localPageMetadata.value))

const activeTagFilter = computed(() => {
  void getTagFilterRevision()
  return getActiveTagFilter(workspaceStore.currentPageId)
})

const filterableTags = computed(() => {
  const editor = tuEditorRef.value?.editor
  if (!editor) return [] as BlockTag[]
  return collectFilterableTagsOnPage(
    localPageMetadata.value,
    editor.state.doc,
    tocCollectContext.value,
  )
})

const showPageChrome = computed(() => props.editable || filterableTags.value.length > 0)

provide('activeTagFilter', activeTagFilter)
provide('sectionTagsMap', sectionTagsMap)
provide('sectionTagAnchors', sectionTagAnchors)
provide('textTagSpans', currentTextTagSpans)
provide('textTagSpanRevision', computed(() => textTagSpanRevision.value))

const availableTags = computed(() => collectAvailableTags(
  localBlocks.value,
  pageTags.value,
  [kbTagPool.value],
  [...currentSectionTags.value, ...collectTextTagSpanTags(localPageMetadata.value)],
))

async function refreshKbTagPool() {
  const kbId = workspaceStore.currentKbId
  kbTagPool.value = await fetchKbTagPool(kbId)
}

watch(
  () => workspaceStore.currentKbId,
  () => {
    void refreshKbTagPool()
  },
  { immediate: true },
)

watch(
  () => props.contentList,
  (val, oldVal) => {
    if (!val) return
    if (val !== oldVal || !val.document) {
      localDocument.value = resolvePageDocument(val)
    } else if (JSON.stringify(val.document) !== JSON.stringify(localDocument.value)) {
      localDocument.value = val.document
    }
    localAnnotations.value = val.annotations ?? []
    localPageMetadata.value = { ...(val.metadata ?? {}) }
  },
  { immediate: true, deep: true },
)

watch(
  () => workspaceStore.currentPageId,
  () => {
    void nextTick(() => reconcileSectionTagsOnLoad())
  },
)

watch(
  () => tuEditorRef.value?.editor,
  (editor) => {
    if (!editor) return
    void nextTick(() => reconcileSectionTagsOnLoad())
  },
)

watch(
  () => props.pageTitle,
  (val) => {
    if (pageTitleEditing.value) return
    pageTitleDraft.value = displayPageTitle(val)
  },
  { immediate: true },
)

function onPageTitleFocus() {
  pageTitleEditing.value = true
}

function onPageTitleBlur() {
  pageTitleEditing.value = false
  if (!pageTitleDraft.value.trim()) {
    pageTitleDraft.value = '未命名页面'
    emit('page-title-change', pageTitleDraft.value)
    return
  }
  pageTitleDraft.value = displayPageTitle(props.pageTitle)
}

function displayPageTitle(title: string) {
  const value = title.trim()
  return value && !/^p-[\w-]+$/.test(value) ? value : '未命名页面'
}

// --- Toast ---
const showToast = (message: string) => {
  if (!toastEnabled.value) return
  const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  toastMessages.value.push({ id, message })
}

const removeToast = (id: string) => {
  const idx = toastMessages.value.findIndex(t => t.id === id)
  if (idx >= 0) toastMessages.value.splice(idx, 1)
}

// --- Block sync ---
const handleDocumentChange = (document: JSONContent) => {
  localDocument.value = document
  emitLocalContentChange()
}

// --- Focus editor from title ---
const focusEditorFromStart = () => {
  const editor = tuEditorRef.value?.editor
  if (!editor) return

  const firstChild = editor.state.doc.firstChild
  if (firstChild && NODEVIEW_TYPES.includes(firstChild.type.name)) {
    const blockId = String(firstChild.attrs.blockId || '')
    if (blockId) {
      const newBlock: Block = {
        id: 'block-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
        type: 'richtext',
        content: '',
      }
      editor
        .chain()
        .focus()
        .insertBlockBefore(newBlock, blockId)
        .setTextSelection(2)
        .run()
      return
    }
  }

  editor.commands.focus()
  editor.commands.setTextSelection({ from: 1, to: 1 })
}

// --- Selection ---
const handleSelectionChange = (
  selHasSelection: boolean,
  selText: string,
  selFrom?: number,
  selTo?: number,
  selBlockId?: string,
  selSpannedBlockIds?: string[],
  selSpannedBlockMetadata?: SpannedBlockInfo[],
) => {
  hasSelection.value = selHasSelection
  selectedText.value = selText
  selectionFrom.value = selFrom ?? 0
  selectionTo.value = selTo ?? 0
  selectionBlockIndex.value = -1
  selectionBlockId.value = selBlockId ?? ''
  selectionSpannedBlockIds.value = selSpannedBlockIds ?? []
  selectionSpannedBlockMetadata.value = selSpannedBlockMetadata ?? []
  selectionStateVersion.value += 1
}

// --- Block picker ---
const handleOpenBlockPicker = () => {
  showBlockPicker.value = true
}

const handleOpenResourcePicker = () => {
  resourcePickerMode.value = 'insert'
  pendingResourceExcerptText.value = ''
  pendingResourceExcerptTitle.value = ''
  showResourcePicker.value = true
}

const handleOpenPdfExcerptPicker = () => {
  pdfExcerptPickerMode.value = 'insert'
  pdfExcerptEditBlockId.value = ''
  pdfExcerptPickerInitial.value = null
  showPdfExcerptPicker.value = true
}

const handleEditPdfExcerptSource = (blockId: string) => {
  const editor = tuEditorRef.value?.editor
  if (!editor || !blockId) return

  const foundAttrs = findPdfExcerptAttrsByBlockId(editor, blockId)
  if (!foundAttrs) return

  pdfExcerptPickerMode.value = 'edit'
  pdfExcerptEditBlockId.value = blockId
  pdfExcerptPickerInitial.value = {
    fileId: String(foundAttrs.fileId || ''),
    fileName: String(foundAttrs.fileName || 'PDF'),
    viewMode: parsePdfExcerptViewMode(String(foundAttrs.viewMode || 'excerpt')),
    startPage: Number(foundAttrs.startPage) || 1,
    endPage: Number(foundAttrs.endPage) || 1,
    height: Number(foundAttrs.height) || PDF_EXCERPT_DEFAULT_HEIGHT,
  }
  hideNodeViewToolbar()
  showPdfExcerptPicker.value = true
}

const handlePdfExcerptPickerConfirm = (selection: PdfExcerptSelection) => {
  if (pdfExcerptPickerMode.value === 'edit' && pdfExcerptEditBlockId.value) {
    const updated = tuEditorRef.value?.updatePdfExcerptBlock?.(pdfExcerptEditBlockId.value, selection)
    if (!updated) return
    const rangeLabel = selection.viewMode === 'full'
      ? '全文'
      : `第 ${selection.startPage}–${selection.endPage} 页`
    showToast(`已更新 PDF 来源：${selection.fileName}（${rangeLabel}）`)
  } else {
    const inserted = tuEditorRef.value?.insertPdfExcerptBlock?.(selection)
    if (!inserted) return
    showToast(`已插入 PDF 摘页：${selection.fileName} 第 ${selection.startPage}–${selection.endPage} 页`)
  }
  showPdfExcerptPicker.value = false
  pdfExcerptPickerMode.value = 'insert'
  pdfExcerptEditBlockId.value = ''
  pdfExcerptPickerInitial.value = null
}

const getSelectionAnnotationPayload = (from: number, to: number) => {
  const editor = tuEditorRef.value?.editor
  if (!editor) return {
    selectedText: '',
    contextBefore: '',
    contextAfter: '',
    from: undefined,
    to: undefined,
    blockId: undefined,
  }
  return getAnnotationSelectionPayload(editor.state.doc, from, to)
}

const handleBlockPickerSelect = (target: { type: 'block' | 'page'; id: string }) => {
  tuEditorRef.value?.completePendingRefInsert?.(target.id, target.type)
  showBlockPicker.value = false
}

const handleResourcePickerSelect = (selection: { title: string; externalResource: ExternalResourceEmbedData }) => {
  const block: Block = {
    id: 'external-resource-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    type: 'externalResource',
    title: selection.title,
    externalResource: selection.externalResource,
  }
  tuEditorRef.value?.completePendingExternalResourceInsert?.(block)
  showResourcePicker.value = false
}

const normalizeResourceExcerptSelectionText = (value: string): string => {
  let text = value.trim()
  const wrappedQuote = text.match(/^\{>\s*([\s\S]*?)\s*\}$/)
  if (wrappedQuote) text = wrappedQuote[1].trim()
  else text = text.replace(/^\{>\s*/, '').replace(/\s*\}$/, '').trim()
  text = text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*>\s?/, ''))
    .join('\n')
    .trim()
  return text
}

const buildResourceExcerptTitle = (text: string): string => {
  const firstLine = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) || '来自文档的节选'
  return firstLine
    .replace(/^#+\s+/, '')
    .replace(/^[-*]\s+/, '')
    .replace(/^\d+\.\s+/, '')
    .slice(0, 80)
}

const handleMarkResourceExcerptFromSelection = () => {
  if (!canMarkResourceExcerptFromSelection.value) return
  const payload = getSelectionAnnotationPayload(selectionFrom.value, selectionTo.value)
  const excerptText = normalizeResourceExcerptSelectionText(payload.selectedText || selectedText.value)
  if (!excerptText) return
  pendingResourceExcerptText.value = excerptText
  pendingResourceExcerptTitle.value = buildResourceExcerptTitle(excerptText)
  resourcePickerMode.value = 'markExcerpt'
  showResourcePicker.value = true
}

const openMarkBlockExcerptPicker = (text: string, title: string) => {
  const excerptText = normalizeResourceExcerptSelectionText(text)
  if (!excerptText) return
  pendingResourceExcerptText.value = excerptText
  pendingResourceExcerptTitle.value = title || buildResourceExcerptTitle(excerptText)
  resourcePickerMode.value = 'markExcerpt'
  showResourcePicker.value = true
}

const handleMarkBlockExcerpt = (blockId: string) => {
  const editor = tuEditorRef.value?.editor
  if (!editor) return
  const payload = getBlockExcerptContent(editor.state.doc, blockId, tocCollectContext.value)
  if (!payload) return
  hideNodeViewToolbar()
  openMarkBlockExcerptPicker(payload.text, payload.title)
}

const handleMarkNodeViewBlockExcerpt = () => {
  if (!nodeViewToolbar.blockId) return
  handleMarkBlockExcerpt(nodeViewToolbar.blockId)
}

const openSetBasisPicker = (target: PendingBasisTarget) => {
  if (!target.selectedText.trim() && !(target.spannedBlockIds?.length)) return
  pendingBasisTarget.value = target
  pendingResourceExcerptText.value = ''
  pendingResourceExcerptTitle.value = ''
  resourcePickerMode.value = 'setBasis'
  showResourcePicker.value = true
}

const handleSetExcerptBasisFromSelection = () => {
  if (!canSetExcerptBasisFromSelection.value) return
  const payload = getSelectionAnnotationPayload(selectionFrom.value, selectionTo.value)
  const excerptText = payload.selectedText || selectedText.value
  if (!excerptText.trim()) return
  const hasSpannedBlocks = selectionSpannedBlockIds.value.length > 0
  openSetBasisPicker({
    selectedText: excerptText,
    contextBefore: payload.contextBefore,
    contextAfter: payload.contextAfter,
    from: payload.from ?? selectionFrom.value,
    to: payload.to ?? selectionTo.value,
    scope: hasSpannedBlocks ? 'compound' : 'text',
    spannedBlockIds: hasSpannedBlocks ? selectionSpannedBlockIds.value : undefined,
    spannedBlockMetadata: hasSpannedBlocks
      ? normalizeSpannedBlockMetadata(selectionSpannedBlockIds.value, selectionSpannedBlockMetadata.value)
      : undefined,
  })
}

const handleSetBlockBasis = (blockId: string) => {
  const editor = tuEditorRef.value?.editor
  if (!editor) return
  const payload = getBlockExcerptContent(editor.state.doc, blockId, tocCollectContext.value)
  if (!payload) return
  const blockIds = collectBasisBlockIds(editor.state.doc, blockId, tocCollectContext.value)
  const scope = blockIds.length > 1 ? 'compound' : 'block'
  hideNodeViewToolbar()
  openSetBasisPicker({
    selectedText: payload.text,
    contextBefore: '',
    contextAfter: '',
    scope,
    spannedBlockIds: blockIds,
    spannedBlockMetadata: normalizeSpannedBlockMetadata(blockIds, []),
  })
}

const handleSetNodeViewBlockBasis = () => {
  if (!nodeViewToolbar.blockId) return
  handleSetBlockBasis(nodeViewToolbar.blockId)
}

const saveExcerptBasisAnnotation = (binding: HeadingSourceBinding) => {
  const target = pendingBasisTarget.value
  if (!target) return
  const now = Date.now()
  const hasText = !!target.selectedText.trim()
  const hasSpannedBlocks = (target.spannedBlockIds?.length ?? 0) > 0
  const scope = target.scope
  const annotation: TextAnnotation = {
    id: `basis-${now}-${Math.random().toString(36).slice(2, 8)}`,
    kind: 'basis',
    basisBinding: binding,
    selectedText: target.selectedText,
    contextBefore: target.contextBefore,
    contextAfter: target.contextAfter,
    note: '',
    color: '#A5D6A7',
    createdAt: now,
    updatedAt: now,
    from: scope === 'text' && hasText ? target.from : undefined,
    to: scope === 'text' && hasText ? target.to : undefined,
    blockId: '',
    anchorVersion: scope === 'text' && hasText ? 1 : undefined,
    lastResolvedAt: scope === 'text' && hasText ? now : undefined,
    unresolved: false,
    scope,
    spannedBlockIds: hasSpannedBlocks ? target.spannedBlockIds : undefined,
    spannedBlockMetadata: hasSpannedBlocks ? target.spannedBlockMetadata : undefined,
  }
  localAnnotations.value = [...localAnnotations.value, annotation]
  emitLocalContentChange()
  pendingBasisTarget.value = null
  showToast(`已设置依据：${binding.snapshot.excerptTitle || binding.snapshot.resourceTitle || '外部资源'}`)
}

const handleBindResourceFromPicker = (payload: { binding: HeadingSourceBinding }) => {
  if (resourcePickerMode.value === 'setBasis') {
    saveExcerptBasisAnnotation(payload.binding)
    showResourcePicker.value = false
    resourcePickerMode.value = 'insert'
    return
  }
  handleBindHeadingSource(payload)
}

const handleResourceExcerptCreated = (payload: { excerpt: { title: string } }) => {
  showResourcePicker.value = false
  resourcePickerMode.value = 'insert'
  pendingResourceExcerptText.value = ''
  pendingResourceExcerptTitle.value = ''
  hasSelection.value = false
  showToast(`已创建外部资源节选：${payload.excerpt.title}`)
}

const navigateToHeadingSource = (binding: HeadingSourceBinding) => {
  void router.push({
    path: '/resources',
    query: {
      tab: 'items',
      itemId: binding.resourceItemId,
      ...(binding.resourceExcerptId ? { excerptId: binding.resourceExcerptId } : {}),
    },
  })
}

const handleHeadingSourceClick = (
  binding: HeadingSourceBinding,
  context: { blockId: string; title: string; clientX: number; clientY: number },
) => {
  const pageId = workspaceStore.currentPageId
  if (!pageId) {
    navigateToHeadingSource(binding)
    return
  }
  headingSourcePopoverBinding.value = binding
  headingSourcePopoverAnchor.value = headingAnchor(pageId, context.blockId, context.title)
  headingSourcePopoverTop.value = context.clientY + 8
  headingSourcePopoverLeft.value = context.clientX
  headingSourcePopoverVisible.value = true
  knowledgeRelationRefreshKey.value += 1
}

const closeHeadingSourcePopover = () => {
  headingSourcePopoverVisible.value = false
  headingSourcePopoverAnchor.value = null
  headingSourcePopoverBinding.value = null
}

const handleCreateKnowledgeRelationFromSelection = () => {
  const editor = tuEditorRef.value?.editor
  const pageId = workspaceStore.currentPageId
  const kbId = workspaceStore.currentKbId
  if (!editor || !pageId || !kbId) return
  knowledgeSourceAnchor.value = buildSelectionAnchor(editor, pageId)
  if (!knowledgeSourceAnchor.value) return
  knowledgeAnchorPickerVisible.value = true
}

const handleKnowledgeRelationCreated = () => {
  knowledgeRelationRefreshKey.value += 1
  showToast('已关联到知识点')
}

const handleMarkHeadingSourceFromSelection = () => {
  if (!canMarkHeadingSourceFromSelection.value) return
  const headingText = tuEditorRef.value?.getHeadingTextAtSelection?.() || selectedText.value.trim()
  pendingResourceExcerptText.value = ''
  pendingResourceExcerptTitle.value = headingText
  resourcePickerMode.value = 'bindSource'
  showResourcePicker.value = true
}

const handleClearHeadingSourceFromSelection = () => {
  if (!canClearHeadingSourceFromSelection.value) return
  tuEditorRef.value?.clearHeadingSourceBinding?.()
  tuEditorRef.value?.flushContentChange?.()
  showToast('已解除标题来源')
}

const handleBindHeadingSource = (payload: { binding: HeadingSourceBinding }) => {
  tuEditorRef.value?.applyHeadingSourceBinding?.(payload.binding)
  tuEditorRef.value?.flushContentChange?.()
  showResourcePicker.value = false
  resourcePickerMode.value = 'insert'
  pendingResourceExcerptText.value = ''
  pendingResourceExcerptTitle.value = ''
  showToast(`已标记标题来源：${payload.binding.snapshot.excerptTitle || payload.binding.snapshot.resourceTitle || '外部资源'}`)
}

const focusHeadingAtTocItem = (item: TocItem) => {
  const editor = tuEditorRef.value?.editor
  if (!editor) return
  const from = Math.max(1, Math.min(item.pos + 1, editor.state.doc.content.size - 1))
  editor.commands.setTextSelection({ from, to: from })
}

const closeTocContextMenu = () => {
  tocContextMenu.value.visible = false
  tocContextMenu.value.item = null
}

const handleTocContextMenu = (item: TocItem, event: MouseEvent) => {
  event.preventDefault()
  tocContextMenu.value = {
    visible: true,
    top: event.clientY,
    left: event.clientX,
    item,
  }
}

const handleTocMarkExcerpt = () => {
  const item = tocContextMenu.value.item
  if (!item) return
  openMarkExcerptForTocEntry(item.id)
  closeTocContextMenu()
}

const handleTocSetBasis = () => {
  const item = tocContextMenu.value.item
  if (!item) return
  openSetBasisForTocEntry(item.id)
  closeTocContextMenu()
}

function openMarkExcerptForTocEntry(entryId: string) {
  const editor = tuEditorRef.value?.editor
  if (!editor) return
  const flat = collectFlatTocEntries(editor.state.doc, tocCollectContext.value)
  const payload = getTocEntryExcerptContent(editor.state.doc, flat, entryId, tocCollectContext.value)
  if (!payload) return
  openMarkBlockExcerptPicker(payload.text, payload.title)
}

function openSetBasisForTocEntry(entryId: string) {
  const editor = tuEditorRef.value?.editor
  if (!editor) return
  const flat = collectFlatTocEntries(editor.state.doc, tocCollectContext.value)
  const payload = getTocEntryExcerptContent(editor.state.doc, flat, entryId, tocCollectContext.value)
  if (!payload) return
  const blockIds = collectTocEntryBasisBlockIds(editor.state.doc, flat, entryId, tocCollectContext.value)
  const scope = blockIds.length > 1 ? 'compound' : 'block'
  openSetBasisPicker({
    selectedText: payload.text,
    contextBefore: '',
    contextAfter: '',
    scope,
    spannedBlockIds: blockIds,
    spannedBlockMetadata: normalizeSpannedBlockMetadata(blockIds, []),
  })
}

const handleTocMarkSource = () => {
  const item = tocContextMenu.value.item
  if (!item) return
  focusHeadingAtTocItem(item)
  pendingResourceExcerptText.value = ''
  pendingResourceExcerptTitle.value = item.text
  resourcePickerMode.value = 'bindSource'
  showResourcePicker.value = true
  closeTocContextMenu()
}

const handleTocClearSource = () => {
  const item = tocContextMenu.value.item
  if (!item?.sourceBinding) return
  focusHeadingAtTocItem(item)
  tuEditorRef.value?.clearHeadingSourceBinding?.()
  tuEditorRef.value?.flushContentChange?.()
  closeTocContextMenu()
  showToast('已解除标题来源')
}

const handleTocSourceClick = (item: TocItem) => {
  if (!item.sourceBinding) return
  navigateToHeadingSource(item.sourceBinding)
}

const handleResourcePickerVisibleChange = (visible: boolean) => {
  showResourcePicker.value = visible
  if (!visible) {
    resourcePickerMode.value = 'insert'
    pendingResourceExcerptText.value = ''
    pendingResourceExcerptTitle.value = ''
    pendingBasisTarget.value = null
  }
}

// --- TOC ---
const tocExpand = useExpandCollapse()

const getTocExpandKey = (item: TocItem): string => item.id

const allExpandableTocIds = computed(() => {
  const ids: string[] = []
  const walk = (items: TocItem[]) => {
    for (const item of items) {
      if (item.children?.length) ids.push(getTocExpandKey(item))
      if (item.children) walk(item.children)
    }
  }
  walk(tocItems.value)
  return ids
})

const allTocItemsExpanded = computed(() => {
  const ids = allExpandableTocIds.value
  return ids.length > 0 && ids.every(id => tocExpand.isExpanded(id))
})

const toggleAllTocItems = () => {
  const ids = allExpandableTocIds.value
  if (ids.length === 0) return
  if (allTocItemsExpanded.value) tocExpand.collapseAll()
  else tocExpand.expandAll(ids)
}

const toggleTocItem = (item: TocItem) => {
  if (item.children?.length) tocExpand.toggle(getTocExpandKey(item))
}

const isTocItemExpanded = (item: TocItem): boolean => {
  return tocExpand.isExpanded(getTocExpandKey(item))
}

/** Walk workspace page tree to find a page title by pageId. */
function findPageTitle(pageId: string): string {
  const walk = (items: Array<{ id: string; title: string; children?: any[] }>): string | undefined => {
    for (const item of items) {
      if (item.id === pageId) return item.title
      if (item.children?.length) {
        const found = walk(item.children)
        if (found) return found
      }
    }
    return undefined
  }
  return walk(workspaceStore.pageTree) ?? pageId
}

const tocCollectContext = computed<TocCollectContext>(() => ({
  blocks: localBlocks.value,
  getPageBlocks: (pageId: string) => registryStore.getPageBlocks(pageId),
  getBlock: (id: string) => registryStore.getBlock(id),
  getBlockMeta: (id: string) => registryStore.getMeta(id),
  getPageTitle: findPageTitle,
  getPageOutline: (pageId: string) => outlineCacheStore.getPageNodes(pageId),
  getBlockOutline: (blockId: string) => outlineCacheStore.getBlockNodes(blockId),
  structureSource: 'outline',
}))

provide('tocCollectContext', tocCollectContext)

async function prefetchEditorRefOutlines() {
  const editor = tuEditorRef.value?.editor
  if (!editor) return

  const pageIds = new Set<string>()
  const blockIds = new Set<string>()
  editor.state.doc.descendants((node) => {
    if (node.type.name !== 'refBlock') return true
    const refId = String(node.attrs?.refId ?? '')
    if (!refId) return true
    if (node.attrs?.refType === 'page') pageIds.add(refId)
    else blockIds.add(refId)
    return true
  })

  if (pageIds.size === 0 && blockIds.size === 0) return
  await outlineCacheStore.prefetchBatch([...pageIds], [...blockIds])
  editor.view.dispatch(editor.state.tr.setMeta(HEADING_SECTION_FOLD_META, true))
}

watch(
  () => workspaceStore.currentPageId,
  () => {
    clearSectionFoldSession()
    clearTagFilterSession()
    void nextTick(() => void prefetchEditorRefOutlines())
  },
)

watch(
  () => localBlocks.value,
  () => {
    void nextTick(() => void prefetchEditorRefOutlines())
  },
  { deep: true },
)

const tocItems = computed<TocItem[]>(() => {
  const editor = tuEditorRef.value?.editor
  if (!editor) return []

  const flat = collectFlatTocEntries(editor.state.doc, tocCollectContext.value)
  if (flat.length === 0) return []
  return buildHeadingTree(flat)
})

const getEditorScrollContainer = (): HTMLElement | Window => {
  const editorDom = tuEditorRef.value?.editor?.view.dom
  return editorDom?.closest('.content-scroll') as HTMLElement | null ?? window
}

const scrollElementIntoEditorView = (el: HTMLElement) => {
  const scrollContainer = getEditorScrollContainer()
  if (scrollContainer instanceof HTMLElement) {
    const containerRect = scrollContainer.getBoundingClientRect()
    const elRect = el.getBoundingClientRect()
    const targetTop = scrollContainer.scrollTop + elRect.top - containerRect.top - 88
    scrollContainer.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' })
    return
  }
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

const scrollToAnnotationById = (_pageId: string, annotationId: string) => {
  const editorDom = tuEditorRef.value?.editor?.view.dom
  const el = editorDom?.querySelector<HTMLElement>(`[data-tu-annotation-id="${CSS.escape(annotationId)}"]`)
  if (el) scrollElementIntoEditorView(el)
}

const scrollToHeadingByBlockId = (_pageId: string, blockId: string) => {
  const editor = tuEditorRef.value?.editor
  if (!editor) return
  const flat = collectFlatTocEntries(editor.state.doc, tocCollectContext.value)
  const entry = flat.find((item) => item.blockId === blockId)
  if (!entry) return
  const nodeDom = editor.view.nodeDOM(entry.pos)
  const el = nodeDom instanceof HTMLElement
    ? nodeDom
    : nodeDom instanceof Text
      ? nodeDom.parentElement
      : editor.view.dom.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(blockId)}"]`)
  if (el) scrollElementIntoEditorView(el)
}

const scrollToSelectionRange = (_pageId: string, from: number, to: number) => {
  const editor = tuEditorRef.value?.editor
  if (!editor) return
  const docSize = editor.state.doc.content.size
  const safeFrom = Math.max(1, Math.min(from, docSize - 1))
  const safeTo = Math.max(safeFrom, Math.min(to, docSize - 1))
  editor.commands.setTextSelection({ from: safeFrom, to: safeTo })
  try {
    const coords = editor.view.coordsAtPos(safeFrom)
    const element = document.elementFromPoint(coords.left, coords.top)
    if (element instanceof HTMLElement) {
      scrollElementIntoEditorView(element)
    }
  } catch {
    // ignore invalid positions after navigation
  }
}

const scrollToBlockByBlockId = (
  _pageId: string,
  blockId: string,
  options?: { pdfPage?: number },
) => {
  const editorDom = tuEditorRef.value?.editor?.view.dom
  const el = editorDom?.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(blockId)}"]`)
  if (el) scrollElementIntoEditorView(el)
  if (options?.pdfPage != null && Number.isFinite(options.pdfPage)) {
    el?.dispatchEvent(new CustomEvent(PDF_EXCERPT_SCROLL_EVENT, {
      detail: { pageNumber: options.pdfPage },
      bubbles: true,
    }))
  }
}

const knowledgeNavigateHandlers = computed<KnowledgeAnchorNavigateHandlers>(() => ({
  router,
  selectPage: (pageId) => workspaceStore.selectPage(pageId),
  currentPageId: workspaceStore.currentPageId,
  scrollToAnnotation: scrollToAnnotationById,
  scrollToHeading: scrollToHeadingByBlockId,
  scrollToSelection: scrollToSelectionRange,
  scrollToBlock: scrollToBlockByBlockId,
}))

const findHeadingInEmbedBlock = (blockId: string, headingText?: string): HTMLElement | null => {
  if (!headingText) return null
  const editorDom = tuEditorRef.value?.editor?.view.dom
  const embedRoot = editorDom?.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(blockId)}"]`)
  if (!embedRoot) return null
  const contentRoot = embedRoot.querySelector<HTMLElement>(
    '.ref-page-content, .ref-block-card__content, .external-resource-card',
  ) ?? embedRoot
  const headings = contentRoot.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6')
  for (const heading of headings) {
    if (heading.textContent?.trim() === headingText.trim()) return heading
  }
  return null
}

const findTocTargetElement = (item: TocItem): HTMLElement | null => {
  if (item.sourceType === 'ref-child') {
    return findHeadingInEmbedBlock(item.blockId, item.targetText || item.text)
  }

  const editor = tuEditorRef.value?.editor
  if (!editor) return null

  const nodeDom = editor.view.nodeDOM(item.pos)
  if (nodeDom instanceof HTMLElement) return nodeDom
  if (nodeDom instanceof Text) return nodeDom.parentElement

  const editorDom = editor.view.dom
  if (item.blockId) {
    const byBlockId = editorDom.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(item.blockId)}"]`)
    if (byBlockId) return byBlockId
  }

  try {
    const coords = editor.view.coordsAtPos(item.pos)
    const element = document.elementFromPoint(coords.left, coords.top)
    return element instanceof HTMLElement ? element.closest<HTMLElement>('.ProseMirror > *') ?? element : null
  } catch {
    return null
  }
}

const handleTocItemClick = (item: TocItem) => {
  const editor = tuEditorRef.value?.editor
  if (!editor) return

  const docSize = editor.state.doc.content.size
  const from = Math.max(0, Math.min(item.pos, docSize))
  const targetNode = editor.state.doc.nodeAt(from)
  try {
    if (targetNode?.isTextblock || targetNode?.isInline) {
      editor.commands.setTextSelection({ from, to: from + 1 })
    } else if (targetNode) {
      editor.commands.setNodeSelection(from)
    }
    const targetEl = findTocTargetElement(item)
    if (targetEl) scrollElementIntoEditorView(targetEl)
    else editor.commands.scrollIntoView()
    highlightedBlockId.value = item.blockId
    setTimeout(() => { highlightedBlockId.value = null }, 2000)
  } catch {
    // Position may be stale after editor rebuild; ignore silently
  }
}

// --- Link insertion ---
const URL_HOVER_DISMISS_MS = 320

const clearUrlHoverPinTimer = () => {
  if (urlHoverPinTimer !== null) {
    clearTimeout(urlHoverPinTimer)
    urlHoverPinTimer = null
  }
}

let urlHoverDismissTimer: ReturnType<typeof setTimeout> | null = null

const clearUrlHoverDismissTimer = () => {
  if (urlHoverDismissTimer !== null) {
    clearTimeout(urlHoverDismissTimer)
    urlHoverDismissTimer = null
  }
}

const scheduleUrlHoverDismiss = () => {
  if (urlHoverToolbarPinned.value || urlHoverToolbarHovering) return
  clearUrlHoverDismissTimer()
  urlHoverDismissTimer = setTimeout(() => {
    urlHoverDismissTimer = null
    if (!urlHoverToolbarHovering && !urlHoverToolbarPinned.value) {
      urlHoverTarget.value = null
    }
  }, URL_HOVER_DISMISS_MS)
}

const pinUrlHoverToolbar = (durationMs = 3000) => {
  clearUrlHoverPinTimer()
  urlHoverToolbarPinned.value = true
  tuEditorRef.value?.setUrlHoverSuppressed?.(true)
  urlHoverPinTimer = setTimeout(() => {
    urlHoverPinTimer = null
    urlHoverToolbarPinned.value = false
    tuEditorRef.value?.setUrlHoverSuppressed?.(urlHoverToolbarSuppressed.value)
    if (!urlHoverToolbarHovering) {
      urlHoverTarget.value = null
    }
  }, durationMs)
}

const handleUrlHoverChange = (target: UrlHoverTarget | null) => {
  if (urlHoverToolbarPinned.value && !target) return
  if (!target) {
    scheduleUrlHoverDismiss()
    return
  }
  clearUrlHoverDismissTimer()
  urlHoverTarget.value = target
}

const handleUrlHoverToolbarEnter = () => {
  urlHoverToolbarHovering = true
  clearUrlHoverDismissTimer()
}

const handleUrlHoverToolbarLeave = () => {
  urlHoverToolbarHovering = false
  if (!urlHoverToolbarPinned.value) {
    scheduleUrlHoverDismiss()
  }
}

const handleUrlDisplayModeSelect = async (mode: UrlDisplayMode) => {
  const target = urlHoverTarget.value
  if (!target || !tuEditorRef.value) return
  const updated = await tuEditorRef.value.applyUrlDisplayMode(target, mode)
  if (!updated) return
  urlHoverTarget.value = updated
  registerExternalLinkResource(updated.url, updated.label || updated.url)
  pinUrlHoverToolbar()
}

const handleUrlEmbedHeightChange = (height: number) => {
  const target = urlHoverTarget.value
  if (!target?.blockId || !tuEditorRef.value) return
  const updated = tuEditorRef.value.applyUrlEmbedHeight(target.blockId, height)
  if (!updated) return
  urlHoverTarget.value = updated
  pinUrlHoverToolbar()
}

const showUrlHoverAfterInsert = (url: string, label: string) => {
  const editor = tuEditorRef.value?.editor
  if (!editor) return
  nextTick(() => {
    const { from, to, empty } = editor.state.selection
    if (empty) return
    tuEditorRef.value?.showUrlHoverForInline?.(from, to, url, 'link', label)
    pinUrlHoverToolbar()
  })
}

const handleInsertLinkButtonClick = () => {
  const editor = tuEditorRef.value?.editor
  if (!editor) return
  const { from, to } = editor.state.selection
  if (from === to) {
    showToast('请先选中文字后再插入链接')
    return
  }

  const label = editor.state.doc.textBetween(from, to, ' ')

  linkPopoverUrl.value = ''
  linkPopoverLabel.value = label
  linkPopoverVisible.value = true
  updateLinkPopoverPosition()
  nextTick(() => linkPopoverUrlInput.value?.focus())
}

const closeLinkPopover = () => {
  linkPopoverVisible.value = false
  linkPopoverUrl.value = ''
  linkPopoverLabel.value = ''
}

const submitLinkPopover = () => {
  const editor = tuEditorRef.value?.editor
  if (!editor || !linkPopoverUrl.value.trim()) return

  const url = linkPopoverUrl.value.trim()
  const label = linkPopoverLabel.value || url

  editor.chain().focus().setLink({ href: url }).run()
  const excerptText = label.trim() && label.trim() !== url ? label.trim() : undefined
  registerExternalLinkResource(url, label, excerptText)
  showUrlHoverAfterInsert(url, label)
  closeLinkPopover()
}

const registerExternalLinkResource = (url: string, label: string, excerptText?: string) => {
  void registerExternalUrlFromPaste(url, { label, excerptText })
    .then((result) => {
      if (result.mode === 'excerpt') {
        if (result.createdExcerpt) {
          showToast('链接已登记为页面节选（已创建父级网络资源）')
        } else {
          showToast('链接已关联到已有页面节选')
        }
        return
      }
      showToast(result.createdItem ? '链接已登记为网络资源实体' : '链接已关联到已有网络资源')
    })
    .catch((error) => {
      console.warn('Failed to register external link resource:', error)
      showToast('链接已插入，但外部资源登记失败')
    })
}

// --- Paste URL detection ---
const normalizePastedUrl = (text: string): string | null => parseExternalUrl(text)?.href ?? null

// --- Extract selection ---
const handleExtractSelectionButtonClick = () => {
  const editor = tuEditorRef.value?.editor
  if (!editor) return
  const { from, to } = editor.state.selection
  if (from === to) {
    showToast('请先选中文字后再提取')
    return
  }
  const text = editor.state.doc.textBetween(from, to, ' ')
  if (text) {
    editor.chain()
      .focus()
      .insertContent(`<p>${text}</p>`)
      .run()
  }
}

// --- Tag editor ---
const openTagEditorAtCenter = (
  scope: TagEditorScope,
  blockId = '',
  sectionKey = '',
  textSpanId = '',
) => {
  tagEditorState.value = {
    visible: true,
    scope,
    blockId,
    sectionKey,
    textSpanId,
    top: window.innerHeight / 2 - 160,
    left: window.innerWidth / 2 - 160,
  }
}

const syncHeadingBlockIdAtPos = (pos: number, blockId: string): boolean => {
  const editor = tuEditorRef.value?.editor
  if (!editor) return false
  const node = editor.state.doc.nodeAt(pos)
  if (!node || node.type.name !== 'heading') return false
  if (String(node.attrs.blockId || '').trim() === blockId) return false
  editor.chain().focus().command(({ tr, dispatch }) => {
    if (!dispatch) return true
    tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      blockId,
    })
    return true
  }).run()
  localDocument.value = editor.getJSON()
  return true
}

const findPreferredSectionBlockId = (entry: FlatTocEntry, doc: ProseMirrorNode): string | null => {
  const metadata = localPageMetadata.value
  const anchors = getSectionTagAnchors(metadata)
  for (const [key, anchor] of Object.entries(anchors)) {
    if (anchor.text !== entry.text || anchor.level !== entry.level) continue
    if (getSectionTags(metadata, key).length === 0) continue
    return key.slice('local:'.length)
  }
  for (const key of getLocalSectionTagLookupKeys(entry, doc)) {
    if (key.endsWith(`heading-${entry.pos}`)) continue
    const blockId = key.slice('local:'.length)
    if (blockId.startsWith('heading-')) continue
    if (getSectionTags(metadata, key).length > 0) return blockId
  }
  return null
}

const reconcileSectionTagsOnLoad = () => {
  const editor = tuEditorRef.value?.editor
  if (!editor) return

  const flat = collectFlatTocEntries(editor.state.doc, tocCollectContext.value)
  let metadata = { ...localPageMetadata.value }
  let metadataChanged = false

  const withAnchors = ensureSectionTagAnchorsForFlat(metadata, flat, editor.state.doc)
  if (withAnchors !== metadata) {
    metadata = withAnchors
    metadataChanged = true
  }

  const withOrphans = reconcileOrphanSectionTagKeys(metadata, flat, editor.state.doc)
  if (withOrphans !== metadata) {
    metadata = withOrphans
    metadataChanged = true
  }

  if (metadataChanged) {
    localPageMetadata.value = metadata
  }

  const syncs = listSectionHeadingBlockIdSyncs(flat, editor.state.doc, metadata)
  let docChanged = false
  for (const { pos, blockId } of syncs) {
    if (syncHeadingBlockIdAtPos(pos, blockId)) docChanged = true
  }

  if (metadataChanged || docChanged) {
    emitLocalContentChange()
  }
}

const ensureLocalHeadingBlockId = (entry: FlatTocEntry): string => {
  const editor = tuEditorRef.value?.editor
  if (!editor || entry.sourceType !== 'local') {
    return entry.blockId
  }

  const node = editor.state.doc.nodeAt(entry.pos)
  if (!node || node.type.name !== 'heading') {
    return entry.blockId
  }

  const existing = String(node.attrs.blockId || '').trim()
  if (existing && !existing.startsWith('heading-')) {
    return existing
  }

  const preferredBlockId = findPreferredSectionBlockId(entry, editor.state.doc)
  if (preferredBlockId) {
    if (String(node.attrs.blockId || '').trim() !== preferredBlockId) {
      editor.chain().focus().command(({ tr, dispatch }) => {
        if (!dispatch) return true
        tr.setNodeMarkup(entry.pos, undefined, {
          ...node.attrs,
          blockId: preferredBlockId,
        })
        return true
      }).run()
      localDocument.value = editor.getJSON()
      emitLocalContentChange()
    }
    return preferredBlockId
  }

  const legacyIds = new Set<string>()
  if (existing) legacyIds.add(existing)
  if (entry.blockId) legacyIds.add(entry.blockId)
  legacyIds.add(`heading-${entry.pos}`)

  const blockId = createHeadingBlockId()
  editor.chain().focus().command(({ tr, dispatch }) => {
    if (!dispatch) return true
    tr.setNodeMarkup(entry.pos, undefined, {
      ...node.attrs,
      blockId,
    })
    return true
  }).run()

  let metadata = { ...localPageMetadata.value }
  let metadataChanged = false
  for (const legacyId of legacyIds) {
    if (legacyId === blockId) continue
    const legacyKey = `local:${legacyId}`
    const legacyTags = getSectionTags(metadata, legacyKey)
    if (legacyTags.length === 0) continue
    metadata = setSectionTagsInMetadata(metadata, `local:${blockId}`, legacyTags)
    metadata = setSectionTagsInMetadata(metadata, legacyKey, [])
    metadataChanged = true
  }
  if (metadataChanged) {
    localPageMetadata.value = metadata
    emitLocalContentChange()
  }

  localDocument.value = editor.getJSON()
  emitLocalContentChange()
  return blockId
}

const openSectionTagEditorFromEntry = (found: FlatTocEntry) => {
  const editor = tuEditorRef.value?.editor
  if (!editor) return

  let entry = found
  if (entry.sourceType === 'local') {
    const blockId = ensureLocalHeadingBlockId(entry)
    entry = { ...entry, blockId }
  }

  const sectionKey = getSectionTagKey(entry)
  tagEditorBlockTags.value = [...getSectionTags(localPageMetadata.value, sectionKey)]
  openTagEditorAtCenter('section', '', sectionKey)
}

const openSectionTagEditor = (item: TocItem) => {
  const editor = tuEditorRef.value?.editor
  if (!editor) return

  const flat = collectFlatTocEntries(editor.state.doc, tocCollectContext.value)
  const found = flat.find((entry) => entry.id === item.id)
  if (!found) return
  openSectionTagEditorFromEntry(found)
}


const handleTextTagSpanClick = (spanId: string) => {
  const span = getTextTagSpans(localPageMetadata.value).find((item) => item.id === spanId)
  if (!span) return

  const rangeFrom = typeof span.from === 'number' ? span.from : selectionFrom.value
  const rangeTo = typeof span.to === 'number' ? span.to : selectionTo.value
  const overlappingAnnotation = localAnnotations.value.find((annotation) => (
    annotation.kind !== 'basis'
    && typeof annotation.from === 'number'
    && typeof annotation.to === 'number'
    && annotation.from < rangeTo
    && rangeFrom < annotation.to
  ))

  pendingNoteBlockId.value = ''
  pendingNoteSelectedText.value = span.selectedText
  pendingNoteContextBefore.value = span.contextBefore
  pendingNoteContextAfter.value = span.contextAfter
  pendingNoteFrom.value = rangeFrom
  pendingNoteTo.value = rangeTo
  pendingNoteSpannedBlockIds.value = []
  pendingNoteSpannedBlockMetadata.value = []
  pendingNoteTags.value = [...span.tags]
  pendingTextTagSpanId.value = span.id
  editingAnnotation.value = overlappingAnnotation ? { ...overlappingAnnotation } : undefined
  noteEditorVisible.value = true
}

const handleTextTagSpansMapped = (spans: TextTagSpan[]) => {
  const nextMetadata = setTextTagSpansInMetadata(localPageMetadata.value, spans)
  if (JSON.stringify(nextMetadata.textTagSpans ?? []) === JSON.stringify(localPageMetadata.value.textTagSpans ?? [])) {
    return
  }
  localPageMetadata.value = nextMetadata
  emitLocalContentChange()
}

const bumpTextTagSpanRevision = () => {
  textTagSpanRevision.value += 1
}

const handleEditSectionTagsFromSelection = () => {
  const editor = tuEditorRef.value?.editor
  if (!editor) return

  const entry = resolveSectionEntryAtEditor(editor, tocCollectContext.value)
  if (!entry) return
  openSectionTagEditorFromEntry(entry)
}

const openSectionAnnotationFromTocEntry = (entryId: string) => {
  const editor = tuEditorRef.value?.editor
  if (!editor) return

  let flat = collectFlatTocEntries(editor.state.doc, tocCollectContext.value)
  let entry = flat.find((item) => item.id === entryId)
  if (!entry) return

  if (entry.sourceType === 'local') {
    ensureLocalHeadingBlockId(entry)
    flat = collectFlatTocEntries(editor.state.doc, tocCollectContext.value)
  }

  const payload = getTocEntryExcerptContent(editor.state.doc, flat, entryId, tocCollectContext.value)
  if (!payload) return

  const blockIds = collectTocEntryBasisBlockIds(editor.state.doc, flat, entryId, tocCollectContext.value)
  if (blockIds.length === 0) return

  pendingNoteBlockId.value = ''
  pendingNoteSelectedText.value = payload.text
  pendingNoteContextBefore.value = ''
  pendingNoteContextAfter.value = ''
  pendingNoteFrom.value = 0
  pendingNoteTo.value = 0
  pendingNoteSpannedBlockIds.value = blockIds
  pendingNoteSpannedBlockMetadata.value = normalizeSpannedBlockMetadata(blockIds, [])
  pendingNoteTags.value = []
  pendingTextTagSpanId.value = ''
  editingAnnotation.value = undefined
  noteEditorVisible.value = true
}

const openBlockAnnotationFromGutter = (blockId: string) => {
  const editor = tuEditorRef.value?.editor
  if (!editor) return

  const payload = getBlockExcerptContent(editor.state.doc, blockId, tocCollectContext.value)
  if (!payload) return

  const blockIds = collectBasisBlockIds(editor.state.doc, blockId, tocCollectContext.value)
  pendingNoteBlockId.value = ''
  pendingNoteSelectedText.value = payload.text
  pendingNoteContextBefore.value = ''
  pendingNoteContextAfter.value = ''
  pendingNoteFrom.value = 0
  pendingNoteTo.value = 0
  pendingNoteSpannedBlockIds.value = blockIds
  pendingNoteSpannedBlockMetadata.value = normalizeSpannedBlockMetadata(blockIds, [])
  pendingNoteTags.value = []
  pendingTextTagSpanId.value = ''
  editingAnnotation.value = undefined
  noteEditorVisible.value = true
}

const openKnowledgeRelationForTocEntry = (entryId: string) => {
  const editor = tuEditorRef.value?.editor
  const pageId = workspaceStore.currentPageId
  const kbId = workspaceStore.currentKbId
  if (!editor || !pageId || !kbId) return

  let flat = collectFlatTocEntries(editor.state.doc, tocCollectContext.value)
  let entry = flat.find((item) => item.id === entryId)
  if (!entry) return

  if (entry.sourceType === 'local') {
    ensureLocalHeadingBlockId(entry)
    flat = collectFlatTocEntries(editor.state.doc, tocCollectContext.value)
    entry = flat.find((item) => item.id === entryId) ?? entry
  }

  const sectionKey = getSectionTagKey(entry)
  knowledgeSourceAnchor.value = sectionAnchor(
    pageId,
    sectionKey,
    entry.text?.trim() || undefined,
  )
  knowledgeAnchorPickerVisible.value = true
}

const handleLineAnnotateFromGutter = (blockId: string) => {
  openBlockAnnotationFromGutter(blockId)
}

const handleLineCreateKnowledgeRelationFromGutter = (blockId: string) => {
  const editor = tuEditorRef.value?.editor
  const pageId = workspaceStore.currentPageId
  const kbId = workspaceStore.currentKbId
  if (!editor || !pageId || !kbId) return

  knowledgeSourceAnchor.value = buildBlockAnchor(editor, pageId, blockId)
  if (!knowledgeSourceAnchor.value) return
  knowledgeAnchorPickerVisible.value = true
}

const handleSectionAnnotateFromGutter = (entryId: string) => {
  openSectionAnnotationFromTocEntry(entryId)
}

const handleSectionMarkExcerptFromGutter = (entryId: string) => {
  openMarkExcerptForTocEntry(entryId)
}

const handleSectionSetBasisFromGutter = (entryId: string) => {
  openSetBasisForTocEntry(entryId)
}

const handleSectionCreateKnowledgeRelationFromGutter = (entryId: string) => {
  openKnowledgeRelationForTocEntry(entryId)
}

const handleEditSectionTagsFromNodeView = () => {
  const editor = tuEditorRef.value?.editor
  const blockId = nodeViewToolbar.blockId
  if (!editor || !blockId) return
  if (!EMBED_TOC_SOURCE_TYPES.has(nodeViewToolbar.sourceType)) return

  const entry = resolveRefGroupSectionEntry(editor, tocCollectContext.value, blockId) ?? {
    id: `ref-group-${blockId}`,
    blockId,
    level: 1,
    text: '',
    pos: 0,
    sortIndex: 0,
    sourceType: 'ref-group' as const,
  }
  openSectionTagEditorFromEntry(entry)
}

const handleTocEditTags = () => {
  const item = tocContextMenu.value.item
  if (!item) return
  openSectionTagEditor(item)
  closeTocContextMenu()
}

const handleOpenPageTagEditor = () => {
  tagEditorBlockTags.value = [...pageTags.value]
  openTagEditorAtCenter('page')
}

const handleTagFilterSelect = (tag: BlockTag) => {
  const pageId = workspaceStore.currentPageId
  if (!pageId) return
  setActiveTagFilter(pageId, tag)
  void nextTick(() => {
    reconcileSectionTagsOnLoad()
    dispatchTagFilterRefresh(tuEditorRef.value?.editor)
  })
}

const handleTagFilterClear = () => {
  const pageId = workspaceStore.currentPageId
  if (!pageId) return
  setActiveTagFilter(pageId, null)
  void nextTick(() => {
    dispatchTagFilterRefresh(tuEditorRef.value?.editor)
  })
}

const handleOpenTagEditor = (blockId: string) => {
  const found = findEmbedNodeByBlockId(blockId)
  const metadata = (found?.node.attrs?.metadata || {}) as { tags?: BlockTag[] }
  tagEditorBlockTags.value = normalizeBlockTags(metadata.tags)
  openTagEditorAtCenter('block', blockId)
}

const closeTagEditor = () => {
  tagEditorState.value.visible = false
  tagEditorState.value.blockId = ''
  tagEditorState.value.sectionKey = ''
  tagEditorState.value.textSpanId = ''
  tagEditorState.value.scope = 'page'
  pendingTextTagSpan.value = null
}

const applyBlockTags = (blockId: string, tags: BlockTag[]) => {
  const editor = tuEditorRef.value?.editor
  if (!editor || !blockId) return

  const found = findEmbedNodeByBlockId(blockId)
  if (!found) return

  const existingMetadata = { ...(found.node.attrs?.metadata as Record<string, unknown> || {}) }
  const normalizedTags = normalizeBlockTags(tags)

  editor.chain().focus().command(({ tr, dispatch }) => {
    if (!dispatch) return true
    const nextMetadata = { ...existingMetadata }
    if (normalizedTags.length > 0) {
      nextMetadata.tags = normalizedTags
    } else {
      delete nextMetadata.tags
    }
    tr.setNodeMarkup(found!.pos, undefined, {
      ...found!.node.attrs,
      metadata: nextMetadata,
    })
    return true
  }).run()

  localDocument.value = editor.getJSON()
  emitLocalContentChange()
}

const updateBlockTags = (tags: BlockTag[]) => {
  tagEditorBlockTags.value = tags
  if (tagEditorState.value.scope === 'page') {
    const normalizedTags = normalizeBlockTags(tags)
    const metadata = { ...localPageMetadata.value }
    if (normalizedTags.length > 0) {
      metadata.tags = normalizedTags
    } else {
      delete metadata.tags
    }
    localPageMetadata.value = metadata
    emitLocalContentChange()
    void refreshKbTagPool()
    return
  }

  if (tagEditorState.value.scope === 'section') {
    const key = tagEditorState.value.sectionKey
    if (!key) return
    let metadata = setSectionTagsInMetadata(localPageMetadata.value, key, tags)
    const editor = tuEditorRef.value?.editor
    if (editor) {
      const flat = collectFlatTocEntries(editor.state.doc, tocCollectContext.value)
      metadata = pruneOrphanSectionTags(
        metadata,
        collectValidSectionTagKeys(flat, editor.state.doc, metadata),
      )
      const entry = findLocalSectionEntryForTagKey(flat, editor.state.doc, key)
      if (entry) {
        metadata = setSectionTagAnchor(metadata, key, { text: entry.text, level: entry.level })
        const blockId = key.slice('local:'.length)
        if (syncHeadingBlockIdAtPos(entry.pos, blockId)) {
          emitLocalContentChange()
        }
      }
    }
    localPageMetadata.value = metadata
    emitLocalContentChange()
    void refreshKbTagPool()
    return
  }

  if (tagEditorState.value.scope === 'text-span') {
    const normalizedTags = normalizeBlockTags(tags)
    const spanId = tagEditorState.value.textSpanId
    let metadata = { ...localPageMetadata.value }

    if (normalizedTags.length === 0) {
      if (spanId) {
        metadata = removeTextTagSpan(metadata, spanId)
      }
    } else if (spanId) {
      const existing = getTextTagSpans(metadata).find((item) => item.id === spanId)
      if (existing) {
        metadata = upsertTextTagSpan(metadata, { ...existing, tags: normalizedTags })
      }
    } else if (pendingTextTagSpan.value) {
      metadata = upsertTextTagSpan(metadata, {
        ...pendingTextTagSpan.value,
        tags: normalizedTags,
      })
    }

    localPageMetadata.value = metadata
    pendingTextTagSpan.value = null
    bumpTextTagSpanRevision()
    emitLocalContentChange()
    void refreshKbTagPool()
    return
  }

  if (tagEditorState.value.blockId) {
    applyBlockTags(tagEditorState.value.blockId, tags)
    void refreshKbTagPool()
  }
}

const editorAnnotations = computed(() => {
  // All annotations apply to the entire page content
  if ((localAnnotations.value || []).length) {
    return { 'page-content': localAnnotations.value ?? [] } as Record<string, TextAnnotation[]>
  }
  return {} as Record<string, TextAnnotation[]>
})
const allAnnotations = computed(() => localAnnotations.value)

// --- Note / Annotation ---
const handleAddNoteFromSelection = () => {
  const payload = getSelectionAnnotationPayload(selectionFrom.value, selectionTo.value)
  const hasText = !!payload.selectedText
  if (!hasText && selectionSpannedBlockIds.value.length === 0) return

  const existingSpan = hasText
    ? findTextTagSpanAtRange(
      getTextTagSpans(localPageMetadata.value),
      selectionFrom.value,
      selectionTo.value,
    )
    : null

  pendingNoteBlockId.value = ''
  pendingNoteSelectedText.value = payload.selectedText
  pendingNoteContextBefore.value = payload.contextBefore
  pendingNoteContextAfter.value = payload.contextAfter
  pendingNoteFrom.value = payload.from ?? selectionFrom.value
  pendingNoteTo.value = payload.to ?? selectionTo.value
  pendingNoteSpannedBlockIds.value = selectionSpannedBlockIds.value
  pendingNoteSpannedBlockMetadata.value = selectionSpannedBlockMetadata.value
  pendingNoteTags.value = existingSpan ? [...existingSpan.tags] : []
  pendingTextTagSpanId.value = existingSpan?.id ?? ''

  editingAnnotation.value = undefined
  noteEditorVisible.value = true
}

const applyTextTagSpanFromMarking = (tags: BlockTag[]) => {
  const normalizedTags = normalizeBlockTags(tags)
  const spanId = pendingTextTagSpanId.value
  let metadata = { ...localPageMetadata.value }
  let changed = false

  if (normalizedTags.length === 0) {
    if (spanId) {
      metadata = removeTextTagSpan(metadata, spanId)
      changed = true
    }
  } else if (spanId) {
    const existing = getTextTagSpans(metadata).find((item) => item.id === spanId)
    if (existing) {
      metadata = upsertTextTagSpan(metadata, { ...existing, tags: normalizedTags })
      changed = true
    }
  } else if (pendingNoteSelectedText.value.trim()) {
    const editor = tuEditorRef.value?.editor
    const payload = editor
      ? getSelectionAnnotationPayload(pendingNoteFrom.value, pendingNoteTo.value)
      : {
        selectedText: pendingNoteSelectedText.value,
        contextBefore: pendingNoteContextBefore.value,
        contextAfter: pendingNoteContextAfter.value,
        from: pendingNoteFrom.value,
        to: pendingNoteTo.value,
      }
    let span = createTextTagSpanFromSelection({
      selectedText: payload.selectedText || pendingNoteSelectedText.value,
      contextBefore: payload.contextBefore ?? pendingNoteContextBefore.value,
      contextAfter: payload.contextAfter ?? pendingNoteContextAfter.value,
      from: payload.from ?? pendingNoteFrom.value,
      to: payload.to ?? pendingNoteTo.value,
      blockId: payload.blockId,
    }, normalizedTags)
    if (editor) {
      span = resolveTextTagSpan(editor.state.doc, span)
    }
    metadata = upsertTextTagSpan(metadata, span)
    changed = true
  }

  if (changed) {
    localPageMetadata.value = metadata
    bumpTextTagSpanRevision()
  }
}

const resetTextMarkingPending = () => {
  noteEditorVisible.value = false
  editingAnnotation.value = undefined
  hasSelection.value = false
  selectionBlockIndex.value = -1
  selectionBlockId.value = ''
  pendingNoteBlockId.value = ''
  pendingNoteSelectedText.value = ''
  pendingNoteFrom.value = 0
  pendingNoteTo.value = 0
  pendingNoteSpannedBlockIds.value = []
  pendingNoteSpannedBlockMetadata.value = []
  pendingNoteTags.value = []
  pendingTextTagSpanId.value = ''
}

const handleSaveAnnotation = (payload: { note: string; tags: BlockTag[] }) => {
  const note = payload.note.trim()
  const now = Date.now()
  const existing = editingAnnotation.value
  let annotations = [...localAnnotations.value]

  if (existing) {
    const idx = annotations.findIndex((item) => item.id === existing.id)
    if (idx >= 0) {
      if (note) {
        annotations[idx] = { ...existing, note, updatedAt: now }
      } else {
        annotations = annotations.filter((item) => item.id !== existing.id)
      }
    }
  } else if (note) {
    const hasText = !!pendingNoteSelectedText.value
    const hasSpannedBlocks = pendingNoteSpannedBlockIds.value.length > 0
    const isBlockOnly = !hasText && hasSpannedBlocks
    const scope: 'text' | 'block' | 'compound' = isBlockOnly ? 'block' : hasSpannedBlocks ? 'compound' : 'text'
    const spannedBlockMetadata = hasSpannedBlocks
      ? normalizeSpannedBlockMetadata(pendingNoteSpannedBlockIds.value, pendingNoteSpannedBlockMetadata.value)
      : undefined
    annotations.push({
      id: `annot-${now}-${Math.random().toString(36).substr(2, 6)}`,
      selectedText: pendingNoteSelectedText.value,
      contextBefore: pendingNoteContextBefore.value,
      contextAfter: pendingNoteContextAfter.value,
      note,
      color: scope === 'compound' ? '#A5D6A7' : scope === 'block' ? '#90CAF9' : '#FFEB3B',
      createdAt: now,
      updatedAt: now,
      from: hasText ? pendingNoteFrom.value : undefined,
      to: hasText ? pendingNoteTo.value : undefined,
      blockId: '',
      anchorVersion: hasText ? 1 : undefined,
      lastResolvedAt: hasText ? now : undefined,
      unresolved: false,
      scope,
      spannedBlockIds: hasSpannedBlocks ? pendingNoteSpannedBlockIds.value : undefined,
      spannedBlockMetadata,
    })
  }

  localAnnotations.value = annotations
  applyTextTagSpanFromMarking(payload.tags)
  emitLocalContentChange()
  resetTextMarkingPending()
}

const sortAnnotationsByTimeDesc = (annotations: TextAnnotation[]) => {
  return [...annotations].sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0))
}

const rectFromPoint = (clientX: number, clientY: number): FloatingAnchorRect => ({
  top: clientY,
  left: clientX,
  right: clientX,
  bottom: clientY,
  width: 0,
  height: 0,
})

const unionDomRects = (rects: DOMRect[]): FloatingAnchorRect | null => {
  if (rects.length === 0) return null
  const left = Math.min(...rects.map((r) => r.left))
  const top = Math.min(...rects.map((r) => r.top))
  const right = Math.max(...rects.map((r) => r.right))
  const bottom = Math.max(...rects.map((r) => r.bottom))
  return { left, top, right, bottom, width: right - left, height: bottom - top }
}

const resolveBlockIdsAnchorRect = (blockIds: string[]): FloatingAnchorRect | null => {
  const editorDom = tuEditorRef.value?.editor?.view.dom
  if (!editorDom || blockIds.length === 0) return null
  const rects: DOMRect[] = []
  for (const blockId of blockIds) {
    const el = editorDom.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(blockId)}"]`)
    if (el) rects.push(el.getBoundingClientRect())
  }
  return unionDomRects(rects)
}

const resolveAnnotationAnchorRect = (
  annotation: TextAnnotation,
  fallback: FloatingAnchorRect,
): FloatingAnchorRect => {
  if ((annotation.scope === 'block' || annotation.scope === 'compound') && annotation.spannedBlockIds?.length) {
    return resolveBlockIdsAnchorRect(annotation.spannedBlockIds) ?? fallback
  }
  return fallback
}

const handleAnnotationClick = (payload: { annotationId: string; annotationIds?: string[]; event: MouseEvent }) => {
  const annotations = getBlockAnnotations()
  const ids = payload.annotationIds?.length ? payload.annotationIds : [payload.annotationId]
  const idSet = new Set(ids)
  const matched = sortAnnotationsByTimeDesc(annotations.filter(a => idSet.has(a.id)))
  const annotation = matched[0] ?? annotations.find(a => a.id === payload.annotationId)
  if (!annotation) return
  notePopoverAnnotation.value = annotation
  notePopoverAnnotations.value = matched.length ? matched : [annotation]
  const highlightRect = (payload.event.target as HTMLElement | null)
    ?.closest('[data-tu-annotation-id]')
    ?.getBoundingClientRect()
  const fallback = highlightRect ?? rectFromPoint(payload.event.clientX, payload.event.clientY)
  notePopoverAnchor.value = resolveAnnotationAnchorRect(annotation, fallback)
  notePopoverVisible.value = true
  updateNotePopoverPosition()
}

const getBlockAnnotations = (): TextAnnotation[] => {
  return localAnnotations.value
}

const getBlockDisplayType = (block: Block | undefined, fallback: string): string => {
  if (!block) return fallback
  if (block.type === 'x6') return 'x6Block'
  if (block.type === 'line') return 'timelineBlock'
  if (block.type === 'ref') return 'refBlock'
  if (block.type === 'spacer') return 'spacerBlock'
  if (block.type === 'table') return 'tableBlock'
  if (block.type === 'multiTable') return 'multiTableBlock'
  if (block.type === 'externalResource') return 'externalResourceBlock'
  if (block.type === 'richtext' || block.type === 'richText') return 'paragraph'
  return block.type || fallback
}

function findBlockMetaInEditor(blockId: string): { blockType?: string; title?: string } | undefined {
  const editor = tuEditorRef.value?.editor
  if (!editor) return undefined
  let found: { blockType?: string; title?: string } | undefined
  editor.state.doc.descendants((node) => {
    if (node.attrs?.blockId !== blockId) return true
    found = {
      blockType: node.type.name,
      title: typeof node.attrs.title === 'string' ? node.attrs.title : undefined,
    }
    return false
  })
  return found
}

const normalizeSpannedBlockMetadata = (
  blockIds: string[],
  metadata: SpannedBlockInfo[],
): SpannedBlockInfo[] => {
  const byId = new Map(metadata.map(item => [item.blockId, item]))
  return blockIds.map((blockId) => {
    const fromEditor = findBlockMetaInEditor(blockId)
    const existing = byId.get(blockId)
    return {
      blockId,
      blockType: existing?.blockType || fromEditor?.blockType || 'block',
      title: existing?.title || fromEditor?.title,
    }
  })
}

const handleAnnotationsMapped = (mappedAnnotations: TextAnnotation[]) => {
  if (annotationPersistTimer) clearTimeout(annotationPersistTimer)
  annotationPersistTimer = setTimeout(() => {
    annotationPersistTimer = null
    const byId = new Map(mappedAnnotations.map((a) => [a.id, a]))
    const next = localAnnotations.value.map((a) => byId.get(a.id) ?? a)
    const changed = next.some((a, i) => {
      const prev = localAnnotations.value[i]
      return prev.from !== a.from || prev.to !== a.to || prev.unresolved !== a.unresolved || prev.anchorVersion !== a.anchorVersion
    })
    if (changed) {
      localAnnotations.value = next
      emitLocalContentChange()
    }
  }, 400)
}

const handleCompoundBadgeClick = (_blockId: string, annotationId: string, clientY: number, clientX: number) => {
  const related = sortAnnotationsByTimeDesc(localAnnotations.value.filter(a => a.id === annotationId))
  const annotation = related[0] ?? localAnnotations.value.find(a => a.id === annotationId)
  if (!annotation) return
  notePopoverAnnotation.value = annotation
  notePopoverAnnotations.value = related.length ? related : [annotation]
  const fallback = rectFromPoint(clientX, clientY)
  notePopoverAnchor.value = resolveAnnotationAnchorRect(annotation, fallback)
  notePopoverVisible.value = true
  updateNotePopoverPosition()
}

const handleEditAnnotation = (annotation?: TextAnnotation) => {
  const target = annotation ?? notePopoverAnnotation.value
  if (!target || target.kind === 'basis') return

  const rangeFrom = typeof target.from === 'number' ? target.from : 0
  const rangeTo = typeof target.to === 'number' ? target.to : 0
  const existingSpan = (typeof target.from === 'number' && typeof target.to === 'number')
    ? findTextTagSpanAtRange(getTextTagSpans(localPageMetadata.value), rangeFrom, rangeTo)
    : null

  pendingNoteBlockId.value = ''
  pendingNoteSelectedText.value = target.selectedText
  pendingNoteContextBefore.value = target.contextBefore
  pendingNoteContextAfter.value = target.contextAfter
  pendingNoteFrom.value = rangeFrom
  pendingNoteTo.value = rangeTo
  pendingNoteTags.value = existingSpan ? [...existingSpan.tags] : []
  pendingTextTagSpanId.value = existingSpan?.id ?? ''
  editingAnnotation.value = { ...target }
  noteEditorVisible.value = true
  notePopoverVisible.value = false
}

const handleNavigateBasisFromPopover = (annotation?: TextAnnotation) => {
  const target = annotation ?? notePopoverAnnotation.value
  if (!target?.basisBinding) return
  notePopoverVisible.value = false
  navigateToHeadingSource(target.basisBinding)
}

const handleDeleteAnnotation = (annotation?: TextAnnotation) => {
  const target = annotation ?? notePopoverAnnotation.value
  if (!target) return

  localAnnotations.value = localAnnotations.value.filter(a => a.id !== target.id)
  emitLocalContentChange()

  notePopoverAnnotations.value = notePopoverAnnotations.value.filter(item => item.id !== target.id)
  notePopoverAnnotation.value = notePopoverAnnotations.value[0] ?? null
  notePopoverVisible.value = notePopoverAnnotations.value.length > 0
  if (!notePopoverVisible.value) notePopoverAnchor.value = null
}

// --- Paste URL detection ---
const handleGlobalPaste = (event: ClipboardEvent) => {
  if (!props.editable) return
  const clipboardText = event.clipboardData?.getData('text/plain') ?? ''
  const url = normalizePastedUrl(clipboardText)
  if (!url) return

  const editor = tuEditorRef.value?.editor
  if (!editor) return

  const { empty, from, to } = editor.state.selection
  const selectedText = empty ? '' : editor.state.doc.textBetween(from, to, ' ').trim()

  if (!empty) {
    editor.chain().focus().setLink({ href: url }).run()
    registerExternalLinkResource(url, selectedText || url, selectedText || undefined)
    event.preventDefault()
    event.stopPropagation()
    showToast('链接已插入')
    return
  }

  registerExternalLinkResource(url, url)
}

// --- Lifecycle ---
onMounted(() => {
  document.addEventListener('paste', handleGlobalPaste, true)
  document.addEventListener('click', closeTocContextMenu)

  blockSyncManager.onStatusChange((status, error) => {
    if (status === 'syncing') {
      showToast('正在同步内容...')
    } else if (status === 'synced') {
      showToast('内容已同步到服务器')
    } else if (status === 'error') {
      showToast(`同步失败：${error || '网络错误'}`)
    }
  })
})

onBeforeUnmount(() => {
  clearUrlHoverPinTimer()
  clearUrlHoverDismissTimer()
  if (annotationPersistTimer) {
    clearTimeout(annotationPersistTimer)
    annotationPersistTimer = null
  }
  document.removeEventListener('paste', handleGlobalPaste, true)
  document.removeEventListener('click', closeTocContextMenu)
  blockSyncManager.destroy()
})
</script>

<template>
  <div class="tu-editor-page">
    <!-- 页面级固定顶栏：编辑操作 + 作用于整页的筛选等 -->
    <header v-if="showPageChrome" class="page-chrome">
      <div v-if="editable" class="page-chrome__actions">
        <button
          class="toolbar-button"
          @click="handleInsertLinkButtonClick"
          title="在当前选中文字位置插入链接"
        >
          插入链接
        </button>
        <button
          class="toolbar-button"
          @click="handleOpenResourcePicker"
          title="插入外部资源或图书节选"
        >
          插入资源
        </button>
        <button
          class="toolbar-button"
          @click="handleExtractSelectionButtonClick"
          title="提取选中文本为新块"
        >
          提取成块
        </button>
      </div>
      <span
        v-if="editable && filterableTags.length > 0"
        class="page-chrome__sep"
        aria-hidden="true"
      />
      <TagFilterBar
        v-if="filterableTags.length > 0"
        embedded
        :tags="filterableTags"
        :active-tag="activeTagFilter"
        @select="handleTagFilterSelect"
        @clear="handleTagFilterClear"
      />
    </header>

    <!-- 链接插入弹窗 -->
    <form
      v-if="linkPopoverVisible"
      class="link-popover"
      :style="{ top: `${linkPopoverPosition.top}px`, left: `${linkPopoverPosition.left}px`, zIndex: linkPopoverPosition.zIndex }"
      @submit.prevent="submitLinkPopover"
      @mousedown.stop
      @click.stop
      @keydown.esc.prevent.stop="closeLinkPopover"
    >
      <label>
        <span>链接</span>
        <input
          ref="linkPopoverUrlInput"
          v-model="linkPopoverUrl"
          type="url"
          placeholder="https://example.com"
          required
        />
      </label>
      <label>
        <span>文字</span>
        <input
          v-model="linkPopoverLabel"
          type="text"
          placeholder="显示文字"
        />
      </label>
      <div class="link-popover__actions">
        <button type="button" @click="closeLinkPopover">取消</button>
        <button type="submit" :disabled="!linkPopoverUrl.trim()">插入</button>
      </div>
    </form>

    <UrlHoverToolbar
      :visible="urlHoverToolbarVisible"
      :target="urlHoverTarget"
      :editor="tiptapEditor"
      :suppressed="urlHoverToolbarSuppressed"
      :pinning="urlHoverToolbarPinned"
      @select-mode="handleUrlDisplayModeSelect"
      @height-change="handleUrlEmbedHeightChange"
      @mouseenter="handleUrlHoverToolbarEnter"
      @mouseleave="handleUrlHoverToolbarLeave"
    />

    <section class="page-title-row">
      <input
        v-if="editable"
        v-model="pageTitleDraft"
        class="page-title-input"
        type="text"
        aria-label="页面标题"
        placeholder="未命名页面"
        @focus="onPageTitleFocus"
        @input="emit('page-title-change', pageTitleDraft)"
        @blur="onPageTitleBlur"
        @keydown.enter="focusEditorFromStart"
      />
      <h1 v-else class="page-title-heading">{{ pageTitleDraft || '未命名页面' }}</h1>
      <PageTagsBar
        v-if="editable || pageTags.length > 0"
        class="page-title-row__tags"
        :tags="pageTags"
        :editable="editable"
        @edit="handleOpenPageTagEditor"
      />
    </section>

    <div class="content-shell" :class="{ 'content-shell--toc-open': tocExpanded && tocItems.length > 0 }">
      <div class="content-container">
        <TuEditor
          ref="tuEditorRef"
          :document="localDocument"
          :editable="editable"
          :annotations="editorAnnotations"
          @update:document="handleDocumentChange"
          @selection-change="handleSelectionChange"
          @annotation-click="handleAnnotationClick"
          @annotations-mapped="handleAnnotationsMapped"
          @compound-badge-click="handleCompoundBadgeClick"
          @open-block-picker="handleOpenBlockPicker"
          @open-resource-picker="handleOpenResourcePicker"
          @open-pdf-excerpt-picker="handleOpenPdfExcerptPicker"
          @edit-pdf-excerpt-source="handleEditPdfExcerptSource"
          @open-tag-editor="handleOpenTagEditor"
          @block-click="handleBlockClick"
          @mark-block-excerpt="handleMarkBlockExcerpt"
          @set-block-basis="handleSetBlockBasis"
          @line-annotate="handleLineAnnotateFromGutter"
          @line-create-knowledge-relation="handleLineCreateKnowledgeRelationFromGutter"
          @section-annotate="handleSectionAnnotateFromGutter"
          @section-mark-excerpt="handleSectionMarkExcerptFromGutter"
          @section-set-basis="handleSectionSetBasisFromGutter"
          @section-create-knowledge-relation="handleSectionCreateKnowledgeRelationFromGutter"
          @heading-source-click="handleHeadingSourceClick"
          @text-tag-span-click="handleTextTagSpanClick"
          @text-tag-spans-mapped="handleTextTagSpansMapped"
          @url-hover-change="handleUrlHoverChange"
        />
      </div>

      <aside
        v-if="tocItems.length > 0"
        class="page-toc"
        :class="{ 'page-toc--collapsed': !tocExpanded }"
      >
        <div class="page-toc__card">
          <button
            type="button"
            class="page-toc__header"
            @click="tocExpanded = false"
          >
            <span class="page-toc__title">目录</span>
            <span class="page-toc__toggle">收起</span>
          </button>
          <div v-if="tocExpanded && allExpandableTocIds.length > 0" class="page-toc__actions">
            <button
              type="button"
              class="page-toc__action-btn"
              @click="toggleAllTocItems"
            >
              {{ allTocItemsExpanded ? '全部收起' : '全部展开' }}
            </button>
          </div>
          <div v-show="tocExpanded" class="page-toc__list">
            <TocTreeList
              :items="tocItems"
              :highlighted-block-id="highlightedBlockId"
              :section-tags-by-item-id="sectionTagsByItemId"
              :is-expanded="isTocItemExpanded"
              @click="handleTocItemClick"
              @toggle="toggleTocItem"
              @context-menu="handleTocContextMenu"
              @source-click="handleTocSourceClick"
            />
          </div>
        </div>
      </aside>

      <!-- Floating TOC expand button (visible only when collapsed) -->
      <button
        v-if="!tocExpanded && tocItems.length > 0"
        type="button"
        class="page-toc__floating-toggle"
        @click="tocExpanded = true"
        title="展开目录"
      >
        目录
      </button>

      <!-- NodeView floating toolbar -->
      <div
        v-if="nodeViewToolbar.visible"
        class="nodeview-toolbar"
        :style="{ top: nodeViewToolbarPosition.top + 'px', left: nodeViewToolbarPosition.left + 'px', zIndex: nodeViewToolbarPosition.zIndex }"
        @mousedown.stop
        @click.stop
      >
        <button
          v-if="nodeViewToolbar.sourceType === 'pdfExcerptBlock'"
          class="nodeview-toolbar__btn"
          @click="handleEditPdfExcerptSource(nodeViewToolbar.blockId)"
        >更改来源</button>
        <button
          v-if="nodeViewToolbar.canPromoteToPage"
          class="nodeview-toolbar__btn"
          @click="promoteSelectedEmbedToPage"
        >{{ nodeViewToolbar.isMindmapEmbed ? '升级为思维导图页' : '升级为画板页' }}</button>
        <button
          v-if="nodeViewToolbar.canAddNote"
          class="nodeview-toolbar__btn"
          @click="handleAddNoteFromSelection"
        >标注</button>
        <button
          class="nodeview-toolbar__btn"
          @click="handleMarkNodeViewBlockExcerpt"
        >标记节选</button>
        <button
          class="nodeview-toolbar__btn"
          @click="handleSetNodeViewBlockBasis"
        >设置依据</button>
        <button
          class="nodeview-toolbar__btn"
          @click="handleOpenTagEditor(nodeViewToolbar.blockId)"
        >标签</button>
        <button
          v-if="supportsEmbedTocSettings(nodeViewToolbar.sourceType)"
          class="nodeview-toolbar__btn"
          @click="handleEditSectionTagsFromNodeView"
        >节标签</button>
        <button class="nodeview-toolbar__btn" @click="deleteSelectedNodeView">删除</button>
        <button class="nodeview-toolbar__btn" @click="duplicateSelectedNodeView">复制</button>
        <button
          v-if="supportsEmbedTocSettings(nodeViewToolbar.sourceType)"
          class="nodeview-toolbar__btn"
          @click="openTocSettingsPopover"
        >目录等级</button>
        <button
          v-if="nodeViewToolbar.sourceType === 'refBlock' && nodeViewToolbar.refId"
          class="nodeview-toolbar__btn"
          @click="navigateToReferencedPage"
        >跳转原页面</button>
      </div>

      <div
        v-if="tocSettingsPopover.visible"
        class="toc-settings-popover"
        :style="{ top: tocSettingsPopover.top + 'px', left: tocSettingsPopover.left + 'px' }"
        @mousedown.stop
        @click.stop
      >
        <div class="toc-settings-popover__field">
          <label class="toc-settings-popover__label">目录标题等级</label>
          <select
            v-model.number="tocSettingsForm.titleLevel"
            class="toc-settings-popover__select"
            :disabled="nodeViewToolbar.sourceType === 'refBlock' && tocSettingsForm.hideTitle"
          >
            <option :value="0">自动（跟随上文）</option>
            <option v-for="level in 6" :key="level" :value="level">H{{ level }}</option>
          </select>
        </div>
        <label
          v-if="nodeViewToolbar.sourceType === 'refBlock'"
          class="toc-settings-popover__checkbox-label"
        >
          <input v-model="tocSettingsForm.hideTitle" type="checkbox" />
          不在目录显示外层标题
        </label>
        <div class="toc-settings-popover__actions">
          <button type="button" class="toc-settings-popover__btn toc-settings-popover__btn--cancel" @click="closeTocSettingsPopover">
            取消
          </button>
          <button type="button" class="toc-settings-popover__btn" @click="applyTocSettings">
            确定
          </button>
        </div>
      </div>

    </div>

    <!-- 选中文本工具栏 -->
    <SelectionToolbar
      v-if="editable"
      :editor="tiptapEditor"
      :suppressed="selectionToolbarSuppressed"
      @add-note="handleAddNoteFromSelection"
      @mark-resource-excerpt="handleMarkResourceExcerptFromSelection"
      @set-excerpt-basis="handleSetExcerptBasisFromSelection"
      @mark-heading-source="handleMarkHeadingSourceFromSelection"
      @clear-heading-source="handleClearHeadingSourceFromSelection"
      @edit-section-tags="handleEditSectionTagsFromSelection"
      @create-knowledge-relation="handleCreateKnowledgeRelationFromSelection"
    />

    <KnowledgePointPicker
      :visible="knowledgeAnchorPickerVisible"
      :kb-id="workspaceStore.currentKbId || ''"
      :source-anchor="knowledgeSourceAnchor"
      @update:visible="knowledgeAnchorPickerVisible = $event"
      @created="handleKnowledgeRelationCreated"
    />

    <!-- 引用块选择器 -->
    <BlockPicker
      :visible="showBlockPicker"
      :pages="workspaceStore.pageTree"
      :current-page-id="workspaceStore.currentPageId"
      @select="handleBlockPickerSelect"
      @update:visible="showBlockPicker = $event"
    />

    <ExternalResourcePicker
      :visible="showResourcePicker"
      :mode="resourcePickerMode"
      :initial-excerpt-text="pendingResourceExcerptText"
      :initial-excerpt-title="pendingResourceExcerptTitle"
      @select="handleResourcePickerSelect"
      @excerpt-created="handleResourceExcerptCreated"
      @bind-source="handleBindResourceFromPicker"
      @update:visible="handleResourcePickerVisibleChange"
    />

    <PdfExcerptPicker
      :visible="showPdfExcerptPicker"
      :mode="pdfExcerptPickerMode"
      :initial="pdfExcerptPickerInitial"
      @update:visible="showPdfExcerptPicker = $event"
      @confirm="handlePdfExcerptPickerConfirm"
    />

    <div
      v-if="tocContextMenu.visible"
      ref="tocContextMenuRef"
      class="toc-context-menu"
      :style="{ top: `${tocContextMenuPosition.top}px`, left: `${tocContextMenuPosition.left}px` }"
      @mousedown.prevent
    >
      <button type="button" @click="handleTocEditTags">编辑标签</button>
      <button
        v-if="tocContextMenu.item?.sourceType === 'local' || tocContextMenu.item?.sourceType === 'ref-group'"
        type="button"
        @click="handleTocMarkExcerpt"
      >标记节选</button>
      <button
        v-if="tocContextMenu.item?.sourceType === 'local' || tocContextMenu.item?.sourceType === 'ref-group'"
        type="button"
        @click="handleTocSetBasis"
      >设置依据</button>
      <button
        v-if="tocContextMenu.item?.sourceType === 'local'"
        type="button"
        @click="handleTocMarkSource"
      >标记来源</button>
      <button
        v-if="tocContextMenu.item?.sourceBinding"
        type="button"
        @click="handleTocClearSource"
      >
        解除来源
      </button>
    </div>

    <!-- 标签编辑器 -->
    <BlockMetadataTagEditor
      :visible="tagEditorState.visible"
      :title="tagEditorTitle"
      :selected-tags="tagEditorBlockTags"
      :available-tags="availableTags"
      :top="tagEditorState.top"
      :left="tagEditorState.left"
      @close="closeTagEditor"
      @update:selected-tags="updateBlockTags"
    />

    <!-- 笔记编辑器 -->
    <NoteEditor
      :visible="noteEditorVisible"
      :annotation="editingAnnotation"
      :selected-tags="pendingNoteTags"
      :available-tags="availableTags"
      @save="handleSaveAnnotation"
      @cancel="resetTextMarkingPending"
    />

    <!-- 笔记弹窗 -->
    <NotePopover
      :visible="notePopoverVisible"
      :annotation="notePopoverAnnotation"
      :annotations="notePopoverAnnotations"
      :anchor-rect="notePopoverAnchor"
      :top="notePopoverPosition.top"
      :left="notePopoverPosition.left"
      :z-index="notePopoverPosition.zIndex"
      :kb-id="workspaceStore.currentKbId || ''"
      :page-id="workspaceStore.currentPageId || ''"
      :navigate="knowledgeNavigateHandlers"
      :relation-refresh-key="knowledgeRelationRefreshKey"
      @edit="handleEditAnnotation"
      @delete="handleDeleteAnnotation"
      @navigate-basis="handleNavigateBasisFromPopover"
      @close="notePopoverVisible = false; notePopoverAnnotation = null; notePopoverAnnotations = []; notePopoverAnchor = null"
    />

    <Teleport to="body">
      <div
        v-if="headingSourcePopoverVisible && headingSourcePopoverAnchor"
        class="heading-source-relation-popover"
        :style="{ top: `${headingSourcePopoverTop}px`, left: `${headingSourcePopoverLeft}px` }"
        @mousedown.stop
      >
        <div class="heading-source-relation-popover__header">
          <span>标题关联</span>
          <button type="button" @click="closeHeadingSourcePopover">关闭</button>
        </div>
        <KnowledgeRelationList
          :key="knowledgeRelationRefreshKey"
          :kb-id="workspaceStore.currentKbId || ''"
          :anchor="headingSourcePopoverAnchor"
          :navigate="knowledgeNavigateHandlers"
          :after-navigate="closeHeadingSourcePopover"
        />
        <button
          v-if="headingSourcePopoverBinding"
          type="button"
          class="heading-source-relation-popover__link"
          @click="navigateToHeadingSource(headingSourcePopoverBinding); closeHeadingSourcePopover()"
        >
          查看来源资料
        </button>
      </div>
    </Teleport>

    <!-- Toast 消息 -->
    <div class="toast-container">
      <Toast
        v-for="toast in toastMessages"
        :key="toast.id"
        :message="toast.message"
        @close="removeToast(toast.id)"
      />
    </div>
  </div>
</template>

<style scoped>
.tu-editor-page {
  position: relative;
  min-height: max(100%, max-content);
  display: flex;
  flex-direction: column;
}

.page-chrome {
  position: sticky;
  top: 0;
  z-index: 30;
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  margin: 0 -48px 16px;
  padding: 8px 48px;
  background-color: rgba(245, 245, 245, 0.96);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid #e0e0e0;
  box-shadow: 0 2px 8px rgba(31, 35, 40, 0.06);
}

.page-chrome__actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  flex-shrink: 0;
}

.page-chrome__sep {
  width: 1px;
  align-self: stretch;
  min-height: 24px;
  margin: 2px 4px;
  background: #d9d9d9;
  flex-shrink: 0;
}

.toolbar-button {
  padding: 5px 10px;
  background-color: #1890ff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  transition: background-color 0.3s;
}

.toolbar-button:hover {
  background-color: #40a9ff;
}

.page-title-row {
  flex: 0 0 auto;
  width: 100%;
  box-sizing: border-box;
  margin: 0 0 10px;
  padding: 8px 0 0;
  overflow: visible;
  cursor: text;
}

.page-title-row__tags {
  margin-top: 8px;
  cursor: default;
}

.page-title-input,
.page-title-heading {
  display: block;
  width: 100%;
  box-sizing: border-box;
  margin: 0;
  border: 0;
  background: transparent;
  color: #111827;
  font-family:
    'Segoe UI',
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    Roboto,
    'Helvetica Neue',
    Arial,
    sans-serif;
  font-size: clamp(30px, 4vw, 44px);
  font-weight: 760;
  line-height: 1.28;
  letter-spacing: 0;
  text-rendering: auto;
  overflow: visible;
  padding-left: 2px;
}

.page-title-input {
  padding: 6px 0 10px 2px;
  outline: none;
}

.page-title-heading {
  padding: 6px 0 10px 2px;
}

.page-title-input::placeholder {
  color: #9ca3af;
}

.page-title-input:focus {
  box-shadow: inset 0 -2px 0 rgba(22, 119, 255, 0.28);
}

.content-shell {
  display: flex;
  align-items: flex-start;
  gap: 0;
  width: 100%;
  min-height: 0;
  position: relative;
}

.content-shell--toc-open {
  gap: 20px;
}

.content-container {
  position: relative;
  min-height: 100%;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.page-toc {
  position: sticky;
  top: 72px;
  flex: 0 0 248px;
  width: 248px;
  align-self: flex-start;
  z-index: 24;
  transition: flex-basis 0.2s ease, width 0.2s ease;
}

.page-toc--collapsed {
  flex-basis: 0;
  width: 0;
  min-width: 0;
  overflow: hidden;
  padding: 0;
  border: 0;
  margin: 0;
  opacity: 0;
  pointer-events: none;
}

.page-toc__card {
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 40px);
  overflow: hidden;
  padding: 10px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: rgba(252, 253, 255, 0.94);
  backdrop-filter: blur(10px);
  box-shadow: 0 14px 32px rgba(15, 23, 42, 0.12);
}

.page-toc__header {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #1f2937;
  cursor: pointer;
  text-align: left;
}

.page-toc__header:hover {
  background: rgba(22, 119, 255, 0.08);
}

.page-toc__title {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 700;
}

.page-toc__toggle {
  flex: 0 0 auto;
  color: #6b7280;
  font-size: 12px;
}

.page-toc__floating-toggle {
  position: fixed;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  z-index: 999;
  padding: 12px 6px;
  border: 1px solid #e5e7eb;
  border-right: 0;
  border-radius: 8px 0 0 8px;
  background: rgba(252, 253, 255, 0.94);
  backdrop-filter: blur(10px);
  box-shadow: -4px 0 16px rgba(15, 23, 42, 0.08);
  color: #6b7280;
  font-size: 12px;
  cursor: pointer;
  writing-mode: vertical-rl;
  letter-spacing: 0.06em;
  line-height: 1.4;
  transition: color 0.15s, background 0.15s;
}

.page-toc__floating-toggle:hover {
  color: #1677ff;
  background: #fff;
}

.page-toc__actions {
  display: flex;
  justify-content: flex-end;
  padding: 2px 8px 0;
}

.page-toc__action-btn {
  border: 0;
  background: transparent;
  color: #1677ff;
  font-size: 11px;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  transition: background 0.15s;
}

.page-toc__action-btn:hover {
  background: rgba(22, 119, 255, 0.08);
}

.page-toc__list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 6px;
  overflow: auto;
}

.page-toc :deep(.page-toc__item) {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-width: 0;
  overflow: hidden;
  padding: 6px 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #4b5563;
  cursor: pointer;
  text-align: left;
  transition: background 0.2s ease, color 0.2s ease, transform 0.2s ease;
}

.page-toc :deep(.page-toc__item:hover) {
  background: rgba(22, 119, 255, 0.08);
  color: #0958d9;
}

.page-toc :deep(.page-toc__item--active) {
  background: rgba(22, 119, 255, 0.12);
  color: #0958d9;
}

.page-toc :deep(.page-toc__bullet) {
  flex: 0 0 14px;
  width: 14px;
  min-width: 14px;
  padding-top: 1px;
  font-size: 10px;
  font-weight: 700;
  color: #1677ff;
  text-align: center;
}

.page-toc :deep(.page-toc__bullet--placeholder) {
  visibility: hidden;
  pointer-events: none;
}

.page-toc :deep(.page-toc__item--ref) {
  background: rgba(139, 92, 246, 0.06);
}

.page-toc :deep(.page-toc__item--ref:hover) {
  background: rgba(139, 92, 246, 0.12);
}

.page-toc :deep(.page-toc__item--ref.page-toc__item--active) {
  background: rgba(139, 92, 246, 0.14);
}

.page-toc :deep(.page-toc__bullet--group) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #7c3aed !important;
  cursor: pointer;
}

.page-toc :deep(.page-toc__children .page-toc__item:hover) {
  background: rgba(139, 92, 246, 0.08);
}

.page-toc :deep(.page-toc__children .page-toc__item--active) {
  background: rgba(139, 92, 246, 0.14);
}

.page-toc :deep(.page-toc__children .page-toc__bullet),
.page-toc :deep(.page-toc__inline-ref-child .page-toc__bullet) {
  color: #8b5cf6;
}

.page-toc :deep(.page-toc__local-children) {
  display: flex;
  flex-direction: column;
  margin-left: 10px;
  padding-left: 4px;
  border-left: 1px solid #e5e7eb;
}

.page-toc :deep(.page-toc__local-children .page-toc__group) {
  margin-top: 2px;
}

.page-toc :deep(.page-toc__local-children .page-toc__group:last-child) {
  margin-bottom: 4px;
}

.page-toc :deep(.page-toc__children) {
  display: flex;
  flex-direction: column;
  margin: 2px 0 4px 10px;
  padding-left: 4px;
  border-left: 1px solid #e5e7eb;
}

.page-toc :deep(.page-toc__item .el-tooltip__trigger) {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.page-toc :deep(.page-toc__text) {
  display: block;
  flex: 1;
  min-width: 0;
  font-size: 13px;
  line-height: 1.45;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.toc-settings-popover {
  position: fixed;
  z-index: 1000003;
  min-width: 200px;
  padding: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 16px 36px rgba(15, 23, 42, 0.14);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.toc-settings-popover__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.toc-settings-popover__label {
  font-size: 12px;
  font-weight: 600;
  color: #374151;
}
.toc-settings-popover__select {
  padding: 6px 8px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 13px;
  color: #1f2937;
  background: #fff;
  outline: none;
  cursor: pointer;
}
.toc-settings-popover__select:focus {
  border-color: #1677ff;
  box-shadow: 0 0 0 2px rgba(22, 119, 255, 0.12);
}
.toc-settings-popover__checkbox-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #374151;
  cursor: pointer;
}
.toc-settings-popover__checkbox-label input {
  width: 14px;
  height: 14px;
  cursor: pointer;
}
.toc-settings-popover__actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 2px;
}
.toc-settings-popover__btn {
  padding: 5px 12px;
  border: 1px solid #1677ff;
  border-radius: 6px;
  background: #1677ff;
  color: #fff;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s;
}
.toc-settings-popover__btn:hover {
  background: #4096ff;
}
.toc-settings-popover__btn--cancel {
  border-color: #d1d5db;
  background: #fff;
  color: #374151;
}
.toc-settings-popover__btn--cancel:hover {
  background: #f3f4f6;
}

.nodeview-toolbar {
  position: fixed;
  display: flex;
  gap: 2px;
  padding: 2px 3px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 3px;
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.1);
}
.nodeview-toolbar__btn {
  padding: 2px 7px;
  border: none;
  border-radius: 2px;
  background: transparent;
  color: #374151;
  font-size: 12px;
  line-height: 20px;
  cursor: pointer;
  white-space: nowrap;
}
.nodeview-toolbar__btn:hover {
  background: #f3f4f6;
}

.toc-context-menu {
  position: fixed;
  z-index: 40;
  display: grid;
  gap: 2px;
  min-width: 120px;
  padding: 4px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.12);
}

.toc-context-menu button {
  border: 0;
  background: transparent;
  color: #374151;
  font-size: 12px;
  text-align: left;
  padding: 6px 10px;
  border-radius: 6px;
  cursor: pointer;
}

.toc-context-menu button:hover {
  background: #f3f4f6;
}

.heading-source-relation-popover {
  position: fixed;
  z-index: 60;
  width: min(320px, calc(100vw - 24px));
  padding: 10px 12px;
  border: 1px solid #e8e8e8;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

.heading-source-relation-popover__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 600;
}

.heading-source-relation-popover__header button {
  border: none;
  background: transparent;
  color: #8c8c8c;
  cursor: pointer;
  font-size: 12px;
}

.heading-source-relation-popover__link {
  margin-top: 8px;
  width: 100%;
  border: none;
  border-radius: 6px;
  background: #f6ffed;
  color: #389e0d;
  padding: 6px 8px;
  cursor: pointer;
  font-size: 12px;
}
</style>


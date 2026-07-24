<script setup lang="ts">
import { computed, inject, markRaw, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch, type ComputedRef, type Ref } from 'vue'
import { nodeViewProps, NodeViewWrapper } from '@tiptap/vue-3'
import { buildFileUrl } from '@/api/fileStorage'
import { listResourcePdfRegionNotes } from '@/api/externalResource'
import type { PdfRegionAnchor, TextAnnotation } from '@/api/types'
import {
  collectPdfRegionNotesForBlock,
  filterNotesOverlappingViewport,
  resourcePdfNoteToAnnotation,
} from '@/utils/pdfRegionNotes'
import ResizableBlockWrapper from '../components/ResizableBlockWrapper.vue'
import {
  PDF_EXCERPT_DEFAULT_HEIGHT,
  PDF_EXCERPT_LARGE_DOC_PAGES,
  PDF_EXCERPT_MAX_HEIGHT,
  PDF_EXCERPT_MIN_HEIGHT,
  PDF_EXCERPT_SCROLL_EVENT,
  PDF_EXCERPT_ZOOM_MAX,
  PDF_EXCERPT_ZOOM_MIN,
  PDF_EXCERPT_ZOOM_STEP,
  PDF_EXCERPT_SIDEBAR_DEFAULT_WIDTH,
  PDF_EXCERPT_SIDEBAR_MIN_WIDTH,
  PDF_EXCERPT_SIDEBAR_MAX_WIDTH,
  formatPdfExcerptMetaLabel,
  formatPdfExcerptRangeLabel,
  parsePdfExcerptViewMode,
  resolvePageRange,
  resolvePdfPageVerticalClip,
  normalizePdfClipRatio,
  clipAttrsFromVerticalHits,
  PDF_EXCERPT_CLIP_SELECT_EVENT,
  PDF_EXCERPT_FIT_HEIGHT_EVENT,
  type PdfPageVerticalHit,
} from '@/utils/pdfExcerpt'
import { parseResourceLocator, syncResourceHrefWithPdfPages } from '@/editor/linkLabelSuggestQuery'
import { isResourceLocatorHref } from '@/editor/resourceLinkToPdf'
import { acquirePdfDocument, releasePdfDocument } from '@/utils/pdfDocumentCache'
import type { PdfDocumentProxy } from '@/utils/pdfjsSetup'
import {
  buildPdfSidebarTree,
  collectExpandableNodeIds,
  type PdfSidebarNode,
  type PdfSidebarSource,
} from '@/utils/pdfOutline'
import { PdfPageRenderManager } from '@/utils/pdfPageRender'
import PdfExcerptSidebar from './PdfExcerptSidebar.vue'
import { useExpandCollapse } from '@/composables/useExpandCollapse'

const props = defineProps(nodeViewProps)

const onEditPdfExcerptSource = inject<(blockId: string) => void>('onEditPdfExcerptSource', () => {})
const onPublishPdfRegionNote = inject<(payload: PdfRegionAnchor) => void>('onPublishPdfRegionNote', () => {})
const onPdfRegionAnnotationClick = inject<
  (payload: { annotationId: string; annotation?: TextAnnotation; event: MouseEvent }) => void
>('onPdfRegionAnnotationClick', () => {})
const pagePdfRegionAnnotations = inject<ComputedRef<TextAnnotation[]>>(
  'pagePdfRegionAnnotations',
  computed(() => []),
)
const resourcePdfNotesReloadToken = inject<Ref<number>>('resourcePdfNotesReloadToken', ref(0))

const blockId = computed(() => props.node.attrs.blockId || '')
const fileId = computed(() => String(props.node.attrs.fileId || ''))
const sourceHref = computed(() => String(props.node.attrs.sourceHref || '').trim())
const resourceItemId = computed(() => parseResourceLocator(sourceHref.value)?.itemId || '')
const fileName = computed(() => String(props.node.attrs.fileName || 'PDF'))
const viewMode = computed(() => parsePdfExcerptViewMode(String(props.node.attrs.viewMode || 'excerpt')))
const startPage = computed(() => Number(props.node.attrs.startPage) || 1)
const endPage = computed(() => Number(props.node.attrs.endPage) || 1)
const height = computed(() => Number(props.node.attrs.height) || PDF_EXCERPT_DEFAULT_HEIGHT)
const clipRatio = computed(() => normalizePdfClipRatio(
  Number(props.node.attrs.clipTop) || 0,
  props.node.attrs.clipBottom == null ? 1 : Number(props.node.attrs.clipBottom),
))

const resourcePdfNotes = ref<TextAnnotation[]>([])
let resourceNotesLoadSeq = 0

async function loadResourcePdfNotes() {
  const itemId = resourceItemId.value
  const bid = blockId.value
  if (!itemId || !bid) {
    resourcePdfNotes.value = []
    return
  }
  const seq = ++resourceNotesLoadSeq
  try {
    const notes = await listResourcePdfRegionNotes(itemId)
    if (seq !== resourceNotesLoadSeq) return
    resourcePdfNotes.value = notes.map((note) => resourcePdfNoteToAnnotation(note, bid))
  } catch {
    if (seq !== resourceNotesLoadSeq) return
    resourcePdfNotes.value = []
  }
}

const blockPdfRegionAnnotations = computed(() => {
  const pageLocal = collectPdfRegionNotesForBlock(pagePdfRegionAnnotations.value, {
    blockId: blockId.value,
    fileId: fileId.value,
  }).filter((ann) => !ann.pdfRegion?.resourceItemId)

  const fromResource = filterNotesOverlappingViewport(resourcePdfNotes.value, {
    viewMode: viewMode.value,
    startPage: startPage.value,
    endPage: endPage.value,
    clipTop: clipRatio.value.clipTop,
    clipBottom: clipRatio.value.clipBottom,
  })

  const byId = new Map<string, TextAnnotation>()
  for (const ann of pageLocal) byId.set(ann.id, ann)
  for (const ann of fromResource) byId.set(ann.id, ann)
  return [...byId.values()]
})

const fileUrl = computed(() => (fileId.value ? buildFileUrl(fileId.value) : ''))
const loadError = ref('')
const loading = ref(false)
const largeDocWarning = ref('')
const pageCanvases = ref<Array<{ pageNumber: number; placeholderHeight: number }>>([])
const docRef = shallowRef<PdfDocumentProxy | null>(null)
const sidebarNodes = ref<PdfSidebarNode[]>([])
const sidebarSource = ref<PdfSidebarSource>('pages')
const sidebarOpen = ref(true)
const sidebarWidth = ref(PDF_EXCERPT_SIDEBAR_DEFAULT_WIDTH)
const savedSidebarWidth = ref(PDF_EXCERPT_SIDEBAR_DEFAULT_WIDTH)
const activeNodeId = ref<string | null>(null)
const sidebarExpand = useExpandCollapse()
const pagesScrollRef = ref<HTMLElement | null>(null)
const pdfBlockRef = ref<HTMLElement | null>(null)
const isPdfBlockHovered = ref(false)
const zoomScale = ref(1)
const clipSelectActive = ref(false)
/** While dragging: document-anchored start + mouse-following end (client Y). */
const clipDrag = ref<{
  anchorHit: PdfPageVerticalHit
  currentClientY: number
} | null>(null)
/** After mouseup: waiting for explicit confirm. */
const clipPending = ref<{
  topHit: PdfPageVerticalHit
  bottomHit: PdfPageVerticalHit
} | null>(null)
/** Bumped on pages scroll so selection box / PDF note overlays re-measure. */
const overlayLayoutTick = ref(0)
/** Hide PDF region notes while zoom re-layouts pages; show again after settle. */
const pdfRegionNotesHiddenForZoom = ref(false)
/** Persisted on the block (`notesVisible`); default false when unset. */
const pdfRegionNotesVisible = computed(() => Boolean(props.node.attrs.notesVisible))

let scrollHost: HTMLElement | null = null
let wheelTarget: HTMLElement | null = null
let pendingZoomDelta = 0
let zoomRafId = 0
let clipSelectRoot: HTMLElement | null = null
/** Keep viewport center stable across zoom re-layout. */
let pendingZoomCenter: { xRatio: number; yRatio: number } | null = null
let zoomCenterRestoreRaf = 0
let zoomNoteSettleTimer: ReturnType<typeof setTimeout> | null = null

const pageRefs = new Map<number, HTMLElement>()
let renderManager: PdfPageRenderManager | null = null
let observer: IntersectionObserver | null = null
let resizeObserver: ResizeObserver | null = null
/** Skip ResizeObserver→re-render while applying fit-height (avoids scrollbar width thrash). */
let suppressPdfResizeObserver = false
let boundUrl = ''
let loadGeneration = 0
let resolvedStartPage = 1
let resolvedEndPage = 1
let sidebarResizeLayoutRafId = 0
let sidebarDragging = false
let sidebarResizeStartX = 0
let sidebarResizeStartWidth = 0

const metaLabel = computed(() => formatPdfExcerptMetaLabel(
  fileName.value,
  viewMode.value,
  startPage.value,
  endPage.value,
  viewMode.value === 'full' ? 0 : clipRatio.value.clipTop,
  viewMode.value === 'full' ? 1 : clipRatio.value.clipBottom,
))

/** Below `.page-chrome` (z-index 30) — document overlays must never cover page toolbar. */
const CLIP_SELECT_BOX_Z_INDEX = 20

/**
 * Measure a fixed overlay covering [topClientY, bottomClientY] within the PDF pages viewport.
 * @param edgeMarkers When true (clip-select), scrolled-out ranges leave a 3px stub on the
 *   band edge. When false (saved notes), fully out-of-band ranges return null so overlays
 *   never hang at the edge without their PDF target.
 */
function measureClipSelectBox(
  topClientY: number,
  bottomClientY: number,
  options?: { edgeMarkers?: boolean },
) {
  const root = pagesScrollRef.value
  if (!root) return null
  overlayLayoutTick.value
  const rect = root.getBoundingClientRect()
  const toolbarBottom = getDocumentToolbarBottom()
  // Visible band: intersection of PDF pages viewport and area below document toolbar.
  const bandTop = Math.max(rect.top, toolbarBottom)
  const bandBottom = rect.bottom
  if (bandBottom - bandTop < 1) return null

  const top = Math.min(topClientY, bottomClientY)
  const bottom = Math.max(topClientY, bottomClientY)
  // Fully outside the visible band — never pin notes to the edge.
  if (bottom <= bandTop || top >= bandBottom) {
    if (options?.edgeMarkers) {
      if (bottom <= bandTop) {
        return {
          position: 'fixed' as const,
          left: `${rect.left}px`,
          width: `${rect.width}px`,
          top: `${bandTop}px`,
          height: '3px',
          zIndex: CLIP_SELECT_BOX_Z_INDEX,
        }
      }
      return {
        position: 'fixed' as const,
        left: `${rect.left}px`,
        width: `${rect.width}px`,
        top: `${bandBottom - 3}px`,
        height: '3px',
        zIndex: CLIP_SELECT_BOX_Z_INDEX,
      }
    }
    return null
  }

  const clampedTop = Math.max(bandTop, top)
  const clampedBottom = Math.min(bandBottom, bottom)
  if (clampedBottom - clampedTop < 1) return null

  return {
    position: 'fixed' as const,
    left: `${rect.left}px`,
    width: `${rect.width}px`,
    top: `${clampedTop}px`,
    height: `${Math.max(2, clampedBottom - clampedTop)}px`,
    zIndex: CLIP_SELECT_BOX_Z_INDEX,
  }
}

function getDocumentToolbarBottom(): number {
  const chrome = document.querySelector('.page-chrome')
  if (!(chrome instanceof HTMLElement)) return 0
  return chrome.getBoundingClientRect().bottom
}

const clipSelectBoxStyle = computed(() => {
  overlayLayoutTick.value
  const pending = clipPending.value
  if (pending) {
    const topY = hitToClientY(pending.topHit)
    const bottomY = hitToClientY(pending.bottomHit)
    if (topY == null || bottomY == null) return null
    return measureClipSelectBox(topY, bottomY, { edgeMarkers: true })
  }
  const drag = clipDrag.value
  if (!drag) return null
  const anchorY = hitToClientY(drag.anchorHit)
  if (anchorY == null) return null
  return measureClipSelectBox(anchorY, drag.currentClientY, { edgeMarkers: true })
})

interface PdfRegionOverlayItem {
  annotationId: string
  color: string
  boxStyle: Record<string, string | number>
  markerStyle: Record<string, string | number>
}

const pdfRegionOverlays = computed((): PdfRegionOverlayItem[] => {
  overlayLayoutTick.value
  if (!pdfRegionNotesVisible.value || pdfRegionNotesHiddenForZoom.value) return []
  const root = pagesScrollRef.value
  if (!root) return []

  return blockPdfRegionAnnotations.value.flatMap((ann) => {
    const region = ann.pdfRegion
    if (!region) return []
    const topY = hitToClientY({ pageNumber: region.startPage, ratio: region.clipTop })
    const bottomY = hitToClientY({ pageNumber: region.endPage, ratio: region.clipBottom })
    if (topY == null || bottomY == null) return []
    const box = measureClipSelectBox(topY, bottomY, { edgeMarkers: false })
    if (!box) return []

    const topPx = Number.parseFloat(String(box.top))
    const leftPx = Number.parseFloat(String(box.left))
    const widthPx = Number.parseFloat(String(box.width))
    const heightPx = Number.parseFloat(String(box.height))
    if (!Number.isFinite(topPx) || !Number.isFinite(leftPx) || !Number.isFinite(widthPx)) return []

    const markerTop = topPx + Math.max(0, heightPx) / 2 - 14
    return [{
      annotationId: ann.id,
      color: ann.color || '#FFE082',
      boxStyle: {
        ...box,
        pointerEvents: 'auto',
        cursor: 'pointer',
        zIndex: CLIP_SELECT_BOX_Z_INDEX - 1,
      },
      markerStyle: {
        position: 'fixed' as const,
        top: `${markerTop}px`,
        left: `${leftPx + widthPx + 6}px`,
        zIndex: CLIP_SELECT_BOX_Z_INDEX,
      },
    }]
  })
})

/** Floating confirm bar above the selection marquee (teleported; no PDF layout shift). */
const clipPendingConfirmStyle = computed(() => {
  const box = clipSelectBoxStyle.value
  if (!clipPending.value || !box) return null
  const topPx = Number.parseFloat(String(box.top))
  const leftPx = Number.parseFloat(String(box.left))
  const widthPx = Number.parseFloat(String(box.width))
  if (!Number.isFinite(topPx) || !Number.isFinite(leftPx) || !Number.isFinite(widthPx)) return null
  const toolbarBottom = getDocumentToolbarBottom()
  const preferAbove = topPx - 40
  const top = preferAbove >= toolbarBottom + 4 ? preferAbove : topPx + 8
  return {
    position: 'fixed' as const,
    left: `${leftPx}px`,
    width: `${widthPx}px`,
    top: `${top}px`,
    zIndex: CLIP_SELECT_BOX_Z_INDEX + 1,
  }
})

const sidebarTitle = computed(() => {
  if (sidebarSource.value === 'outline') return '书签'
  if (sidebarSource.value === 'pages') return '目录'
  return '导航'
})

const showSidebar = computed(() => sidebarNodes.value.length > 0 || sidebarSource.value === 'none')
const sidebarExpandableIds = computed(() => collectExpandableNodeIds(sidebarNodes.value))
const sidebarHasNestedNodes = computed(() => sidebarExpandableIds.value.length > 0)
const sidebarEmptyHint = computed(() => (
  sidebarSource.value === 'none'
    ? '该 PDF 无书签目录，请滚动浏览各页'
    : ''
))

const zoomLabel = computed(() => `${Math.round(zoomScale.value * 100)}%`)

/** Show whenever PDF pages are ready (not hover-gated — hover was easy to miss / covered). */
const showZoomBadge = computed(() => (
  !loading.value
  && !loadError.value
  && pageCanvases.value.length > 0
))

function setPageRef(pageNumber: number, el: unknown) {
  if (el instanceof HTMLElement) {
    pageRefs.set(pageNumber, el)
  } else {
    pageRefs.delete(pageNumber)
  }
}

function getPlaceholderHeight(pageNumber: number): number {
  return renderManager?.getPlaceholderHeight(pageNumber) ?? 120
}

function pageClipFor(pageNumber: number) {
  if (clipSelectActive.value) return null
  if (viewMode.value === 'full') return null
  return resolvePdfPageVerticalClip(
    pageNumber,
    startPage.value,
    endPage.value,
    clipRatio.value.clipTop,
    clipRatio.value.clipBottom,
  )
}

function pageFullHeight(page: { pageNumber: number; placeholderHeight: number }): number {
  return page.placeholderHeight || getPlaceholderHeight(page.pageNumber)
}

function pageClipViewportStyle(page: { pageNumber: number; placeholderHeight: number }) {
  const clip = pageClipFor(page.pageNumber)
  const fullH = pageFullHeight(page)
  if (!clip) return { minHeight: `${fullH}px` }
  const visible = Math.max(24, (clip.clipBottom - clip.clipTop) * fullH)
  return {
    height: `${visible}px`,
    overflow: 'hidden',
  }
}

function pageCanvasHostStyle(page: { pageNumber: number; placeholderHeight: number }) {
  const clip = pageClipFor(page.pageNumber)
  const fullH = pageFullHeight(page)
  if (!clip) return {}
  return {
    height: `${fullH}px`,
    transform: `translateY(${-clip.clipTop * fullH}px)`,
  }
}

function expandSidebarAll() {
  sidebarExpand.expandAll(sidebarExpandableIds.value)
}

function collapseSidebarAll() {
  sidebarExpand.collapseAll()
}

function resetSidebarExpandState(nodes: PdfSidebarNode[]) {
  sidebarExpand.collapseAll()
  sidebarExpand.expandAll(collectExpandableNodeIds(nodes))
}

function toggleSidebar() {
  if (sidebarOpen.value) {
    savedSidebarWidth.value = sidebarWidth.value
    sidebarOpen.value = false
    return
  }
  sidebarOpen.value = true
  sidebarWidth.value = savedSidebarWidth.value
  void nextTick().then(() => schedulePdfLayoutAfterSidebarResize())
}

function clampSidebarWidth(width: number): number {
  return Math.min(
    PDF_EXCERPT_SIDEBAR_MAX_WIDTH,
    Math.max(PDF_EXCERPT_SIDEBAR_MIN_WIDTH, Math.round(width)),
  )
}

function schedulePdfLayoutAfterSidebarResize() {
  if (sidebarResizeLayoutRafId) return
  sidebarResizeLayoutRafId = requestAnimationFrame(() => {
    sidebarResizeLayoutRafId = 0
    const firstPage = pageCanvases.value[0]?.pageNumber
    if (firstPage != null) {
      renderManager?.handleResize(firstPage)
    }
  })
}

function onSidebarResizeMouseMove(event: MouseEvent) {
  if (!sidebarDragging) return
  const delta = event.clientX - sidebarResizeStartX
  sidebarWidth.value = clampSidebarWidth(sidebarResizeStartWidth + delta)
  schedulePdfLayoutAfterSidebarResize()
}

function onSidebarResizeMouseUp() {
  sidebarDragging = false
  document.removeEventListener('mousemove', onSidebarResizeMouseMove)
  document.removeEventListener('mouseup', onSidebarResizeMouseUp)
  const firstPage = pageCanvases.value[0]?.pageNumber
  if (firstPage != null) {
    renderManager?.handleResize(firstPage)
    renderManager?.flushPendingResize()
  }
}

function onSidebarResizeMouseDown(event: MouseEvent) {
  event.preventDefault()
  event.stopPropagation()
  sidebarDragging = true
  sidebarResizeStartX = event.clientX
  sidebarResizeStartWidth = sidebarWidth.value
  document.addEventListener('mousemove', onSidebarResizeMouseMove)
  document.addEventListener('mouseup', onSidebarResizeMouseUp)
}

function scrollToPage(pageNumber: number, nodeId: string | null = null) {
  if (pageNumber < resolvedStartPage || pageNumber > resolvedEndPage) return
  activeNodeId.value = nodeId
  renderManager?.requestRender(pageNumber)
  const el = pageRefs.get(pageNumber)
  const pageEl = el?.closest('.pdf-excerpt-block__page')
  pageEl?.scrollIntoView({ behavior: 'instant', block: 'start' })
}

function navigateSidebar(payload: { nodeId: string; pageNumber: number }) {
  scrollToPage(payload.pageNumber, payload.nodeId)
}

function openInNewTab() {
  if (!fileUrl.value) return
  window.open(fileUrl.value, '_blank', 'noopener,noreferrer')
}

function handleEditSource() {
  if (!blockId.value) return
  onEditPdfExcerptSource(blockId.value)
}

function hitTestPageVertical(clientY: number): PdfPageVerticalHit | null {
  const pages = [...pageCanvases.value].sort((a, b) => a.pageNumber - b.pageNumber)
  if (pages.length === 0) return null

  type Measured = { pageNumber: number; top: number; bottom: number }
  const measured: Measured[] = []
  for (const page of pages) {
    const host = pageRefs.get(page.pageNumber)
    if (!host) continue
    const rect = host.getBoundingClientRect()
    if (rect.height <= 0) continue
    measured.push({ pageNumber: page.pageNumber, top: rect.top, bottom: rect.bottom })
  }
  if (measured.length === 0) return null

  for (const item of measured) {
    if (clientY >= item.top && clientY <= item.bottom) {
      const ratio = (clientY - item.top) / Math.max(item.bottom - item.top, 1)
      return {
        pageNumber: item.pageNumber,
        ratio: Math.min(1, Math.max(0, ratio)),
      }
    }
  }

  const first = measured[0]
  const last = measured[measured.length - 1]
  if (clientY < first.top) return { pageNumber: first.pageNumber, ratio: 0 }
  if (clientY > last.bottom) return { pageNumber: last.pageNumber, ratio: 1 }

  for (let i = 0; i < measured.length - 1; i += 1) {
    const cur = measured[i]
    const next = measured[i + 1]
    if (clientY > cur.bottom && clientY < next.top) {
      const mid = (cur.bottom + next.top) / 2
      return clientY < mid
        ? { pageNumber: cur.pageNumber, ratio: 1 }
        : { pageNumber: next.pageNumber, ratio: 0 }
    }
  }
  return { pageNumber: last.pageNumber, ratio: 1 }
}

function hitToClientY(hit: PdfPageVerticalHit): number | null {
  const host = pageRefs.get(hit.pageNumber)
  if (!host) return null
  const rect = host.getBoundingClientRect()
  if (rect.height <= 0) return null
  return rect.top + hit.ratio * rect.height
}

function orderHits(
  a: PdfPageVerticalHit,
  b: PdfPageVerticalHit,
): { topHit: PdfPageVerticalHit; bottomHit: PdfPageVerticalHit } {
  const aFirst = a.pageNumber < b.pageNumber
    || (a.pageNumber === b.pageNumber && a.ratio <= b.ratio)
  return aFirst
    ? { topHit: a, bottomHit: b }
    : { topHit: b, bottomHit: a }
}

function unbindClipSelectDragListeners() {
  document.removeEventListener('mousemove', onClipSelectMouseMove, true)
  document.removeEventListener('mouseup', onClipSelectMouseUp, true)
}

function unbindClipSelectListeners() {
  unbindClipSelectDragListeners()
  document.removeEventListener('keydown', onClipSelectKeyDown, true)
}

function onOverlayLayoutScroll() {
  if (
    clipDrag.value
    || clipPending.value
    || blockPdfRegionAnnotations.value.length > 0
  ) {
    overlayLayoutTick.value += 1
  }
}

let overlayScrollBound = false
let overlayScrollRoot: HTMLElement | null = null

function bindOverlayScrollListeners() {
  if (overlayScrollBound) return
  overlayScrollBound = true
  pagesScrollRef.value?.addEventListener('scroll', onOverlayLayoutScroll, { passive: true })
  overlayScrollRoot = pagesScrollRef.value?.closest('.content-scroll') as HTMLElement | null
  overlayScrollRoot?.addEventListener('scroll', onOverlayLayoutScroll, { passive: true })
  window.addEventListener('scroll', onOverlayLayoutScroll, { passive: true, capture: true })
  window.addEventListener('resize', onOverlayLayoutScroll, { passive: true })
}

function unbindOverlayScrollListeners() {
  if (!overlayScrollBound) return
  overlayScrollBound = false
  pagesScrollRef.value?.removeEventListener('scroll', onOverlayLayoutScroll)
  overlayScrollRoot?.removeEventListener('scroll', onOverlayLayoutScroll)
  overlayScrollRoot = null
  window.removeEventListener('scroll', onOverlayLayoutScroll, true)
  window.removeEventListener('resize', onOverlayLayoutScroll)
}

function syncOverlayScrollListeners() {
  if (
    clipSelectActive.value
    || (pdfRegionNotesVisible.value && blockPdfRegionAnnotations.value.length > 0)
  ) {
    void nextTick().then(() => bindOverlayScrollListeners())
  } else {
    unbindOverlayScrollListeners()
  }
}

function togglePdfRegionNotesVisible() {
  const next = !pdfRegionNotesVisible.value
  props.updateAttributes({ notesVisible: next })
  if (next) {
    overlayLayoutTick.value += 1
  }
  void nextTick().then(() => syncOverlayScrollListeners())
}

function cancelClipSelect() {
  unbindClipSelectListeners()
  clipDrag.value = null
  clipPending.value = null
  clipSelectActive.value = false
  syncOverlayScrollListeners()
}

function startClipSelect() {
  if (loading.value || loadError.value || pageCanvases.value.length === 0) return
  clipSelectActive.value = true
  clipDrag.value = null
  clipPending.value = null
  document.addEventListener('keydown', onClipSelectKeyDown, true)
  syncOverlayScrollListeners()
}

function toggleClipSelect() {
  if (clipSelectActive.value) {
    cancelClipSelect()
    return
  }
  startClipSelect()
}

function onClipSelectKeyDown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    cancelClipSelect()
  }
}

function onClipSelectMouseDown(event: MouseEvent) {
  if (!clipSelectActive.value) return
  if (event.button !== 0) return
  // Pending confirm: ignore drag on pages (use hint bar actions)
  if (clipPending.value) return
  event.preventDefault()
  event.stopPropagation()
  const anchorHit = hitTestPageVertical(event.clientY)
  if (!anchorHit) return
  clipDrag.value = { anchorHit, currentClientY: event.clientY }
  document.addEventListener('mousemove', onClipSelectMouseMove, true)
  document.addEventListener('mouseup', onClipSelectMouseUp, true)
}

function onClipSelectMouseMove(event: MouseEvent) {
  if (!clipDrag.value) return
  clipDrag.value = {
    anchorHit: clipDrag.value.anchorHit,
    currentClientY: event.clientY,
  }
}

const clipPendingRangeLabel = computed(() => {
  const pending = clipPending.value
  if (!pending) return ''
  const next = clipAttrsFromVerticalHits(pending.topHit, pending.bottomHit)
  return formatPdfExcerptRangeLabel(
    next.startPage,
    next.endPage,
    next.clipTop,
    next.clipBottom,
  )
})

function onClipSelectMouseUp(event: MouseEvent) {
  unbindClipSelectDragListeners()
  const drag = clipDrag.value
  clipDrag.value = null
  if (!drag) return

  const endHit = hitTestPageVertical(event.clientY)
  if (!endHit) return

  const anchorY = hitToClientY(drag.anchorHit)
  const endY = event.clientY
  if (anchorY != null && Math.abs(endY - anchorY) < 8) {
    // Too small — stay in select mode for retry
    return
  }

  // Keep hint bar mounted (no MessageBox / body scroll-lock) so PDF layout and
  // the fixed selection overlay stay aligned; saved ratios use these hits as-is.
  clipPending.value = orderHits(drag.anchorHit, endHit)
  overlayLayoutTick.value += 1
}

function confirmClipSelect() {
  const pending = clipPending.value
  if (!pending) return
  const next = clipAttrsFromVerticalHits(pending.topHit, pending.bottomHit)
  const prevHref = String(props.node.attrs.sourceHref || '')
  props.updateAttributes({
    viewMode: 'excerpt',
    startPage: next.startPage,
    endPage: next.endPage,
    clipTop: next.clipTop,
    clipBottom: next.clipBottom,
    ...(isResourceLocatorHref(prevHref)
      ? {
        sourceHref: syncResourceHrefWithPdfPages(
          prevHref,
          'excerpt',
          next.startPage,
          next.endPage,
          next.clipTop,
          next.clipBottom,
        ),
      }
      : {}),
  })
  cancelClipSelect()
}

function publishClipNote() {
  const pending = clipPending.value
  if (!pending || !blockId.value || !fileId.value) return
  const next = clipAttrsFromVerticalHits(pending.topHit, pending.bottomHit)
  onPublishPdfRegionNote({
    blockId: blockId.value,
    fileId: fileId.value,
    resourceItemId: resourceItemId.value || undefined,
    startPage: next.startPage,
    endPage: next.endPage,
    clipTop: next.clipTop,
    clipBottom: next.clipBottom,
  })
  // Show notes after publish so the new marker is visible immediately (persisted).
  props.updateAttributes({ notesVisible: true })
  cancelClipSelect()
  void nextTick().then(() => {
    syncOverlayScrollListeners()
    overlayLayoutTick.value += 1
  })
}

function handlePdfRegionOverlayClick(annotationId: string, event: MouseEvent) {
  event.preventDefault()
  event.stopPropagation()
  const annotation = blockPdfRegionAnnotations.value.find((item) => item.id === annotationId)
  onPdfRegionAnnotationClick({ annotationId, annotation, event })
}

function redoClipSelect() {
  clipPending.value = null
  clipDrag.value = null
}

function onPdfClipSelectEvent() {
  startClipSelect()
}

function onPdfFitHeightEvent() {
  fitHeightToContent()
}

function bindClipSelectEvent() {
  unbindClipSelectEvent()
  // Prefer outer NodeView root so toolbar CustomEvents (dispatched on first
  // `[data-block-id]`) reach the same element without relying on bubble.
  clipSelectRoot = (
    pdfBlockRef.value?.closest('.pdf-excerpt-block-nv')
    ?? pdfBlockRef.value?.closest('[data-block-id]')
  ) as HTMLElement | null
  clipSelectRoot?.addEventListener(PDF_EXCERPT_CLIP_SELECT_EVENT, onPdfClipSelectEvent)
  clipSelectRoot?.addEventListener(PDF_EXCERPT_FIT_HEIGHT_EVENT, onPdfFitHeightEvent)
}

function unbindClipSelectEvent() {
  clipSelectRoot?.removeEventListener(PDF_EXCERPT_CLIP_SELECT_EVENT, onPdfClipSelectEvent)
  clipSelectRoot?.removeEventListener(PDF_EXCERPT_FIT_HEIGHT_EVENT, onPdfFitHeightEvent)
  clipSelectRoot = null
}

function onResize(_width: number | null, nextHeight: number | null) {
  if (nextHeight == null) return
  const clamped = Math.min(PDF_EXCERPT_MAX_HEIGHT, Math.max(PDF_EXCERPT_MIN_HEIGHT, Math.round(nextHeight)))
  if (Math.abs(clamped - height.value) < 1) return
  props.updateAttributes({ height: clamped })
}

/** Fixed chrome above the pages scrollport (block header / meta / hints). */
function measurePdfBlockChromeHeight(): number {
  const wrap = pdfBlockRef.value?.closest('.resizable-block-wrapper') as HTMLElement | null
  const pdfBlock = pdfBlockRef.value
  if (!wrap || !pdfBlock) return 0
  let chrome = 0
  for (const child of Array.from(wrap.children)) {
    const el = child as HTMLElement
    if (el.classList.contains('resizable-handle')) continue
    if (el === pdfBlock || el.contains(pdfBlock)) continue
    chrome += el.offsetHeight
  }
  for (const child of Array.from(pdfBlock.children)) {
    const el = child as HTMLElement
    if (el.classList.contains('pdf-excerpt-block__content')) continue
    chrome += el.offsetHeight
  }
  return chrome
}

/**
 * Natural height of pages scroller content at current zoom/clip.
 * Prefer summing page boxes; fall back to model heights if DOM not ready.
 * Avoid scrollHeight/clientHeight — scrollbar width feeds back into PDF re-render.
 */
function measurePagesContentHeight(): number {
  const pagesEl = pagesScrollRef.value
  if (!pagesEl) return 0
  const style = getComputedStyle(pagesEl)
  const padY = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0)
  const gap = parseFloat(style.rowGap || style.gap) || 12

  const flowKids = Array.from(pagesEl.children).filter((node): node is HTMLElement => (
    node instanceof HTMLElement
  ))
  if (flowKids.length > 0) {
    let sum = 0
    flowKids.forEach((el, index) => {
      sum += el.offsetHeight
      if (index < flowKids.length - 1) sum += gap
    })
    return Math.ceil(sum + padY)
  }

  // DOM pages not mounted yet — estimate from placeholder / clip model.
  const pages = pageCanvases.value
  if (pages.length === 0) return 0
  const labelH = 22
  let sum = 0
  pages.forEach((page, index) => {
    const fullH = pageFullHeight(page)
    const clip = pageClipFor(page.pageNumber)
    const body = clip
      ? Math.max(24, (clip.clipBottom - clip.clipTop) * fullH)
      : fullH
    sum += labelH + body
    if (index < pages.length - 1) sum += gap
  })
  return Math.ceil(sum + padY)
}

/**
 * Set wrapper height so pages area exactly fits current zoom/clip content
 * (no inner scrollbar, no empty slack).
 */
function fitHeightToContent() {
  if (loading.value || loadError.value || pageCanvases.value.length === 0) return
  if (!pagesScrollRef.value || !pdfBlockRef.value) return

  const apply = () => {
    const chrome = measurePdfBlockChromeHeight()
    const content = measurePagesContentHeight()
    if (content <= 0) return
    const next = Math.round(chrome + content)
    if (Math.abs(next - height.value) < 2) return
    suppressPdfResizeObserver = true
    onResize(null, next)
    // Re-enable after layout + optional scrollbar width settle.
    window.setTimeout(() => {
      suppressPdfResizeObserver = false
    }, 120)
  }

  // One layout pass after current zoom/clip styles settle — avoid double-apply oscillation.
  void nextTick().then(() => {
    requestAnimationFrame(() => {
      apply()
    })
  })
}

function disposeRenderManager() {
  renderManager?.dispose()
  renderManager = null
}

function createRenderManager() {
  disposeRenderManager()
  renderManager = new PdfPageRenderManager({
    getDoc: () => docRef.value,
    getHost: (pageNumber) => pageRefs.get(pageNumber),
    getScrollRoot: () => pagesScrollRef.value,
    onRenderError: (message) => {
      loadError.value = message
    },
    onPlaceholderHeight: (pageNumber, placeholderHeight) => {
      const index = pageCanvases.value.findIndex((page) => page.pageNumber === pageNumber)
      if (index < 0) return
      const prev = pageCanvases.value[index]
      if (Math.abs((prev.placeholderHeight || 0) - placeholderHeight) < 1) return
      pageCanvases.value[index] = { ...prev, placeholderHeight }
      scheduleRestoreZoomCenter()
      if (blockPdfRegionAnnotations.value.length > 0) {
        overlayLayoutTick.value += 1
      }
    },
  })
  renderManager.setRange(resolvedStartPage, resolvedEndPage)
  renderManager.setZoomScale(zoomScale.value)
}

function captureZoomCenter() {
  const root = pagesScrollRef.value
  if (!root) {
    pendingZoomCenter = null
    return
  }
  pendingZoomCenter = {
    xRatio: (root.scrollLeft + root.clientWidth / 2) / Math.max(1, root.scrollWidth),
    yRatio: (root.scrollTop + root.clientHeight / 2) / Math.max(1, root.scrollHeight),
  }
}

function restoreZoomCenter() {
  const root = pagesScrollRef.value
  const anchor = pendingZoomCenter
  if (!root || !anchor) return
  root.scrollLeft = Math.max(0, anchor.xRatio * root.scrollWidth - root.clientWidth / 2)
  root.scrollTop = Math.max(0, anchor.yRatio * root.scrollHeight - root.clientHeight / 2)
}

function scheduleRestoreZoomCenter() {
  if (!pendingZoomCenter) return
  if (zoomCenterRestoreRaf) cancelAnimationFrame(zoomCenterRestoreRaf)
  zoomCenterRestoreRaf = requestAnimationFrame(() => {
    zoomCenterRestoreRaf = 0
    restoreZoomCenter()
  })
}

function scheduleShowPdfRegionNotesAfterZoom() {
  pdfRegionNotesHiddenForZoom.value = true
  if (zoomNoteSettleTimer) clearTimeout(zoomNoteSettleTimer)
  // After zoom center restore (120ms) + page canvas re-layout, remeasure and show.
  zoomNoteSettleTimer = setTimeout(() => {
    zoomNoteSettleTimer = null
    restoreZoomCenter()
    pendingZoomCenter = null
    requestAnimationFrame(() => {
      overlayLayoutTick.value += 1
      requestAnimationFrame(() => {
        overlayLayoutTick.value += 1
        pdfRegionNotesHiddenForZoom.value = false
      })
    })
  }, 180)
}

function applyZoomScale(nextScale: number) {
  const clamped = Math.min(
    PDF_EXCERPT_ZOOM_MAX,
    Math.max(PDF_EXCERPT_ZOOM_MIN, Math.round(nextScale * 100) / 100),
  )
  if (Math.abs(clamped - zoomScale.value) < 0.001) return
  captureZoomCenter()
  zoomScale.value = clamped
  renderManager?.setZoomScale(clamped)
  scheduleRestoreZoomCenter()
  scheduleShowPdfRegionNotesAfterZoom()
}

function flushZoomDelta() {
  zoomRafId = 0
  if (pendingZoomDelta === 0) return
  const delta = pendingZoomDelta
  pendingZoomDelta = 0
  applyZoomScale(zoomScale.value + delta)
}

function onPdfBlockWheel(event: WheelEvent) {
  if (!event.ctrlKey) return
  if (!isPdfBlockHovered.value) return
  event.preventDefault()
  event.stopPropagation()
  if (loading.value || loadError.value || pageCanvases.value.length === 0) return
  const direction = event.deltaY < 0 ? 1 : -1
  pendingZoomDelta += direction * PDF_EXCERPT_ZOOM_STEP
  if (!zoomRafId) {
    zoomRafId = requestAnimationFrame(flushZoomDelta)
  }
}

function bindWheelListener() {
  unbindWheelListener()
  wheelTarget = pdfBlockRef.value
  wheelTarget?.addEventListener('wheel', onPdfBlockWheel, { passive: false })
}

function unbindWheelListener() {
  wheelTarget?.removeEventListener('wheel', onPdfBlockWheel)
  wheelTarget = null
}

function disconnectObserver() {
  observer?.disconnect()
  observer = null
  resizeObserver?.disconnect()
  resizeObserver = null
}

function setupObserver() {
  disconnectObserver()
  const root = pagesScrollRef.value

  observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const pageNumber = Number((entry.target as HTMLElement).dataset.pageNumber)
      if (!Number.isFinite(pageNumber)) return
      renderManager?.handleIntersection(pageNumber, entry.isIntersecting)
    })
  }, { root, threshold: 0.05, rootMargin: '120px 0px' })

  resizeObserver = new ResizeObserver(() => {
    if (suppressPdfResizeObserver) return
    const firstPage = pageCanvases.value[0]?.pageNumber
    if (firstPage != null) {
      renderManager?.handleResize(firstPage)
    }
  })

  pageRefs.forEach((el, pageNumber) => {
    el.dataset.pageNumber = String(pageNumber)
    observer?.observe(el.closest('.pdf-excerpt-block__page') ?? el)
  })
  if (root) {
    resizeObserver.observe(root)
  }
}

async function schedulePageRendering() {
  await nextTick()
  if (pageRefs.size === 0 && pageCanvases.value.length > 0) {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve())
    })
  }
  createRenderManager()
  setupObserver()
}

async function loadDocument() {
  if (!fileUrl.value) return
  const generation = ++loadGeneration
  if (boundUrl && boundUrl !== fileUrl.value) {
    releasePdfDocument(boundUrl)
    boundUrl = ''
    docRef.value = null
  }

  loading.value = true
  loadError.value = ''
  largeDocWarning.value = ''
  zoomScale.value = 1
  disposeRenderManager()
  pageCanvases.value = []
  sidebarNodes.value = []
  sidebarSource.value = 'pages'
  activeNodeId.value = null
  pageRefs.clear()

  try {
    if (!docRef.value || boundUrl !== fileUrl.value) {
      if (boundUrl) {
        releasePdfDocument(boundUrl)
      }
      docRef.value = markRaw(await acquirePdfDocument(fileUrl.value))
      boundUrl = fileUrl.value
    }
    if (generation !== loadGeneration) return

    const doc = docRef.value
    const normalized = resolvePageRange(viewMode.value, startPage.value, endPage.value, doc.numPages)
    resolvedStartPage = normalized.startPage
    resolvedEndPage = normalized.endPage

    if (
      viewMode.value === 'full'
      && (startPage.value !== normalized.startPage || endPage.value !== normalized.endPage)
    ) {
      const prevHref = String(props.node.attrs.sourceHref || '')
      props.updateAttributes({
        startPage: normalized.startPage,
        endPage: normalized.endPage,
        ...(isResourceLocatorHref(prevHref)
          ? { sourceHref: syncResourceHrefWithPdfPages(prevHref, 'full', normalized.startPage, normalized.endPage) }
          : {}),
      })
    } else if (viewMode.value === 'excerpt' && (
      normalized.startPage !== startPage.value
      || normalized.endPage !== endPage.value
    )) {
      const prevHref = String(props.node.attrs.sourceHref || '')
      props.updateAttributes({
        startPage: normalized.startPage,
        endPage: normalized.endPage,
        ...(isResourceLocatorHref(prevHref)
          ? {
            sourceHref: syncResourceHrefWithPdfPages(
              prevHref,
              'excerpt',
              normalized.startPage,
              normalized.endPage,
              clipRatio.value.clipTop,
              clipRatio.value.clipBottom,
            ),
          }
          : {}),
      })
    }

    if (viewMode.value === 'full' && doc.numPages > PDF_EXCERPT_LARGE_DOC_PAGES) {
      largeDocWarning.value = `该 PDF 共 ${doc.numPages} 页，全文模式将按需加载；若卡顿可改用摘页或在新标签打开。`
    }

    const pages: Array<{ pageNumber: number; placeholderHeight: number }> = []
    for (let pageNumber = normalized.startPage; pageNumber <= normalized.endPage; pageNumber += 1) {
      pages.push({ pageNumber, placeholderHeight: 120 })
    }
    pageCanvases.value = pages

    const sidebar = await buildPdfSidebarTree(doc, normalized.startPage, normalized.endPage, {
      viewMode: viewMode.value,
    })
    if (generation !== loadGeneration) return
    sidebarNodes.value = sidebar.nodes
    sidebarSource.value = sidebar.source
    resetSidebarExpandState(sidebar.nodes)
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : 'PDF 加载失败'
    pageCanvases.value = []
  } finally {
    loading.value = false
  }

  if (generation !== loadGeneration || loadError.value || pageCanvases.value.length === 0) {
    return
  }
  await schedulePageRendering()
  await bindPdfScrollListener()
}

onMounted(() => {
  void nextTick().then(() => {
    bindWheelListener()
    bindClipSelectEvent()
    syncOverlayScrollListeners()
  })
})

watch(
  () => blockPdfRegionAnnotations.value.length,
  () => {
    syncOverlayScrollListeners()
    overlayLayoutTick.value += 1
  },
)

watch(
  [resourceItemId, blockId, resourcePdfNotesReloadToken],
  () => {
    void loadResourcePdfNotes()
  },
  { immediate: true },
)

watch(pdfRegionNotesVisible, () => {
  syncOverlayScrollListeners()
  overlayLayoutTick.value += 1
})

watch(fileUrl, () => {
  void loadDocument()
}, { immediate: true })

watch([viewMode, startPage, endPage], () => {
  void loadDocument()
})

watch(sidebarOpen, () => {
  void nextTick().then(() => {
    renderManager?.dispose()
    createRenderManager()
    setupObserver()
  })
})

function onPdfExcerptScrollEvent(event: Event) {
  const detail = (event as CustomEvent<{ pageNumber?: number }>).detail
  const pageNumber = Number(detail?.pageNumber)
  if (!Number.isFinite(pageNumber)) return
  void nextTick().then(() => scrollToPage(pageNumber))
}

async function bindPdfScrollListener() {
  await nextTick()
  scrollHost?.removeEventListener(PDF_EXCERPT_SCROLL_EVENT, onPdfExcerptScrollEvent as EventListener)
  scrollHost = pagesScrollRef.value?.closest<HTMLElement>('[data-block-id]') ?? null
  scrollHost?.addEventListener(PDF_EXCERPT_SCROLL_EVENT, onPdfExcerptScrollEvent as EventListener)
}

onBeforeUnmount(() => {
  if (sidebarResizeLayoutRafId) {
    cancelAnimationFrame(sidebarResizeLayoutRafId)
    sidebarResizeLayoutRafId = 0
  }
  document.removeEventListener('mousemove', onSidebarResizeMouseMove)
  document.removeEventListener('mouseup', onSidebarResizeMouseUp)
  if (zoomRafId) {
    cancelAnimationFrame(zoomRafId)
    zoomRafId = 0
  }
  if (zoomCenterRestoreRaf) {
    cancelAnimationFrame(zoomCenterRestoreRaf)
    zoomCenterRestoreRaf = 0
  }
  if (zoomNoteSettleTimer) {
    clearTimeout(zoomNoteSettleTimer)
    zoomNoteSettleTimer = null
  }
  pdfRegionNotesHiddenForZoom.value = false
  pendingZoomCenter = null
  pendingZoomDelta = 0
  cancelClipSelect()
  unbindOverlayScrollListeners()
  unbindClipSelectEvent()
  unbindWheelListener()
  scrollHost?.removeEventListener(PDF_EXCERPT_SCROLL_EVENT, onPdfExcerptScrollEvent as EventListener)
  scrollHost = null
  disconnectObserver()
  disposeRenderManager()
  if (boundUrl) {
    releasePdfDocument(boundUrl)
    boundUrl = ''
  }
  docRef.value = null
})
</script>

<template>
  <node-view-wrapper class="pdf-excerpt-block-nv" :data-block-id="blockId">
    <ResizableBlockWrapper
      :selected="selected"
      :content-hover-chrome="false"
      :resizable-axes="{ width: false, height: true }"
      :height="height"
      :min-height="PDF_EXCERPT_MIN_HEIGHT"
      :max-height="PDF_EXCERPT_MAX_HEIGHT"
      block-type-label="PDF"
      :block-id="blockId"
      block-type="pdfExcerpt"
      @resize="onResize"
    >
      <template #header-meta>
        <span class="pdf-excerpt-block__meta" :title="metaLabel">
          {{ metaLabel }}
        </span>
        <button
          type="button"
          class="pdf-excerpt-block__edit-source"
          data-node-view-no-drag
          @mousedown.stop
          @click.stop="handleEditSource"
        >
          更改来源
        </button>
        <button
          type="button"
          class="pdf-excerpt-block__edit-source"
          :class="{ 'pdf-excerpt-block__edit-source--active': clipSelectActive }"
          data-node-view-no-drag
          :title="clipSelectActive ? '取消划选（Esc）' : '在 PDF 上划选区域（可发布笔记或应用裁剪）'"
          @mousedown.stop
          @click.stop="toggleClipSelect"
        >
          {{ clipSelectActive ? '取消划选' : '划选笔记' }}
        </button>
        <button
          v-if="blockPdfRegionAnnotations.length > 0"
          type="button"
          class="pdf-excerpt-block__edit-source"
          :class="{ 'pdf-excerpt-block__edit-source--active': pdfRegionNotesVisible }"
          data-node-view-no-drag
          :title="pdfRegionNotesVisible ? '隐藏 PDF 划选笔记' : '显示 PDF 划选笔记'"
          @mousedown.stop
          @click.stop="togglePdfRegionNotesVisible"
        >
          {{ pdfRegionNotesVisible ? '隐藏笔记' : `显示笔记${blockPdfRegionAnnotations.length > 1 ? ` ${blockPdfRegionAnnotations.length}` : ''}` }}
        </button>
        <button
          type="button"
          class="pdf-excerpt-block__edit-source"
          data-node-view-no-drag
          title="按当前缩放将块高度调为完整显示全部内容（无滚动条、无空白）"
          @mousedown.stop
          @click.stop="fitHeightToContent"
        >
          高度 100%
        </button>
      </template>

      <div
        ref="pdfBlockRef"
        class="pdf-excerpt-block"
        :class="{ 'pdf-excerpt-block--clip-select': clipSelectActive }"
        @mouseenter="isPdfBlockHovered = true"
        @mouseleave="isPdfBlockHovered = false"
      >
        <div v-if="loading" class="pdf-excerpt-block__status">正在加载 PDF…</div>
        <div v-else-if="loadError" class="pdf-excerpt-block__fallback">
          <p class="pdf-excerpt-block__error">{{ loadError }}</p>
          <button type="button" class="pdf-excerpt-block__open-btn" @click="openInNewTab">
            在新标签打开正本
          </button>
        </div>
        <div v-else class="pdf-excerpt-block__content">
          <div
            v-if="showSidebar"
            class="pdf-excerpt-block__sidebar-column"
            :class="{ 'pdf-excerpt-block__sidebar-column--collapsed': !sidebarOpen }"
          >
            <aside
              v-show="sidebarOpen"
              class="pdf-excerpt-block__sidebar"
              :style="{ width: `${sidebarWidth}px` }"
              @mousedown.stop
            >
              <div class="pdf-excerpt-block__sidebar-header">
                <span class="pdf-excerpt-block__sidebar-title">{{ sidebarTitle }}</span>
                <div v-if="sidebarHasNestedNodes" class="pdf-excerpt-block__sidebar-actions">
                  <button
                    type="button"
                    class="pdf-excerpt-block__sidebar-action"
                    data-node-view-no-drag
                    title="全部展开"
                    @mousedown.stop
                    @click.stop="expandSidebarAll"
                  >
                    全部展开
                  </button>
                  <button
                    type="button"
                    class="pdf-excerpt-block__sidebar-action"
                    data-node-view-no-drag
                    title="全部收起"
                    @mousedown.stop
                    @click.stop="collapseSidebarAll"
                  >
                    全部收起
                  </button>
                </div>
              </div>
              <nav v-if="sidebarNodes.length > 0" class="pdf-excerpt-block__sidebar-nav" aria-label="PDF 目录">
                <PdfExcerptSidebar
                  :nodes="sidebarNodes"
                  :start-page="resolvedStartPage"
                  :end-page="resolvedEndPage"
                  :active-node-id="activeNodeId"
                  :expanded-node-ids="sidebarExpand.expanded.value"
                  @navigate="navigateSidebar"
                  @toggle-expand="sidebarExpand.toggle"
                />
              </nav>
              <p v-else-if="sidebarEmptyHint" class="pdf-excerpt-block__sidebar-empty">
                {{ sidebarEmptyHint }}
              </p>
            </aside>
            <div class="pdf-excerpt-block__sidebar-edge">
              <button
                type="button"
                class="pdf-excerpt-block__sidebar-toggle"
                data-node-view-no-drag
                :title="sidebarOpen ? `隐藏${sidebarTitle}` : `显示${sidebarTitle}`"
                :aria-label="sidebarOpen ? `隐藏${sidebarTitle}` : `显示${sidebarTitle}`"
                :aria-expanded="sidebarOpen"
                @mousedown.stop
                @click.stop="toggleSidebar"
              >
                <svg
                  class="pdf-excerpt-block__sidebar-toggle-icon"
                  :class="{ 'pdf-excerpt-block__sidebar-toggle-icon--collapsed': !sidebarOpen }"
                  viewBox="0 0 12 12"
                  aria-hidden="true"
                >
                  <path
                    d="M7.5 2 4 6l3.5 4"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.6"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </button>
              <div
                v-show="sidebarOpen"
                class="pdf-excerpt-block__sidebar-resizer"
                data-node-view-no-drag
                title="拖拽调节宽度"
                aria-label="拖拽调节书签栏宽度"
                @mousedown.stop.prevent="onSidebarResizeMouseDown"
              />
            </div>
          </div>
          <div class="pdf-excerpt-block__main">
            <div
              v-show="showZoomBadge"
              class="pdf-excerpt-block__zoom-badge"
              aria-live="polite"
            >
              {{ zoomLabel }}
            </div>
            <div
              ref="pagesScrollRef"
              class="pdf-excerpt-block__pages"
              :class="{
                'pdf-excerpt-block__pages--clip-select': clipSelectActive && !clipPending,
                'pdf-excerpt-block__pages--clip-pending': !!clipPending,
              }"
              @mousedown="onClipSelectMouseDown"
            >
              <p v-if="largeDocWarning" class="pdf-excerpt-block__warn">{{ largeDocWarning }}</p>
              <div
                v-for="page in pageCanvases"
                :key="page.pageNumber"
                class="pdf-excerpt-block__page"
                :data-page-number="page.pageNumber"
              >
                <div
                  class="pdf-excerpt-block__page-clip"
                  :style="pageClipViewportStyle(page)"
                >
                  <div
                    :ref="(el) => setPageRef(page.pageNumber, el)"
                    class="pdf-excerpt-block__page-canvas-host"
                    :style="pageCanvasHostStyle(page)"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ResizableBlockWrapper>
    <Teleport to="body">
      <div
        v-if="clipSelectBoxStyle"
        class="pdf-excerpt-block__clip-select-box"
        :style="clipSelectBoxStyle"
      />
      <div
        v-if="clipPendingConfirmStyle"
        class="pdf-excerpt-block__clip-confirm"
        :style="clipPendingConfirmStyle"
        @mousedown.stop
      >
        <span class="pdf-excerpt-block__clip-confirm-text">
          {{ clipPendingRangeLabel }}
        </span>
        <button
          type="button"
          class="pdf-excerpt-block__clip-confirm-btn pdf-excerpt-block__clip-confirm-btn--primary"
          @click.stop="publishClipNote"
        >
          发布笔记
        </button>
        <button
          type="button"
          class="pdf-excerpt-block__clip-confirm-btn"
          @click.stop="confirmClipSelect"
        >
          应用裁剪
        </button>
        <button
          type="button"
          class="pdf-excerpt-block__clip-confirm-btn"
          @click.stop="redoClipSelect"
        >
          重新划选
        </button>
        <button
          type="button"
          class="pdf-excerpt-block__clip-confirm-btn"
          @click.stop="cancelClipSelect"
        >
          取消
        </button>
      </div>
      <template v-for="overlay in pdfRegionOverlays" :key="overlay.annotationId">
        <div
          class="pdf-excerpt-block__pdf-note-region"
          :style="{
            ...overlay.boxStyle,
            borderColor: overlay.color,
            backgroundColor: `${overlay.color}33`,
          }"
          :data-tu-annotation-id="overlay.annotationId"
          @mousedown.stop
          @click.stop="handlePdfRegionOverlayClick(overlay.annotationId, $event)"
        />
        <button
          type="button"
          class="pdf-excerpt-block__pdf-note-marker"
          :style="overlay.markerStyle"
          :data-tu-annotation-id="overlay.annotationId"
          @mousedown.stop
          @click.stop="handlePdfRegionOverlayClick(overlay.annotationId, $event)"
        >
          笔记
        </button>
      </template>
    </Teleport>
  </node-view-wrapper>
</template>

<style scoped>
.pdf-excerpt-block-nv {
  /* 底部高度手柄 bottom:-6px，避免被父级裁切 */
  overflow: visible;
}

.pdf-excerpt-block__meta {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pdf-excerpt-block__edit-source {
  flex-shrink: 0;
  padding: 2px 8px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  background: #fff;
  color: #475569;
  font-size: 11px;
  line-height: 1.4;
  cursor: pointer;
}

.pdf-excerpt-block__edit-source:hover {
  border-color: #94a3b8;
  color: #1e293b;
  background: #f8fafc;
}

.pdf-excerpt-block__edit-source--active {
  border-color: #1677ff;
  color: #1677ff;
  background: #e6f4ff;
}

.pdf-excerpt-block--clip-select .pdf-excerpt-block__pages--clip-select {
  cursor: crosshair;
  user-select: none;
}

.pdf-excerpt-block--clip-select .pdf-excerpt-block__pages--clip-pending {
  cursor: default;
  user-select: none;
}

.pdf-excerpt-block {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: transparent;
  display: flex;
  flex-direction: column;
}

.pdf-excerpt-block__content {
  display: flex;
  flex: 1;
  min-height: 0;
  height: 100%;
}

.pdf-excerpt-block__sidebar-column {
  display: flex;
  flex-shrink: 0;
  min-height: 0;
  height: 100%;
}

.pdf-excerpt-block__sidebar-column--collapsed {
  min-width: 0;
}

.pdf-excerpt-block__sidebar {
  flex-shrink: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #f1f5f9;
  box-sizing: border-box;
}

.pdf-excerpt-block__sidebar-edge {
  position: relative;
  flex-shrink: 0;
  width: 4px;
  height: 100%;
  border-right: 1px solid #e4e4e4;
  background: #f1f5f9;
  pointer-events: none;
  overflow: visible;
}

.pdf-excerpt-block__sidebar-column--collapsed .pdf-excerpt-block__sidebar-edge {
  width: 0;
}

.pdf-excerpt-block__sidebar-toggle {
  position: absolute;
  top: 50%;
  left: 0;
  z-index: 21;
  pointer-events: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 12px;
  height: 48px;
  padding: 0;
  border: 1px solid #d0d7de;
  border-radius: 8px;
  background: #fff;
  color: #595959;
  cursor: pointer;
  box-shadow: 0 1px 4px rgba(15, 23, 42, 0.08);
  transform: translate(-50%, -50%);
  transition: border-color 0.15s, color 0.15s, box-shadow 0.15s;
}

.pdf-excerpt-block__sidebar-toggle:hover {
  border-color: #1677ff;
  color: #1677ff;
  box-shadow: 0 2px 8px rgba(22, 119, 255, 0.16);
}

.pdf-excerpt-block__sidebar-toggle-icon {
  width: 8px;
  height: 8px;
  flex-shrink: 0;
  transition: transform 0.2s ease;
}

.pdf-excerpt-block__sidebar-toggle-icon--collapsed {
  transform: rotate(180deg);
}

.pdf-excerpt-block__sidebar-resizer {
  position: absolute;
  inset: 0;
  width: 4px;
  max-width: 4px;
  flex-shrink: 0;
  cursor: col-resize;
  background: transparent;
  transition: background 0.15s;
  z-index: 10;
  pointer-events: auto;
  box-sizing: border-box;
}

.pdf-excerpt-block__sidebar-resizer:hover,
.pdf-excerpt-block__sidebar-resizer:active {
  background: #1677ff40;
}

.pdf-excerpt-block__sidebar-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 8px 8px 8px;
}

.pdf-excerpt-block__sidebar-title {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: #64748b;
}

.pdf-excerpt-block__sidebar-actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 2px;
}

.pdf-excerpt-block__sidebar-action {
  flex-shrink: 0;
  padding: 2px 6px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #64748b;
  font-size: 11px;
  line-height: 1.4;
  cursor: pointer;
}

.pdf-excerpt-block__sidebar-action:hover {
  background: #e2e8f0;
  color: #334155;
}

.pdf-excerpt-block__sidebar-nav {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 4px 8px 0;
}

.pdf-excerpt-block__sidebar-empty {
  margin: 0;
  padding: 8px 8px 12px;
  font-size: 12px;
  line-height: 1.5;
  color: #64748b;
}

.pdf-excerpt-block__main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  overflow: hidden;
  cursor: default;
  position: relative;
}

.pdf-excerpt-block__pages {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
  padding: 0;
  box-sizing: border-box;
  position: relative;
  background: transparent;
}

.pdf-excerpt-block__zoom-badge {
  /* Overlay on the main pane (not inside the scrollport) so it stays visible while scrolling. */
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 12;
  margin: 0;
  padding: 4px 8px;
  border-radius: 6px;
  background: rgba(15, 23, 42, 0.78);
  color: #f8fafc;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  line-height: 1.4;
  pointer-events: none;
  user-select: none;
}

.pdf-excerpt-block__warn {
  align-self: stretch;
  margin: 0;
  padding: 8px 10px;
  border-radius: 0;
  background: #fffbeb;
  border: none;
  border-bottom: 1px solid #fde68a;
  font-size: 12px;
  color: #92400e;
  line-height: 1.5;
}

.pdf-excerpt-block__status,
.pdf-excerpt-block__fallback {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 10px;
  min-height: 120px;
  padding: 16px;
  box-sizing: border-box;
}

.pdf-excerpt-block__error {
  margin: 0;
  color: #b91c1c;
  font-size: 13px;
}

.pdf-excerpt-block__open-btn {
  padding: 6px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #fff;
  color: #374151;
  font-size: 12px;
  cursor: pointer;
}

.pdf-excerpt-block__page {
  width: max-content;
  max-width: none;
  min-width: 100%;
  box-sizing: border-box;
  background: transparent;
  border: none;
  border-radius: 0;
  padding: 0;
  overflow: visible;
  display: flex;
  justify-content: center;
  margin-inline: auto;
}

.pdf-excerpt-block__page-clip {
  width: max-content;
  max-width: none;
  min-width: 0;
  position: relative;
  background: transparent;
}

.pdf-excerpt-block__page-canvas-host {
  width: max-content;
  min-width: 0;
  overflow: visible;
  display: flex;
  justify-content: center;
  background: transparent;
}

.pdf-excerpt-block__page :deep(.pdf-excerpt-block__canvas) {
  display: block;
  max-width: none;
  margin: 0 auto;
  background: transparent;
}
</style>

<style>
/* Teleported marquee / confirm (body) — keep unscoped */
.pdf-excerpt-block__clip-select-box {
  box-sizing: border-box;
  pointer-events: none;
  border: 2px dashed #1677ff;
  background: rgba(22, 119, 255, 0.12);
  box-shadow: 0 0 0 9999px rgba(15, 23, 42, 0.25);
}

.pdf-excerpt-block__clip-confirm {
  box-sizing: border-box;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid #93c5fd;
  background: #eff6ff;
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.12);
  font-size: 12px;
  line-height: 1.4;
  color: #1d4ed8;
  pointer-events: auto;
}

.pdf-excerpt-block__clip-confirm-text {
  flex: 1 1 auto;
  min-width: 0;
}

.pdf-excerpt-block__clip-confirm-btn {
  flex-shrink: 0;
  padding: 2px 10px;
  border: 1px solid #93c5fd;
  border-radius: 4px;
  background: #fff;
  color: #1e40af;
  font-size: 12px;
  line-height: 1.4;
  cursor: pointer;
}

.pdf-excerpt-block__clip-confirm-btn:hover {
  border-color: #60a5fa;
  background: #f8fafc;
}

.pdf-excerpt-block__clip-confirm-btn--primary {
  border-color: #1677ff;
  background: #1677ff;
  color: #fff;
}

.pdf-excerpt-block__clip-confirm-btn--primary:hover {
  border-color: #0958d9;
  background: #0958d9;
  color: #fff;
}

.pdf-excerpt-block__pdf-note-region {
  box-sizing: border-box;
  border: 2px solid #ffe082;
  background: rgba(255, 224, 130, 0.28);
}

.pdf-excerpt-block__pdf-note-marker {
  box-sizing: border-box;
  padding: 2px 8px;
  border: 1px solid #fbbf24;
  border-radius: 4px;
  background: #fffbeb;
  color: #b45309;
  font-size: 11px;
  line-height: 1.4;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.1);
  pointer-events: auto;
}

.pdf-excerpt-block__pdf-note-marker:hover {
  border-color: #f59e0b;
  background: #fef3c7;
  color: #92400e;
}
</style>

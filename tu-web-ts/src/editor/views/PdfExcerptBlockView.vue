<script setup lang="ts">
import { computed, inject, markRaw, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { nodeViewProps, NodeViewWrapper } from '@tiptap/vue-3'
import { buildFileUrl } from '@/api/fileStorage'
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
  parsePdfExcerptViewMode,
  resolvePageRange,
} from '@/utils/pdfExcerpt'
import { acquirePdfDocument, releasePdfDocument } from '@/utils/pdfDocumentCache'
import type { PdfDocumentProxy } from '@/utils/pdfjsSetup'
import {
  buildPdfSidebarTree,
  type PdfSidebarNode,
  type PdfSidebarSource,
} from '@/utils/pdfOutline'
import { PdfPageRenderManager } from '@/utils/pdfPageRender'
import PdfExcerptSidebar from './PdfExcerptSidebar.vue'

const props = defineProps(nodeViewProps)

const onEditPdfExcerptSource = inject<(blockId: string) => void>('onEditPdfExcerptSource', () => {})

const blockId = computed(() => props.node.attrs.blockId || '')
const fileId = computed(() => String(props.node.attrs.fileId || ''))
const fileName = computed(() => String(props.node.attrs.fileName || 'PDF'))
const viewMode = computed(() => parsePdfExcerptViewMode(String(props.node.attrs.viewMode || 'excerpt')))
const startPage = computed(() => Number(props.node.attrs.startPage) || 1)
const endPage = computed(() => Number(props.node.attrs.endPage) || 1)
const height = computed(() => Number(props.node.attrs.height) || PDF_EXCERPT_DEFAULT_HEIGHT)

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
const pagesScrollRef = ref<HTMLElement | null>(null)
const pdfBlockRef = ref<HTMLElement | null>(null)
const isPdfBlockHovered = ref(false)
const zoomScale = ref(1)

let scrollHost: HTMLElement | null = null
let wheelTarget: HTMLElement | null = null
let pendingZoomDelta = 0
let zoomRafId = 0

const pageRefs = new Map<number, HTMLElement>()
let renderManager: PdfPageRenderManager | null = null
let observer: IntersectionObserver | null = null
let resizeObserver: ResizeObserver | null = null
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
  resolvedStartPage,
  resolvedEndPage,
))

const sidebarTitle = computed(() => {
  if (sidebarSource.value === 'outline') return '书签'
  if (sidebarSource.value === 'pages') return '目录'
  return '导航'
})

const showSidebar = computed(() => sidebarNodes.value.length > 0 || sidebarSource.value === 'none')
const sidebarEmptyHint = computed(() => (
  sidebarSource.value === 'none'
    ? '该 PDF 无书签目录，请滚动浏览各页'
    : ''
))

const zoomLabel = computed(() => `${Math.round(zoomScale.value * 100)}%`)

const showZoomBadge = computed(() => (
  isPdfBlockHovered.value
  && !loading.value
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
  schedulePdfLayoutAfterSidebarResize()
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
  const el = pageRefs.get(pageNumber)
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  renderManager?.requestRender(pageNumber)
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

function onResize(_width: number | null, nextHeight: number | null) {
  if (nextHeight == null) return
  const clamped = Math.min(PDF_EXCERPT_MAX_HEIGHT, Math.max(PDF_EXCERPT_MIN_HEIGHT, Math.round(nextHeight)))
  props.updateAttributes({ height: clamped })
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
      if (index >= 0) {
        pageCanvases.value[index] = { ...pageCanvases.value[index], placeholderHeight }
      }
    },
  })
  renderManager.setRange(resolvedStartPage, resolvedEndPage)
  renderManager.setZoomScale(zoomScale.value)
}

function applyZoomScale(nextScale: number) {
  const clamped = Math.min(
    PDF_EXCERPT_ZOOM_MAX,
    Math.max(PDF_EXCERPT_ZOOM_MIN, Math.round(nextScale * 100) / 100),
  )
  if (Math.abs(clamped - zoomScale.value) < 0.001) return
  zoomScale.value = clamped
  renderManager?.setZoomScale(clamped)
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
      props.updateAttributes({
        startPage: normalized.startPage,
        endPage: normalized.endPage,
      })
    } else if (viewMode.value === 'excerpt' && (
      normalized.startPage !== startPage.value
      || normalized.endPage !== endPage.value
    )) {
      props.updateAttributes({
        startPage: normalized.startPage,
        endPage: normalized.endPage,
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
  void nextTick().then(() => bindWheelListener())
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
  pendingZoomDelta = 0
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
      :resize-on-hover="false"
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
      </template>

      <div
        ref="pdfBlockRef"
        class="pdf-excerpt-block"
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
              </div>
              <nav v-if="sidebarNodes.length > 0" class="pdf-excerpt-block__sidebar-nav" aria-label="PDF 目录">
                <PdfExcerptSidebar
                  :nodes="sidebarNodes"
                  :start-page="resolvedStartPage"
                  :end-page="resolvedEndPage"
                  :active-node-id="activeNodeId"
                  @navigate="navigateSidebar"
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
            <div ref="pagesScrollRef" class="pdf-excerpt-block__pages">
              <div
                v-if="showZoomBadge"
                class="pdf-excerpt-block__zoom-badge"
                aria-live="polite"
              >
                {{ zoomLabel }}
              </div>
              <p v-if="largeDocWarning" class="pdf-excerpt-block__warn">{{ largeDocWarning }}</p>
              <div
                v-for="page in pageCanvases"
                :key="page.pageNumber"
                class="pdf-excerpt-block__page"
                :data-page-number="page.pageNumber"
                :style="{ minHeight: `${page.placeholderHeight || getPlaceholderHeight(page.pageNumber)}px` }"
              >
                <div class="pdf-excerpt-block__page-label">第 {{ page.pageNumber }} 页</div>
                <div
                  :ref="(el) => setPageRef(page.pageNumber, el)"
                  class="pdf-excerpt-block__page-canvas-host"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </ResizableBlockWrapper>
  </node-view-wrapper>
</template>

<style scoped>
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

.pdf-excerpt-block {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: #f8fafc;
}

.pdf-excerpt-block__content {
  display: flex;
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
}

.pdf-excerpt-block__pages {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  box-sizing: border-box;
  position: relative;
}

.pdf-excerpt-block__zoom-badge {
  position: sticky;
  top: 8px;
  z-index: 2;
  align-self: flex-end;
  margin: 0 0 -28px;
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
  margin: 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: #fffbeb;
  border: 1px solid #fde68a;
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
  width: 100%;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 8px;
  overflow: visible;
}

.pdf-excerpt-block__page-canvas-host {
  width: 100%;
  min-width: 0;
  overflow: visible;
}

.pdf-excerpt-block__page-label {
  margin-bottom: 6px;
  font-size: 11px;
  color: #64748b;
}

.pdf-excerpt-block__page :deep(.pdf-excerpt-block__canvas) {
  display: block;
  max-width: none;
}
</style>

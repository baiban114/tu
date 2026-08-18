<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { GraphData, PageContent } from '@/api/types'
import { getPageContent } from '@/api/page'
import { useWorkspaceStore } from '@/stores/workspace'

const X6Component = defineAsyncComponent(() => import('./X6Component.vue'))

interface ReferencedBoardExpose {
  dockReferenceInterfaceTerminals: (items: Array<{
    edgeId: string
    direction: 'in' | 'out'
    clientX: number
    clientY: number
  }>) => void
}

const props = defineProps<{
  pageId: string
  hostPageId?: string
  title: string
  editable: boolean
  interfaces?: Array<{
    edgeId: string
    portId: string
    direction: 'in' | 'out'
    side: 'top' | 'right' | 'bottom' | 'left'
    ratio: number
  }>
}>()

const emit = defineEmits<{
  'select-wrapper': []
  'drag-wrapper-start': []
  'drag-wrapper-move': [delta: { dx: number; dy: number }]
  'drag-wrapper-end': []
  'drag-interface-start': [portId: string]
  'drag-interface-move': [payload: {
    portId: string
    side: 'top' | 'right' | 'bottom' | 'left'
    ratio: number
  }]
  'drag-interface-end': [portId: string]
}>()

const workspaceStore = useWorkspaceStore()

const canvasRef = ref<HTMLElement | null>(null)
const previewRef = ref<HTMLElement | null>(null)
const interfaceLayerRef = ref<SVGSVGElement | null>(null)
const nestedBoardRef = ref<ReferencedBoardExpose | null>(null)
const content = ref<PageContent | null>(null)
const graphData = ref<GraphData | null>(null)
const embedId = ref('')
const loading = ref(false)
const error = ref('')
const width = ref(320)
const height = ref(200)

let resizeObserver: ResizeObserver | null = null
let interfaceMutationObserver: MutationObserver | null = null
let interfaceMeasureFrame: number | null = null
let pendingGraphData: GraphData | null = null
let headerPointerId: number | null = null
let headerPointerStart: { x: number; y: number } | null = null
let headerPointerLast: { x: number; y: number } | null = null
let wrapperDragging = false
let interfacePointerId: number | null = null
let interfacePointerStart: { x: number; y: number } | null = null
let interfaceDragPortId = ''
let interfaceDragging = false
const draggedInterfaceDock = ref<{
  portId: string
  side: 'top' | 'right' | 'bottom' | 'left'
  ratio: number
} | null>(null)

const canRender = computed(() => (
  !loading.value && !error.value && graphData.value && width.value > 0 && height.value > 0
))

const effectiveInterfaces = computed(() => (props.interfaces ?? []).map((item) => (
  draggedInterfaceDock.value?.portId === item.portId
    ? { ...item, side: draggedInterfaceDock.value.side, ratio: draggedInterfaceDock.value.ratio }
    : item
)))

const interfaceDocks = computed(() => effectiveInterfaces.value.map((item) => {
  const dock = item.side === 'left'
    ? { x: 0, y: height.value * item.ratio }
    : item.side === 'right'
      ? { x: width.value, y: height.value * item.ratio }
      : item.side === 'top'
        ? { x: width.value * item.ratio, y: 0 }
        : { x: width.value * item.ratio, y: height.value }
  return { ...item, ...dock }
}))

function dockRenderedInterfaceTerminals() {
  interfaceMeasureFrame = null
  const interfaceLayer = interfaceLayerRef.value
  const interfaceMatrix = interfaceLayer?.getScreenCTM()
  if (!interfaceMatrix || !nestedBoardRef.value) return
  nestedBoardRef.value.dockReferenceInterfaceTerminals(interfaceDocks.value.map((item) => {
    const screenPoint = new DOMPoint(item.x, item.y).matrixTransform(interfaceMatrix)
    return {
      edgeId: item.edgeId,
      direction: item.direction,
      clientX: screenPoint.x,
      clientY: screenPoint.y,
    }
  }))
}

function scheduleInterfaceMeasurement() {
  if (interfaceMeasureFrame != null) cancelAnimationFrame(interfaceMeasureFrame)
  interfaceMeasureFrame = requestAnimationFrame(() => {
    interfaceMeasureFrame = requestAnimationFrame(dockRenderedInterfaceTerminals)
  })
}

function updateSize() {
  const element = canvasRef.value
  if (!element) return
  width.value = Math.max(1, element.clientWidth)
  height.value = Math.max(1, element.clientHeight)
  scheduleInterfaceMeasurement()
}

async function loadReferencedBoard() {
  if (!props.pageId) return
  if (props.hostPageId && props.hostPageId === props.pageId) {
    error.value = '不能在画板内展开其自身引用'
    graphData.value = null
    return
  }
  loading.value = true
  error.value = ''
  try {
    const pageContent = await getPageContent(props.pageId)
    const primaryId = typeof pageContent.metadata?.primaryEmbedId === 'string'
      ? pageContent.metadata.primaryEmbedId
      : ''
    const embed = pageContent.embeds.find((item) => item.id === primaryId && item.type === 'x6')
      ?? pageContent.embeds.find((item) => item.type === 'x6')
    if (!embed?.graphData) throw new Error('引用页面中没有可显示的画板')
    content.value = pageContent
    embedId.value = embed.id
    graphData.value = embed.graphData
    await nextTick()
    updateSize()
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '引用画板加载失败'
    graphData.value = null
  } finally {
    loading.value = false
    nextTick(() => scheduleInterfaceMeasurement())
  }
}

async function flushSave() {
  const nextGraphData = pendingGraphData
  const pageContent = content.value
  const targetEmbedId = embedId.value
  pendingGraphData = null
  if (!nextGraphData || !pageContent || !targetEmbedId) return
  const nextContent: PageContent = {
    ...pageContent,
    embeds: pageContent.embeds.map((embed) => (
      embed.id === targetEmbedId ? { ...embed, graphData: nextGraphData } : embed
    )),
  }
  content.value = nextContent
  await workspaceStore.savePage(props.pageId, nextContent)
}

function onGraphDataChange(next: GraphData) {
  graphData.value = next
  pendingGraphData = next
  scheduleInterfaceMeasurement()
  void flushSave()
}

function onHeaderPointerDown(event: PointerEvent) {
  if (event.button !== 0) return
  event.preventDefault()
  emit('select-wrapper')
  if (!props.editable) return
  headerPointerId = event.pointerId
  headerPointerStart = { x: event.clientX, y: event.clientY }
  headerPointerLast = { ...headerPointerStart }
  wrapperDragging = false
  window.addEventListener('pointermove', onHeaderPointerMove)
  window.addEventListener('pointerup', onHeaderPointerUp)
  window.addEventListener('pointercancel', onHeaderPointerUp)
}

function onHeaderPointerMove(event: PointerEvent) {
  if (event.pointerId !== headerPointerId || !headerPointerStart || !headerPointerLast) return
  const totalDistance = Math.hypot(
    event.clientX - headerPointerStart.x,
    event.clientY - headerPointerStart.y,
  )
  if (!wrapperDragging && totalDistance < 3) return
  if (!wrapperDragging) {
    wrapperDragging = true
    emit('drag-wrapper-start')
  }
  const dx = event.clientX - headerPointerLast.x
  const dy = event.clientY - headerPointerLast.y
  headerPointerLast = { x: event.clientX, y: event.clientY }
  if (dx || dy) emit('drag-wrapper-move', { dx, dy })
}

function clearHeaderPointerListeners() {
  window.removeEventListener('pointermove', onHeaderPointerMove)
  window.removeEventListener('pointerup', onHeaderPointerUp)
  window.removeEventListener('pointercancel', onHeaderPointerUp)
}

function onHeaderPointerUp(event: PointerEvent) {
  if (event.pointerId !== headerPointerId) return
  if (wrapperDragging) emit('drag-wrapper-end')
  headerPointerId = null
  headerPointerStart = null
  headerPointerLast = null
  wrapperDragging = false
  clearHeaderPointerListeners()
}

function resolveInterfaceDock(clientX: number, clientY: number) {
  const element = previewRef.value
  if (!element) return null
  const rect = element.getBoundingClientRect()
  const x = Math.min(rect.width, Math.max(0, clientX - rect.left))
  const y = Math.min(rect.height, Math.max(0, clientY - rect.top))
  const candidates = [
    { side: 'left' as const, distance: x },
    { side: 'right' as const, distance: rect.width - x },
    { side: 'top' as const, distance: y },
    { side: 'bottom' as const, distance: rect.height - y },
  ]
  const side = candidates.sort((left, right) => left.distance - right.distance)[0]?.side ?? 'right'
  const rawRatio = side === 'left' || side === 'right'
    ? y / Math.max(1, rect.height)
    : x / Math.max(1, rect.width)
  return { side, ratio: Math.min(0.92, Math.max(0.08, rawRatio)) }
}

function onInterfacePointerDown(event: PointerEvent, portId: string) {
  if (!props.editable || event.button !== 0) return
  event.preventDefault()
  emit('select-wrapper')
  interfacePointerId = event.pointerId
  interfacePointerStart = { x: event.clientX, y: event.clientY }
  interfaceDragPortId = portId
  interfaceDragging = false
  window.addEventListener('pointermove', onInterfacePointerMove)
  window.addEventListener('pointerup', onInterfacePointerUp)
  window.addEventListener('pointercancel', onInterfacePointerUp)
}

function onInterfacePointerMove(event: PointerEvent) {
  if (event.pointerId !== interfacePointerId || !interfacePointerStart || !interfaceDragPortId) return
  const distance = Math.hypot(
    event.clientX - interfacePointerStart.x,
    event.clientY - interfacePointerStart.y,
  )
  if (!interfaceDragging && distance < 2) return
  if (!interfaceDragging) {
    interfaceDragging = true
    emit('drag-interface-start', interfaceDragPortId)
  }
  const dock = resolveInterfaceDock(event.clientX, event.clientY)
  if (!dock) return
  draggedInterfaceDock.value = { portId: interfaceDragPortId, ...dock }
  emit('drag-interface-move', { portId: interfaceDragPortId, ...dock })
}

function clearInterfacePointerListeners() {
  window.removeEventListener('pointermove', onInterfacePointerMove)
  window.removeEventListener('pointerup', onInterfacePointerUp)
  window.removeEventListener('pointercancel', onInterfacePointerUp)
}

function onInterfacePointerUp(event: PointerEvent) {
  if (event.pointerId !== interfacePointerId) return
  const portId = interfaceDragPortId
  if (interfaceDragging) emit('drag-interface-end', portId)
  interfacePointerId = null
  interfacePointerStart = null
  interfaceDragPortId = ''
  interfaceDragging = false
  clearInterfacePointerListeners()
  nextTick(() => {
    draggedInterfaceDock.value = null
  })
}

watch(() => props.pageId, () => {
  void loadReferencedBoard()
})

watch(() => props.interfaces, () => {
  scheduleInterfaceMeasurement()
}, { deep: true })

onMounted(() => {
  updateSize()
  if (canvasRef.value) {
    resizeObserver = new ResizeObserver(() => updateSize())
    resizeObserver.observe(canvasRef.value)
    interfaceMutationObserver = new MutationObserver(() => scheduleInterfaceMeasurement())
    interfaceMutationObserver.observe(canvasRef.value, {
      attributes: true,
      childList: true,
      subtree: true,
      attributeFilter: ['transform', 'd'],
    })
  }
  void loadReferencedBoard()
})

onBeforeUnmount(() => {
  if (wrapperDragging) emit('drag-wrapper-end')
  clearHeaderPointerListeners()
  if (interfaceDragging && interfaceDragPortId) emit('drag-interface-end', interfaceDragPortId)
  clearInterfacePointerListeners()
  if (interfaceMeasureFrame != null) cancelAnimationFrame(interfaceMeasureFrame)
  interfaceMeasureFrame = null
  resizeObserver?.disconnect()
  resizeObserver = null
  interfaceMutationObserver?.disconnect()
  interfaceMutationObserver = null
  void flushSave()
})
</script>

<template>
  <div ref="previewRef" class="x6-board-reference-preview" @mousedown.stop @click.stop @dblclick.stop>
    <button
      type="button"
      class="x6-board-reference-preview__header"
      title="选择画板引用父元素"
      @pointerdown.stop="onHeaderPointerDown"
      @mousedown.stop
      @click.stop="emit('select-wrapper')"
    >
      <span class="x6-board-reference-preview__badge">引用画板</span>
      <span class="x6-board-reference-preview__title">{{ title }}</span>
    </button>
    <div ref="canvasRef" class="x6-board-reference-preview__canvas">
      <div v-if="loading" class="x6-board-reference-preview__state">正在加载画板…</div>
      <div v-else-if="error" class="x6-board-reference-preview__state x6-board-reference-preview__state--error">
        {{ error }}
      </div>
      <X6Component
        v-else-if="canRender && graphData"
        ref="nestedBoardRef"
        :page-id="pageId"
        :graph-data="graphData"
        :width="width"
        :height="height"
        layout-mode="fill"
        :editable="editable"
        :toolbar-enabled="false"
        :inspector-enabled="false"
        :block-actions-enabled="false"
        :reference-preview-enabled="false"
        :auto-fit-on-resize="true"
        @graph-data-change="onGraphDataChange"
      />
      <div v-else class="x6-board-reference-preview__state">引用画板暂无内容</div>
    </div>
    <svg ref="interfaceLayerRef" class="x6-board-reference-preview__interfaces">
      <g
        v-for="item in interfaceDocks"
        :key="item.portId"
        :data-interface-edge-id="item.edgeId"
      >
        <circle
          class="x6-board-reference-preview__interface-dock"
          :cx="item.x"
          :cy="item.y"
          r="5"
          role="slider"
          aria-label="调整接口锚点"
          @pointerdown.stop="onInterfacePointerDown($event, item.portId)"
        />
      </g>
    </svg>
  </div>
</template>

<style scoped>
.x6-board-reference-preview {
  position: relative;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 2px solid #7c3aed;
  border-radius: 12px;
  box-sizing: border-box;
  background: #fff;
  pointer-events: auto;
}

.x6-board-reference-preview__header {
  position: relative;
  z-index: 2;
  height: 28px;
  flex: 0 0 28px;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 9px;
  border: 0;
  border-bottom: 1px solid #ddd6fe;
  background: rgba(245, 243, 255, 0.82);
  color: #5b21b6;
  cursor: grab;
  touch-action: none;
  text-align: left;
}

.x6-board-reference-preview__header:active {
  cursor: grabbing;
}

.x6-board-reference-preview__interfaces {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-radius: inherit;
  pointer-events: none;
  z-index: 3;
}

.x6-board-reference-preview__interface-dock {
  fill: transparent;
  stroke: #7c3aed;
  stroke-width: 2;
  pointer-events: all;
  cursor: move;
  touch-action: none;
}

.x6-board-reference-preview__badge {
  flex: 0 0 auto;
  padding: 1px 5px;
  border-radius: 999px;
  background: #7c3aed;
  color: #fff;
  font-size: 10px;
  line-height: 16px;
}

.x6-board-reference-preview__title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 600;
}

.x6-board-reference-preview__canvas {
  position: absolute;
  inset: 0;
  min-height: 0;
  overflow: hidden;
  z-index: 1;
}

.x6-board-reference-preview__canvas :deep(.x6-editor) {
  width: 100%;
  height: 100%;
  min-height: 0;
  border: 0;
}

.x6-board-reference-preview__state {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  box-sizing: border-box;
  color: #6b7280;
  font-size: 12px;
  text-align: center;
}

.x6-board-reference-preview__state--error {
  color: #b91c1c;
}
</style>

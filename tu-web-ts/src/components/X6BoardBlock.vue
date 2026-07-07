<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, unref, type Ref } from 'vue'
import BoardCanvasShell from './BoardCanvasShell.vue'
import X6Component from './X6Component.vue'
import BlockPicker from './BlockPicker.vue'
import type { ReferenceTarget } from './BlockPicker.vue'
import type { GraphData } from '@/api/types'
import { isMindmapBlueprint } from '@/components/x6'
import { useWorkspaceStore } from '@/stores/workspace'

const props = withDefaults(
  defineProps<{
    mode: 'embedded' | 'page'
    graphData: GraphData
    width?: number | null
    height?: number | null
    selected?: boolean
    blockId?: string
    headingLevel?: number
    headingText?: string
    pageTitle?: string
  }>(),
  {
    width: null,
    height: null,
    selected: false,
    blockId: '',
    headingLevel: 0,
    headingText: '',
    pageTitle: '',
  },
)

const emit = defineEmits<{
  'graph-data-change': [graphData: GraphData]
  resize: [width: number | null, height: number | null]
  'page-title-change': [title: string]
  'compound-badge-click': [blockId: string, annotationId: string, event: MouseEvent]
}>()

interface CompoundBadge {
  annotationId: string
  color: string
}

const compoundAnnotationBadges = inject<Record<string, CompoundBadge[]> | Ref<Record<string, CompoundBadge[]>>>(
  'compoundAnnotationBadges',
  {},
)
const onCompoundBadgeClick = inject<(blockId: string, annotationId: string, event: MouseEvent) => void>(
  'onCompoundBadgeClick',
  () => {},
)

const blockId = computed(() => props.blockId || '')
const compoundBadges = computed(() => unref(compoundAnnotationBadges)[blockId.value] || [])

const blockTypeLabel = computed(() => (
  isMindmapBlueprint(props.graphData) ? '思维导图' : 'X6 画板'
))

const canvasHostRef = ref<HTMLElement | null>(null)
const x6ComponentRef = ref<InstanceType<typeof X6Component> | null>(null)
const observedWidth = ref<number | null>(null)
const observedHeight = ref<number | null>(null)
const showRefBlockPicker = ref(false)
const pendingRefInsertPosition = ref<{ x: number; y: number } | null>(null)
const workspaceStore = useWorkspaceStore()
let resizeObserver: ResizeObserver | null = null

function updateObservedSize() {
  const el = canvasHostRef.value
  if (!el) return
  observedWidth.value = el.clientWidth
  observedHeight.value = el.clientHeight
}

onMounted(() => {
  if (props.mode !== 'page' || !canvasHostRef.value) return
  updateObservedSize()
  resizeObserver = new ResizeObserver(() => {
    updateObservedSize()
  })
  resizeObserver.observe(canvasHostRef.value)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
})

const effectiveWidth = computed(() => {
  if (props.mode === 'page') return observedWidth.value ?? undefined
  return props.width ?? undefined
})

const effectiveHeight = computed(() => {
  if (props.mode === 'page') return observedHeight.value ?? undefined
  return props.height ?? undefined
})

const layoutMode = computed(() => (props.mode === 'page' ? 'fill' : 'fixed'))

const shellHeadingText = computed(() => (
  props.mode === 'page' ? props.pageTitle : props.headingText
))

function handleBadgeClick(bid: string, annotationId: string, event: MouseEvent) {
  onCompoundBadgeClick(bid, annotationId, event)
  emit('compound-badge-click', bid, annotationId, event)
}

function handleRequestInsertRef(position: { x: number; y: number }) {
  pendingRefInsertPosition.value = position
  showRefBlockPicker.value = true
}

function handleRefBlockPickerSelect(target: ReferenceTarget) {
  x6ComponentRef.value?.insertRefBlock?.(
    target.id,
    target.type,
    pendingRefInsertPosition.value ?? undefined,
  )
  showRefBlockPicker.value = false
  pendingRefInsertPosition.value = null
}

function handleRefBlockPickerVisibleChange(visible: boolean) {
  showRefBlockPicker.value = visible
  if (!visible) {
    pendingRefInsertPosition.value = null
  }
}
</script>

<template>
  <BoardCanvasShell
    :mode="mode"
    :selected="selected"
    :block-type-label="blockTypeLabel"
    :block-id="blockId"
    block-type="x6"
    :compound-badges="compoundBadges"
    :heading-level="mode === 'page' ? 1 : headingLevel"
    :heading-text="shellHeadingText"
    :page-title-editable="mode === 'page'"
    :resizable-axes="{ width: true, height: true }"
    :min-width="200"
    :min-height="150"
    @resize="(width, height) => emit('resize', width, height)"
    @compound-badge-click="handleBadgeClick"
    @page-title-change="emit('page-title-change', $event)"
  >
    <div
      ref="canvasHostRef"
      class="x6-board-block__canvas"
      :class="{ 'x6-board-block__canvas--page': mode === 'page' }"
    >
      <X6Component
        ref="x6ComponentRef"
        :graph-data="graphData"
        :width="effectiveWidth"
        :height="effectiveHeight"
        :layout-mode="layoutMode"
        @graph-data-change="emit('graph-data-change', $event)"
        @request-insert-ref="handleRequestInsertRef"
      />
    </div>
  </BoardCanvasShell>

  <BlockPicker
    :visible="showRefBlockPicker"
    :pages="workspaceStore.pageTree"
    :current-page-id="workspaceStore.currentPageId"
    @select="handleRefBlockPickerSelect"
    @update:visible="handleRefBlockPickerVisibleChange"
  />
</template>

<style scoped>
.x6-board-block__canvas {
  width: 100%;
}

.x6-board-block__canvas--page {
  flex: 1;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}
</style>

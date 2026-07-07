<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref, type Ref } from 'vue'
import { useContentContainerBounds } from '../composables/useContentContainerBounds'
import TuBlockChromeHeader from './TuBlockChromeHeader.vue'

interface ResizableAxes {
  width?: boolean
  height?: boolean
}

interface CompoundBadge {
  annotationId: string
  color: string
}

const props = defineProps({
  selected: { type: Boolean, default: false },
  resizableAxes: { type: Object as () => ResizableAxes, default: () => ({ width: true, height: true }) },
  width: { type: Number, default: null },
  height: { type: Number, default: null },
  minWidth: { type: Number, default: 100 },
  minHeight: { type: Number, default: 40 },
  maxWidth: { type: Number, default: undefined },
  maxHeight: { type: Number, default: undefined },
  blockTypeLabel: { type: String, default: '' },
  blockId: { type: String, default: '' },
  blockType: { type: String, default: '' },
  compoundBadges: { type: Object as () => CompoundBadge[], default: () => [] },
  headingLevel: { type: Number, default: 0 },
  headingText: { type: String, default: '' },
})

const emit = defineEmits<{
  resize: [width: number | null, height: number | null]
  'compound-badge-click': [blockId: string, annotationId: string, event: MouseEvent]
}>()

const wrapper = ref<HTMLElement | null>(null)
const dragging = ref<'right' | 'bottom' | 'corner' | null>(null)
const hovered = ref(false)
const dragWidth = ref<number | null>(null)
const dragHeight = ref<number | null>(null)

const { clampWidth: clampToContentWidth } = useContentContainerBounds(wrapper)

const showHandles = computed(() => props.selected || hovered.value)

// Lasso selection state (multi-select for batch operations)
const lassoSelectedBlockIds = inject('lassoSelectedBlockIds') as Ref<Set<string>>
const isLassoSelected = computed(() => lassoSelectedBlockIds?.value.has(props.blockId) ?? false)

const wrapperStyle = computed(() => {
  const style: Record<string, string> = {}
  const rawWidth = dragWidth.value ?? props.width
  const height = dragHeight.value ?? props.height

  if (rawWidth != null) {
    const minW = props.minWidth ?? 0
    const capped = props.maxWidth != null
      ? Math.min(rawWidth, props.maxWidth)
      : rawWidth
    style.width = `${clampToContentWidth(capped, minW)}px`
  } else {
    style.width = '100%'
    style.maxWidth = '100%'
  }

  if (height != null) style.height = `${height}px`
  return style
})

const handleMouseDown = (direction: 'right' | 'bottom' | 'corner', event: MouseEvent) => {
  event.preventDefault()
  event.stopPropagation()
  dragging.value = direction

  const el = wrapper.value
  if (!el) return

  const rect = el.getBoundingClientRect()
  const startX = event.clientX
  const startY = event.clientY
  const startW = rect.width
  const startH = rect.height

  const onMouseMove = (e: MouseEvent) => {
    let newW = startW
    let newH = startH

    if (direction === 'right' || direction === 'corner') {
      newW = startW + (e.clientX - startX)
      if (!props.resizableAxes.width) newW = startW
      newW = clampToContentWidth(newW, props.minWidth ?? 0)
      if (props.maxWidth != null) newW = Math.min(props.maxWidth, newW)
    }

    if (direction === 'bottom' || direction === 'corner') {
      newH = startH + (e.clientY - startY)
      if (props.minHeight != null) newH = Math.max(props.minHeight, newH)
      if (props.maxHeight != null) newH = Math.min(props.maxHeight, newH)
      if (!props.resizableAxes.height) newH = startH
    }

    if (e.shiftKey && direction === 'corner' && startH > 0 && startW > 0) {
      const ratio = startW / startH
      const maxDim = Math.max(newW / ratio, newH)
      newW = maxDim * ratio
      newH = maxDim
    }

    const clampedW = newW != null ? Math.round(newW) : null
    const clampedH = newH != null ? Math.round(newH) : null

    dragWidth.value = clampedW
    dragHeight.value = clampedH
    emit('resize', clampedW, clampedH)
  }

  const onMouseUp = () => {
    dragging.value = null
    dragWidth.value = null
    dragHeight.value = null
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
  }

  document.body.style.userSelect = 'none'
  document.body.style.cursor = direction === 'right' ? 'ew-resize' : direction === 'bottom' ? 'ns-resize' : 'nwse-resize'
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

onBeforeUnmount(() => {
  document.body.style.userSelect = ''
  document.body.style.cursor = ''
})
</script>

<template>
  <div
    ref="wrapper"
    class="resizable-block-wrapper"
    :class="{
      'resizable-block-wrapper--selected': selected,
      'resizable-block-wrapper--dragging': dragging != null,
      'resizable-block-wrapper--lasso-selected': isLassoSelected,
    }"
    :data-block-id="blockId || undefined"
    :style="wrapperStyle"
    @mouseenter="hovered = true"
    @mouseleave="hovered = false"
  >
    <TuBlockChromeHeader
      v-if="blockTypeLabel"
      :type-label="blockTypeLabel"
      :compound-badges="compoundBadges"
      drag-handle
      @compound-badge-click="(annotationId, event) => emit('compound-badge-click', blockId, annotationId, event)"
    />

    <div
      v-if="$slots['header-meta']"
      class="resizable-block-wrapper__header-meta"
      data-node-view-no-drag
    >
      <slot name="header-meta" />
    </div>

    <component
      :is="'h' + headingLevel"
      v-if="headingLevel > 0 && headingText"
      class="resizable-block-wrapper__heading"
    >{{ headingText }}</component>

    <slot />

    <div
      v-if="showHandles && resizableAxes.width"
      class="resizable-handle resizable-handle--right"
      @mousedown.prevent.stop="handleMouseDown('right', $event)"
    />

    <div
      v-if="showHandles && resizableAxes.height"
      class="resizable-handle resizable-handle--bottom"
      @mousedown.prevent.stop="handleMouseDown('bottom', $event)"
    />

    <div
      v-if="showHandles && resizableAxes.width && resizableAxes.height"
      class="resizable-handle resizable-handle--corner"
      @mousedown.prevent.stop="handleMouseDown('corner', $event)"
    />
  </div>
</template>

<style scoped>
.resizable-block-wrapper {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
  border: 1px solid transparent;
  border-radius: 6px;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.resizable-block-wrapper:hover {
  border-color: rgba(22, 119, 255, 0.35);
  box-shadow: 0 0 0 1px rgba(22, 119, 255, 0.08), 0 1px 6px rgba(22, 119, 255, 0.06);
}

.resizable-block-wrapper--selected {
  border-color: #1677ff;
  box-shadow: 0 0 0 2px rgba(22, 119, 255, 0.14);
}

.resizable-block-wrapper--dragging {
  transition: none;
}

.resizable-block-wrapper--lasso-selected {
  border-color: #fa8c16;
  box-shadow: 0 0 0 2px rgba(250, 140, 22, 0.2), inset 0 0 0 1px rgba(250, 140, 22, 0.08);
}

.resizable-block-wrapper__header-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  min-width: 0;
  padding: 6px 10px;
  font-size: 12px;
  line-height: 1.4;
  color: #64748b;
  border-bottom: 1px solid #e5e7eb;
  background: #f9fafb;
}

.resizable-block-wrapper__heading {
  margin: 1em 0 0.5em;
  font-weight: 600;
  line-height: 1.3;
}
h1.resizable-block-wrapper__heading { font-size: 2em; }
h2.resizable-block-wrapper__heading { font-size: 1.5em; }
h3.resizable-block-wrapper__heading { font-size: 1.25em; }
h4.resizable-block-wrapper__heading { font-size: 1.1em; }

.resizable-handle {
  position: absolute;
  z-index: 10;
  background: rgba(22, 119, 255, 0.08);
  border: 1px solid rgba(22, 119, 255, 0.3);
  transition: background 0.15s, border-color 0.15s, box-shadow 0.15s;
}

.resizable-handle:hover {
  background: rgba(22, 119, 255, 0.2);
  border-color: #1677ff;
  box-shadow: 0 0 4px rgba(22, 119, 255, 0.3);
}

.resizable-handle--right {
  top: 50%;
  right: -6px;
  width: 12px;
  height: 44px;
  transform: translateY(-50%);
  cursor: ew-resize;
  border-radius: 4px;
}

.resizable-handle--bottom {
  bottom: -6px;
  left: 50%;
  width: 54px;
  height: 12px;
  transform: translateX(-50%);
  cursor: ns-resize;
  border-radius: 4px;
}

.resizable-handle--corner {
  right: -9px;
  bottom: -9px;
  width: 18px;
  height: 18px;
  cursor: nwse-resize;
  border-radius: 4px;
}

.resizable-handle--corner::after {
  content: '';
  position: absolute;
  right: 3px;
  bottom: 3px;
  width: 7px;
  height: 7px;
  border-right: 2px solid #1677ff;
  border-bottom: 2px solid #1677ff;
}
</style>

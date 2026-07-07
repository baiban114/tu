<script setup lang="ts">
import { computed, inject, unref, type Ref } from 'vue'
import { nodeViewProps, NodeViewWrapper } from '@tiptap/vue-3'
import ResizableBlockWrapper from '../components/ResizableBlockWrapper.vue'
import MultiTableBlock from '@/components/MultiTableBlock.vue'
import type { MultiTableData } from '@/api/types'

const props = defineProps(nodeViewProps)

interface CompoundBadge {
  annotationId: string
  color: string
}

const compoundAnnotationBadges = inject<Record<string, CompoundBadge[]> | Ref<Record<string, CompoundBadge[]>>>('compoundAnnotationBadges', {})
const onCompoundBadgeClick = inject<((blockId: string, annotationId: string, event: MouseEvent) => void)>('onCompoundBadgeClick', () => {})
const flushEditorContentChange = inject<() => void>('flushEditorContentChange', () => {})

const blockId = computed(() => props.node.attrs.blockId || '')
const compoundBadges = computed(() => unref(compoundAnnotationBadges)[blockId.value] || [])
const headingLevel = computed(() => props.node.attrs.headingLevel || 0)
const headingText = computed(() => props.node.attrs.title || '')

const multiTableData = computed<MultiTableData>({
  get: () => props.node.attrs.multiTableData,
  set: (val) => props.updateAttributes({ multiTableData: val }),
})

const updateMultiTableData = (data: MultiTableData) => {
  props.updateAttributes({ multiTableData: data })
  flushEditorContentChange()
}

const blockHeight = computed(() => {
  const value = Number(props.node.attrs.height)
  return Number.isFinite(value) && value > 0 ? value : undefined
})

const blockWidth = computed(() => {
  const value = Number(props.node.attrs.width)
  return Number.isFinite(value) && value > 0 ? value : undefined
})

const onResize = (width: number | null, height: number | null) => {
  props.updateAttributes({ width, height })
}
</script>

<template>
  <node-view-wrapper class="multi-table-block-view">
    <ResizableBlockWrapper
      :selected="selected"
      :resizable-axes="{ width: true, height: true }"
      :width="blockWidth"
      :height="blockHeight"
      :min-width="320"
      :min-height="220"
      block-type-label="多维表格"
      :block-id="blockId"
      block-type="multiTable"
      :compound-badges="compoundBadges"
      :heading-level="headingLevel"
      :heading-text="headingText"
      @resize="onResize"
      @compound-badge-click="(bid, annotationId, event) => onCompoundBadgeClick(bid, annotationId, event)"
    >
      <div class="multi-table-block-view__body" :class="{ 'multi-table-block-view__body--fixed-height': blockHeight != null }">
        <MultiTableBlock
          :data="multiTableData"
          :editable="editor.isEditable"
          @change="updateMultiTableData"
        />
      </div>
    </ResizableBlockWrapper>
  </node-view-wrapper>
</template>

<style scoped>
.multi-table-block-view {
  width: 100%;
  max-width: 100%;
}

.multi-table-block-view__body {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  min-height: 0;
}

.multi-table-block-view__body :deep(.multi-table) {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}

.multi-table-block-view__body--fixed-height {
  flex: 1;
  overflow: hidden;
}

.multi-table-block-view__body--fixed-height :deep(.multi-table) {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.multi-table-block-view__body--fixed-height :deep(.multi-table__grid),
.multi-table-block-view__body--fixed-height :deep(.multi-table__kanban) {
  flex: 1;
  min-height: 0;
}

.multi-table-block-view__body--fixed-height :deep(.multi-table__grid) {
  max-height: none;
}
</style>

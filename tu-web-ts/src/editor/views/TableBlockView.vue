<script setup lang="ts">
import { computed, inject, unref, type Ref } from 'vue'
import { nodeViewProps, NodeViewWrapper } from '@tiptap/vue-3'
import ResizableBlockWrapper from '../components/ResizableBlockWrapper.vue'
import TableBlock from '@/components/TableBlock.vue'
import type { TableBlockData } from '@/api/types'

const props = defineProps(nodeViewProps)

interface CompoundBadge {
  annotationId: string
  color: string
}

const compoundAnnotationBadges = inject<Record<string, CompoundBadge[]> | Ref<Record<string, CompoundBadge[]>>>('compoundAnnotationBadges', {})
const onCompoundBadgeClick = inject<((blockId: string, annotationId: string, event: MouseEvent) => void)>('onCompoundBadgeClick', () => {})

const blockId = computed(() => props.node.attrs.blockId || '')
const compoundBadges = computed(() => unref(compoundAnnotationBadges)[blockId.value] || [])

const headingLevel = computed(() => props.node.attrs.headingLevel || 0)
const headingText = computed(() => props.node.attrs.title || '')

const tableData = computed<TableBlockData>({
  get: () => props.node.attrs.tableData,
  set: (val) => props.updateAttributes({ tableData: val }),
})

const onResize = (width: number | null, _height: number | null) => {
  props.updateAttributes({ width })
}

const handleBadgeClick = (bid: string, annotationId: string, event: MouseEvent) => {
  onCompoundBadgeClick(bid, annotationId, event)
}
</script>

<template>
  <node-view-wrapper class="table-block-view">
    <ResizableBlockWrapper
      :selected="selected"
      :resizable-axes="{ width: true, height: false }"
      :min-width="240"
      block-type-label="表格"
      :block-id="blockId"
      block-type="table"
      :compound-badges="compoundBadges"
      :heading-level="headingLevel"
      :heading-text="headingText"
      @resize="onResize"
      @compound-badge-click="handleBadgeClick"
    >
      <div class="table-block-view__body">
        <TableBlock
          :data="tableData"
          :editable="editor.isEditable"
          @change="tableData = $event"
        />
      </div>
    </ResizableBlockWrapper>
  </node-view-wrapper>
</template>

<style scoped>
.table-block-view__body {
  max-width: 100%;
}
</style>

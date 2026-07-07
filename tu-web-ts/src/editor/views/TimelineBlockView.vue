<script setup lang="ts">
import { computed, inject, unref, type Ref } from 'vue'
import { nodeViewProps, NodeViewWrapper } from '@tiptap/vue-3'
import ResizableBlockWrapper from '../components/ResizableBlockWrapper.vue'
import Line from '@/components/line.vue'

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

const timelineData = computed({
  get: () => props.node.attrs.timelineData,
  set: (val) => props.updateAttributes({ timelineData: val }),
})

const onResize = (width: number | null, _height: number | null) => {
  props.updateAttributes({ width })
}

const handleBadgeClick = (bid: string, annotationId: string, event: MouseEvent) => {
  onCompoundBadgeClick(bid, annotationId, event)
}
</script>

<template>
  <node-view-wrapper class="timeline-block-view">
    <ResizableBlockWrapper
      :selected="selected"
      :resizable-axes="{ width: true, height: false }"
      :min-width="300"
      block-type-label="时间轴"
      :block-id="blockId"
      block-type="line"
      :compound-badges="compoundBadges"
      :heading-level="headingLevel"
      :heading-text="headingText"
      @resize="onResize"
      @compound-badge-click="handleBadgeClick"
    >
      <Line
        :timeline-data="timelineData"
        @update:timeline-data="timelineData = $event"
      />
    </ResizableBlockWrapper>
  </node-view-wrapper>
</template>

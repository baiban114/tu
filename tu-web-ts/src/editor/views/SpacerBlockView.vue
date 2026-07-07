<script setup lang="ts">
import { computed, inject, unref, type Ref } from 'vue'
import { nodeViewProps, NodeViewWrapper } from '@tiptap/vue-3'
import ResizableBlockWrapper from '../components/ResizableBlockWrapper.vue'

interface CompoundBadge {
  annotationId: string
  color: string
}

const props = defineProps(nodeViewProps)

const compoundAnnotationBadges = inject<Record<string, CompoundBadge[]> | Ref<Record<string, CompoundBadge[]>>>('compoundAnnotationBadges', {})
const onCompoundBadgeClick = inject<((blockId: string, annotationId: string, event: MouseEvent) => void)>('onCompoundBadgeClick', () => {})

const blockId = computed(() => props.node.attrs.blockId || '')
const compoundBadges = computed(() => unref(compoundAnnotationBadges)[blockId.value] || [])

const headingLevel = computed(() => props.node.attrs.headingLevel || 0)
const headingText = computed(() => props.node.attrs.title || '')

const onResize = (_width: number | null, height: number | null) => {
  props.updateAttributes({ height, spacerHeight: height })
}

const handleBadgeClick = (bid: string, annotationId: string, event: MouseEvent) => {
  onCompoundBadgeClick(bid, annotationId, event)
}
</script>

<template>
  <node-view-wrapper class="spacer-block-nv">
    <ResizableBlockWrapper
      :selected="selected"
      :resizable-axes="{ width: false, height: true }"
      :min-height="20"
      :max-height="600"
      block-type-label="分割空白"
      :block-id="blockId"
      block-type="spacer"
      :compound-badges="compoundBadges"
      :heading-level="headingLevel"
      :heading-text="headingText"
      @resize="onResize"
      @compound-badge-click="handleBadgeClick"
    >
      <div
        class="spacer-block-view"
        :style="{ height: (node.attrs.height || 40) + 'px' }"
      />
    </ResizableBlockWrapper>
  </node-view-wrapper>
</template>

<style scoped>
.spacer-block-view {
  background: repeating-linear-gradient(
    90deg,
    transparent,
    transparent 10px,
    rgba(0, 0, 0, 0.03) 10px,
    rgba(0, 0, 0, 0.03) 11px
  );
  cursor: ns-resize;
  min-height: 20px;
}
</style>

<script setup lang="ts">
import { computed } from 'vue'
import { nodeViewProps, NodeViewWrapper } from '@tiptap/vue-3'
import X6BoardBlock from '@/components/X6BoardBlock.vue'

const props = defineProps(nodeViewProps)

const blockId = computed(() => props.node.attrs.blockId || '')
const headingLevel = computed(() => props.node.attrs.headingLevel || 0)
const headingText = computed(() => props.node.attrs.title || '')

const graphData = computed({
  get: () => props.node.attrs.graphData,
  set: (val) => props.updateAttributes({ graphData: val }),
})

const onResize = (width: number | null, height: number | null) => {
  props.updateAttributes({ width, height })
}
</script>

<template>
  <node-view-wrapper class="x6-block-view">
    <X6BoardBlock
      mode="embedded"
      :selected="selected"
      :graph-data="graphData"
      :width="props.node.attrs.width"
      :height="props.node.attrs.height"
      :block-id="blockId"
      :heading-level="headingLevel"
      :heading-text="headingText"
      @graph-data-change="graphData = $event"
      @resize="onResize"
    />
  </node-view-wrapper>
</template>

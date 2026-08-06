<script setup lang="ts">
import { computed, watch } from 'vue'
import TuEditor from '@/components/TuEditor.vue'
import type { PageContent } from '@/api/types'
import type { TaggedContentItem } from '@/api/taggedContent'
import {
  documentToBlocks,
  extractBlockDocument,
  extractSectionDocument,
} from '@/utils/taggedContentExpansion'

const props = withDefaults(defineProps<{
  item: TaggedContentItem
  /** Page content for rendering; undefined → not yet loaded. */
  content?: PageContent | null
  loading?: boolean
}>(), {
  content: null,
  loading: false,
})

const emit = defineEmits<{
  load: []
}>()

const renderBlocks = computed(() => {
  if (!props.content) return []
  if (props.item.scope === 'section' && props.item.blockId) {
    const doc = extractSectionDocument(props.content, props.item.blockId)
    return doc ? documentToBlocks(doc) : []
  }
  if (props.item.scope === 'block' && props.item.blockId) {
    const doc = extractBlockDocument(props.content, props.item.blockId)
    return doc ? documentToBlocks(doc) : []
  }
  if (props.item.scope === 'text' && props.item.blockId) {
    const doc = extractBlockDocument(props.content, props.item.blockId)
    return doc ? documentToBlocks(doc) : []
  }
  return []
})

watch(
  () => [props.item.pageId, props.item.blockId, props.content] as const,
  () => {
    if (!props.content) emit('load')
  },
  { immediate: true },
)
</script>

<template>
  <div class="tagged-content-expander">
    <div
      v-if="!content && loading"
      class="tagged-content-expander__status"
    >
      加载内容…
    </div>
    <div
      v-else-if="!content"
      class="tagged-content-expander__status"
    >
      内容加载失败或不可用
    </div>
    <div
      v-else-if="item.scope === 'text' && item.snippet && renderBlocks.length === 0"
      class="tagged-content-expander__text"
    >
      {{ item.snippet }}
    </div>
    <div
      v-else-if="renderBlocks.length === 0"
      class="tagged-content-expander__status"
    >
      未找到可预览的原始内容
    </div>
    <TuEditor
      v-else
      :key="`${item.pageId}-${item.id}`"
      class="tagged-content-expander__editor"
      :blocks="renderBlocks"
      :editable="false"
      :paragraph-gutter-actions="false"
    />
  </div>
</template>

<style scoped>
.tagged-content-expander {
  padding: 8px 12px;
  background: #fff;
  border: 1px solid #ebeef5;
  border-radius: 6px;
}

.tagged-content-expander__editor {
  width: 100%;
}

.tagged-content-expander__status {
  padding: 8px;
  text-align: center;
  font-size: 12px;
  color: #c0c4cc;
}

.tagged-content-expander__text {
  padding: 10px 12px;
  border-left: 3px solid #67c23a;
  background: #f0f9eb;
  color: #303133;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
}
</style>

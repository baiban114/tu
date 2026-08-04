<script setup lang="ts">
import { computed } from 'vue'
import type { ResourceCrawledDocument } from '@/api/externalResource'
import ExpandedDocumentDialog from '@/components/ExpandedDocumentDialog.vue'
import { crawledDocumentToTipTap } from '@/utils/crawledDocumentContent'

/**
 * Read-only viewer dialog for a crawled web-page document. Thin wrapper over
 * ExpandedDocumentDialog — banner shows title, tags and source/crawl meta.
 */
const props = defineProps<{
  modelValue: boolean
  doc: ResourceCrawledDocument | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const title = computed(() => props.doc?.title?.trim() || '网页内容')

const document = computed(() => (props.doc ? crawledDocumentToTipTap(props.doc) : null))

const editorKey = computed(() => `crawled:${props.doc?.id ?? 'none'}`)

const crawledAtLabel = computed(() => {
  if (!props.doc?.crawledAt) return ''
  const date = new Date(props.doc.crawledAt)
  return Number.isNaN(date.getTime()) ? props.doc.crawledAt : date.toLocaleString()
})

function onVisibleUpdate(value: boolean) {
  emit('update:modelValue', value)
}
</script>

<template>
  <ExpandedDocumentDialog
    :visible="modelValue"
    :title="title"
    dialog-title="网页内容"
    :tags="['网络内容', '只读']"
    :document="document"
    :editable="false"
    :editor-key="editorKey"
    @update:visible="onVisibleUpdate"
  >
    <template #banner-extra>
      <span
        v-if="doc?.sourceUrl"
        class="resource-crawled-document-dialog__source"
        :title="doc.sourceUrl"
      >
        <a
          :href="doc.sourceUrl"
          target="_blank"
          rel="noopener noreferrer"
        >来源</a>
        <span v-if="crawledAtLabel"> · 爬取于 {{ crawledAtLabel }}</span>
      </span>
    </template>
  </ExpandedDocumentDialog>
</template>

<style scoped>
.resource-crawled-document-dialog__source {
  margin-left: auto;
  min-width: 0;
  font-size: 11px;
  color: #64748b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.resource-crawled-document-dialog__source a {
  color: #2563eb;
  text-decoration: none;
}

.resource-crawled-document-dialog__source a:hover {
  text-decoration: underline;
}
</style>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  getResourceExcerpt,
  getResourceItem,
  type ResourceExcerpt,
  type ResourceItem,
} from '@/api/externalResource'
import type { Block, ExternalResourceEmbedData } from '@/api/types'
import { resourcePositionDisplay } from '@/utils/resourcePositionLocator'
import TuEditor from '@/components/TuEditor.vue'

const META_DISPLAY_LIMITS = {
  title: 56,
  workTitle: 28,
  identityValue: 20,
  chapterTitle: 32,
  locator: 40,
  note: 48,
  sourceUrl: 40,
} as const

const EXTERNAL_RESOURCE_EXCERPT_MAX_HEIGHT = 200

const props = withDefaults(defineProps<{
  externalResource: ExternalResourceEmbedData
  compact?: boolean
  showBody?: boolean
  bodyBlockId?: string
  lineGutterActions?: boolean
}>(), {
  compact: false,
  showBody: false,
  bodyBlockId: '',
  lineGutterActions: false,
})

const emit = defineEmits<{
  (e: 'line-annotate', blockId: string): void
  (e: 'mark-block-excerpt', blockId: string): void
  (e: 'set-block-basis', blockId: string): void
  (e: 'line-create-knowledge-relation', blockId: string): void
}>()

const latestItem = ref<ResourceItem | null>(null)
const latestExcerpt = ref<ResourceExcerpt | null>(null)
const loading = ref(false)
const loadError = ref('')

function truncateDisplayText(value: string, max: number): string {
  const text = value.trim()
  if (!text) return ''
  if (text.length <= max) return text
  return `${text.slice(0, max)}…`
}

function formatSourceUrlLabel(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return ''
  try {
    return truncateDisplayText(new URL(trimmed).hostname, META_DISPLAY_LIMITS.sourceUrl)
  } catch {
    return truncateDisplayText(trimmed, META_DISPLAY_LIMITS.sourceUrl)
  }
}

const snapshot = computed(() => props.externalResource.snapshot || { resourceTitle: '' })
const isExcerpt = computed(() => props.externalResource.mode === 'excerpt' || Boolean(props.externalResource.resourceExcerptId))
const resourceTitle = computed(() => latestItem.value?.title || snapshot.value.resourceTitle || '外部资源')
const resourceTypeName = computed(() => latestItem.value?.typeName || snapshot.value.resourceTypeName || '外部资源')
const workTitle = computed(() => latestItem.value?.workTitle || snapshot.value.workTitle || '')
const identityLabel = computed(() => latestItem.value?.identityFieldLabel || snapshot.value.identityFieldLabel || '标识')
const identityValue = computed(() => latestItem.value?.identityValue || snapshot.value.identityValue || '')
const sourceUrl = computed(() => latestItem.value?.sourceUrl || snapshot.value.sourceUrl || '')
const excerptTitle = computed(() => latestExcerpt.value?.title || snapshot.value.excerptTitle || '')
const chapterTitle = computed(() => latestExcerpt.value?.chapterTitle || snapshot.value.chapterTitle || '')
const excerptLocator = computed(() => latestExcerpt.value?.locator || snapshot.value.excerptLocator || '')
const excerptNote = computed(() => latestExcerpt.value?.note || snapshot.value.excerptNote || '')
const excerptText = computed(() => latestExcerpt.value?.excerptText || snapshot.value.excerptText || '')
const usingSnapshot = computed(() => Boolean(loadError.value || (!latestItem.value && snapshot.value.resourceTitle)))
const cardTitle = computed(() => (isExcerpt.value ? (excerptTitle.value || resourceTitle.value) : resourceTitle.value))
const cardTitleDisplay = computed(() => truncateDisplayText(cardTitle.value, META_DISPLAY_LIMITS.title))
const workTitleDisplay = computed(() => truncateDisplayText(workTitle.value, META_DISPLAY_LIMITS.workTitle))
const identityDisplay = computed(() => {
  if (!identityValue.value) return ''
  const value = truncateDisplayText(identityValue.value, META_DISPLAY_LIMITS.identityValue)
  return `${identityLabel.value}: ${value}`
})
const chapterTitleDisplay = computed(() => truncateDisplayText(chapterTitle.value, META_DISPLAY_LIMITS.chapterTitle))
const excerptLocatorDisplay = computed(() => {
  const text = resourcePositionDisplay(excerptLocator.value)
  return truncateDisplayText(text, META_DISPLAY_LIMITS.locator)
})
const excerptNoteDisplay = computed(() => truncateDisplayText(excerptNote.value, META_DISPLAY_LIMITS.note))
const sourceUrlLabel = computed(() => formatSourceUrlLabel(sourceUrl.value))

const excerptEditorBlocks = computed<Block[]>(() => [{
  id: props.bodyBlockId || 'external-resource-excerpt',
  type: 'richtext',
  content: excerptText.value,
}])

const showExcerptBody = computed(() => props.showBody && isExcerpt.value && excerptText.value.trim().length > 0)

const loadResource = async () => {
  const resourceItemId = props.externalResource.resourceItemId
  if (!resourceItemId) return
  loading.value = true
  loadError.value = ''
  latestItem.value = null
  latestExcerpt.value = null
  try {
    latestItem.value = await getResourceItem(resourceItemId)
    if (props.externalResource.resourceExcerptId) {
      latestExcerpt.value = await getResourceExcerpt(props.externalResource.resourceExcerptId)
    }
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : '资源加载失败'
  } finally {
    loading.value = false
  }
}

watch(() => [props.externalResource.resourceItemId, props.externalResource.resourceExcerptId], () => {
  void loadResource()
})

onMounted(() => {
  void loadResource()
})
</script>

<template>
  <div class="external-resource-excerpt-panel" :class="{ 'external-resource-excerpt-panel--compact': compact }">
    <div class="external-resource-excerpt-meta">
      <span class="external-resource-excerpt-meta__badge">{{ isExcerpt ? '资源节选' : resourceTypeName }}</span>
      <span v-if="usingSnapshot" class="external-resource-excerpt-meta__snapshot">快照</span>
      <span
        v-if="cardTitleDisplay"
        class="external-resource-excerpt-meta__title"
        :title="cardTitle"
      >{{ cardTitleDisplay }}</span>
      <span
        v-if="workTitleDisplay"
        class="external-resource-excerpt-meta__chip"
        :title="workTitle"
      >{{ workTitleDisplay }}</span>
      <span
        v-if="identityDisplay"
        class="external-resource-excerpt-meta__chip"
        :title="`${identityLabel}: ${identityValue}`"
      >{{ identityDisplay }}</span>
      <span
        v-if="isExcerpt && chapterTitleDisplay"
        class="external-resource-excerpt-meta__chip"
        :title="`章节：${chapterTitle}`"
      >章节：{{ chapterTitleDisplay }}</span>
      <span
        v-if="isExcerpt && excerptLocatorDisplay"
        class="external-resource-excerpt-meta__chip"
        :title="excerptLocator"
      >{{ excerptLocatorDisplay }}</span>
      <span
        v-if="isExcerpt && excerptNoteDisplay"
        class="external-resource-excerpt-meta__chip external-resource-excerpt-meta__chip--note"
        :title="excerptNote"
      >{{ excerptNoteDisplay }}</span>
      <a
        v-if="sourceUrl"
        class="external-resource-excerpt-meta__link"
        :href="sourceUrl"
        target="_blank"
        rel="noreferrer"
        :title="sourceUrl"
      >{{ sourceUrlLabel || sourceUrl }}</a>
      <span v-if="loading" class="external-resource-excerpt-meta__status">加载中…</span>
      <span
        v-else-if="loadError"
        class="external-resource-excerpt-meta__status external-resource-excerpt-meta__status--warn"
        title="最新资源不可用，已显示插入时快照"
      >快照模式</span>
    </div>

    <div
      v-if="showExcerptBody"
      class="external-resource-excerpt-panel__body"
      :style="{ '--external-resource-excerpt-max-height': `${EXTERNAL_RESOURCE_EXCERPT_MAX_HEIGHT}px` }"
    >
      <TuEditor
        :blocks="excerptEditorBlocks"
        :editable="false"
        :hover-handle="false"
        :line-gutter-actions="lineGutterActions"
        class="external-resource-excerpt-panel__editor"
        @line-annotate="emit('line-annotate', $event)"
        @mark-block-excerpt="emit('mark-block-excerpt', $event)"
        @set-block-basis="emit('set-block-basis', $event)"
        @line-create-knowledge-relation="emit('line-create-knowledge-relation', $event)"
      />
    </div>
  </div>
</template>

<style scoped>
.external-resource-excerpt-panel {
  overflow: hidden;
  border: 1px solid #d8dee8;
  border-radius: 6px;
  background: #fff;
}

.external-resource-excerpt-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 6px 10px;
  border-bottom: 1px solid #e5e7eb;
  background: #f8fafc;
  font-size: 12px;
  color: #475569;
}

.external-resource-excerpt-panel--compact .external-resource-excerpt-meta {
  padding: 4px 8px;
  font-size: 11px;
}

.external-resource-excerpt-meta__badge,
.external-resource-excerpt-meta__snapshot {
  border-radius: 999px;
  padding: 1px 8px;
  font-size: 11px;
  flex-shrink: 0;
}

.external-resource-excerpt-meta__badge {
  color: #075985;
  background: #e0f2fe;
}

.external-resource-excerpt-meta__snapshot {
  color: #92400e;
  background: #fef3c7;
}

.external-resource-excerpt-meta__title {
  max-width: min(100%, 360px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
  color: #1f2937;
}

.external-resource-excerpt-meta__chip {
  max-width: min(100%, 240px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.external-resource-excerpt-meta__chip--note {
  max-width: min(100%, 280px);
  font-style: italic;
}

.external-resource-excerpt-meta__link {
  max-width: min(100%, 200px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #1677ff;
}

.external-resource-excerpt-meta__status {
  flex-shrink: 0;
  font-size: 11px;
}

.external-resource-excerpt-meta__status--warn {
  color: #b45309;
}

.external-resource-excerpt-panel__body {
  max-height: var(--external-resource-excerpt-max-height, 200px);
  overflow-y: auto;
  overscroll-behavior: contain;
  min-height: 0;
  padding: 8px 10px;
}

.external-resource-excerpt-panel__body :deep(.tu-editor-wrapper) {
  min-height: 0 !important;
  --tiptap-handle-gutter: 0;
}

.external-resource-excerpt-panel__body :deep(.tu-editor-content) {
  min-height: 0 !important;
  padding: 0 !important;
}
</style>

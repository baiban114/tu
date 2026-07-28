<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  getResourceExcerpt,
  getResourceItem,
  type ResourceExcerpt,
  type ResourceItem,
} from '@/api/externalResource'
import type { Block, ExternalResourceEmbedData } from '@/api/types'
import { formatResourceMetaPath } from '@/utils/resourceMetaPath'
import TuEditor from '@/components/TuEditor.vue'

const EXTERNAL_RESOURCE_EXCERPT_MAX_HEIGHT = 200

const props = withDefaults(defineProps<{
  externalResource: ExternalResourceEmbedData
  compact?: boolean
  showBody?: boolean
  bodyBlockId?: string
  paragraphGutterActions?: boolean
  /** Override badge text (e.g. 依据 / 资源节选). */
  badgeLabel?: string
}>(), {
  compact: false,
  showBody: false,
  bodyBlockId: '',
  paragraphGutterActions: false,
  badgeLabel: '',
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

const snapshot = computed(() => props.externalResource.snapshot || { resourceTitle: '' })
const isExcerpt = computed(() => props.externalResource.mode === 'excerpt' || Boolean(props.externalResource.resourceExcerptId))
const isChapter = computed(() => (
  !isExcerpt.value
  && (props.externalResource.mode === 'chapter' || Boolean(props.externalResource.resourceChapterId))
))
const resourceTitle = computed(() => latestItem.value?.title || snapshot.value.resourceTitle || '')
const resourceTypeName = computed(() => latestItem.value?.typeName || snapshot.value.resourceTypeName || '')
const workTitle = computed(() => latestItem.value?.workTitle || snapshot.value.workTitle || '')
const sourceUrl = computed(() => latestItem.value?.sourceUrl || snapshot.value.sourceUrl || '')
const excerptTitle = computed(() => latestExcerpt.value?.title || snapshot.value.excerptTitle || '')
const chapterTitle = computed(() => latestExcerpt.value?.chapterTitle || snapshot.value.chapterTitle || '')
const excerptLocator = computed(() => latestExcerpt.value?.locator || snapshot.value.excerptLocator || '')
const excerptText = computed(() => latestExcerpt.value?.excerptText || snapshot.value.excerptText || '')
const usingSnapshot = computed(() => Boolean(loadError.value || (!latestItem.value && snapshot.value.resourceTitle)))

function formatSourceUrlLabel(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return ''
  try {
    const host = new URL(trimmed).hostname
    return host.length > 40 ? `${host.slice(0, 40)}…` : host
  } catch {
    return trimmed.length > 40 ? `${trimmed.slice(0, 40)}…` : trimmed
  }
}

const sourceUrlLabel = computed(() => formatSourceUrlLabel(sourceUrl.value))

const badgeText = computed(() => {
  if (props.badgeLabel.trim()) return props.badgeLabel.trim()
  if (isExcerpt.value) return '资源节选'
  if (isChapter.value) return '资源章节'
  return resourceTypeName.value || '外部资源'
})
const badgeTone = computed(() => {
  const label = badgeText.value
  if (label === '依据') return 'basis'
  if (label === '来源') return 'source'
  return 'excerpt'
})

/** Same hierarchy builder as inline meta bars (类型 > 归类 > 实体 > 章节 > 定位 > 节选). */
const metaPathFields = computed(() => ({
  resourceTypeName: resourceTypeName.value !== badgeText.value ? resourceTypeName.value : '',
  workTitle: workTitle.value,
  resourceTitle: resourceTitle.value !== badgeText.value ? resourceTitle.value : '',
  chapterTitle: chapterTitle.value,
  excerptLocator: excerptLocator.value,
  excerptTitle: excerptTitle.value,
}))

const metaPath = computed(() => formatResourceMetaPath(metaPathFields.value))
const metaPathTitle = computed(() => metaPath.value)

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
      <span
        class="external-resource-excerpt-meta__role"
        :class="`external-resource-excerpt-meta__role--${badgeTone}`"
      >{{ badgeText }}</span>
      <span
        v-if="metaPath"
        class="external-resource-excerpt-meta__path"
        :title="metaPathTitle"
      >{{ metaPath }}</span>
      <span v-if="usingSnapshot" class="external-resource-excerpt-meta__snapshot">快照</span>
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
        :paragraph-gutter-actions="paragraphGutterActions"
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

.external-resource-excerpt-meta__role {
  flex-shrink: 0;
  font-weight: 700;
  color: #075985;
}

.external-resource-excerpt-meta__role--basis {
  color: #166534;
}

.external-resource-excerpt-meta__role--source {
  color: #6b21a8;
}

.external-resource-excerpt-meta__role--excerpt {
  color: #075985;
}

.external-resource-excerpt-meta__path {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
  color: #1f2937;
}

.external-resource-excerpt-meta__snapshot {
  border-radius: 999px;
  padding: 1px 8px;
  font-size: 11px;
  flex-shrink: 0;
  color: #92400e;
  background: #fef3c7;
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

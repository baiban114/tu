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
const sourceUrlLabel = computed(() => formatSourceUrlLabel(sourceUrl.value))

const badgeText = computed(() => {
  if (props.badgeLabel.trim()) return props.badgeLabel.trim()
  return isExcerpt.value ? '资源节选' : resourceTypeName.value
})
const badgeTone = computed(() => {
  const label = badgeText.value
  if (label === '依据') return 'basis'
  if (label === '来源') return 'source'
  return 'excerpt'
})

/** Locator path layers only — role badge is separate, not joined with `>`. */
const metaPathParts = computed(() => {
  const parts: string[] = []
  if (
    resourceTypeName.value
    && resourceTypeName.value !== badgeText.value
    && resourceTypeName.value !== '外部资源'
  ) {
    parts.push(truncateDisplayText(resourceTypeName.value, META_DISPLAY_LIMITS.workTitle))
  }
  if (workTitle.value) {
    parts.push(truncateDisplayText(workTitle.value, META_DISPLAY_LIMITS.workTitle))
  } else if (
    resourceTitle.value
    && resourceTitle.value !== badgeText.value
    && (!isExcerpt.value || !excerptTitle.value)
  ) {
    parts.push(truncateDisplayText(resourceTitle.value, META_DISPLAY_LIMITS.title))
  }
  if (identityValue.value) {
    const value = truncateDisplayText(identityValue.value, META_DISPLAY_LIMITS.identityValue)
    parts.push(`${identityLabel.value}: ${value}`)
  }
  if (isExcerpt.value && chapterTitle.value) {
    parts.push(truncateDisplayText(chapterTitle.value, META_DISPLAY_LIMITS.chapterTitle))
  }
  if (isExcerpt.value && excerptLocator.value) {
    const text = resourcePositionDisplay(excerptLocator.value)
    if (text) parts.push(truncateDisplayText(text, META_DISPLAY_LIMITS.locator))
  }
  if (isExcerpt.value && excerptTitle.value) {
    const title = truncateDisplayText(excerptTitle.value, META_DISPLAY_LIMITS.title)
    const last = parts[parts.length - 1]
    const workDisp = workTitle.value
      ? truncateDisplayText(workTitle.value, META_DISPLAY_LIMITS.workTitle)
      : ''
    if (title && title !== last && title !== workDisp) {
      parts.push(title)
    }
  }
  if (isExcerpt.value && excerptNote.value) {
    parts.push(truncateDisplayText(excerptNote.value, META_DISPLAY_LIMITS.note))
  }
  return parts.filter(Boolean)
})

const metaPath = computed(() => metaPathParts.value.join(' > '))
const metaPathTitle = computed(() => {
  const full: string[] = []
  if (resourceTypeName.value && resourceTypeName.value !== badgeText.value) full.push(resourceTypeName.value)
  if (workTitle.value) full.push(workTitle.value)
  else if (resourceTitle.value && resourceTitle.value !== badgeText.value) full.push(resourceTitle.value)
  if (identityValue.value) full.push(`${identityLabel.value}: ${identityValue.value}`)
  if (isExcerpt.value && chapterTitle.value) full.push(chapterTitle.value)
  if (isExcerpt.value && excerptLocator.value) {
    const text = resourcePositionDisplay(excerptLocator.value)
    if (text) full.push(text)
  }
  if (isExcerpt.value && excerptTitle.value) full.push(excerptTitle.value)
  if (isExcerpt.value && excerptNote.value) full.push(excerptNote.value)
  return full.filter(Boolean).join(' > ')
})

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

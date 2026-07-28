<script setup lang="ts">
import { computed, inject, onMounted, ref, unref, watch, type Ref } from 'vue'
import { nodeViewProps, NodeViewWrapper } from '@tiptap/vue-3'
import ResizableBlockWrapper from '../components/ResizableBlockWrapper.vue'
import {
  getResourceExcerpt,
  getResourceItem,
  type ResourceExcerpt,
  type ResourceItem,
} from '@/api/externalResource'
import type { ExternalResourceEmbedData, ExternalResourceSnapshot, Block } from '@/api/types'
import { resourcePositionDisplay } from '@/utils/resourcePositionLocator'
import TuEditor from '@/components/TuEditor.vue'

interface CompoundBadge {
  annotationId: string
  color: string
}

const props = defineProps(nodeViewProps)

const EXTERNAL_RESOURCE_EXCERPT_MAX_HEIGHT = 200

const META_DISPLAY_LIMITS = {
  title: 56,
  workTitle: 28,
  identityValue: 20,
  chapterTitle: 32,
  locator: 40,
  note: 48,
  sourceUrl: 40,
} as const

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

const compoundAnnotationBadges = inject<Record<string, CompoundBadge[]> | Ref<Record<string, CompoundBadge[]>>>('compoundAnnotationBadges', {})
const onCompoundBadgeClick = inject<((blockId: string, annotationId: string, event: MouseEvent) => void)>('onCompoundBadgeClick', () => {})

const latestItem = ref<ResourceItem | null>(null)
const latestExcerpt = ref<ResourceExcerpt | null>(null)
const loading = ref(false)
const loadError = ref('')

const blockId = computed(() => props.node.attrs.blockId || '')
const headingLevel = computed(() => props.node.attrs.headingLevel || 0)
const data = computed<ExternalResourceEmbedData>(() => props.node.attrs.externalResource || {
  resourceItemId: '',
  resourceExcerptId: null,
  mode: 'resource',
  snapshot: { resourceTitle: '' },
})
const snapshot = computed<ExternalResourceSnapshot>(() => data.value.snapshot || { resourceTitle: '' })
const compoundBadges = computed(() => unref(compoundAnnotationBadges)[blockId.value] || [])

const resourceTitle = computed(() => latestItem.value?.title || snapshot.value.resourceTitle || '外部资源')
const resourceTypeName = computed(() => latestItem.value?.typeName || snapshot.value.resourceTypeName || '外部资源')
const workTitle = computed(() => latestItem.value?.workTitle || snapshot.value.workTitle || '')
const identityLabel = computed(() => latestItem.value?.identityFieldLabel || snapshot.value.identityFieldLabel || '标识')
const identityValue = computed(() => latestItem.value?.identityValue || snapshot.value.identityValue || '')
const sourceUrl = computed(() => latestItem.value?.sourceUrl || snapshot.value.sourceUrl || '')
const excerptTitle = computed(() => latestExcerpt.value?.title || snapshot.value.excerptTitle || '')
const chapterTitle = computed(() => latestExcerpt.value?.chapterTitle || snapshot.value.chapterTitle || '')
const excerptLocator = computed(() => latestExcerpt.value?.locator || snapshot.value.excerptLocator || '')
const excerptText = computed(() => latestExcerpt.value?.excerptText || snapshot.value.excerptText || '')
const excerptNote = computed(() => latestExcerpt.value?.note || snapshot.value.excerptNote || '')
const isExcerpt = computed(() => data.value.mode === 'excerpt' || Boolean(data.value.resourceExcerptId))
const usingSnapshot = computed(() => Boolean(loadError.value || (!latestItem.value && snapshot.value.resourceTitle)))
const headingText = computed(() => props.node.attrs.title || (isExcerpt.value ? excerptTitle.value : resourceTitle.value))
const showInlineTitle = computed(() => headingLevel.value <= 0)
const sourceUrlLabel = computed(() => formatSourceUrlLabel(sourceUrl.value))

const metaBadge = computed(() => (isExcerpt.value ? '资源节选' : resourceTypeName.value))

const metaPathParts = computed(() => {
  const parts: string[] = []
  if (
    isExcerpt.value
    && resourceTypeName.value
    && resourceTypeName.value !== metaBadge.value
    && resourceTypeName.value !== '外部资源'
  ) {
    parts.push(truncateDisplayText(resourceTypeName.value, META_DISPLAY_LIMITS.workTitle))
  }
  if (workTitle.value) {
    parts.push(truncateDisplayText(workTitle.value, META_DISPLAY_LIMITS.workTitle))
  } else if (
    showInlineTitle.value
    && resourceTitle.value
    && resourceTitle.value !== metaBadge.value
    && (!isExcerpt.value || !excerptTitle.value)
  ) {
    parts.push(truncateDisplayText(resourceTitle.value, META_DISPLAY_LIMITS.title))
  } else if (
    !isExcerpt.value
    && resourceTitle.value
    && resourceTitle.value !== metaBadge.value
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
  if (showInlineTitle.value && isExcerpt.value && excerptTitle.value) {
    const title = truncateDisplayText(excerptTitle.value, META_DISPLAY_LIMITS.title)
    const last = parts[parts.length - 1]
    const workDisp = workTitle.value
      ? truncateDisplayText(workTitle.value, META_DISPLAY_LIMITS.workTitle)
      : ''
    if (title && title !== last && title !== workDisp) parts.push(title)
  }
  if (isExcerpt.value && excerptNote.value) {
    parts.push(truncateDisplayText(excerptNote.value, META_DISPLAY_LIMITS.note))
  }
  return parts.filter(Boolean)
})

const metaPath = computed(() => metaPathParts.value.join(' > '))
const metaPathTitle = computed(() => metaPathParts.value.join(' > '))

const excerptEditorBlocks = computed<Block[]>(() => [{
  id: blockId.value || 'external-resource-excerpt',
  type: 'richtext',
  content: excerptText.value,
}])

const loadResource = async () => {
  if (!data.value.resourceItemId) return
  loading.value = true
  loadError.value = ''
  latestItem.value = null
  latestExcerpt.value = null
  try {
    latestItem.value = await getResourceItem(data.value.resourceItemId)
    if (data.value.resourceExcerptId) {
      latestExcerpt.value = await getResourceExcerpt(data.value.resourceExcerptId)
    }
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : '资源加载失败'
  } finally {
    loading.value = false
  }
}

const onResize = (width: number | null, _height: number | null) => {
  props.updateAttributes({ width })
}

const handleBadgeClick = (bid: string, annotationId: string, event: MouseEvent) => {
  onCompoundBadgeClick(bid, annotationId, event)
}

watch(() => [data.value.resourceItemId, data.value.resourceExcerptId], () => {
  void loadResource()
})

onMounted(() => {
  void loadResource()
})
</script>

<template>
  <node-view-wrapper class="external-resource-block-view">
    <ResizableBlockWrapper
      :selected="selected"
      :resizable-axes="{ width: true, height: false }"
      :min-width="260"
      block-type-label="外部资源"
      :block-id="blockId"
      block-type="externalResource"
      :compound-badges="compoundBadges"
      :heading-level="headingLevel"
      :heading-text="headingText"
      @resize="onResize"
      @compound-badge-click="handleBadgeClick"
    >
      <template #header-meta>
        <span class="external-resource-meta__role">{{ metaBadge }}</span>
        <span
          v-if="metaPath"
          class="external-resource-meta__path"
          :title="metaPathTitle"
        >{{ metaPath }}</span>
        <span v-if="usingSnapshot" class="external-resource-meta__snapshot">快照</span>
        <a
          v-if="sourceUrl"
          class="external-resource-meta__link"
          :href="sourceUrl"
          target="_blank"
          rel="noreferrer"
          :title="sourceUrl"
        >{{ sourceUrlLabel || sourceUrl }}</a>
        <span v-if="loading" class="external-resource-meta__status">加载中…</span>
        <span
          v-else-if="loadError"
          class="external-resource-meta__status external-resource-meta__status--warn"
          title="最新资源不可用，已显示插入时快照"
        >快照模式</span>
      </template>

      <article class="external-resource-card" :class="{ 'external-resource-card--excerpt': isExcerpt }">
        <div
          v-if="isExcerpt && excerptText.trim()"
          class="external-resource-card__excerpt-scroll"
          :style="{ '--external-resource-excerpt-max-height': `${EXTERNAL_RESOURCE_EXCERPT_MAX_HEIGHT}px` }"
        >
          <TuEditor
            :blocks="excerptEditorBlocks"
            :editable="false"
            :hover-handle="false"
            class="external-resource-card__excerpt-editor"
          />
        </div>
      </article>
    </ResizableBlockWrapper>
  </node-view-wrapper>
</template>

<style scoped>
.external-resource-card {
  min-width: 0;
  border: 1px solid #d8dee8;
  border-radius: 0 0 8px 8px;
  background: #ffffff;
  color: #1f2937;
}

.external-resource-card--excerpt:empty {
  display: none;
}

.external-resource-card:not(:empty) {
  padding: 10px 12px;
}

.external-resource-meta__role {
  flex-shrink: 0;
  font-weight: 700;
  color: #075985;
  font-size: 12px;
}

.external-resource-meta__path {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
  color: #1f2937;
  font-size: 12px;
}

.external-resource-meta__snapshot {
  border-radius: 999px;
  padding: 1px 8px;
  font-size: 11px;
  flex-shrink: 0;
  color: #92400e;
  background: #fef3c7;
}

.external-resource-meta__link {
  max-width: min(100%, 200px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #1677ff;
  font-size: 12px;
}

.external-resource-meta__status {
  flex-shrink: 0;
  font-size: 11px;
}

.external-resource-meta__status--warn {
  color: #b45309;
}

.external-resource-card__excerpt-scroll {
  max-height: var(--external-resource-excerpt-max-height, 200px);
  overflow-y: auto;
  overscroll-behavior: contain;
  min-height: 0;
}

.external-resource-card__excerpt-scroll :deep(.tu-editor-wrapper) {
  min-height: 0 !important;
  --tiptap-handle-gutter: 0;
}

.external-resource-card__excerpt-scroll :deep(.tu-editor-content) {
  min-height: 0 !important;
  padding: 0 !important;
}
</style>

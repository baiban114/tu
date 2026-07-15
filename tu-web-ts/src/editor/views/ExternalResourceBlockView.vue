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
        <span class="external-resource-meta__badge">{{ isExcerpt ? '资源节选' : resourceTypeName }}</span>
        <span v-if="usingSnapshot" class="external-resource-meta__snapshot">快照</span>
        <span
          v-if="showInlineTitle && cardTitleDisplay"
          class="external-resource-meta__title"
          :title="cardTitle"
        >{{ cardTitleDisplay }}</span>
        <span
          v-if="workTitleDisplay"
          class="external-resource-meta__chip"
          :title="workTitle"
        >{{ workTitleDisplay }}</span>
        <span
          v-if="identityDisplay"
          class="external-resource-meta__chip"
          :title="`${identityLabel}: ${identityValue}`"
        >{{ identityDisplay }}</span>
        <span
          v-if="isExcerpt && chapterTitleDisplay"
          class="external-resource-meta__chip"
          :title="`章节：${chapterTitle}`"
        >章节：{{ chapterTitleDisplay }}</span>
        <span
          v-if="isExcerpt && excerptLocatorDisplay"
          class="external-resource-meta__chip"
          :title="excerptLocator"
        >{{ excerptLocatorDisplay }}</span>
        <span
          v-if="isExcerpt && excerptNoteDisplay"
          class="external-resource-meta__chip external-resource-meta__chip--note"
          :title="excerptNote"
        >{{ excerptNoteDisplay }}</span>
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

.external-resource-meta__badge,
.external-resource-meta__snapshot {
  border-radius: 999px;
  padding: 1px 8px;
  font-size: 11px;
  flex-shrink: 0;
}

.external-resource-meta__badge {
  color: #075985;
  background: #e0f2fe;
}

.external-resource-meta__snapshot {
  color: #92400e;
  background: #fef3c7;
}

.external-resource-meta__title {
  max-width: min(100%, 360px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
  color: #1f2937;
}

.external-resource-meta__chip {
  max-width: min(100%, 240px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.external-resource-meta__chip--note {
  max-width: min(100%, 280px);
  font-style: italic;
}

.external-resource-meta__link {
  max-width: min(100%, 200px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #1677ff;
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

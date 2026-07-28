<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { HeadingSourceBinding, KnowledgeAnchor, TextAnnotation } from '@/api/types'
import type { FloatingAnchorRect } from '@/composables/useAnchoredFloating'
import { effectiveMarkerSource, externalResourceFromBinding } from '@/utils/headingSource'
import KnowledgeRelationList from './KnowledgeRelationList.vue'
import CommentThreadPanel from './CommentThreadPanel.vue'
import ExternalResourceExcerptMeta from './ExternalResourceExcerptMeta.vue'
import { annotationToAnchor } from '@/utils/knowledgeAnchor'
import type { KnowledgeAnchorNavigateHandlers } from '@/utils/knowledgeAnchor'

const BLOCK_TYPE_LABELS: Record<string, string> = {
  x6Block: 'X6 画板',
  timelineBlock: '时间轴',
  refBlock: '引用',
  spacerBlock: '分割空白',
}

const VIEWPORT_PADDING = 12
const MAX_POPOVER_WIDTH = 360

interface Props {
  visible: boolean
  top: number
  left: number
  anchorRect?: FloatingAnchorRect | null
  zIndex?: number
  annotation: TextAnnotation | null
  annotations?: TextAnnotation[]
  sourceBinding?: HeadingSourceBinding | null
  /** Badge on the shared resource meta panel for sourceBinding (来源 / 依据 / 资源节选). */
  sourceBadgeLabel?: string
  headingTitle?: string
  relationAnchor?: KnowledgeAnchor | null
  kbId?: string
  pageId?: string
  navigate?: KnowledgeAnchorNavigateHandlers
  relationRefreshKey?: number
}

const props = withDefaults(defineProps<Props>(), {
  annotations: () => [],
  anchorRect: null,
  sourceBinding: null,
  sourceBadgeLabel: '来源',
  headingTitle: '',
  relationAnchor: null,
  zIndex: 20,
})

const emit = defineEmits<{
  (e: 'edit', annotation?: TextAnnotation): void
  (e: 'delete', annotation?: TextAnnotation): void
  (e: 'navigate-basis', annotation?: TextAnnotation): void
  (e: 'navigate-source'): void
  (e: 'clear-source'): void
  (e: 'promote-to-user', annotation?: TextAnnotation): void
  (e: 'promote-source-to-user'): void
  (e: 'bind-link-to-region', annotation: TextAnnotation): void
  (e: 'close'): void
}>()

const popoverRef = ref<HTMLElement | null>(null)
const displayTop = ref(0)
const displayLeft = ref(0)
const displayWidth = ref<number | null>(null)

const displayedAnnotations = computed(() => {
  const source = props.annotations.length > 0
    ? props.annotations
    : props.annotation
      ? [props.annotation]
      : []
  return [...source].sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0))
})

const hasSourceBinding = computed(() => !!props.sourceBinding?.resourceItemId)

const hasAnnotations = computed(() => displayedAnnotations.value.length > 0)

const sourceMetaBadge = computed(() => props.sourceBadgeLabel?.trim() || '来源')

const sourceClearLabel = computed(() => {
  if (props.sourceBadgeLabel === '依据') return '解除依据'
  if (props.relationAnchor?.kind === 'heading') return '解除来源'
  return '取消节选标记'
})

const title = computed(() => {
  if (hasSourceBinding.value && !hasAnnotations.value) return '来源'
  if (!hasSourceBinding.value && hasAnnotations.value) {
    if (displayedAnnotations.value.every((item) => item.kind === 'basis')) {
      return displayedAnnotations.value.length > 1
        ? `依据 ${displayedAnnotations.value.length}`
        : '依据'
    }
    if (displayedAnnotations.value.every((item) => item.kind === 'excerpt')) {
      return displayedAnnotations.value.length > 1
        ? `节选 ${displayedAnnotations.value.length}`
        : '节选'
    }
    return displayedAnnotations.value.length > 1
      ? `笔记 ${displayedAnnotations.value.length}`
      : '笔记'
  }
  if (hasSourceBinding.value && hasAnnotations.value) return '元信息'
  return '元信息'
})

const effectiveRelationAnchor = computed(() => {
  if (props.relationAnchor) return props.relationAnchor
  if (!props.pageId || !props.annotation) return null
  return annotationToAnchor(props.pageId, props.annotation)
})

const commentAnnotationId = computed(() => props.annotation?.id || '')
const showCommentPanel = computed(() => Boolean(props.pageId && commentAnnotationId.value))

const relationNavigate = computed(() => props.navigate ?? null)

const popoverStyle = computed(() => {
  const style: Record<string, string> = {}
  if (displayWidth.value != null) {
    style.width = `${displayWidth.value}px`
  }
  return style
})

function clampHorizontal(
  left: number,
  width: number,
  anchor: FloatingAnchorRect | null | undefined,
): number {
  const viewportWidth = window.innerWidth
  let minLeft = VIEWPORT_PADDING
  let maxLeft = viewportWidth - width - VIEWPORT_PADDING
  if (anchor && anchor.width > 0) {
    minLeft = Math.max(minLeft, anchor.left)
    maxLeft = Math.min(maxLeft, anchor.right - width)
  }
  if (minLeft > maxLeft) {
    if (anchor && anchor.width > 0) {
      return Math.max(VIEWPORT_PADDING, Math.min(anchor.left, viewportWidth - width - VIEWPORT_PADDING))
    }
    return Math.max(VIEWPORT_PADDING, Math.min(left, maxLeft))
  }
  return Math.min(Math.max(minLeft, left), maxLeft)
}

const clampToViewport = () => {
  const el = popoverRef.value
  if (!el) return

  const anchor = props.anchorRect
  let width = el.getBoundingClientRect().width
  if (anchor && anchor.width > 0) {
    width = Math.min(MAX_POPOVER_WIDTH, anchor.width, window.innerWidth - VIEWPORT_PADDING * 2)
    displayWidth.value = width
  } else {
    displayWidth.value = Math.min(MAX_POPOVER_WIDTH, window.innerWidth - VIEWPORT_PADDING * 2)
    width = displayWidth.value
  }

  const height = el.getBoundingClientRect().height
  const maxTop = Math.max(VIEWPORT_PADDING, window.innerHeight - height - VIEWPORT_PADDING)

  displayLeft.value = clampHorizontal(props.left, width, anchor)
  displayTop.value = Math.min(Math.max(VIEWPORT_PADDING, props.top), maxTop)
}

watch(
  () => [props.visible, props.top, props.left, props.anchorRect, displayedAnnotations.value.length, hasSourceBinding.value, showCommentPanel.value] as const,
  async ([visible]) => {
    if (!visible) return
    displayTop.value = props.top
    displayLeft.value = props.left
    displayWidth.value = null
    await nextTick()
    clampToViewport()
  },
  { flush: 'post' },
)

watch(
  () => props.visible,
  (visible, _old, onCleanup) => {
    if (!visible) return
    const onReflow = () => clampToViewport()
    window.addEventListener('resize', onReflow)
    window.addEventListener('scroll', onReflow, true)
    onCleanup(() => {
      window.removeEventListener('resize', onReflow)
      window.removeEventListener('scroll', onReflow, true)
    })
  },
)
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible && (hasAnnotations || hasSourceBinding)"
      class="note-popover-mask"
      :style="{ zIndex }"
      @mousedown.self="emit('close')"
    >
      <div
        ref="popoverRef"
        class="note-popover"
        :style="{ top: `${displayTop}px`, left: `${displayLeft}px`, zIndex, ...popoverStyle }"
        @mousedown.stop
      >
        <div class="note-popover__header">
          <span class="note-popover__label">{{ title }}</span>
          <button type="button" class="note-popover__close" @click="emit('close')">关闭</button>
        </div>

        <div class="note-popover__list">
          <section
            v-if="hasSourceBinding && sourceBinding"
            class="note-popover__item note-popover__item--source"
          >
            <ExternalResourceExcerptMeta
              compact
              :badge-label="sourceMetaBadge"
              :external-resource="externalResourceFromBinding(sourceBinding)"
            />
            <div class="note-popover__actions">
              <button type="button" class="note-popover__edit-btn" @click="emit('navigate-source')">
                查看资料
              </button>
              <button
                v-if="effectiveMarkerSource(sourceBinding.markerSource) === 'ai'"
                type="button"
                class="note-popover__edit-btn"
                @click="emit('promote-source-to-user')"
              >
                转为手动标记
              </button>
              <button type="button" class="note-popover__delete-btn" @click="emit('clear-source')">
                {{ sourceClearLabel }}
              </button>
            </div>
          </section>

          <article
            v-for="item in displayedAnnotations"
            :key="item.id"
            class="note-popover__item"
            :class="{
              'note-popover__item--basis': item.kind === 'basis',
              'note-popover__item--excerpt': item.kind === 'excerpt',
            }"
          >
            <div v-if="item.scope !== 'block'" class="note-popover__quote">
              "{{ item.selectedText }}"
            </div>

            <div v-if="item.scope === 'compound' && item.spannedBlockMetadata?.length" class="note-popover__blocks">
              <div class="note-popover__blocks-label">涉及块：</div>
              <div
                v-for="meta in item.spannedBlockMetadata"
                :key="meta.blockId"
                class="note-popover__block-tag"
              >
                {{ BLOCK_TYPE_LABELS[meta.blockType] || meta.blockType }}
                <template v-if="meta.title"> — {{ meta.title }}</template>
              </div>
            </div>

            <div v-if="(item.kind === 'basis' || item.kind === 'excerpt') && item.basisBinding" class="note-popover__basis">
              <ExternalResourceExcerptMeta
                compact
                :badge-label="item.kind === 'excerpt' ? '资源节选' : '依据'"
                :external-resource="externalResourceFromBinding(item.basisBinding)"
              />
            </div>

            <div v-if="item.kind !== 'basis' && item.kind !== 'excerpt'" class="note-popover__body">
              {{ item.note }}
            </div>

            <div class="note-popover__actions">
              <button
                v-if="(item.kind === 'basis' || item.kind === 'excerpt') && item.basisBinding"
                type="button"
                class="note-popover__edit-btn"
                @click="emit('navigate-basis', item)"
              >
                查看资料
              </button>
              <button
                v-else
                type="button"
                class="note-popover__edit-btn"
                @click="emit('edit', item)"
              >
                编辑
              </button>
              <button
                v-if="item.scope === 'pdfRegion' && item.pdfRegion"
                type="button"
                class="note-popover__edit-btn"
                title="将 PDF 链接从整本资源改为该划选节选（page+clip）"
                @click="emit('bind-link-to-region', item)"
              >
                链接改为当前节选
              </button>
              <button
                v-if="item.markerSource === 'ai'"
                type="button"
                class="note-popover__edit-btn"
                @click="emit('promote-to-user', item)"
              >
                转为手动标记
              </button>
              <button type="button" class="note-popover__delete-btn" @click="emit('delete', item)">
                {{ item.kind === 'basis' ? '解除依据' : item.kind === 'excerpt' ? '取消节选标记' : '删除' }}
              </button>
            </div>
          </article>
        </div>

        <KnowledgeRelationList
          v-if="kbId && effectiveRelationAnchor && relationNavigate"
          :key="relationRefreshKey"
          :kb-id="kbId"
          :anchor="effectiveRelationAnchor"
          :navigate="relationNavigate"
          :after-navigate="() => emit('close')"
        />

        <CommentThreadPanel
          v-if="showCommentPanel && pageId"
          compact
          :page-id="pageId"
          :annotation-id="commentAnnotationId"
        />
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.note-popover-mask {
  position: fixed;
  inset: 0;
}

.note-popover {
  position: fixed;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: min(360px, calc(100vw - 24px));
  max-height: min(420px, calc(100vh - 24px));
  overflow: hidden;
  border: 1px solid var(--el-border-color-light);
  border-radius: 10px;
  background: var(--el-bg-color);
  box-shadow: var(--el-box-shadow-light);
}

.note-popover__header {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.note-popover :deep(.comment-thread) {
  flex-shrink: 0;
}

.note-popover__label {
  font-size: 13px;
  font-weight: 600;
}

.note-popover__close {
  border: none;
  background: transparent;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  font-size: 12px;
}

.note-popover__list {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  padding: 10px 12px 12px;
  overflow-y: auto;
}

.note-popover__item {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 10px;
}

.note-popover__item--basis,
.note-popover__item--source {
  border-color: rgba(76, 175, 80, 0.35);
  background: rgba(165, 214, 167, 0.12);
}

.note-popover__item--excerpt {
  border-color: rgba(3, 105, 161, 0.28);
  background: rgba(179, 229, 252, 0.2);
}

.note-popover__basis-link--excerpt {
  color: #0369a1;
}

.note-popover__quote {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 8px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.note-popover__source-info {
  margin-bottom: 8px;
}

.note-popover__source-info-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.note-popover__source-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 8px 0 0;
}

.note-popover__source-meta-row {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr);
  gap: 8px;
  align-items: start;
  font-size: 12px;
  line-height: 1.4;
}

.note-popover__source-meta-row dt {
  margin: 0;
  color: var(--el-text-color-secondary);
  flex-shrink: 0;
}

.note-popover__source-meta-row dd {
  margin: 0;
  color: var(--el-text-color-primary);
  overflow-wrap: anywhere;
}

.note-popover__blocks {
  margin-bottom: 8px;
}

.note-popover__blocks-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 4px;
}

.note-popover__block-tag {
  display: inline-block;
  margin: 0 6px 4px 0;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--el-fill-color-light);
  font-size: 12px;
}

.note-popover__basis {
  margin-bottom: 8px;
}

.note-popover__basis-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 4px;
}

.note-popover__basis-link {
  border: none;
  background: transparent;
  color: var(--el-color-success);
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  padding: 0;
  text-align: left;
  overflow-wrap: anywhere;
}

.note-popover__body {
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  margin-bottom: 8px;
}

.note-popover__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.note-popover__edit-btn,
.note-popover__delete-btn {
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  background: var(--el-bg-color);
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
}

.note-popover__delete-btn {
  color: var(--el-color-danger);
  border-color: var(--el-color-danger-light-5);
}
</style>

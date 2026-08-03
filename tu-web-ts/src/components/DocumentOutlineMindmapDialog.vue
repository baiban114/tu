<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { ElMessage, ElScrollbar } from 'element-plus'
import X6Component from '@/components/X6Component.vue'
import type { GraphData, PageItem } from '@/api/types'
import type { TocTreeItem } from '@/utils/toc/headings'
import { buildMindmapGraphFromPageSubtree } from '@/utils/toc/mindmapFromPageSubtree'
import { outlineNodesToTocTree } from '@/utils/toc/outlineNodesToTocTree'
import { parseLocator } from '@/utils/knowledgeAnchor'
import { getResourceExcerpt } from '@/api/externalResource'
import { useOutlineCacheStore } from '@/stores/outlineCache'

export interface OutlineMindmapSourceContentRequest {
  locator: string
  label: string
  tocEntryId?: string
}

const props = defineProps<{
  modelValue: boolean
  pageId: string
  pageTitle: string
  tocItems: TocTreeItem[]
  /** Direct child pages of the current page (nested via `.children`). */
  childPages?: PageItem[]
  /** Resolve page/heading section plain text for content preview. */
  resolvePageSectionText?: (request: OutlineMindmapSourceContentRequest) => string | null | Promise<string | null>
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'navigate-source': [payload: OutlineMindmapSourceContentRequest]
}>()

const outlineCacheStore = useOutlineCacheStore()
const canvasHostRef = ref<HTMLElement | null>(null)
const canvasWidth = ref(0)
const canvasHeight = ref(0)
const x6Ref = ref<InstanceType<typeof X6Component> | null>(null)
let resizeObserver: ResizeObserver | null = null

const outlinesReady = ref(false)
const outlinesLoading = ref(false)
const outlineRevision = ref(0)

const contentPreviewVisible = ref(false)
const contentPreviewTitle = ref('')
const contentPreviewLocator = ref('')
const contentPreviewBody = ref('')
const contentPreviewLoading = ref(false)

const childPages = computed(() => props.childPages ?? [])

function collectDescendantPageIds(pages: PageItem[]): string[] {
  const ids: string[] = []
  const walk = (list: PageItem[]) => {
    for (const page of list) {
      const id = page.id?.trim()
      if (id) ids.push(id)
      if (page.children?.length) walk(page.children)
    }
  }
  walk(pages)
  return ids
}

const graphData = computed<GraphData>(() => {
  // Depend on outlineRevision so graph rebuilds after batch load.
  void outlineRevision.value
  return buildMindmapGraphFromPageSubtree({
    rootPageId: props.pageId,
    rootTitle: props.pageTitle,
    rootToc: props.tocItems,
    childPages: childPages.value,
    getPageOutlineToc: (pageId) => {
      const nodes = outlineCacheStore.getPageNodes(pageId)
      if (!nodes) return []
      return outlineNodesToTocTree(pageId, nodes)
    },
  })
})

const hasContent = computed(() => (
  props.tocItems.length > 0 || childPages.value.length > 0
))
const canvasReady = computed(() => (
  canvasWidth.value > 0 && canvasHeight.value > 0 && outlinesReady.value
))

function close() {
  emit('update:modelValue', false)
}

function measureCanvas() {
  const el = canvasHostRef.value
  if (!el) return
  const width = Math.max(0, Math.floor(el.clientWidth))
  const height = Math.max(0, Math.floor(el.clientHeight))
  if (width === canvasWidth.value && height === canvasHeight.value) return
  canvasWidth.value = width
  canvasHeight.value = height
}

function bindResizeObserver() {
  unbindResizeObserver()
  const el = canvasHostRef.value
  if (!el || typeof ResizeObserver === 'undefined') return
  resizeObserver = new ResizeObserver(() => {
    measureCanvas()
  })
  resizeObserver.observe(el)
}

function unbindResizeObserver() {
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
}

function onNavigateSource(payload: OutlineMindmapSourceContentRequest) {
  emit('navigate-source', payload)
}

async function resolveContentBody(payload: OutlineMindmapSourceContentRequest): Promise<string> {
  const parsed = parseLocator(payload.locator)

  if (parsed.kind === 'resourceExcerpt' && parsed.excerptId) {
    try {
      const excerpt = await getResourceExcerpt(parsed.excerptId)
      const title = excerpt.title?.trim()
      const text = excerpt.excerptText?.trim() || ''
      if (title && text) return `${title}\n\n${text}`
      return text || title || '（该资源节选暂无正文）'
    } catch (error) {
      const message = error instanceof Error ? error.message : '加载资源节选失败'
      throw new Error(message)
    }
  }

  if (parsed.kind === 'resourceItem' || parsed.kind === 'resourceChapter') {
    return '资源实体/章节本身没有正文预览；请使用「跳转」在资源管理中查看。'
  }

  if (props.resolvePageSectionText) {
    const text = await props.resolvePageSectionText(payload)
    if (text != null && text.trim()) return text.trim()
  }

  if (parsed.kind === 'page') {
    if (parsed.pageId && parsed.pageId !== props.pageId) {
      return '（子文档节点；请跳转到来源打开该页）'
    }
    return '（页面根节点；请跳转到来源查看整页内容）'
  }

  if (parsed.kind === 'heading' && parsed.pageId && parsed.pageId !== props.pageId) {
    return '（其他文档标题；请跳转到来源查看该节内容）'
  }

  return '（暂无可用正文预览）'
}

async function onPreviewSource(payload: OutlineMindmapSourceContentRequest) {
  contentPreviewTitle.value = payload.label || '来源内容'
  contentPreviewLocator.value = payload.locator
  contentPreviewBody.value = ''
  contentPreviewVisible.value = true
  contentPreviewLoading.value = true
  try {
    contentPreviewBody.value = await resolveContentBody(payload)
  } catch (error) {
    const message = error instanceof Error ? error.message : '加载内容失败'
    contentPreviewBody.value = ''
    ElMessage.error(message)
  } finally {
    contentPreviewLoading.value = false
  }
}

async function loadDescendantOutlines() {
  const pageIds = collectDescendantPageIds(childPages.value)
  outlinesLoading.value = true
  try {
    if (pageIds.length) {
      await outlineCacheStore.prefetchBatch(pageIds, [])
    }
    outlineRevision.value += 1
    outlinesReady.value = true
  } catch (error) {
    outlinesReady.value = true
    const message = error instanceof Error ? error.message : '加载子文档目录失败'
    ElMessage.warning(message)
  } finally {
    outlinesLoading.value = false
  }
}

function fitCanvas() {
  requestAnimationFrame(() => {
    x6Ref.value?.fitGraph?.({ padding: 28, maxScale: 1.8 })
  })
}

watch(
  () => props.modelValue,
  async (visible) => {
    if (!visible) {
      unbindResizeObserver()
      canvasWidth.value = 0
      canvasHeight.value = 0
      contentPreviewVisible.value = false
      outlinesReady.value = false
      return
    }
    outlinesReady.value = false
    await loadDescendantOutlines()
    await nextTick()
    measureCanvas()
    bindResizeObserver()
    await nextTick()
    fitCanvas()
  },
)

watch([canvasWidth, canvasHeight, outlinesReady], async () => {
  if (!props.modelValue || !canvasReady.value) return
  await nextTick()
  fitCanvas()
})

onBeforeUnmount(() => {
  unbindResizeObserver()
})
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    class="tu-dialog-viewport document-outline-mindmap-dialog"
    title="目录思维导图"
    width="min(1280px, 96vw)"
    align-center
    destroy-on-close
    @update:model-value="emit('update:modelValue', $event)"
    @closed="close"
  >
    <div class="document-outline-mindmap-dialog__body">
      <p class="document-outline-mindmap-dialog__hint">
        包含当前文档目录与子文档树（根为页面标题）。子文档默认收起其目录标题，但展开更下级子文档；点击节点可在属性侧栏查看定位、跳转或打开内容窗口。按住空格拖动画布，Ctrl/⌘ + 滚轮缩放。
      </p>
      <div
        v-if="outlinesLoading"
        class="document-outline-mindmap-dialog__empty"
      >
        正在加载子文档目录…
      </div>
      <div
        v-else-if="!hasContent"
        class="document-outline-mindmap-dialog__empty"
      >
        当前文档暂无目录标题与子文档，仅显示页面根节点。
      </div>
      <div
        ref="canvasHostRef"
        class="document-outline-mindmap-dialog__canvas"
      >
        <X6Component
          v-if="canvasReady"
          ref="x6Ref"
          :key="`${pageId}-${pageTitle}-${tocItems.length}-${childPages.length}-${outlineRevision}`"
          :graph-data="graphData"
          :editable="false"
          :block-actions-enabled="false"
          :toolbar-enabled="false"
          :inspector-enabled="true"
          :inspector-default-visible="false"
          :open-inspector-on-node-select="true"
          layout-mode="fill"
          :width="canvasWidth"
          :height="canvasHeight"
          @navigate-source-locator="onNavigateSource"
          @preview-source-content="onPreviewSource"
        />
      </div>
    </div>

    <el-dialog
      v-model="contentPreviewVisible"
      class="tu-dialog-viewport document-outline-mindmap-content-dialog"
      :title="contentPreviewTitle"
      width="min(640px, 92vw)"
      append-to-body
      align-center
      destroy-on-close
    >
      <div class="document-outline-mindmap-content-dialog__body">
        <p
          v-if="contentPreviewLocator"
          class="document-outline-mindmap-content-dialog__locator"
          :title="contentPreviewLocator"
        >
          {{ contentPreviewLocator }}
        </p>
        <div class="document-outline-mindmap-content-dialog__pane">
          <ElScrollbar class="document-outline-mindmap-content-dialog__scroll">
            <p
              v-if="contentPreviewLoading"
              class="document-outline-mindmap-content-dialog__placeholder"
            >
              加载中…
            </p>
            <pre
              v-else
              class="document-outline-mindmap-content-dialog__text"
            >{{ contentPreviewBody || '（暂无内容）' }}</pre>
          </ElScrollbar>
        </div>
        <div class="document-outline-mindmap-content-dialog__actions">
          <button
            type="button"
            class="document-outline-mindmap-content-dialog__jump"
            :disabled="!contentPreviewLocator"
            @click="onNavigateSource({ locator: contentPreviewLocator, label: contentPreviewTitle })"
          >
            跳转到来源
          </button>
        </div>
      </div>
    </el-dialog>
  </el-dialog>
</template>

<style scoped>
.document-outline-mindmap-dialog :deep(.el-dialog__body) {
  padding: 8px 12px 12px;
  display: flex;
  flex-direction: column;
  /* Nearly full viewport below the title bar; wider aspect for the mindmap. */
  height: min(86dvh, calc(100dvh - 56px));
  max-height: min(86dvh, calc(100dvh - 56px));
  box-sizing: border-box;
}

.document-outline-mindmap-dialog__body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  height: 100%;
  gap: 6px;
  box-sizing: border-box;
}

.document-outline-mindmap-dialog__hint,
.document-outline-mindmap-dialog__empty {
  flex-shrink: 0;
  margin: 0;
  font-size: 12px;
  color: #64748b;
  line-height: 1.4;
}

.document-outline-mindmap-dialog__canvas {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  overflow: hidden;
  background: #f8fafc;
}

.document-outline-mindmap-dialog__canvas :deep(.x6-editor) {
  width: 100%;
  height: 100%;
}

.document-outline-mindmap-content-dialog :deep(.el-dialog__body) {
  padding: 10px 12px 12px;
  display: flex;
  flex-direction: column;
  height: min(56dvh, 420px);
  max-height: min(56dvh, 420px);
  box-sizing: border-box;
}

.document-outline-mindmap-content-dialog__body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  height: 100%;
  gap: 8px;
}

.document-outline-mindmap-content-dialog__locator {
  flex-shrink: 0;
  margin: 0;
  padding: 6px 8px;
  border-radius: 6px;
  background: #f1f5f9;
  color: #475569;
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.document-outline-mindmap-content-dialog__pane {
  flex: 1;
  min-height: 0;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  overflow: hidden;
  background: #fff;
}

.document-outline-mindmap-content-dialog__scroll {
  height: 100%;
}

.document-outline-mindmap-content-dialog__placeholder,
.document-outline-mindmap-content-dialog__text {
  margin: 0;
  padding: 12px;
  font-size: 13px;
  line-height: 1.55;
  color: #334155;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
}

.document-outline-mindmap-content-dialog__actions {
  flex-shrink: 0;
  display: flex;
  justify-content: flex-end;
}

.document-outline-mindmap-content-dialog__jump {
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #334155;
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 13px;
  cursor: pointer;
}

.document-outline-mindmap-content-dialog__jump:hover:not(:disabled) {
  border-color: #94a3b8;
  background: #f8fafc;
}

.document-outline-mindmap-content-dialog__jump:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>

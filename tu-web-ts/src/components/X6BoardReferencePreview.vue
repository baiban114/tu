<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { GraphData, PageContent } from '@/api/types'
import { getPageContent } from '@/api/page'
import { useWorkspaceStore } from '@/stores/workspace'

const X6Component = defineAsyncComponent(() => import('./X6Component.vue'))

const props = defineProps<{
  pageId: string
  hostPageId?: string
  title: string
  editable: boolean
}>()

const emit = defineEmits<{
  'select-wrapper': []
}>()

const workspaceStore = useWorkspaceStore()

const canvasRef = ref<HTMLElement | null>(null)
const content = ref<PageContent | null>(null)
const graphData = ref<GraphData | null>(null)
const embedId = ref('')
const loading = ref(false)
const error = ref('')
const width = ref(320)
const height = ref(200)

let resizeObserver: ResizeObserver | null = null
let pendingGraphData: GraphData | null = null

const canRender = computed(() => (
  !loading.value && !error.value && graphData.value && width.value > 0 && height.value > 0
))

function updateSize() {
  const element = canvasRef.value
  if (!element) return
  width.value = Math.max(1, element.clientWidth)
  height.value = Math.max(1, element.clientHeight)
}

async function loadReferencedBoard() {
  if (!props.pageId) return
  if (props.hostPageId && props.hostPageId === props.pageId) {
    error.value = '不能在画板内展开其自身引用'
    graphData.value = null
    return
  }
  loading.value = true
  error.value = ''
  try {
    const pageContent = await getPageContent(props.pageId)
    const primaryId = typeof pageContent.metadata?.primaryEmbedId === 'string'
      ? pageContent.metadata.primaryEmbedId
      : ''
    const embed = pageContent.embeds.find((item) => item.id === primaryId && item.type === 'x6')
      ?? pageContent.embeds.find((item) => item.type === 'x6')
    if (!embed?.graphData) throw new Error('引用页面中没有可显示的画板')
    content.value = pageContent
    embedId.value = embed.id
    graphData.value = embed.graphData
    await nextTick()
    updateSize()
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '引用画板加载失败'
    graphData.value = null
  } finally {
    loading.value = false
  }
}

async function flushSave() {
  const nextGraphData = pendingGraphData
  const pageContent = content.value
  const targetEmbedId = embedId.value
  pendingGraphData = null
  if (!nextGraphData || !pageContent || !targetEmbedId) return
  const nextContent: PageContent = {
    ...pageContent,
    embeds: pageContent.embeds.map((embed) => (
      embed.id === targetEmbedId ? { ...embed, graphData: nextGraphData } : embed
    )),
  }
  content.value = nextContent
  await workspaceStore.savePage(props.pageId, nextContent)
}

function onGraphDataChange(next: GraphData) {
  graphData.value = next
  pendingGraphData = next
  void flushSave()
}

watch(() => props.pageId, () => {
  void loadReferencedBoard()
})

onMounted(() => {
  updateSize()
  if (canvasRef.value) {
    resizeObserver = new ResizeObserver(() => updateSize())
    resizeObserver.observe(canvasRef.value)
  }
  void loadReferencedBoard()
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  void flushSave()
})
</script>

<template>
  <div class="x6-board-reference-preview" @mousedown.stop @click.stop @dblclick.stop>
    <button
      type="button"
      class="x6-board-reference-preview__header"
      title="选择画板引用父元素"
      @mousedown.stop
      @click.stop="emit('select-wrapper')"
    >
      <span class="x6-board-reference-preview__badge">引用画板</span>
      <span class="x6-board-reference-preview__title">{{ title }}</span>
    </button>
    <div ref="canvasRef" class="x6-board-reference-preview__canvas">
      <div v-if="loading" class="x6-board-reference-preview__state">正在加载画板…</div>
      <div v-else-if="error" class="x6-board-reference-preview__state x6-board-reference-preview__state--error">
        {{ error }}
      </div>
      <X6Component
        v-else-if="canRender && graphData"
        :page-id="pageId"
        :graph-data="graphData"
        :width="width"
        :height="height"
        layout-mode="fill"
        :editable="editable"
        :toolbar-enabled="false"
        :inspector-enabled="false"
        :block-actions-enabled="false"
        :reference-preview-enabled="false"
        :auto-fit-on-resize="true"
        @graph-data-change="onGraphDataChange"
      />
      <div v-else class="x6-board-reference-preview__state">引用画板暂无内容</div>
    </div>
  </div>
</template>

<style scoped>
.x6-board-reference-preview {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 2px solid #7c3aed;
  border-radius: 12px;
  box-sizing: border-box;
  background: #fff;
  pointer-events: auto;
}

.x6-board-reference-preview__header {
  height: 28px;
  flex: 0 0 28px;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 9px;
  border: 0;
  border-bottom: 1px solid #ddd6fe;
  background: #f5f3ff;
  color: #5b21b6;
  cursor: pointer;
  text-align: left;
}

.x6-board-reference-preview__badge {
  flex: 0 0 auto;
  padding: 1px 5px;
  border-radius: 999px;
  background: #7c3aed;
  color: #fff;
  font-size: 10px;
  line-height: 16px;
}

.x6-board-reference-preview__title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 600;
}

.x6-board-reference-preview__canvas {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.x6-board-reference-preview__canvas :deep(.x6-editor) {
  width: 100%;
  height: 100%;
  min-height: 0;
  border: 0;
}

.x6-board-reference-preview__state {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  box-sizing: border-box;
  color: #6b7280;
  font-size: 12px;
  text-align: center;
}

.x6-board-reference-preview__state--error {
  color: #b91c1c;
}
</style>

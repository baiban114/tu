<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { FullScreen, Monitor } from '@element-plus/icons-vue'
import X6BoardBlock from '@/components/X6BoardBlock.vue'
import PageTagsBar from '@/components/PageTagsBar.vue'
import BlockMetadataTagEditor from '@/components/BlockMetadataTagEditor.vue'
import type { BlockTag, GraphData, PageContent, PageType } from '@/api/types'
import { resolvePrimaryEmbed } from '@/utils/boardPageContent'
import { getPageTags, setPageTags } from '@/utils/pageMetadata'
import { collectAvailableTags, fetchKbTagPool } from '@/utils/tagPool'
import { useWorkspaceStore } from '@/stores/workspace'
import { containsSelfBoardReference } from '@/components/x6'

const props = defineProps<{
  pageId: string
  pageType: Extract<PageType, 'mindmap' | 'x6board'>
  content: PageContent
  pageTitle: string
}>()

const emit = defineEmits<{
  'content-change': [pageId: string, content: PageContent]
  'page-title-change': [title: string]
}>()

const workspaceStore = useWorkspaceStore()
const canvasPageRef = ref<HTMLElement | null>(null)
const isFullscreen = ref(false)
const isWebFullscreen = ref(false)
const primaryEmbed = computed(() => resolvePrimaryEmbed(props.content, props.pageType))
const graphData = computed(() => primaryEmbed.value?.graphData)
const pageTags = computed(() => getPageTags(props.content))

const tagEditorVisible = ref(false)
const tagEditorTags = ref<BlockTag[]>([])
const tagEditorTop = ref(0)
const tagEditorLeft = ref(0)
const kbTagPool = ref<BlockTag[]>([])

const availableTags = computed(() => collectAvailableTags([], pageTags.value, [kbTagPool.value]))

let saveTimer: number | null = null
let pendingSaveContent: PageContent | null = null
let pendingSavePageId: string | null = null
const SAVE_DELAY = 500

function scheduleSave(next: PageContent) {
  pendingSaveContent = next
  pendingSavePageId = props.pageId
  if (saveTimer !== null) window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    saveTimer = null
    const content = pendingSaveContent
    const pageId = pendingSavePageId
    pendingSaveContent = null
    pendingSavePageId = null
    if (content && pageId) emit('content-change', pageId, content)
  }, SAVE_DELAY)
}

async function refreshKbTagPool() {
  kbTagPool.value = await fetchKbTagPool(workspaceStore.currentKbId)
}

watch(
  () => workspaceStore.currentKbId,
  () => {
    void refreshKbTagPool()
  },
  { immediate: true },
)

function onGraphDataChange(data: GraphData) {
  if (containsSelfBoardReference(data, props.pageId)) return
  const embed = primaryEmbed.value
  if (!embed) return
  const nextEmbeds = props.content.embeds.map((item) => (
    item.id === embed.id ? { ...item, graphData: data } : item
  ))
  scheduleSave({ ...props.content, embeds: nextEmbeds })
}

function onPageTitleChange(title: string) {
  emit('page-title-change', title)
}

function openPageTagEditor() {
  tagEditorTags.value = [...pageTags.value]
  tagEditorTop.value = Math.max(24, window.innerHeight / 2 - 160)
  tagEditorLeft.value = Math.max(24, window.innerWidth / 2 - 160)
  tagEditorVisible.value = true
}

function closeTagEditor() {
  tagEditorVisible.value = false
}

function updatePageTags(tags: BlockTag[]) {
  tagEditorTags.value = tags
  scheduleSave(setPageTags(props.content, tags))
  void refreshKbTagPool()
}

function removePageTag(tag: BlockTag) {
  updatePageTags(pageTags.value.filter((item) => item.id !== tag.id))
}

async function toggleFullscreen() {
  const element = canvasPageRef.value
  if (!element) return
  try {
    if (document.fullscreenElement === element) {
      await document.exitFullscreen()
    } else {
      await element.requestFullscreen()
    }
  } catch {
    // The browser may reject fullscreen when the user gesture is interrupted.
  }
}

function toggleWebFullscreen() {
  isWebFullscreen.value = !isWebFullscreen.value
}

function handleFullscreenChange() {
  isFullscreen.value = document.fullscreenElement === canvasPageRef.value
}

function handlePageFullscreenExit() {
  if (isWebFullscreen.value) {
    isWebFullscreen.value = false
    return
  }
  if (document.fullscreenElement) void document.exitFullscreen()
}

function handleFullscreenKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && isWebFullscreen.value) {
    isWebFullscreen.value = false
  }
}

onMounted(() => {
  document.addEventListener('fullscreenchange', handleFullscreenChange)
  document.addEventListener('keydown', handleFullscreenKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('fullscreenchange', handleFullscreenChange)
  document.removeEventListener('keydown', handleFullscreenKeydown)
  if (saveTimer !== null) window.clearTimeout(saveTimer)
  if (pendingSaveContent && pendingSavePageId) {
    emit('content-change', pendingSavePageId, pendingSaveContent)
    pendingSaveContent = null
    pendingSavePageId = null
  }
})
</script>

<template>
  <div
    ref="canvasPageRef"
    class="canvas-page"
    :class="{ 'canvas-page--web-fullscreen': isWebFullscreen }"
  >
    <section class="canvas-page__topbar">
      <PageTagsBar
        class="canvas-page__tags"
        :tags="pageTags"
        editable
        chip-click-mode="edit"
        @edit="openPageTagEditor"
        @remove="removePageTag"
      />
      <button
        type="button"
        class="canvas-page__fullscreen-button"
        :title="isFullscreen ? '退出全屏' : '全屏画板页面'"
        :aria-label="isFullscreen ? '退出全屏' : '全屏画板页面'"
        @click="toggleFullscreen"
      >
        <FullScreen aria-hidden="true" />
      </button>
      <button
        type="button"
        class="canvas-page__fullscreen-button"
        :title="isWebFullscreen ? '退出网页全屏' : '网页全屏'"
        :aria-label="isWebFullscreen ? '退出网页全屏' : '网页全屏'"
        @click="toggleWebFullscreen"
      >
        <Monitor aria-hidden="true" />
      </button>
    </section>
    <X6BoardBlock
      v-if="primaryEmbed && graphData"
      :key="`${pageId}:${primaryEmbed.id}`"
      class="canvas-page__board"
      mode="page"
      :page-fullscreen="isFullscreen || isWebFullscreen"
      :page-fullscreen-exit-label="isWebFullscreen ? '退出网页全屏' : ''"
      :page-id="pageId"
      :graph-data="graphData"
      :page-title="pageTitle"
      @graph-data-change="onGraphDataChange"
      @page-title-change="onPageTitleChange"
      @request-exit-page-fullscreen="handlePageFullscreenExit"
    />

    <BlockMetadataTagEditor
      :visible="tagEditorVisible"
      title="编辑页面标签"
      :selected-tags="tagEditorTags"
      :available-tags="availableTags"
      :top="tagEditorTop"
      :left="tagEditorLeft"
      @close="closeTagEditor"
      @update:selected-tags="updatePageTags"
    />
  </div>
</template>

<style scoped>
.canvas-page {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #fff;
}

.canvas-page:fullscreen {
  width: 100vw;
  height: 100vh;
}

.canvas-page--web-fullscreen {
  position: fixed;
  inset: 0;
  z-index: 3000;
  width: 100vw;
  height: 100vh;
}

.canvas-page:fullscreen .canvas-page__topbar,
.canvas-page--web-fullscreen .canvas-page__topbar {
  display: none;
}

.canvas-page:fullscreen :deep(.board-canvas-shell__header),
.canvas-page--web-fullscreen :deep(.board-canvas-shell__header) {
  display: none;
}

.canvas-page__topbar {
  flex-shrink: 0;
  min-height: 44px;
  padding: 8px 16px 0 24px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.canvas-page__tags {
  flex: 1;
  min-width: 0;
}

.canvas-page__fullscreen-button {
  width: 32px;
  height: 32px;
  flex: 0 0 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid #d8dee8;
  border-radius: 6px;
  color: #44515f;
  background: #fff;
  cursor: pointer;
}

.canvas-page__fullscreen-button:hover {
  color: #2563eb;
  border-color: #93b4ed;
  background: #f4f7fb;
}

.canvas-page__fullscreen-button:focus-visible {
  outline: 2px solid #2563eb;
  outline-offset: 2px;
}

.canvas-page__fullscreen-button svg {
  width: 18px;
  height: 18px;
}

.canvas-page__board {
  flex: 1;
  min-height: 0;
}
</style>

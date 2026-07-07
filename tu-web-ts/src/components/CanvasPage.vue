<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import X6BoardBlock from '@/components/X6BoardBlock.vue'
import PageTagsBar from '@/components/PageTagsBar.vue'
import BlockMetadataTagEditor from '@/components/BlockMetadataTagEditor.vue'
import type { BlockTag, GraphData, PageContent, PageType } from '@/api/types'
import { resolvePrimaryEmbed } from '@/utils/boardPageContent'
import { getPageTags, setPageTags } from '@/utils/pageMetadata'
import { collectAvailableTags, fetchKbTagPool } from '@/utils/tagPool'
import { useWorkspaceStore } from '@/stores/workspace'

const props = defineProps<{
  pageType: Extract<PageType, 'mindmap' | 'x6board'>
  content: PageContent
  pageTitle: string
}>()

const emit = defineEmits<{
  'content-change': [content: PageContent]
  'page-title-change': [title: string]
}>()

const workspaceStore = useWorkspaceStore()
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
const SAVE_DELAY = 500

function scheduleSave(next: PageContent) {
  if (saveTimer !== null) window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    saveTimer = null
    emit('content-change', next)
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

onBeforeUnmount(() => {
  if (saveTimer !== null) window.clearTimeout(saveTimer)
})
</script>

<template>
  <div class="canvas-page">
    <section class="canvas-page__tags">
      <PageTagsBar
        :tags="pageTags"
        editable
        @edit="openPageTagEditor"
      />
    </section>
    <X6BoardBlock
      v-if="primaryEmbed && graphData"
      class="canvas-page__board"
      mode="page"
      :graph-data="graphData"
      :page-title="pageTitle"
      @graph-data-change="onGraphDataChange"
      @page-title-change="onPageTitleChange"
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
}

.canvas-page__tags {
  flex-shrink: 0;
  padding: 12px 24px 0;
}

.canvas-page__board {
  flex: 1;
  min-height: 0;
}
</style>

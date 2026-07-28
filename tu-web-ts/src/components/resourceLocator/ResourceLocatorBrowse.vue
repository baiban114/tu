<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElEmpty, ElPagination, ElScrollbar } from 'element-plus'
import type { ResourceChapter, ResourceExcerpt, ResourceItem } from '@/api/externalResource'
import { DEFAULT_PAGE_SIZE } from '@/constants/pagination'
import { clampPage, paginateSlice } from '@/utils/clientPagination'
import ResourceLocatorChapterBranch from './ResourceLocatorChapterBranch.vue'
import ResourceLocatorExcerptBranch from './ResourceLocatorExcerptBranch.vue'

const EXCERPT_CHILD_LIMIT = 100

const props = withDefaults(defineProps<{
  items: ResourceItem[]
  excerptIndex: Record<string, ResourceExcerpt[]>
  chapterIndex: Record<string, ResourceChapter[]>
  selectedItemId: string
  selectedExcerptId: string
  selectedChapterId?: string
  keyword?: string
  loading?: boolean
  /** Returns true when the item can have marked excerpts (expandable). */
  itemSupportsExcerpts: (item: ResourceItem) => boolean
  /** Returns true when the item is a book with a chapter tree. */
  itemSupportsChapters: (item: ResourceItem) => boolean
  emptyDescription?: string
  showPagination?: boolean
}>(), {
  selectedChapterId: '',
  keyword: '',
  loading: false,
  emptyDescription: '没有找到外部资源',
  showPagination: true,
})

const emit = defineEmits<{
  'update:selectedItemId': [itemId: string]
  'select-item': [item: ResourceItem]
  'select-excerpt': [item: ResourceItem, excerpt: ResourceExcerpt]
  'select-chapter': [item: ResourceItem, chapter: ResourceChapter]
  'ensure-excerpts': [itemId: string]
  'ensure-chapters': [itemId: string]
}>()

const listPage = ref(0)
const expandedNodeIds = ref<Set<string>>(new Set())

const listTotal = computed(() => props.items.length)

const pagedItems = computed(() => {
  if (!props.showPagination) return props.items
  const page = clampPage(listPage.value, props.items.length, DEFAULT_PAGE_SIZE)
  return paginateSlice(props.items, page, DEFAULT_PAGE_SIZE).items
})

watch(
  () => [props.keyword, props.items.length] as const,
  () => {
    listPage.value = 0
  },
)

function itemNodeKey(itemId: string) {
  return `item:${itemId}`
}

function isNodeExpanded(key: string) {
  return expandedNodeIds.value.has(key)
}

function setNodeExpanded(key: string, expanded: boolean) {
  const next = new Set(expandedNodeIds.value)
  if (expanded) next.add(key)
  else next.delete(key)
  expandedNodeIds.value = next
}

function listExcerptsForItem(itemId: string): ResourceExcerpt[] {
  return props.excerptIndex[itemId] ?? []
}

function listChaptersForItem(itemId: string): ResourceChapter[] {
  return props.chapterIndex[itemId] ?? []
}

function itemCanExpand(item: ResourceItem) {
  return props.itemSupportsExcerpts(item) || props.itemSupportsChapters(item)
}

function excerptMatchesKeyword(excerpt: ResourceExcerpt, keywordText: string): boolean {
  const plainExcerpt = (excerpt.excerptText ?? '').replace(/[#*`>\-_\[\]]/g, ' ').trim()
  const haystack = [
    excerpt.title,
    excerpt.chapterTitle,
    excerpt.locator,
    plainExcerpt,
    excerpt.note,
  ].filter(Boolean).join(' ').toLowerCase()
  return haystack.includes(keywordText)
}

function getRootExcerpts(itemId: string, chapterScope: string | null | undefined) {
  const q = props.keyword.trim().toLowerCase()
  let list = listExcerptsForItem(itemId).filter((excerpt) => {
    if ((excerpt.parentId ?? null) !== null) return false
    if (chapterScope === undefined) return true
    const chapterId = excerpt.chapterId ?? null
    if (chapterScope === null) return chapterId == null
    return chapterId === chapterScope
  })
  list = list.sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title) || a.id.localeCompare(b.id))
  if (q) list = list.filter((excerpt) => excerptMatchesKeyword(excerpt, q))
  return {
    items: list.slice(0, EXCERPT_CHILD_LIMIT),
    total: list.length,
  }
}

function rootChapters(itemId: string): ResourceChapter[] {
  return listChaptersForItem(itemId)
    .filter((chapter) => (chapter.parentId ?? null) === null)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title) || a.id.localeCompare(b.id))
}

function itemTreeReady(item: ResourceItem) {
  const excerptsReady = !props.itemSupportsExcerpts(item) || item.id in props.excerptIndex
  const chaptersReady = !props.itemSupportsChapters(item) || item.id in props.chapterIndex
  return excerptsReady && chaptersReady
}

function itemTreeHasContent(item: ResourceItem) {
  if (props.itemSupportsChapters(item)) {
    return rootChapters(item.id).length > 0 || getRootExcerpts(item.id, null).total > 0
  }
  return getRootExcerpts(item.id, undefined).total > 0
}

function ensureItemTree(item: ResourceItem) {
  if (props.itemSupportsExcerpts(item) && !(item.id in props.excerptIndex)) {
    emit('ensure-excerpts', item.id)
  }
  if (props.itemSupportsChapters(item) && !(item.id in props.chapterIndex)) {
    emit('ensure-chapters', item.id)
  }
}

function toggleItemExpand(item: ResourceItem) {
  const key = itemNodeKey(item.id)
  if (isNodeExpanded(key)) {
    setNodeExpanded(key, false)
    return
  }
  ensureItemTree(item)
  setNodeExpanded(key, true)
}

function toggleExcerptExpand(excerptId: string) {
  const key = `ex:${excerptId}`
  setNodeExpanded(key, !isNodeExpanded(key))
}

function toggleChapterExpand(chapterId: string) {
  const key = `ch:${chapterId}`
  setNodeExpanded(key, !isNodeExpanded(key))
}

function onSelectItem(item: ResourceItem) {
  emit('update:selectedItemId', item.id)
  emit('select-item', item)
}

function onSelectExcerpt(item: ResourceItem, excerpt: ResourceExcerpt) {
  emit('update:selectedItemId', item.id)
  emit('select-excerpt', item, excerpt)
}

function onSelectChapter(item: ResourceItem, chapter: ResourceChapter) {
  emit('update:selectedItemId', item.id)
  emit('select-chapter', item, chapter)
}

function onListPageChange(page: number) {
  listPage.value = Math.max(0, page - 1)
}
</script>

<template>
  <div class="resource-locator-browse">
    <div class="resource-locator-browse__scroll">
      <el-scrollbar class="resource-locator-browse__scrollbar">
        <div
          v-for="item in pagedItems"
          :key="item.id"
          class="resource-locator-browse__tree-item"
        >
          <div class="resource-locator-browse__item-row">
            <button
              v-if="itemCanExpand(item)"
              type="button"
              class="resource-locator-browse__expand"
              :aria-label="isNodeExpanded(itemNodeKey(item.id)) ? '收起' : '展开'"
              @click.stop="toggleItemExpand(item)"
            >
              {{ isNodeExpanded(itemNodeKey(item.id)) ? '▼' : '▶' }}
            </button>
            <span
              v-else
              class="resource-locator-browse__expand resource-locator-browse__expand--placeholder"
            />
            <button
              type="button"
              class="resource-locator-browse__item"
              :class="{ 'resource-locator-browse__item--active': selectedItemId === item.id && !selectedExcerptId && !selectedChapterId }"
              @click="onSelectItem(item)"
            >
              <span class="resource-locator-browse__item-title">{{ item.title }}</span>
              <small>
                {{ item.typeName }} · {{ item.workTitle || '未归类' }} · {{ item.identityFieldLabel }}:
                {{ item.identityValue || '未填写' }}
              </small>
            </button>
          </div>
          <div
            v-if="isNodeExpanded(itemNodeKey(item.id))"
            class="resource-locator-browse__excerpt-children"
          >
            <template v-if="itemTreeReady(item)">
              <template v-if="itemSupportsChapters(item)">
                <ResourceLocatorChapterBranch
                  v-if="rootChapters(item.id).length > 0"
                  :item="item"
                  :parent-id="null"
                  :depth="0"
                  :chapters="listChaptersForItem(item.id)"
                  :excerpts="listExcerptsForItem(item.id)"
                  :expanded-ids="expandedNodeIds"
                  :selected-chapter-id="selectedChapterId"
                  :selected-excerpt-id="selectedExcerptId"
                  :keyword="keyword"
                  @toggle-chapter="toggleChapterExpand"
                  @toggle-excerpt="toggleExcerptExpand"
                  @select-chapter="(chapter) => onSelectChapter(item, chapter)"
                  @select-excerpt="(excerpt) => onSelectExcerpt(item, excerpt)"
                />
                <ResourceLocatorExcerptBranch
                  v-if="getRootExcerpts(item.id, null).total > 0"
                  :item="item"
                  :parent-id="null"
                  :depth="0"
                  :excerpts="listExcerptsForItem(item.id)"
                  :chapter-scope="null"
                  :expanded-ids="expandedNodeIds"
                  :selected-excerpt-id="selectedExcerptId"
                  :keyword="keyword"
                  @toggle="toggleExcerptExpand"
                  @select="(excerpt) => onSelectExcerpt(item, excerpt)"
                />
                <p
                  v-if="!itemTreeHasContent(item)"
                  class="resource-locator-browse__tree-empty"
                >
                  {{ keyword.trim() ? '没有匹配的章节或节选' : '暂无章节与节选' }}
                </p>
              </template>
              <template v-else>
                <ResourceLocatorExcerptBranch
                  v-if="getRootExcerpts(item.id, undefined).total > 0"
                  :item="item"
                  :parent-id="null"
                  :depth="0"
                  :excerpts="listExcerptsForItem(item.id)"
                  :expanded-ids="expandedNodeIds"
                  :selected-excerpt-id="selectedExcerptId"
                  :keyword="keyword"
                  @toggle="toggleExcerptExpand"
                  @select="(excerpt) => onSelectExcerpt(item, excerpt)"
                />
                <p
                  v-else
                  class="resource-locator-browse__tree-empty"
                >
                  {{ keyword.trim() ? '没有匹配的节选' : '暂无节选' }}
                </p>
              </template>
            </template>
            <p v-else class="resource-locator-browse__tree-empty">加载中…</p>
          </div>
        </div>
        <div
          v-if="!loading && pagedItems.length === 0"
          class="resource-locator-browse__empty-slot"
        >
          <el-empty :description="emptyDescription" :image-size="64" />
        </div>
      </el-scrollbar>
    </div>
    <div
      v-if="showPagination && listTotal > 0"
      class="resource-locator-browse__footer"
    >
      <el-pagination
        size="small"
        background
        layout="total, prev, pager, next"
        :total="listTotal"
        :page-size="DEFAULT_PAGE_SIZE"
        :current-page="listPage + 1"
        @current-change="onListPageChange"
      />
    </div>
  </div>
</template>

<style scoped>
.resource-locator-browse {
  display: flex;
  flex-direction: column;
  flex: 1 1 0;
  min-height: 0;
  width: 100%;
  height: 100%;
  max-height: 100%;
  overflow: hidden;
  box-sizing: border-box;
}

.resource-locator-browse__scroll {
  position: relative;
  flex: 1 1 0;
  min-height: 0;
  overflow: hidden;
}

.resource-locator-browse__scrollbar {
  position: absolute;
  inset: 0;
  height: auto !important;
}

.resource-locator-browse__scrollbar :deep(.el-scrollbar__wrap) {
  max-height: 100%;
  height: 100%;
}

.resource-locator-browse__scrollbar :deep(.el-scrollbar__view) {
  min-height: 100%;
  box-sizing: border-box;
}

.resource-locator-browse__footer {
  flex-shrink: 0;
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #e5e7eb;
}

.resource-locator-browse__tree-item {
  border-bottom: 1px solid #f1f5f9;
}

.resource-locator-browse__item-row {
  display: flex;
  align-items: flex-start;
  gap: 2px;
  min-width: 0;
}

.resource-locator-browse__expand {
  flex-shrink: 0;
  width: 20px;
  height: 40px;
  border: 0;
  padding: 0;
  background: transparent;
  color: #98a2b3;
  font-size: 10px;
  line-height: 40px;
  cursor: pointer;
}

.resource-locator-browse__expand--placeholder {
  visibility: hidden;
  pointer-events: none;
}

.resource-locator-browse__item {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 4px;
  border: 0;
  padding: 10px;
  background: transparent;
  color: #1f2937;
  text-align: left;
  cursor: pointer;
}

.resource-locator-browse__item:hover,
.resource-locator-browse__item--active {
  background: #eff6ff;
}

.resource-locator-browse__item-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.resource-locator-browse__item small {
  margin: 0;
  color: #64748b;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.resource-locator-browse__excerpt-children {
  padding: 0 0 6px;
  background: #fafbfc;
}

.resource-locator-browse__tree-empty {
  margin: 0;
  padding: 8px 12px 8px 28px;
  color: #98a2b3;
  font-size: 12px;
}

.resource-locator-browse__empty-slot {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  min-height: 160px;
  height: 100%;
  box-sizing: border-box;
}
</style>

<script setup lang="ts">
import { computed } from 'vue'
import type { ResourceChapter, ResourceExcerpt, ResourceItem } from '@/api/externalResource'
import { resourcePositionDisplay } from '@/utils/resourcePositionLocator'
import ResourceLocatorChapterBranch from './ResourceLocatorChapterBranch.vue'
import ResourceLocatorExcerptBranch from './ResourceLocatorExcerptBranch.vue'

const CHAPTER_CHILD_LIMIT = 100

const props = defineProps<{
  item: ResourceItem
  parentId: string | null
  depth: number
  chapters: ResourceChapter[]
  excerpts: ResourceExcerpt[]
  expandedIds: Set<string>
  selectedChapterId: string
  selectedExcerptId: string
  keyword: string
}>()

const emit = defineEmits<{
  'toggle-chapter': [chapterId: string]
  'toggle-excerpt': [excerptId: string]
  'select-chapter': [chapter: ResourceChapter]
  'select-excerpt': [excerpt: ResourceExcerpt]
}>()

function chapterMatchesKeyword(chapter: ResourceChapter, keywordText: string): boolean {
  const haystack = [chapter.title, chapter.locator, chapter.note]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return haystack.includes(keywordText)
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

function childrenOf(parentId: string | null): ResourceChapter[] {
  return props.chapters
    .filter((chapter) => (chapter.parentId ?? null) === parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title) || a.id.localeCompare(b.id))
}

function excerptsUnderChapter(chapterId: string): ResourceExcerpt[] {
  return props.excerpts.filter((excerpt) => (excerpt.chapterId ?? null) === chapterId)
}

function chapterHasVisibleContent(chapterId: string): boolean {
  const q = props.keyword.trim().toLowerCase()
  const self = props.chapters.find((chapter) => chapter.id === chapterId)
  if (!self) return false
  if (!q) {
    return childrenOf(chapterId).length > 0 || excerptsUnderChapter(chapterId).length > 0
  }
  if (chapterMatchesKeyword(self, q)) return true
  if (excerptsUnderChapter(chapterId).some((excerpt) => excerptMatchesKeyword(excerpt, q))) return true
  return childrenOf(chapterId).some((child) => chapterHasVisibleContent(child.id))
}

function hasChildren(chapterId: string): boolean {
  return childrenOf(chapterId).length > 0 || excerptsUnderChapter(chapterId).length > 0
}

function isExpanded(chapterId: string): boolean {
  return props.expandedIds.has(`ch:${chapterId}`)
}

function chapterSubtitle(chapter: ResourceChapter): string {
  const locator = chapter.locator?.trim()
  if (locator) return resourcePositionDisplay(locator) || locator
  return '章节'
}

const page = computed(() => {
  const q = props.keyword.trim().toLowerCase()
  let list = childrenOf(props.parentId)
  if (q) list = list.filter((chapter) => chapterHasVisibleContent(chapter.id))
  return {
    items: list.slice(0, CHAPTER_CHILD_LIMIT),
    total: list.length,
    truncated: list.length > CHAPTER_CHILD_LIMIT,
  }
})
</script>

<template>
  <div class="chapter-branch">
    <div
      v-for="chapter in page.items"
      :key="chapter.id"
      class="chapter-branch__node"
    >
      <div
        class="chapter-branch__row"
        :style="{ paddingLeft: `${8 + depth * 14}px` }"
      >
        <button
          type="button"
          class="chapter-branch__expand"
          :class="{ 'chapter-branch__expand--placeholder': !hasChildren(chapter.id) }"
          :aria-label="isExpanded(chapter.id) ? '收起' : '展开'"
          :disabled="!hasChildren(chapter.id)"
          @click.stop="hasChildren(chapter.id) && emit('toggle-chapter', chapter.id)"
        >
          <template v-if="hasChildren(chapter.id)">
            {{ isExpanded(chapter.id) ? '▼' : '▶' }}
          </template>
        </button>
        <button
          type="button"
          class="chapter-branch__label"
          :class="{ 'chapter-branch__label--selected': selectedChapterId === chapter.id }"
          @click="emit('select-chapter', chapter)"
        >
          <span class="chapter-branch__title">{{ chapter.title }}</span>
          <small class="chapter-branch__subtitle">{{ chapterSubtitle(chapter) }}</small>
        </button>
      </div>
      <div v-if="isExpanded(chapter.id)" class="chapter-branch__children">
        <ResourceLocatorChapterBranch
          :item="item"
          :parent-id="chapter.id"
          :depth="depth + 1"
          :chapters="chapters"
          :excerpts="excerpts"
          :expanded-ids="expandedIds"
          :selected-chapter-id="selectedChapterId"
          :selected-excerpt-id="selectedExcerptId"
          :keyword="keyword"
          @toggle-chapter="emit('toggle-chapter', $event)"
          @toggle-excerpt="emit('toggle-excerpt', $event)"
          @select-chapter="emit('select-chapter', $event)"
          @select-excerpt="emit('select-excerpt', $event)"
        />
        <ResourceLocatorExcerptBranch
          :item="item"
          :parent-id="null"
          :depth="depth + 1"
          :excerpts="excerpts"
          :chapter-scope="chapter.id"
          :expanded-ids="expandedIds"
          :selected-excerpt-id="selectedExcerptId"
          :keyword="keyword"
          @toggle="emit('toggle-excerpt', $event)"
          @select="emit('select-excerpt', $event)"
        />
      </div>
    </div>
    <p
      v-if="page.truncated"
      class="chapter-branch__truncate"
      :style="{ paddingLeft: `${8 + depth * 14}px` }"
    >
      本层仅显示前 {{ CHAPTER_CHILD_LIMIT }} 个章节（共 {{ page.total }}）
    </p>
  </div>
</template>

<style scoped>
.chapter-branch__row {
  display: flex;
  align-items: flex-start;
  gap: 2px;
  min-width: 0;
}

.chapter-branch__expand {
  flex-shrink: 0;
  width: 18px;
  height: 40px;
  border: 0;
  padding: 0;
  background: transparent;
  color: #98a2b3;
  font-size: 10px;
  line-height: 40px;
  cursor: pointer;
}

.chapter-branch__expand--placeholder {
  visibility: hidden;
  pointer-events: none;
}

.chapter-branch__label {
  flex: 1;
  min-width: 0;
  display: grid;
  grid-template-rows: auto auto;
  gap: 2px;
  border: 0;
  border-radius: 6px;
  padding: 6px 8px;
  background: transparent;
  color: #344054;
  text-align: left;
  cursor: pointer;
}

.chapter-branch__label:hover {
  background: #f2f4f7;
}

.chapter-branch__label--selected {
  background: #eef2ff;
  box-shadow: inset 0 0 0 1px rgba(99, 102, 241, 0.35);
}

.chapter-branch__title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  line-height: 1.35;
  font-weight: 600;
}

.chapter-branch__subtitle {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #98a2b3;
  font-size: 11px;
  line-height: 1.35;
  min-height: 1.35em;
}

.chapter-branch__truncate {
  margin: 4px 0 8px;
  color: #98a2b3;
  font-size: 11px;
}
</style>

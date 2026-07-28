<script setup lang="ts">
import { computed } from 'vue'
import type { ResourceExcerpt, ResourceItem } from '@/api/externalResource'
import { resourcePositionDisplay } from '@/utils/resourcePositionLocator'
import ResourceLocatorExcerptBranch from './ResourceLocatorExcerptBranch.vue'

const EXCERPT_CHILD_LIMIT = 100

const props = defineProps<{
  item: ResourceItem
  parentId: string | null
  depth: number
  excerpts: ResourceExcerpt[]
  /**
   * When set, only excerpts in this chapter appear.
   * `null` = unassigned (no chapterId). `undefined` = ignore chapter (flat / non-book).
   */
  chapterScope?: string | null
  expandedIds: Set<string>
  selectedExcerptId: string
  keyword: string
}>()

const emit = defineEmits<{
  toggle: [excerptId: string]
  select: [excerpt: ResourceExcerpt]
}>()

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

function inChapterScope(excerpt: ResourceExcerpt): boolean {
  if (props.chapterScope === undefined) return true
  const chapterId = excerpt.chapterId ?? null
  if (props.chapterScope === null) return chapterId == null
  return chapterId === props.chapterScope
}

function childrenOf(parentId: string | null): ResourceExcerpt[] {
  const q = props.keyword.trim().toLowerCase()
  let list = props.excerpts
    .filter((excerpt) => inChapterScope(excerpt) && (excerpt.parentId ?? null) === parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title) || a.id.localeCompare(b.id))
  if (q) list = list.filter((excerpt) => excerptMatchesKeyword(excerpt, q))
  return list
}

function hasChildren(excerptId: string): boolean {
  return childrenOf(excerptId).length > 0
}

function isExpanded(excerptId: string): boolean {
  return props.expandedIds.has(`ex:${excerptId}`)
}

/** Always show a one-line subtitle so row heights stay uniform. */
function excerptSubtitle(excerpt: ResourceExcerpt): string {
  const locator = excerpt.locator?.trim()
  if (locator) {
    return resourcePositionDisplay(locator) || locator
  }
  const chapter = excerpt.chapterTitle?.trim()
  if (chapter) return `章节：${chapter}`
  return '未设置定位'
}

function hasLocator(excerpt: ResourceExcerpt): boolean {
  return Boolean(excerpt.locator?.trim())
}

const page = computed(() => {
  const all = childrenOf(props.parentId)
  return {
    items: all.slice(0, EXCERPT_CHILD_LIMIT),
    total: all.length,
    truncated: all.length > EXCERPT_CHILD_LIMIT,
  }
})
</script>

<template>
  <div class="excerpt-branch">
    <div
      v-for="excerpt in page.items"
      :key="excerpt.id"
      class="excerpt-branch__node"
    >
      <div
        class="excerpt-branch__row"
        :style="{ paddingLeft: `${8 + depth * 14}px` }"
      >
        <button
          type="button"
          class="excerpt-branch__expand"
          :class="{ 'excerpt-branch__expand--placeholder': !hasChildren(excerpt.id) }"
          :aria-label="isExpanded(excerpt.id) ? '收起' : '展开'"
          :disabled="!hasChildren(excerpt.id)"
          @click.stop="hasChildren(excerpt.id) && emit('toggle', excerpt.id)"
        >
          <template v-if="hasChildren(excerpt.id)">
            {{ isExpanded(excerpt.id) ? '▼' : '▶' }}
          </template>
        </button>
        <button
          type="button"
          class="excerpt-branch__label"
          :class="{ 'excerpt-branch__label--selected': selectedExcerptId === excerpt.id }"
          @click="emit('select', excerpt)"
        >
          <span class="excerpt-branch__title">{{ excerpt.title }}</span>
          <small
            class="excerpt-branch__subtitle"
            :class="{ 'excerpt-branch__subtitle--missing': !hasLocator(excerpt) }"
          >{{ excerptSubtitle(excerpt) }}</small>
        </button>
      </div>
      <ResourceLocatorExcerptBranch
        v-if="isExpanded(excerpt.id)"
        :item="item"
        :parent-id="excerpt.id"
        :depth="depth + 1"
        :excerpts="excerpts"
        :chapter-scope="chapterScope"
        :expanded-ids="expandedIds"
        :selected-excerpt-id="selectedExcerptId"
        :keyword="keyword"
        @toggle="emit('toggle', $event)"
        @select="emit('select', $event)"
      />
    </div>
    <p
      v-if="page.truncated"
      class="excerpt-branch__truncate"
      :style="{ paddingLeft: `${8 + depth * 14}px` }"
    >
      本层仅显示前 {{ EXCERPT_CHILD_LIMIT }} 条（共 {{ page.total }}）
    </p>
  </div>
</template>

<style scoped>
.excerpt-branch__row {
  display: flex;
  align-items: flex-start;
  gap: 2px;
  min-width: 0;
}

.excerpt-branch__expand {
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

.excerpt-branch__expand--placeholder {
  visibility: hidden;
  pointer-events: none;
}

.excerpt-branch__label {
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

.excerpt-branch__label:hover {
  background: #f2f4f7;
}

.excerpt-branch__label--selected {
  background: #e6f4ff;
  box-shadow: inset 0 0 0 1px rgba(22, 119, 255, 0.35);
}

.excerpt-branch__title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  line-height: 1.35;
}

.excerpt-branch__subtitle {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #98a2b3;
  font-size: 11px;
  line-height: 1.35;
  min-height: 1.35em;
}

.excerpt-branch__subtitle--missing {
  color: #c0c4cc;
  font-style: italic;
}

.excerpt-branch__truncate {
  margin: 4px 0 8px;
  color: #98a2b3;
  font-size: 11px;
}
</style>

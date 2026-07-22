<script setup lang="ts">
import { computed } from 'vue'
import type { ResourceExcerpt, ResourceItem } from '@/api/externalResource'
import { resourcePositionDisplay } from '@/utils/resourcePositionLocator'
import ResourcePickerExcerptBranch from './ResourcePickerExcerptBranch.vue'

const EXCERPT_CHILD_LIMIT = 100

const props = defineProps<{
  item: ResourceItem
  parentId: string | null
  depth: number
  excerpts: ResourceExcerpt[]
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

function childrenOf(parentId: string | null): ResourceExcerpt[] {
  const q = props.keyword.trim().toLowerCase()
  let list = props.excerpts
    .filter((excerpt) => (excerpt.parentId ?? null) === parentId)
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
          <small v-if="excerpt.locator">{{ resourcePositionDisplay(excerpt.locator) || excerpt.locator }}</small>
        </button>
      </div>
      <ResourcePickerExcerptBranch
        v-if="isExpanded(excerpt.id)"
        :item="item"
        :parent-id="excerpt.id"
        :depth="depth + 1"
        :excerpts="excerpts"
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
  height: 28px;
  border: 0;
  padding: 0;
  background: transparent;
  color: #98a2b3;
  font-size: 10px;
  line-height: 28px;
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
}

.excerpt-branch__label small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #98a2b3;
  font-size: 11px;
}

.excerpt-branch__truncate {
  margin: 4px 0 8px;
  color: #98a2b3;
  font-size: 11px;
}
</style>

<script setup lang="ts">
import { computed } from 'vue'
import { ElTooltip } from 'element-plus'
import FoldChevronIcon from './FoldChevronIcon.vue'
import type { BlockTag } from '@/api/types'
import type { TocTreeItem } from '@/utils/toc/headings'
import { headingSourceBadgeLabel } from '@/utils/headingSource'

const props = defineProps<{
  items: TocTreeItem[]
  highlightedBlockId: string | null
  /** Prefer item id highlight (focus follow); falls back to blockId. */
  highlightedItemId?: string | null
  sectionTagsByItemId?: Record<string, BlockTag[]>
  isExpanded: (item: TocTreeItem) => boolean
}>()

const emit = defineEmits<{
  click: [item: TocTreeItem]
  toggle: [item: TocTreeItem]
  'context-menu': [item: TocTreeItem, event: MouseEvent]
  'source-click': [item: TocTreeItem]
}>()

const sectionTagsByItemIdMap = computed(() => props.sectionTagsByItemId ?? {})

const onItemClick = (item: TocTreeItem) => {
  emit('click', item)
}

const onToggleClick = (item: TocTreeItem) => {
  emit('toggle', item)
}

const onContextMenu = (item: TocTreeItem, event: MouseEvent) => {
  emit('context-menu', item, event)
}

const onSourceClick = (item: TocTreeItem, event: MouseEvent) => {
  event.preventDefault()
  event.stopPropagation()
  emit('source-click', item)
}

function isItemActive(item: TocTreeItem): boolean {
  if (props.highlightedItemId) return props.highlightedItemId === item.id
  return Boolean(props.highlightedBlockId && props.highlightedBlockId === item.blockId)
}

const itemClasses = (item: TocTreeItem) => [
  'page-toc__item',
  item.sourceType === 'ref-group' && item.level === 0
    ? 'page-toc__item--ref'
    : `page-toc__item--level-${item.level}`,
  { 'page-toc__item--active': isItemActive(item) },
]

function visibleSectionTags(item: TocTreeItem): BlockTag[] {
  return sectionTagsByItemIdMap.value[item.id] ?? []
}

function extraSectionTagCount(item: TocTreeItem): number {
  const total = visibleSectionTags(item).length
  return total > 2 ? total - 2 : 0
}
</script>

<template>
  <template v-for="item in items" :key="item.id">
    <div
      v-if="item.children?.length"
      :class="item.sourceType === 'ref-group' ? 'page-toc__group' : 'page-toc__local-group'"
    >
      <button
        type="button"
        :data-toc-item-id="item.id"
        :class="itemClasses(item)"
        @click="onItemClick(item)"
        @contextmenu="onContextMenu(item, $event)"
      >
        <span
          class="page-toc__bullet page-toc__bullet--group"
          @click.stop="onToggleClick(item)"
        >
          <FoldChevronIcon :collapsed="!isExpanded(item)" />
        </span>
        <ElTooltip :content="item.text" placement="left" :show-after="400">
          <span class="page-toc__text">{{ item.text }}</span>
        </ElTooltip>
        <span v-if="visibleSectionTags(item).length" class="page-toc__tags">
          <span
            v-for="tag in visibleSectionTags(item).slice(0, 2)"
            :key="tag.id"
            class="page-toc__tag-chip"
            :style="{ '--tag-chip-color': tag.color || '#1677ff' }"
          >
            {{ tag.label }}
          </span>
          <span v-if="extraSectionTagCount(item) > 0" class="page-toc__tag-more">
            +{{ extraSectionTagCount(item) }}
          </span>
        </span>
        <button
          v-if="item.sourceBinding"
          type="button"
          class="page-toc__source"
          :title="headingSourceBadgeLabel(item.sourceBinding)"
          @click="onSourceClick(item, $event)"
        >
          来源
        </button>
      </button>
      <div
        v-if="isExpanded(item)"
        :class="item.sourceType === 'ref-group' ? 'page-toc__children' : 'page-toc__local-children'"
      >
        <TocTreeList
          :items="item.children"
          :highlighted-block-id="highlightedBlockId"
          :highlighted-item-id="highlightedItemId"
          :section-tags-by-item-id="sectionTagsByItemIdMap"
          :is-expanded="isExpanded"
          @click="emit('click', $event)"
          @toggle="emit('toggle', $event)"
          @context-menu="(tocItem, event) => emit('context-menu', tocItem, event)"
          @source-click="emit('source-click', $event)"
        />
      </div>
    </div>

    <div v-else-if="item.sourceType === 'ref-child'" class="page-toc__inline-ref-child">
      <button
        type="button"
        class="page-toc__item"
        :data-toc-item-id="item.id"
        :class="{
          'page-toc__item--active': isItemActive(item),
          [`page-toc__item--level-${item.level}`]: true,
        }"
        @click="onItemClick(item)"
        @contextmenu="onContextMenu(item, $event)"
      >
        <span
          class="page-toc__bullet page-toc__bullet--placeholder"
          aria-hidden="true"
        />
        <ElTooltip :content="item.text" placement="left" :show-after="400">
          <span class="page-toc__text">{{ item.text }}</span>
        </ElTooltip>
        <span v-if="visibleSectionTags(item).length" class="page-toc__tags">
          <span
            v-for="tag in visibleSectionTags(item).slice(0, 2)"
            :key="tag.id"
            class="page-toc__tag-chip"
            :style="{ '--tag-chip-color': tag.color || '#1677ff' }"
          >
            {{ tag.label }}
          </span>
          <span v-if="extraSectionTagCount(item) > 0" class="page-toc__tag-more">
            +{{ extraSectionTagCount(item) }}
          </span>
        </span>
      </button>
    </div>

    <button
      v-else
      type="button"
      class="page-toc__item"
      :data-toc-item-id="item.id"
      :class="{
        'page-toc__item--active': isItemActive(item),
        [`page-toc__item--level-${item.level}`]: true,
      }"
      @click="onItemClick(item)"
      @contextmenu="onContextMenu(item, $event)"
    >
      <span
        class="page-toc__bullet page-toc__bullet--placeholder"
        aria-hidden="true"
      />
      <ElTooltip :content="item.text" placement="left" :show-after="400">
        <span class="page-toc__text">{{ item.text }}</span>
      </ElTooltip>
      <span v-if="visibleSectionTags(item).length" class="page-toc__tags">
        <span
          v-for="tag in visibleSectionTags(item).slice(0, 2)"
          :key="tag.id"
          class="page-toc__tag-chip"
          :style="{ '--tag-chip-color': tag.color || '#1677ff' }"
        >
          {{ tag.label }}
        </span>
        <span v-if="extraSectionTagCount(item) > 0" class="page-toc__tag-more">
          +{{ extraSectionTagCount(item) }}
        </span>
      </span>
      <span
        v-if="item.sourceBinding"
        class="page-toc__source"
        role="button"
        tabindex="0"
        :title="headingSourceBadgeLabel(item.sourceBinding)"
        @click="onSourceClick(item, $event)"
        @keydown.enter.prevent="emit('source-click', item)"
      >
        来源
      </span>
    </button>
  </template>
</template>

<script lang="ts">
export default {
  name: 'TocTreeList',
}
</script>

<style scoped>
.page-toc__source {
  flex-shrink: 0;
  margin-left: 6px;
  padding: 0 6px;
  border: 1px solid #bfdbfe;
  border-radius: 999px;
  background: #eff6ff;
  color: #075985;
  font-size: 10px;
  line-height: 1.6;
  cursor: pointer;
}

.page-toc__source:hover {
  background: #dbeafe;
}

.page-toc__tags {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: 6px;
  flex-shrink: 0;
}

.page-toc__tag-chip {
  --tag-chip-color: #1677ff;
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--tag-chip-color) 30%, white);
  background: color-mix(in srgb, var(--tag-chip-color) 12%, white);
  color: color-mix(in srgb, var(--tag-chip-color) 85%, black);
  padding: 0 6px;
  font-size: 10px;
  line-height: 1.6;
  max-width: 72px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.page-toc__tag-more {
  font-size: 10px;
  color: #6b7280;
  line-height: 1.6;
}
</style>

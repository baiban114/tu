<script setup lang="ts">
import { computed } from 'vue'
import type { BlockTag } from '@/api/types'
import { normalizeTagLabel } from '@/utils/blockMetadata'

interface Props {
  /** Page-level metadata tags (editable / removable). */
  tags: BlockTag[]
  /** Content tags used for in-page filter (section / block / text-span). */
  filterTags?: BlockTag[]
  activeFilter?: BlockTag | null
  editable?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  filterTags: () => [],
  activeFilter: null,
  editable: true,
})

const emit = defineEmits<{
  (e: 'edit'): void
  (e: 'remove', tag: BlockTag): void
  (e: 'select-filter', tag: BlockTag): void
  (e: 'clear-filter'): void
}>()

const pageTagKeys = computed(() => {
  const keys = new Set<string>()
  for (const tag of props.tags) {
    keys.add(tag.id)
    keys.add(normalizeTagLabel(tag.label).toLowerCase())
  }
  return keys
})

const filterTagKeys = computed(() => {
  const keys = new Set<string>()
  for (const tag of props.filterTags) {
    keys.add(tag.id)
    keys.add(normalizeTagLabel(tag.label).toLowerCase())
  }
  return keys
})

const displayTags = computed(() => {
  const byKey = new Map<string, BlockTag>()
  for (const tag of [...props.tags, ...props.filterTags]) {
    const key = normalizeTagLabel(tag.label).toLowerCase() || tag.id
    if (!byKey.has(key)) byKey.set(key, tag)
  }
  return Array.from(byKey.values())
})

const hasContent = computed(() => (
  displayTags.value.length > 0 || props.editable
))

function tagKey(tag: BlockTag): string {
  return normalizeTagLabel(tag.label).toLowerCase() || tag.id
}

function isPageTag(tag: BlockTag): boolean {
  return pageTagKeys.value.has(tag.id) || pageTagKeys.value.has(tagKey(tag))
}

function isFilterTag(tag: BlockTag): boolean {
  return filterTagKeys.value.has(tag.id) || filterTagKeys.value.has(tagKey(tag))
}

function isActive(tag: BlockTag): boolean {
  if (!props.activeFilter) return false
  if (props.activeFilter.id === tag.id) return true
  return tagKey(props.activeFilter) === tagKey(tag)
}

function onRemove(event: MouseEvent, tag: BlockTag) {
  event.preventDefault()
  event.stopPropagation()
  emit('remove', tag)
}

function onChipClick(tag: BlockTag) {
  if (isFilterTag(tag)) {
    if (isActive(tag)) emit('clear-filter')
    else emit('select-filter', tag)
    return
  }
  if (props.editable) emit('edit')
}
</script>

<template>
  <div v-if="hasContent" class="page-tags-bar">
    <span
      v-for="tag in displayTags"
      :key="tag.id"
      class="tag-chip"
      :class="{
        'tag-chip--editable': editable && isPageTag(tag),
        'tag-chip--filter': isFilterTag(tag),
        'tag-chip--active': isActive(tag),
      }"
      :style="{ '--tag-chip-color': tag.color || '#1677ff' }"
      @click="onChipClick(tag)"
    >
      <span class="tag-chip__label">{{ tag.label }}</span>
      <button
        v-if="editable && isPageTag(tag)"
        type="button"
        class="tag-chip__remove"
        :title="`删除标签「${tag.label}」`"
        :aria-label="`删除标签 ${tag.label}`"
        @click="onRemove($event, tag)"
      >
        ×
      </button>
    </span>

    <button
      v-if="activeFilter"
      type="button"
      class="page-tags-bar__clear"
      @click.stop="emit('clear-filter')"
    >
      显示全部
    </button>

    <button
      v-if="editable"
      type="button"
      class="page-tags-bar__add"
      @click.stop="emit('edit')"
    >
      {{ displayTags.length > 0 ? '+ 标签' : '+ 添加标签' }}
    </button>
  </div>
</template>

<style scoped>
.page-tags-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 8px;
  min-height: 28px;
  cursor: default;
}

.page-tags-bar__add,
.page-tags-bar__clear {
  border-radius: 999px;
  font-size: 12px;
  line-height: 1.4;
  padding: 4px 10px;
  cursor: pointer;
}

.page-tags-bar__add {
  border: 1px dashed #d9d9d9;
  background: transparent;
  color: #8c8c8c;
}

.page-tags-bar__add:hover {
  border-color: #1677ff;
  color: #1677ff;
}

.page-tags-bar__clear {
  border: 1px dashed #d9d9d9;
  background: transparent;
  color: #6b7280;
}

.page-tags-bar__clear:hover {
  border-color: #1677ff;
  color: #1677ff;
}

.tag-chip {
  --tag-chip-color: #1677ff;
  position: relative;
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--tag-chip-color) 30%, white);
  background: color-mix(in srgb, var(--tag-chip-color) 12%, white);
  color: color-mix(in srgb, var(--tag-chip-color) 85%, black);
  padding: 4px 10px;
  font-size: 12px;
  line-height: 1.4;
}

.tag-chip--editable,
.tag-chip--filter {
  cursor: pointer;
}

.tag-chip--editable {
  padding-right: 14px;
}

.tag-chip--filter:hover {
  border-color: color-mix(in srgb, var(--tag-chip-color) 50%, white);
}

.tag-chip--active {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--tag-chip-color) 35%, white);
  font-weight: 600;
}

.tag-chip__label {
  min-width: 0;
}

.tag-chip__remove {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 16px;
  height: 16px;
  padding: 0;
  border: 1px solid #e8e8e8;
  border-radius: 999px;
  background: #fff;
  color: #8c8c8c;
  font-size: 12px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
}

.tag-chip__remove:hover {
  color: #ff4d4f;
  border-color: #ffccc7;
  background: #fff1f0;
}
</style>

<script setup lang="ts">
import { computed } from 'vue'
import type { BlockTag } from '@/api/types'
import { normalizeTagLabel } from '@/utils/blockMetadata'

interface Props {
  tags: BlockTag[]
  activeTag?: BlockTag | null
  embedded?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  activeTag: null,
  embedded: false,
})

const emit = defineEmits<{
  (e: 'select', tag: BlockTag): void
  (e: 'clear'): void
}>()

function tagKey(tag: BlockTag): string {
  return normalizeTagLabel(tag.label).toLowerCase() || tag.id
}

function isActive(tag: BlockTag): boolean {
  if (!props.activeTag) return false
  if (props.activeTag.id === tag.id) return true
  return tagKey(props.activeTag) === tagKey(tag)
}

const displayTags = computed(() => props.tags)

function onClick(tag: BlockTag) {
  if (isActive(tag)) emit('clear')
  else emit('select', tag)
}
</script>

<template>
  <div class="tag-filter-bar" :class="{ 'tag-filter-bar--embedded': embedded }">
    <span
      v-for="tag in displayTags"
      :key="tag.id"
      class="tag-filter-bar__chip"
      :class="{ 'tag-filter-bar__chip--active': isActive(tag) }"
      :style="{ '--tag-chip-color': tag.color || '#1677ff' }"
      :title="`筛选为「${tag.label}」`"
      @click="onClick(tag)"
    >
      {{ tag.label }}
    </span>
    <button
      v-if="activeTag"
      type="button"
      class="tag-filter-bar__clear"
      @click="emit('clear')"
    >2
      清除筛选
    </button>
  </div>
</template>

<style scoped>
.tag-filter-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.tag-filter-bar--embedded {
  gap: 4px;
}

.tag-filter-bar__chip {
  --tag-chip-color: #1677ff;
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--tag-chip-color) 30%, white);
  background: color-mix(in srgb, var(--tag-chip-color) 12%, white);
  color: color-mix(in srgb, var(--tag-chip-color) 85%, black);
  padding: 2px 10px;
  font-size: 12px;
  line-height: 1.4;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}

.tag-filter-bar__chip:hover {
  border-color: color-mix(in srgb, var(--tag-chip-color) 50%, white);
}

.tag-filter-bar__chip--active {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--tag-chip-color) 35%, white);
  font-weight: 600;
}

.tag-filter-bar__clear {
  border-radius: 999px;
  border: 1px dashed #d9d9d9;
  background: transparent;
  color: #6b7280;
  padding: 2px 10px;
  font-size: 12px;
  line-height: 1.4;
  cursor: pointer;
}

.tag-filter-bar__clear:hover {
  border-color: #1677ff;
  color: #1677ff;
}
</style>

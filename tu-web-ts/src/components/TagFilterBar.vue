<script setup lang="ts">
import { computed } from 'vue'
import type { BlockTag } from '@/api/types'
import { normalizeTagLabel } from '@/utils/blockMetadata'

const props = defineProps<{
  tags: BlockTag[]
  activeTag: BlockTag | null
  /** Compact layout for sticky page toolbar chrome */
  embedded?: boolean
}>()

const emit = defineEmits<{
  (e: 'select', tag: BlockTag): void
  (e: 'clear'): void
}>()

const hasTags = computed(() => props.tags.length > 0)

function isActive(tag: BlockTag): boolean {
  if (!props.activeTag) return false
  if (props.activeTag.id === tag.id) return true
  return normalizeTagLabel(props.activeTag.label).toLowerCase()
    === normalizeTagLabel(tag.label).toLowerCase()
}

function onTagClick(tag: BlockTag) {
  if (isActive(tag)) {
    emit('clear')
    return
  }
  emit('select', tag)
}
</script>

<template>
  <div v-if="hasTags" class="tag-filter-bar" :class="{ 'tag-filter-bar--embedded': embedded }">
    <div v-if="activeTag && !embedded" class="tag-filter-bar__banner">
      <span class="tag-filter-bar__banner-text">
        正在查看标签：<strong>{{ activeTag.label }}</strong>
      </span>
      <button type="button" class="tag-filter-bar__clear" @click="emit('clear')">
        显示全部
      </button>
    </div>
    <div class="tag-filter-bar__chips">
      <span v-if="!embedded" class="tag-filter-bar__label">按标签查看</span>
      <span v-else class="tag-filter-bar__label">标签</span>
      <button
        v-for="tag in tags"
        :key="tag.id"
        type="button"
        class="tag-filter-bar__chip"
        :class="{ 'tag-filter-bar__chip--active': isActive(tag) }"
        :style="{ '--tag-chip-color': tag.color || '#1677ff' }"
        @click="onTagClick(tag)"
      >
        {{ tag.label }}
      </button>
      <button
        v-if="activeTag && !embedded"
        type="button"
        class="tag-filter-bar__chip tag-filter-bar__chip--reset"
        @click="emit('clear')"
      >
        显示全部
      </button>
    </div>
  </div>
</template>

<style scoped>
.tag-filter-bar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}

.tag-filter-bar--embedded {
  margin-bottom: 0;
  flex: 1;
  min-width: 0;
}

.tag-filter-bar--embedded .tag-filter-bar__chips {
  flex-wrap: wrap;
  gap: 6px;
}

.tag-filter-bar--embedded .tag-filter-bar__label {
  font-size: 11px;
}

.tag-filter-bar--embedded .tag-filter-bar__chip {
  padding: 3px 8px;
  font-size: 11px;
}

.tag-filter-bar__banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
  border-radius: 8px;
  background: #f0f7ff;
  border: 1px solid #d6e8ff;
  font-size: 13px;
  color: #1f2937;
}

.tag-filter-bar__banner-text strong {
  color: #1677ff;
}

.tag-filter-bar__clear {
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: #1677ff;
  font-size: 12px;
  cursor: pointer;
  padding: 4px 8px;
}

.tag-filter-bar__clear:hover {
  text-decoration: underline;
}

.tag-filter-bar__chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.tag-filter-bar__label {
  font-size: 12px;
  color: #6b7280;
  flex-shrink: 0;
}

.tag-filter-bar__chip {
  --tag-chip-color: #1677ff;
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--tag-chip-color) 30%, white);
  background: color-mix(in srgb, var(--tag-chip-color) 12%, white);
  color: color-mix(in srgb, var(--tag-chip-color) 85%, black);
  padding: 4px 10px;
  font-size: 12px;
  line-height: 1.4;
  cursor: pointer;
}

.tag-filter-bar__chip:hover {
  border-color: color-mix(in srgb, var(--tag-chip-color) 50%, white);
}

.tag-filter-bar__chip--active {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--tag-chip-color) 35%, white);
  font-weight: 600;
}

.tag-filter-bar__chip--reset {
  border-style: dashed;
  background: transparent;
  color: #6b7280;
  --tag-chip-color: #9ca3af;
}
</style>

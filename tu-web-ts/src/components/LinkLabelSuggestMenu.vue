<script setup lang="ts">
import type { LinkSuggestItem, LinkSuggestKind } from '@/editor/linkLabelSuggestQuery'

defineProps<{
  items: LinkSuggestItem[]
  activeIndex: number
  listActive: boolean
}>()

const emit = defineEmits<{
  select: [item: LinkSuggestItem]
  hover: [index: number]
}>()

function kindLabel(kind: LinkSuggestKind): string {
  if (kind === 'page') return '文档'
  if (kind === 'heading') return '标题'
  if (kind === 'resourceChapter') return '章节'
  if (kind === 'resourceExcerpt') return '节选'
  return '资源'
}
</script>

<template>
  <div class="link-label-suggest-menu" role="listbox">
    <button
      v-for="(item, index) in items"
      :key="item.id"
      type="button"
      role="option"
      class="link-label-suggest-menu__item"
      :class="{
        'link-label-suggest-menu__item--active': listActive && index === activeIndex,
      }"
      :aria-selected="listActive && index === activeIndex"
      @mousedown.prevent="emit('select', item)"
      @mouseenter="emit('hover', index)"
    >
      <span class="link-label-suggest-menu__kind">{{ kindLabel(item.kind) }}</span>
      <span class="link-label-suggest-menu__body">
        <span class="link-label-suggest-menu__label">{{ item.label }}</span>
        <span class="link-label-suggest-menu__desc">{{ item.description }}</span>
      </span>
    </button>
  </div>
</template>

<style scoped>
.link-label-suggest-menu {
  min-width: 280px;
  max-width: min(420px, calc(100vw - 24px));
  max-height: min(280px, calc(100dvh - 48px));
  overflow-y: auto;
  padding: 6px;
  box-sizing: border-box;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
}

.link-label-suggest-menu__item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  width: 100%;
  margin: 0;
  padding: 8px 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.link-label-suggest-menu__item:hover,
.link-label-suggest-menu__item--active {
  background: #f1f5f9;
}

.link-label-suggest-menu__kind {
  flex-shrink: 0;
  margin-top: 1px;
  padding: 1px 6px;
  border-radius: 4px;
  background: #e2e8f0;
  color: #475569;
  font-size: 11px;
  line-height: 1.4;
}

.link-label-suggest-menu__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.link-label-suggest-menu__label {
  color: #0f172a;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.35;
  word-break: break-word;
}

.link-label-suggest-menu__desc {
  color: #64748b;
  font-size: 12px;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>

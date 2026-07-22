<script setup lang="ts">
import { ref, watch } from 'vue'

interface CompoundBadge {
  annotationId: string
  color: string
}

const props = defineProps({
  typeLabel: { type: String, default: '' },
  /** Block title shown next to the type badge. */
  title: { type: String, default: '' },
  /** When true, title renders as an editable input. */
  titleEditable: { type: Boolean, default: false },
  titlePlaceholder: { type: String, default: '未命名' },
  compoundBadges: { type: Array as () => CompoundBadge[], default: () => [] },
  /** Show embed drag-handle attributes on the header row. */
  dragHandle: { type: Boolean, default: false },
})

const emit = defineEmits<{
  'compound-badge-click': [annotationId: string, event: MouseEvent]
  'title-change': [title: string]
}>()

const titleDraft = ref(props.title)

watch(
  () => props.title,
  (value) => {
    titleDraft.value = value
  },
)

function commitTitle() {
  if (!props.titleEditable) return
  const next = titleDraft.value.trim()
  if (next === props.title.trim()) return
  emit('title-change', next)
}
</script>

<template>
  <div
    v-if="typeLabel || title || titleEditable || compoundBadges.length > 0 || $slots.default || $slots.trailing"
    class="tu-block-chrome-header"
    :class="{ 'tu-block-chrome-header--drag-handle': dragHandle }"
    :data-drag-handle="dragHandle ? '' : undefined"
    :data-node-view-drag-handle="dragHandle ? '' : undefined"
    :draggable="dragHandle ? 'true' : undefined"
  >
    <div class="tu-block-chrome-header__start">
      <span v-if="typeLabel" class="tu-block-chrome-header__type-badge">{{ typeLabel }}</span>
      <input
        v-if="titleEditable"
        v-model="titleDraft"
        class="tu-block-chrome-header__title-input"
        type="text"
        data-node-view-no-drag
        :placeholder="titlePlaceholder"
        @mousedown.stop
        @click.stop
        @blur="commitTitle"
        @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
      >
      <span
        v-else-if="title"
        class="tu-block-chrome-header__title"
        :title="title"
      >{{ title }}</span>
      <slot />
      <span
        v-for="badge in compoundBadges"
        :key="badge.annotationId"
        class="tu-block-chrome-header__note-badge"
        data-node-view-no-drag
        :style="{ background: badge.color }"
        title="笔记"
        @mousedown.stop
        @click.stop="emit('compound-badge-click', badge.annotationId, $event)"
      />
    </div>
    <div
      v-if="$slots.trailing"
      class="tu-block-chrome-header__trailing"
      data-node-view-no-drag
    >
      <slot name="trailing" />
    </div>
  </div>
</template>

<style scoped>
.tu-block-chrome-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 10px;
  font-size: 11px;
  color: #6b7280;
  border-bottom: 1px solid #e5e7eb;
  background: #f9fafb;
  border-radius: 6px 6px 0 0;
}

.tu-block-chrome-header__start {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 1;
}

.tu-block-chrome-header__trailing {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.tu-block-chrome-header__type-badge {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 3px;
  background: #eef2ff;
  color: #4338ca;
  font-weight: 600;
  flex-shrink: 0;
}

.tu-block-chrome-header__title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 600;
  color: #1f2937;
}

.tu-block-chrome-header__title-input {
  flex: 1;
  min-width: 0;
  max-width: 100%;
  margin: 0;
  padding: 2px 6px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: #1f2937;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
  outline: none;
}

.tu-block-chrome-header__title-input:hover {
  border-color: #e5e7eb;
  background: #fff;
}

.tu-block-chrome-header__title-input:focus {
  border-color: #91caff;
  background: #fff;
  box-shadow: 0 0 0 2px rgba(22, 119, 255, 0.12);
}

.tu-block-chrome-header__note-badge {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  cursor: pointer;
  opacity: 0.7;
  transition: opacity 0.15s, transform 0.15s;
}

.tu-block-chrome-header__note-badge:hover {
  opacity: 1;
  transform: scale(1.3);
}
</style>

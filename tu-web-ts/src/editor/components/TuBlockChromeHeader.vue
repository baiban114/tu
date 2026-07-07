<script setup lang="ts">
interface CompoundBadge {
  annotationId: string
  color: string
}

const props = defineProps({
  typeLabel: { type: String, default: '' },
  compoundBadges: { type: Array as () => CompoundBadge[], default: () => [] },
  /** Show embed drag-handle attributes on the header row. */
  dragHandle: { type: Boolean, default: false },
})

const emit = defineEmits<{
  'compound-badge-click': [annotationId: string, event: MouseEvent]
}>()
</script>

<template>
  <div
    v-if="typeLabel || compoundBadges.length > 0 || $slots.default || $slots.trailing"
    class="tu-block-chrome-header"
    :class="{ 'tu-block-chrome-header--drag-handle': dragHandle }"
    :data-drag-handle="dragHandle ? '' : undefined"
    :data-node-view-drag-handle="dragHandle ? '' : undefined"
    :draggable="dragHandle ? 'true' : undefined"
  >
    <div class="tu-block-chrome-header__start">
      <span v-if="typeLabel" class="tu-block-chrome-header__type-badge">{{ typeLabel }}</span>
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

<script setup lang="ts">
import type { BlockTag } from '@/api/types'

interface Props {
  tags: BlockTag[]
  editable?: boolean
}

withDefaults(defineProps<Props>(), {
  editable: true,
})

const emit = defineEmits<{
  (e: 'edit'): void
}>()
</script>

<template>
  <div class="page-tags-bar" @click="editable && emit('edit')">
    <template v-if="tags.length > 0">
      <span
        v-for="tag in tags"
        :key="tag.id"
        class="tag-chip tag-chip--readonly"
        :style="{ '--tag-chip-color': tag.color || '#1677ff' }"
      >
        {{ tag.label }}
      </span>
    </template>
    <button
      v-if="editable"
      type="button"
      class="page-tags-bar__add"
      @click.stop="emit('edit')"
    >
      {{ tags.length > 0 ? '+ 标签' : '+ 添加标签' }}
    </button>
  </div>
</template>

<style scoped>
.page-tags-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-height: 28px;
  cursor: default;
}

.page-tags-bar__add {
  border: 1px dashed #d9d9d9;
  border-radius: 999px;
  background: transparent;
  color: #8c8c8c;
  font-size: 12px;
  line-height: 1.4;
  padding: 4px 10px;
  cursor: pointer;
}

.page-tags-bar__add:hover {
  border-color: #1677ff;
  color: #1677ff;
}

.tag-chip {
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
}

.tag-chip--readonly {
  pointer-events: none;
}
</style>

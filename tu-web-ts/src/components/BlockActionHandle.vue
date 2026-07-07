<script setup lang="ts">
import HoverHandle from './HoverHandle.vue';
import type { CSSProperties } from 'vue';

export interface BlockActionHandleItem {
  key: string;
  label?: string;
  icon?: string;
  danger?: boolean;
  divider?: boolean;
}

interface Props {
  items: BlockActionHandleItem[];
  mode?: 'block' | 'richtext-line';
  positionStyle: CSSProperties;
  dragEnabled?: boolean;
  visible?: boolean;
}

withDefaults(defineProps<Props>(), {
  mode: 'block',
  dragEnabled: true,
  visible: true,
});

const emit = defineEmits<{
  (e: 'select', action: string): void;
  (e: 'menu-visibility-change', visible: boolean): void;
}>();
</script>

<template>
  <HoverHandle
    class="block-action-handle block-handle"
    :class="{
      'block-action-handle--line': mode === 'richtext-line',
    }"
    :style="positionStyle"
    :items="items"
    :drag-cursor="dragEnabled"
    :prevent-mouse-down="mode === 'richtext-line'"
    :visible="visible"
    @select="(action) => emit('select', action)"
    @menu-visibility-change="(value: boolean) => emit('menu-visibility-change', value)"
  />
</template>

<style scoped>
.block-action-handle--line {
  --hover-handle-item-hover-bg: #f5f5f5;
  --hover-handle-item-hover-color: #333;
}
</style>

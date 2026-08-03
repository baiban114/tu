<script setup lang="ts">
/**
 * @deprecated Use X6CellContentPanel — thin alias for backward compatibility.
 */
import X6CellContentPanel from './X6CellContentPanel.vue'
import type { CellContentBinding } from '@/utils/cellContent'

defineProps<{
  edgeId: string
  binding: CellContentBinding
  editable?: boolean
  pages?: import('@/api/types').PageItem[]
  currentPageId?: string | null
}>()

defineEmits<{
  'update:binding': [binding: CellContentBinding]
}>()
</script>

<template>
  <X6CellContentPanel
    :cell-id="edgeId"
    cell-kind="edge"
    :binding="binding"
    :editable="editable"
    :pages="pages"
    :current-page-id="currentPageId"
    @update:binding="$emit('update:binding', $event)"
  />
</template>

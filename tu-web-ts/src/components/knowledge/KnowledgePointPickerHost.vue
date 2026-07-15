<script setup lang="ts">
import KnowledgePointPickerDialog from '@/components/knowledge/KnowledgePointPickerDialog.vue';
import {
  cancelKnowledgePointPicker,
  knowledgePointPickerState,
  resolveKnowledgePointPicker,
} from '@/utils/knowledgePointPicker';
</script>

<template>
  <KnowledgePointPickerDialog
    v-model:visible="knowledgePointPickerState.visible"
    :kb-id="knowledgePointPickerState.kbId"
    :title="knowledgePointPickerState.title"
    :selected-id="knowledgePointPickerState.selectedId"
    :confirm-text="knowledgePointPickerState.confirmText"
    :hint="knowledgePointPickerState.hint"
    :allow-manage="knowledgePointPickerState.allowManage"
    @select="resolveKnowledgePointPicker"
    @cancel="cancelKnowledgePointPicker"
  />
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { ElButton, ElDialog } from 'element-plus';
import type { KnowledgePoint } from '@/api/types';
import KnowledgePointPickerPanel from '@/components/knowledge/KnowledgePointPickerPanel.vue';

const props = withDefaults(defineProps<{
  visible: boolean;
  kbId: string;
  selectedId?: string | null;
  title?: string;
  confirmText?: string;
  hint?: string;
  allowManage?: boolean;
  disabledPointIds?: string[];
}>(), {
  selectedId: null,
  title: '选择知识点',
  confirmText: '确定',
  hint: '单击节点选中；可在树内右键新建子知识点',
  allowManage: true,
  disabledPointIds: () => [],
});

const emit = defineEmits<{
  'update:visible': [value: boolean];
  select: [point: KnowledgePoint];
  cancel: [];
}>();

const panelRef = ref<InstanceType<typeof KnowledgePointPickerPanel> | null>(null);
const draftPointId = ref<string | null>(props.selectedId);
const draftPoint = ref<KnowledgePoint | null>(null);

function close() {
  emit('update:visible', false);
  emit('cancel');
}

function confirm() {
  const point = panelRef.value?.getDraftPoint() ?? draftPoint.value;
  if (!point) return;
  emit('select', point);
  emit('update:visible', false);
}

function onDraftSelect(point: KnowledgePoint) {
  draftPoint.value = point;
  draftPointId.value = point.id;
}

watch(
  () => props.visible,
  async (visible) => {
    if (!visible) return;
    draftPointId.value = props.selectedId ?? null;
    draftPoint.value = null;
    await nextTick();
    await panelRef.value?.initialize();
  },
);

watch(
  () => props.selectedId,
  (id) => {
    draftPointId.value = id ?? null;
  },
);
</script>

<template>
  <ElDialog
    :model-value="visible"
    :title="title"
    width="min(560px, calc(100vw - 48px))"
    class="tu-dialog-viewport knowledge-point-picker-dialog"
    destroy-on-close
    @update:model-value="(value: boolean) => { if (!value) close(); else emit('update:visible', value); }"
  >
    <KnowledgePointPickerPanel
      ref="panelRef"
      :kb-id="kbId"
      :selected-id="draftPointId"
      :hint="hint"
      :allow-manage="allowManage"
      :disabled-point-ids="disabledPointIds"
      @select="onDraftSelect"
      @update:selected-id="(id) => { draftPointId = id; }"
    />

    <template #footer>
      <ElButton @click="close">取消</ElButton>
      <ElButton type="primary" :disabled="!draftPoint" @click="confirm">{{ confirmText }}</ElButton>
    </template>
  </ElDialog>
</template>

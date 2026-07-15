<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import {
  ElButton,
  ElDialog,
  ElOption,
  ElSelect,
} from 'element-plus';
import type { KnowledgeAnchor, KnowledgePoint, RelationTypeDef } from '@/api/types';
import KnowledgePointPickerPanel from '@/components/knowledge/KnowledgePointPickerPanel.vue';
import { createKnowledgeRelation, listRelationTypes } from '@/api/knowledgeRelation';

const props = defineProps<{
  visible: boolean;
  kbId: string;
  sourceAnchor: KnowledgeAnchor | null;
}>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'created'): void;
}>();

const relationTypes = ref<RelationTypeDef[]>([]);
const selectedTypeKey = ref('case');
const selectedPoint = ref<KnowledgePoint | null>(null);
const selectedPointId = ref<string | null>(null);
const saving = ref(false);
const panelRef = ref<InstanceType<typeof KnowledgePointPickerPanel> | null>(null);

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}

function handleDialogKeydown(event: KeyboardEvent) {
  if (!props.visible) return;
  if (event.key !== 'F2') return;
  if (isTypingTarget(event.target)) return;
  if (!selectedPoint.value) return;
  event.preventDefault();
  panelRef.value?.startRename(selectedPoint.value);
}

watch(
  () => props.visible,
  async (visible) => {
    if (!visible) {
      selectedPoint.value = null;
      selectedPointId.value = null;
      selectedTypeKey.value = 'case';
      document.removeEventListener('keydown', handleDialogKeydown);
      return;
    }
    document.addEventListener('keydown', handleDialogKeydown);
    relationTypes.value = await listRelationTypes(props.kbId);
    if (!relationTypes.value.some((item) => item.typeKey === selectedTypeKey.value)) {
      selectedTypeKey.value = relationTypes.value[0]?.typeKey ?? 'case';
    }
    await nextTick();
    await panelRef.value?.initialize();
  },
);

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleDialogKeydown);
});

function onPointSelect(point: KnowledgePoint) {
  selectedPoint.value = point;
  selectedPointId.value = point.id;
}

function clearSelectedPoint() {
  selectedPoint.value = null;
  selectedPointId.value = null;
}

function close() {
  emit('update:visible', false);
}

async function handleSave() {
  if (!props.sourceAnchor || !selectedPoint.value || saving.value) return;
  saving.value = true;
  try {
    await createKnowledgeRelation(props.kbId, {
      relationTypeKey: selectedTypeKey.value,
      toPointId: selectedPoint.value.id,
      from: props.sourceAnchor,
    });
    emit('created');
    close();
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <ElDialog
    :model-value="visible"
    title="关联到知识点"
    width="min(560px, calc(100vw - 48px))"
    class="tu-dialog-viewport"
    destroy-on-close
    @update:model-value="(value: boolean) => emit('update:visible', value)"
  >
    <div class="kpp-body">
      <label class="kpp-field-label">关系类型</label>
      <ElSelect v-model="selectedTypeKey" class="kpp-select">
        <ElOption
          v-for="type in relationTypes"
          :key="type.typeKey"
          :label="type.label"
          :value="type.typeKey"
        />
      </ElSelect>

      <KnowledgePointPickerPanel
        ref="panelRef"
        :kb-id="kbId"
        :selected-id="selectedPointId"
        hint="选择要挂靠的知识点；可在树内右键新建子知识点"
        @select="onPointSelect"
        @update:selected-id="(id) => { selectedPointId = id; }"
      />

      <div v-if="selectedPoint" class="kpp-clear-row">
        <ElButton link type="primary" @click="clearSelectedPoint">清除已选知识点</ElButton>
      </div>
    </div>

    <template #footer>
      <ElButton @click="close">取消</ElButton>
      <ElButton
        type="primary"
        :disabled="!sourceAnchor || !selectedPoint"
        :loading="saving"
        @click="handleSave"
      >
        关联
      </ElButton>
    </template>
  </ElDialog>
</template>

<style scoped>
.kpp-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
}

.kpp-field-label {
  font-size: 12px;
  color: #8c8c8c;
}

.kpp-select {
  width: 100%;
}

.kpp-clear-row {
  display: flex;
  justify-content: flex-end;
}
</style>

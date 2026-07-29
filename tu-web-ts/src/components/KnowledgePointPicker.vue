<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import {
  ElButton,
  ElDialog,
  ElMessage,
  ElOption,
  ElSelect,
} from 'element-plus';
import type { KnowledgeAnchor, KnowledgePoint, RelationTypeDef } from '@/api/types';
import KnowledgePointPickerPanel from '@/components/knowledge/KnowledgePointPickerPanel.vue';
import {
  createKnowledgePoint,
  listKnowledgePointsByLocator,
} from '@/api/knowledgePoint';
import { createKnowledgeRelation, listRelationTypes } from '@/api/knowledgeRelation';
import { anchorLabel } from '@/utils/knowledgeAnchor';
import { normalizeKnowledgePointTitleFromContent } from '@/utils/knowledgePointTitle';

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
const pagePointIds = ref<string[]>([]);

const isPageLevelAssociate = computed(() => props.sourceAnchor?.kind === 'page');
const disabledPointIds = computed(() => (
  isPageLevelAssociate.value ? pagePointIds.value : []
));
const dialogTitle = computed(() => (
  isPageLevelAssociate.value ? '编辑前置' : '关联到知识点'
));
const confirmText = computed(() => (
  isPageLevelAssociate.value ? '保存' : '关联'
));
const panelHint = computed(() => (
  isPageLevelAssociate.value
    ? '选择作为本文档前置的知识点；可直接新建，或右键添加子知识点'
    : '选择要挂靠的知识点；可直接新建，或右键添加子知识点'
));

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

async function ensurePointForAnchor(anchor: KnowledgeAnchor): Promise<string> {
  const existing = await listKnowledgePointsByLocator(props.kbId, anchor.locator);
  if (existing[0]) return existing[0].id;
  const created = await createKnowledgePoint(props.kbId, {
    title: normalizeKnowledgePointTitleFromContent(anchorLabel(anchor)),
    sourceAnchor: anchor,
  });
  return created.id;
}

async function loadPagePointIds() {
  if (!props.sourceAnchor || props.sourceAnchor.kind !== 'page') {
    pagePointIds.value = [];
    return;
  }
  const points = await listKnowledgePointsByLocator(props.kbId, props.sourceAnchor.locator);
  pagePointIds.value = points.map((point) => point.id);
}

watch(
  () => props.visible,
  async (visible) => {
    if (!visible) {
      selectedPoint.value = null;
      selectedPointId.value = null;
      selectedTypeKey.value = 'case';
      pagePointIds.value = [];
      document.removeEventListener('keydown', handleDialogKeydown);
      return;
    }
    document.addEventListener('keydown', handleDialogKeydown);
    relationTypes.value = await listRelationTypes(props.kbId);
    selectedTypeKey.value = isPageLevelAssociate.value ? 'prerequisite' : 'case';
    if (!relationTypes.value.some((item) => item.typeKey === selectedTypeKey.value)) {
      selectedTypeKey.value = relationTypes.value[0]?.typeKey ?? selectedTypeKey.value;
    }
    await loadPagePointIds();
    await nextTick();
    await panelRef.value?.initialize();
  },
);

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleDialogKeydown);
});

function onPointSelect(point: KnowledgePoint) {
  if (disabledPointIds.value.includes(point.id)) return;
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
  if (disabledPointIds.value.includes(selectedPoint.value.id)) {
    ElMessage.warning('不能将文档自身知识点设为前置');
    return;
  }
  saving.value = true;
  try {
    if (isPageLevelAssociate.value) {
      const fromPointId = await ensurePointForAnchor(props.sourceAnchor);
      if (fromPointId === selectedPoint.value.id) {
        ElMessage.warning('不能将文档自身知识点设为前置');
        return;
      }
      await createKnowledgeRelation(props.kbId, {
        relationTypeKey: selectedTypeKey.value,
        fromPointId,
        toPointId: selectedPoint.value.id,
        from: props.sourceAnchor,
      });
    } else {
      await createKnowledgeRelation(props.kbId, {
        relationTypeKey: selectedTypeKey.value,
        toPointId: selectedPoint.value.id,
        from: props.sourceAnchor,
      });
    }
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
    :title="dialogTitle"
    width="min(560px, calc(100vw - 48px))"
    class="tu-dialog-viewport knowledge-point-picker-dialog"
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
        class="kpp-body__panel"
        :kb-id="kbId"
        :selected-id="selectedPointId"
        :hint="panelHint"
        :disabled-point-ids="disabledPointIds"
        @select="onPointSelect"
        @update:selected-id="(id) => { selectedPointId = id; }"
      />

      <div class="kpp-clear-row">
        <ElButton
          v-if="selectedPoint"
          link
          type="primary"
          @click="clearSelectedPoint"
        >
          清除已选知识点
        </ElButton>
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
        {{ confirmText }}
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
  height: 100%;
  box-sizing: border-box;
}

.kpp-field-label {
  flex-shrink: 0;
  font-size: 12px;
  color: #8c8c8c;
}

.kpp-select {
  flex-shrink: 0;
  width: 100%;
}

.kpp-body__panel {
  flex: 1;
  min-height: 0;
}

.kpp-clear-row {
  flex-shrink: 0;
  display: flex;
  justify-content: flex-end;
  min-height: 24px;
}
</style>

<style>
/* Align with resource-picker / other locator dialogs: fixed shell height. */
.knowledge-point-picker-dialog.tu-dialog-viewport {
  height: min(640px, calc(100dvh - 32px));
  max-height: calc(100dvh - 32px);
}

.knowledge-point-picker-dialog.el-dialog .el-dialog__body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
</style>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import {
  ElButton,
  ElDialog,
  ElInput,
  ElOption,
  ElPagination,
  ElSelect,
  ElTabPane,
  ElTabs,
} from 'element-plus';
import type { KnowledgeAnchor, KnowledgePoint, RelationTypeDef } from '@/api/types';
import KnowledgePointTree from '@/components/knowledge/KnowledgePointTree.vue';
import { DEFAULT_PAGE_SIZE } from '@/constants/pagination';
import { createKnowledgeRelation, listRelationTypes } from '@/api/knowledgeRelation';
import { getKnowledgePointTree, listKnowledgePoints } from '@/api/knowledgePoint';

const props = defineProps<{
  visible: boolean;
  kbId: string;
  sourceAnchor: KnowledgeAnchor | null;
}>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'created'): void;
}>();

const activeTab = ref('tree');
const relationTypes = ref<RelationTypeDef[]>([]);
const selectedTypeKey = ref('case');
const selectedPoint = ref<KnowledgePoint | null>(null);
const selectedPointId = ref<string | null>(null);
const saving = ref(false);
const treeLoading = ref(false);

const pointTree = ref<KnowledgePoint[]>([]);
const pointTreeRef = ref<InstanceType<typeof KnowledgePointTree> | null>(null);
const searchKeyword = ref('');
const searchPage = ref(0);
const searchTotal = ref(0);
const searchItems = ref<KnowledgePoint[]>([]);

async function refreshPointTree() {
  treeLoading.value = true;
  try {
    pointTree.value = await getKnowledgePointTree(props.kbId);
  } finally {
    treeLoading.value = false;
  }
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}

function handleDialogKeydown(event: KeyboardEvent) {
  if (!props.visible || activeTab.value !== 'tree') return;
  if (event.key !== 'F2') return;
  if (isTypingTarget(event.target)) return;
  if (!selectedPoint.value) return;
  event.preventDefault();
  pointTreeRef.value?.startRename(selectedPoint.value);
}

watch(
  () => props.visible,
  async (visible) => {
    if (!visible) {
      selectedPoint.value = null;
      selectedPointId.value = null;
      selectedTypeKey.value = 'case';
      activeTab.value = 'tree';
      searchKeyword.value = '';
      searchPage.value = 0;
      document.removeEventListener('keydown', handleDialogKeydown);
      return;
    }
    document.addEventListener('keydown', handleDialogKeydown);
    relationTypes.value = await listRelationTypes(props.kbId);
    if (!relationTypes.value.some((item) => item.typeKey === selectedTypeKey.value)) {
      selectedTypeKey.value = relationTypes.value[0]?.typeKey ?? 'case';
    }
    await refreshPointTree();
    await loadSearch();
  },
);

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleDialogKeydown);
});

async function loadSearch() {
  const result = await listKnowledgePoints(props.kbId, {
    q: searchKeyword.value.trim() || undefined,
    page: searchPage.value,
    pageSize: DEFAULT_PAGE_SIZE,
  });
  searchItems.value = result.items;
  searchTotal.value = result.total;
}

function onTreeSelect(point: KnowledgePoint) {
  selectedPoint.value = point;
  selectedPointId.value = point.id;
}

async function onTreeUpdated() {
  await loadSearch();
  if (selectedPointId.value) {
    const findInTree = (nodes: KnowledgePoint[]): KnowledgePoint | null => {
      for (const node of nodes) {
        if (node.id === selectedPointId.value) return node;
        if (node.children?.length) {
          const found = findInTree(node.children);
          if (found) return found;
        }
      }
      return null;
    };
    const refreshed = findInTree(pointTree.value);
    if (refreshed) selectedPoint.value = refreshed;
  }
}

function selectSearchItem(item: KnowledgePoint) {
  selectedPoint.value = item;
  selectedPointId.value = item.id;
  activeTab.value = 'tree';
  pointTreeRef.value?.setCurrentKey(item.id);
}

function findMatchingAlias(point: KnowledgePoint, query: string): string | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  if (point.title.toLowerCase().includes(q)) return null;
  return (point.aliases ?? []).find((alias) => alias.toLowerCase().includes(q)) ?? null;
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

async function onSearchPageChange(page: number) {
  searchPage.value = Math.max(0, page - 1);
  await loadSearch();
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
      <div class="kpp-selected">
        <span class="kpp-label">知识点</span>
        <div class="kpp-selected__row">
          <span class="kpp-value">{{ selectedPoint?.title ?? '未选择' }}</span>
          <ElButton
            v-if="selectedPoint"
            link
            type="primary"
            @click="selectedPoint = null; selectedPointId = null"
          >
            清除
          </ElButton>
        </div>
      </div>

      <label class="kpp-field-label">关系类型</label>
      <ElSelect v-model="selectedTypeKey" class="kpp-select">
        <ElOption
          v-for="type in relationTypes"
          :key="type.typeKey"
          :label="type.label"
          :value="type.typeKey"
        />
      </ElSelect>

      <ElTabs v-model="activeTab" class="kpp-tabs">
        <ElTabPane label="知识点树" name="tree">
          <div class="kpp-scroll" tabindex="-1" @keydown.stop>
            <KnowledgePointTree
              ref="pointTreeRef"
              :kb-id="kbId"
              :tree="pointTree"
              :selected-id="selectedPointId"
              :loading="treeLoading"
              mode="pick"
              :draggable="false"
              :on-refresh="refreshPointTree"
              toolbar-hint="选择要挂靠的知识点"
              @select="onTreeSelect"
              @updated="onTreeUpdated"
              @update:selected-id="(id) => { selectedPointId = id; }"
            />
          </div>
        </ElTabPane>
        <ElTabPane label="搜索" name="search">
          <div class="kpp-search-bar">
            <ElInput
              v-model="searchKeyword"
              clearable
              placeholder="搜索知识点"
              @change="searchPage = 0; loadSearch()"
              @clear="searchPage = 0; loadSearch()"
            />
          </div>
          <div class="kpp-scroll">
            <button
              v-for="item in searchItems"
              :key="item.id"
              type="button"
              class="kpp-list-item"
              :class="{ 'kpp-list-item--active': selectedPoint?.id === item.id }"
              @click="selectSearchItem(item)"
            >
              <span class="kpp-list-item__title">{{ item.title }}</span>
              <span
                v-if="findMatchingAlias(item, searchKeyword)"
                class="kpp-list-item__alias"
              >
                {{ findMatchingAlias(item, searchKeyword) }}
              </span>
            </button>
          </div>
          <ElPagination
            v-if="searchTotal > DEFAULT_PAGE_SIZE"
            small
            layout="prev, pager, next"
            :total="searchTotal"
            :page-size="DEFAULT_PAGE_SIZE"
            :current-page="searchPage + 1"
            @current-change="onSearchPageChange"
          />
        </ElTabPane>
      </ElTabs>
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

.kpp-selected {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.kpp-selected__row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.kpp-label {
  color: #8c8c8c;
  font-size: 12px;
}

.kpp-value {
  color: #1f1f1f;
  word-break: break-word;
}

.kpp-field-label {
  font-size: 12px;
  color: #8c8c8c;
}

.kpp-select {
  width: 100%;
}

.kpp-scroll {
  max-height: min(40vh, 280px);
  overflow: auto;
  border: 1px solid #f0f0f0;
  border-radius: 8px;
  padding: 8px;
  outline: none;
}

.kpp-list-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  border: none;
  background: transparent;
  text-align: left;
  padding: 8px;
  border-radius: 6px;
  cursor: pointer;
}

.kpp-list-item__title {
  font-size: 13px;
  color: #1f1f1f;
}

.kpp-list-item__alias {
  font-size: 12px;
  color: #8c8c8c;
}

.kpp-list-item:hover,
.kpp-list-item--active {
  background: #f0f5ff;
}

.kpp-search-bar {
  margin-bottom: 8px;
}
</style>

<script setup lang="ts">
import { ref, watch } from 'vue';
import {
  ElInput,
  ElPagination,
  ElTabPane,
  ElTabs,
} from 'element-plus';
import type { KnowledgePoint } from '@/api/types';
import KnowledgePointTree from '@/components/knowledge/KnowledgePointTree.vue';
import { DEFAULT_PAGE_SIZE } from '@/constants/pagination';
import { getKnowledgePointTree, listKnowledgePoints } from '@/api/knowledgePoint';

const props = withDefaults(defineProps<{
  kbId: string;
  selectedId?: string | null;
  hint?: string;
  allowManage?: boolean;
  disabledPointIds?: string[];
}>(), {
  selectedId: null,
  hint: '单击节点选中；可在树内右键新建子知识点',
  allowManage: true,
  disabledPointIds: () => [],
});

const emit = defineEmits<{
  'update:selectedId': [id: string | null];
  select: [point: KnowledgePoint];
  updated: [];
}>();

const activeTab = ref('tree');
const draftPoint = ref<KnowledgePoint | null>(null);
const draftPointId = ref<string | null>(props.selectedId);
const treeLoading = ref(false);
const pointTree = ref<KnowledgePoint[]>([]);
const pointTreeRef = ref<InstanceType<typeof KnowledgePointTree> | null>(null);
const searchKeyword = ref('');
const searchPage = ref(0);
const searchTotal = ref(0);
const searchItems = ref<KnowledgePoint[]>([]);

function findInTree(nodes: KnowledgePoint[], id: string): KnowledgePoint | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children?.length) {
      const found = findInTree(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

function emitDraft(point: KnowledgePoint | null) {
  draftPoint.value = point;
  draftPointId.value = point?.id ?? null;
  emit('update:selectedId', draftPointId.value);
  if (point) emit('select', point);
}

async function refreshPointTree() {
  treeLoading.value = true;
  try {
    pointTree.value = await getKnowledgePointTree(props.kbId);
  } finally {
    treeLoading.value = false;
  }
}

async function loadSearch() {
  const result = await listKnowledgePoints(props.kbId, {
    q: searchKeyword.value.trim() || undefined,
    page: searchPage.value,
    pageSize: DEFAULT_PAGE_SIZE,
  });
  searchItems.value = result.items;
  searchTotal.value = result.total;
}

function syncDraftFromSelectedId() {
  if (!props.selectedId) {
    emitDraft(null);
    return;
  }
  const found = findInTree(pointTree.value, props.selectedId);
  if (found) {
    emitDraft(found);
    pointTreeRef.value?.setCurrentKey(found.id);
  }
}

function onTreeSelect(point: KnowledgePoint) {
  if (props.disabledPointIds.includes(point.id)) return;
  emitDraft(point);
}

function selectSearchItem(item: KnowledgePoint) {
  if (props.disabledPointIds.includes(item.id)) return;
  emitDraft(item);
  activeTab.value = 'tree';
  pointTreeRef.value?.setCurrentKey(item.id);
}

function findMatchingAlias(point: KnowledgePoint, query: string): string | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  if (point.title.toLowerCase().includes(q)) return null;
  return (point.aliases ?? []).find((alias) => alias.toLowerCase().includes(q)) ?? null;
}

async function onSearchPageChange(page: number) {
  searchPage.value = Math.max(0, page - 1);
  await loadSearch();
}

async function onTreeUpdated() {
  await loadSearch();
  if (draftPointId.value) {
    const refreshed = findInTree(pointTree.value, draftPointId.value);
    if (refreshed) emitDraft(refreshed);
  }
  emit('updated');
}

async function initialize() {
  activeTab.value = 'tree';
  searchKeyword.value = '';
  searchPage.value = 0;
  await refreshPointTree();
  syncDraftFromSelectedId();
  await loadSearch();
}

watch(
  () => props.kbId,
  () => {
    void initialize();
  },
  { immediate: true },
);

watch(
  () => props.selectedId,
  (id) => {
    if (id === draftPointId.value) return;
    if (!id) {
      emitDraft(null);
      return;
    }
    const found = findInTree(pointTree.value, id);
    if (found) emitDraft(found);
  },
);

defineExpose({
  getDraftPoint: () => draftPoint.value,
  initialize,
  refreshPointTree,
  startRename: (point: KnowledgePoint) => pointTreeRef.value?.startRename(point),
});
</script>

<template>
  <div class="kpp-panel">
    <div class="kpp-panel__selected">
      <span class="kpp-panel__label">当前选择</span>
      <span class="kpp-panel__value">{{ draftPoint?.title ?? '未选择' }}</span>
    </div>

    <ElTabs v-model="activeTab" class="kpp-panel__tabs">
      <ElTabPane label="知识点树" name="tree">
        <div class="kpp-panel__scroll" tabindex="-1" @keydown.stop>
          <KnowledgePointTree
            ref="pointTreeRef"
            :kb-id="kbId"
            :tree="pointTree"
            :selected-id="draftPointId"
            :loading="treeLoading"
            mode="pick"
            :draggable="false"
            :show-toolbar="allowManage"
            :on-refresh="refreshPointTree"
            :toolbar-hint="hint"
            :disabled-point-ids="disabledPointIds"
            @select="onTreeSelect"
            @updated="onTreeUpdated"
            @update:selected-id="(id) => { draftPointId = id; emit('update:selectedId', id); }"
          />
        </div>
      </ElTabPane>
      <ElTabPane label="搜索" name="search">
        <div class="kpp-panel__search-bar">
          <ElInput
            v-model="searchKeyword"
            clearable
            placeholder="搜索知识点或别名"
            @change="searchPage = 0; loadSearch()"
            @clear="searchPage = 0; loadSearch()"
          />
        </div>
        <div class="kpp-panel__scroll">
          <button
            v-for="item in searchItems"
            :key="item.id"
            type="button"
            class="kpp-panel__list-item"
            :class="{
              'kpp-panel__list-item--active': draftPoint?.id === item.id,
              'kpp-panel__list-item--disabled': disabledPointIds.includes(item.id),
            }"
            :disabled="disabledPointIds.includes(item.id)"
            @click="selectSearchItem(item)"
          >
            <span class="kpp-panel__list-item-title">{{ item.title }}</span>
            <span
              v-if="findMatchingAlias(item, searchKeyword)"
              class="kpp-panel__list-item-alias"
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
</template>

<style scoped>
.kpp-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
}

.kpp-panel__selected {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.kpp-panel__label {
  color: #8c8c8c;
  font-size: 12px;
}

.kpp-panel__value {
  color: #1f1f1f;
  word-break: break-word;
}

.kpp-panel__tabs {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.kpp-panel__tabs :deep(.el-tabs__content) {
  flex: 1;
  min-height: 0;
}

.kpp-panel__tabs :deep(.el-tab-pane) {
  height: 100%;
}

.kpp-panel__scroll {
  flex: 1;
  min-height: 0;
  max-height: min(52vh, 420px);
  overflow: auto;
  border: 1px solid #f0f0f0;
  border-radius: 8px;
  padding: 8px;
}

.kpp-panel__search-bar {
  margin-bottom: 8px;
}

.kpp-panel__list-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
  border: none;
  background: #fafafa;
  border-radius: 6px;
  padding: 8px 10px;
  margin-bottom: 6px;
  text-align: left;
  cursor: pointer;
}

.kpp-panel__list-item--active {
  background: #e6f4ff;
}

.kpp-panel__list-item--disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.kpp-panel__list-item-title {
  font-size: 13px;
  color: #1f1f1f;
}

.kpp-panel__list-item-alias {
  font-size: 12px;
  color: #8c8c8c;
}
</style>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  ElButton,
  ElCard,
  ElInput,
  ElMessage,
  ElTag,
} from 'element-plus';
import type { KnowledgeAnchor, KnowledgeGraphMode, KnowledgePoint, KnowledgePointAlias, KnowledgePointAnchor, KnowledgeRelation } from '@/api/types';
import KnowledgePointTree from '@/components/knowledge/KnowledgePointTree.vue';
import KnowledgePointGenerateDialog from '@/components/knowledge/KnowledgePointGenerateDialog.vue';
import {
  addKnowledgePointAlias,
  deleteKnowledgePointAlias,
  getKnowledgePointTree,
  listKnowledgePointAliases,
  listKnowledgePointAnchors,
} from '@/api/knowledgePoint';
import { listKnowledgeRelationsByPoint } from '@/api/knowledgeRelation';
import {
  anchorLabel,
  navigateKnowledgeAnchor,
  navigateKnowledgePoint,
  relationEndpointLabel,
} from '@/utils/knowledgeAnchor';
import { useWorkspaceStore } from '@/stores/workspace';
import { flattenKnowledgePoints } from '@/utils/tree/drag';

const props = defineProps<{
  kbId: string;
}>();

const router = useRouter();
const workspaceStore = useWorkspaceStore();

const pointTree = ref<KnowledgePoint[]>([]);
const treeLoading = ref(false);
const keyword = ref('');
const selectedPointId = ref<string | null>(null);
const selectedPointIds = ref<string[]>([]);
const selectedPoint = ref<KnowledgePoint | null>(null);
const anchors = ref<KnowledgePointAnchor[]>([]);
const relationsLoading = ref(false);
const outgoing = ref<KnowledgeRelation[]>([]);
const incoming = ref<KnowledgeRelation[]>([]);
const generateDialogVisible = ref(false);
const aliases = ref<KnowledgePointAlias[]>([]);
const newAlias = ref('');
const addingAlias = ref(false);

const navigateHandlers = computed(() => ({
  router,
  selectPage: async (pageId: string) => {
    await router.push({ path: '/', query: { pageId } });
  },
  currentPageId: workspaceStore.currentPageId,
}));

const hasMultiSelection = computed(() => selectedPointIds.value.length > 1);

const selectedPoints = computed(() => {
  const idSet = new Set(selectedPointIds.value);
  return flattenKnowledgePoints(pointTree.value).filter((item) => idSet.has(item.id));
});

async function refreshTree() {
  treeLoading.value = true;
  try {
    pointTree.value = await getKnowledgePointTree(props.kbId);
    if (selectedPointId.value) {
      const flat = findPointInTree(pointTree.value, selectedPointId.value);
      if (flat) {
        selectedPoint.value = flat;
      } else {
        selectedPointId.value = null;
        selectedPoint.value = null;
      }
    }
    selectedPointIds.value = selectedPointIds.value.filter((id) => Boolean(findPointInTree(pointTree.value, id)));
    if (!selectedPointIds.value.length) {
      selectedPointId.value = null;
      selectedPoint.value = null;
    } else if (selectedPointId.value && !selectedPointIds.value.includes(selectedPointId.value)) {
      selectedPointId.value = selectedPointIds.value[selectedPointIds.value.length - 1] ?? null;
      const fallback = selectedPointId.value ? findPointInTree(pointTree.value, selectedPointId.value) : null;
      selectedPoint.value = fallback;
    }
  } finally {
    treeLoading.value = false;
  }
}

function findPointInTree(nodes: KnowledgePoint[], id: string): KnowledgePoint | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children?.length) {
      const found = findPointInTree(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

async function refreshDetail(point: KnowledgePoint) {
  selectedPointId.value = point.id;
  selectedPoint.value = point;
  relationsLoading.value = true;
  try {
    anchors.value = await listKnowledgePointAnchors(point.id);
    aliases.value = await listKnowledgePointAliases(point.id);
    const relations = await listKnowledgeRelationsByPoint(props.kbId, point.id);
    outgoing.value = relations.outgoing;
    incoming.value = relations.incoming;
  } finally {
    relationsLoading.value = false;
  }
}

watch(
  () => props.kbId,
  () => {
    selectedPointId.value = null;
    selectedPointIds.value = [];
    selectedPoint.value = null;
    void refreshTree();
  },
  { immediate: true },
);

function onTreeSelect(point: KnowledgePoint) {
  void refreshDetail(point);
}

function onSelectedIdChange(id: string | null) {
  selectedPointId.value = id;
  if (!id) {
    selectedPoint.value = null;
    anchors.value = [];
    aliases.value = [];
    outgoing.value = [];
    incoming.value = [];
    return;
  }
  const point = findPointInTree(pointTree.value, id);
  if (point) void refreshDetail(point);
}

function clearSelection() {
  selectedPointIds.value = [];
  onSelectedIdChange(null);
}

function onNavigateAnchor(anchor: KnowledgeAnchor) {
  void navigateKnowledgeAnchor(anchor, navigateHandlers.value);
}

function onNavigatePoint(pointId: string) {
  void navigateKnowledgePoint(pointId, navigateHandlers.value);
}

function openInKnowledgeGraph(mode: KnowledgeGraphMode = 'centered') {
  if (!selectedPoint.value) return;
  void router.push({
    path: '/resources',
    query: {
      tab: 'knowledgeGraph',
      centerPointId: selectedPoint.value.id,
      graphMode: mode,
    },
  });
}

function openGenerateDialog() {
  generateDialogVisible.value = true;
}

async function onGenerateCompleted() {
  await refreshTree();
  if (selectedPointId.value) {
    const refreshed = findPointInTree(pointTree.value, selectedPointId.value);
    if (refreshed) await refreshDetail(refreshed);
  }
}

async function handleAddAlias() {
  const alias = newAlias.value.trim();
  if (!selectedPoint.value || !alias || addingAlias.value) return;
  addingAlias.value = true;
  try {
    await addKnowledgePointAlias(selectedPoint.value.id, alias);
    newAlias.value = '';
    aliases.value = await listKnowledgePointAliases(selectedPoint.value.id);
    await refreshTree();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '添加别名失败');
  } finally {
    addingAlias.value = false;
  }
}

async function handleDeleteAlias(alias: KnowledgePointAlias) {
  if (!selectedPoint.value) return;
  await deleteKnowledgePointAlias(alias.id);
  aliases.value = aliases.value.filter((item) => item.id !== alias.id);
  await refreshTree();
}

async function onTreeUpdated() {
  if (!selectedPointId.value) {
    selectedPoint.value = null;
    return;
  }
  const refreshed = findPointInTree(pointTree.value, selectedPointId.value);
  if (refreshed) {
    await refreshDetail(refreshed);
  } else {
    selectedPointId.value = null;
    selectedPoint.value = null;
    anchors.value = [];
    aliases.value = [];
    outgoing.value = [];
    incoming.value = [];
  }
}
</script>

<template>
  <section class="kpm-layout">
    <div class="kpm-tree-panel">
      <div class="kpm-toolbar">
        <ElInput
          v-model="keyword"
          clearable
          placeholder="筛选分类树"
          style="max-width: 220px"
        />
        <ElButton @click="refreshTree">刷新</ElButton>
        <ElButton @click="openGenerateDialog">从定位系统生成…</ElButton>
      </div>
      <div class="kpm-tree-body">
        <KnowledgePointTree
          :kb-id="kbId"
          :tree="pointTree"
          :selected-id="selectedPointId"
          :selected-ids="selectedPointIds"
          :loading="treeLoading"
          mode="manage"
          :filter-keyword="keyword"
          :on-refresh="refreshTree"
          toolbar-hint="拖到节点上/下边线调整顺序；拖到父节点行可提升为同级；或右键「提升为同级节点」"
          @select="onTreeSelect"
          @updated="onTreeUpdated"
          @update:selected-id="onSelectedIdChange"
          @update:selected-ids="(ids) => { selectedPointIds = ids; }"
        />
      </div>
    </div>

    <div class="kpm-detail-panel">
      <ElCard v-if="hasMultiSelection" shadow="never" class="kpm-detail">
        <template #header>
          <div class="kpm-detail__header">
            <span>已选 {{ selectedPointIds.length }} 个知识点</span>
            <ElButton size="small" plain @click="clearSelection">清除选择</ElButton>
          </div>
        </template>
        <ul class="kpm-multi-list">
          <li v-for="point in selectedPoints" :key="point.id">{{ point.title }}</li>
        </ul>
        <p class="kpm-multi-hint">单选节点可查看详情；右键仍对单个节点操作。</p>
      </ElCard>
      <ElCard v-else-if="selectedPoint" v-loading="relationsLoading" shadow="never" class="kpm-detail">
        <template #header>
          <div class="kpm-detail__header">
            <span>{{ selectedPoint.title }}</span>
            <div class="kpm-detail__header-actions">
              <ElButton size="small" @click="openInKnowledgeGraph('centered')">在图谱中查看</ElButton>
              <ElButton size="small" @click="openInKnowledgeGraph('prerequisite')">前置子图</ElButton>
            </div>
          </div>
        </template>
        <p v-if="selectedPoint.summary" class="kpm-detail__summary">{{ selectedPoint.summary }}</p>

        <div class="kpm-section">
          <div class="kpm-section__title">别名</div>
          <div v-if="aliases.length" class="kpm-alias-chips">
            <ElTag
              v-for="alias in aliases"
              :key="alias.id"
              closable
              @close="handleDeleteAlias(alias)"
            >
              {{ alias.alias }}
            </ElTag>
          </div>
          <div class="kpm-alias-form">
            <ElInput
              v-model="newAlias"
              placeholder="添加别名"
              @keyup.enter="handleAddAlias"
            />
            <ElButton
              type="primary"
              :loading="addingAlias"
              :disabled="!newAlias.trim()"
              @click="handleAddAlias"
            >
              添加
            </ElButton>
          </div>
        </div>

        <div v-if="anchors.length" class="kpm-section">
          <div class="kpm-section__title">证据</div>
          <button
            v-for="anchor in anchors"
            :key="anchor.id"
            type="button"
            class="kpm-link"
            @click="onNavigateAnchor({ kind: anchor.kind, locator: anchor.locator, snapshot: anchor.snapshot })"
          >
            {{ anchorLabel({ kind: anchor.kind, locator: anchor.locator, snapshot: anchor.snapshot }) }}
          </button>
        </div>

        <div v-if="outgoing.length" class="kpm-section">
          <div class="kpm-section__title">关联到</div>
          <button
            v-for="relation in outgoing"
            :key="relation.id"
            type="button"
            class="kpm-link"
            @click="relation.toPointId && onNavigatePoint(relation.toPointId)"
          >
            {{ relation.relationTypeLabel }} · {{ relationEndpointLabel(relation, 'out') }}
          </button>
        </div>

        <div v-if="incoming.length" class="kpm-section">
          <div class="kpm-section__title">被关联</div>
          <button
            v-for="relation in incoming"
            :key="relation.id"
            type="button"
            class="kpm-link"
            @click="relation.fromPointId && onNavigatePoint(relation.fromPointId)"
          >
            {{ relation.relationTypeLabel }} · {{ relationEndpointLabel(relation, 'in') }}
          </button>
        </div>
      </ElCard>
      <div v-else class="kpm-empty-detail">
        在左侧分类树中选择知识点（Ctrl+点击可多选），或右键新建
      </div>
    </div>

    <KnowledgePointGenerateDialog
      v-model:visible="generateDialogVisible"
      :kb-id="kbId"
      :current-page-id="workspaceStore.currentPageId"
      @completed="onGenerateCompleted"
    />
  </section>
</template>

<style scoped>
.kpm-layout {
  display: grid;
  grid-template-columns: minmax(320px, 1fr) minmax(280px, 1fr);
  gap: 16px;
  min-height: min(70vh, 640px);
}

.kpm-tree-panel,
.kpm-detail-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border: 1px solid #f0f0f0;
  border-radius: 8px;
  background: #fff;
  padding: 12px;
}

.kpm-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 12px;
  flex-shrink: 0;
}

.kpm-tree-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.kpm-detail {
  flex: 1;
  min-height: 0;
  overflow: auto;
  border: none;
}

.kpm-detail__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.kpm-detail__header-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.kpm-detail__summary {
  margin: 0 0 12px;
  color: #595959;
  font-size: 13px;
}

.kpm-section + .kpm-section {
  margin-top: 12px;
}

.kpm-section__title {
  font-size: 12px;
  color: #8c8c8c;
  margin-bottom: 6px;
}

.kpm-alias-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

.kpm-alias-form {
  display: flex;
  gap: 8px;
  align-items: center;
}

.kpm-link {
  display: block;
  width: 100%;
  border: none;
  background: #fafafa;
  border-radius: 6px;
  padding: 6px 8px;
  margin-bottom: 4px;
  text-align: left;
  cursor: pointer;
  font-size: 12px;
  color: #1677ff;
}

.kpm-link:hover {
  background: #f0f5ff;
}

.kpm-empty-detail {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #8c8c8c;
  font-size: 13px;
  padding: 24px;
  text-align: center;
}

.kpm-multi-list {
  margin: 0;
  padding-left: 18px;
  color: #434343;
  font-size: 13px;
  line-height: 1.7;
}

.kpm-multi-hint {
  margin: 12px 0 0;
  font-size: 12px;
  color: #8c8c8c;
}
</style>

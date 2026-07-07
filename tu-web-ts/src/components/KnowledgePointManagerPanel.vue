<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  ElButton,
  ElCard,
  ElCheckbox,
  ElDialog,
  ElInput,
  ElMessage,
  ElTag,
} from 'element-plus';
import type { KnowledgeAnchor, KnowledgePoint, KnowledgePointAlias, KnowledgePointAnchor, KnowledgeRelation } from '@/api/types';
import KnowledgePointTree from '@/components/knowledge/KnowledgePointTree.vue';
import {
  addKnowledgePointAlias,
  deleteKnowledgePointAlias,
  generateKnowledgePoints,
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

const props = defineProps<{
  kbId: string;
}>();

const router = useRouter();
const workspaceStore = useWorkspaceStore();

const pointTree = ref<KnowledgePoint[]>([]);
const treeLoading = ref(false);
const keyword = ref('');
const selectedPointId = ref<string | null>(null);
const selectedPoint = ref<KnowledgePoint | null>(null);
const anchors = ref<KnowledgePointAnchor[]>([]);
const relationsLoading = ref(false);
const outgoing = ref<KnowledgeRelation[]>([]);
const incoming = ref<KnowledgeRelation[]>([]);
const generateDialogVisible = ref(false);
const generatePageTree = ref(true);
const generateDocumentHeadings = ref(true);
const generating = ref(false);
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
    selectedPoint.value = null;
    void refreshTree();
  },
  { immediate: true },
);

function onTreeSelect(point: KnowledgePoint) {
  void refreshDetail(point);
}

function onNavigateAnchor(anchor: KnowledgeAnchor) {
  void navigateKnowledgeAnchor(anchor, navigateHandlers.value);
}

function onNavigatePoint(pointId: string) {
  void navigateKnowledgePoint(pointId, navigateHandlers.value);
}

function openGenerateDialog() {
  generatePageTree.value = true;
  generateDocumentHeadings.value = true;
  generateDialogVisible.value = true;
}

async function handleGenerate() {
  const sources: string[] = [];
  if (generatePageTree.value) sources.push('pageTree');
  if (generateDocumentHeadings.value) sources.push('documentHeadings');
  if (!sources.length || generating.value) return;

  const pageIds = workspaceStore.currentPageId ? [workspaceStore.currentPageId] : undefined;
  generating.value = true;
  try {
    const result = await generateKnowledgePoints(props.kbId, { sources, pageIds });
    generateDialogVisible.value = false;
    ElMessage.success(`生成完成：新建 ${result.created}，跳过 ${result.skipped}，失败 ${result.failed}`);
    await refreshTree();
    if (selectedPointId.value) {
      const refreshed = findPointInTree(pointTree.value, selectedPointId.value);
      if (refreshed) await refreshDetail(refreshed);
    }
  } finally {
    generating.value = false;
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
        <ElButton @click="openGenerateDialog">从结构生成…</ElButton>
      </div>
      <div class="kpm-tree-body">
        <KnowledgePointTree
          :kb-id="kbId"
          :tree="pointTree"
          :selected-id="selectedPointId"
          :loading="treeLoading"
          mode="manage"
          :filter-keyword="keyword"
          :on-refresh="refreshTree"
          toolbar-hint="拖到节点上/下边线调整顺序；拖到父节点行可提升为同级；或右键「提升为同级节点」"
          @select="onTreeSelect"
          @updated="onTreeUpdated"
          @update:selected-id="(id) => { selectedPointId = id; }"
        />
      </div>
    </div>

    <div class="kpm-detail-panel">
      <ElCard v-if="selectedPoint" v-loading="relationsLoading" shadow="never" class="kpm-detail">
        <template #header>
          <span>{{ selectedPoint.title }}</span>
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
        在左侧分类树中选择知识点，或右键新建
      </div>
    </div>

    <ElDialog
      v-model="generateDialogVisible"
      title="从结构生成知识点"
      width="480px"
      class="tu-dialog-viewport"
    >
      <p class="kpm-generate-hint">扁平生成：不设置父节点，仅建立知识点与 primary 证据锚点。</p>
      <div class="kpm-generate-options">
        <ElCheckbox v-model="generatePageTree">知识库页面树</ElCheckbox>
        <ElCheckbox v-model="generateDocumentHeadings">文档标题结构</ElCheckbox>
      </div>
      <p v-if="workspaceStore.currentPageId" class="kpm-generate-scope">
        将仅处理当前选中页面。
      </p>
      <template #footer>
        <ElButton @click="generateDialogVisible = false">取消</ElButton>
        <ElButton
          type="primary"
          :loading="generating"
          :disabled="!generatePageTree && !generateDocumentHeadings"
          @click="handleGenerate"
        >
          开始生成
        </ElButton>
      </template>
    </ElDialog>
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

.kpm-generate-hint {
  margin: 0 0 12px;
  font-size: 13px;
  color: #595959;
}

.kpm-generate-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.kpm-generate-scope {
  margin: 12px 0 0;
  font-size: 12px;
  color: #8c8c8c;
}
</style>

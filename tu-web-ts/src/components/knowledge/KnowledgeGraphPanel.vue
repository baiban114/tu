<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  ElAlert,
  ElButton,
  ElCheckbox,
  ElCheckboxGroup,
  ElEmpty,
  ElMessage,
  ElOption,
  ElSelect,
  ElTag,
} from 'element-plus';
import type {
  GraphData,
  KnowledgeGraphDirection,
  KnowledgeGraphMode,
  KnowledgeGraphNode,
  KnowledgeGraphResponse,
  KnowledgePoint,
  RelationTypeDef,
} from '@/api/types';
import { getKnowledgeGraph } from '@/api/knowledgeGraph';
import { getKnowledgePointTree } from '@/api/knowledgePoint';
import { listRelationTypes } from '@/api/knowledgeRelation';
import KnowledgeGraphViewer from '@/components/knowledge/KnowledgeGraphViewer.vue';
import { openKnowledgePointPicker } from '@/utils/knowledgePointPicker';
import { useWorkspaceStore } from '@/stores/workspace';
import { navigateKnowledgePoint } from '@/utils/knowledgeAnchor';
import { projectKnowledgeGraphToGraphData } from '@/utils/knowledgeGraphProjection';

const props = defineProps<{
  kbId: string;
  initialCenterPointId?: string | null;
  initialMode?: KnowledgeGraphMode | null;
}>();

const router = useRouter();
const workspaceStore = useWorkspaceStore();

const viewerRef = ref<InstanceType<typeof KnowledgeGraphViewer> | null>(null);
const loading = ref(false);
const graphData = ref<GraphData | null>(null);
const lastGraphResponse = ref<KnowledgeGraphResponse | null>(null);
const graphNodes = ref<KnowledgeGraphNode[]>([]);
const graphMeta = ref<{ truncated: boolean; warnings: string[]; totalPoints: number; totalRelations: number } | null>(null);
const relationTypes = ref<RelationTypeDef[]>([]);
const selectedTypeKeys = ref<string[]>([]);
const mode = ref<KnowledgeGraphMode>(props.initialMode ?? (props.initialCenterPointId ? 'centered' : 'full'));
const centerPointId = ref(props.initialCenterPointId ?? '');
const centerPointTitle = ref('');
const pointTree = ref<KnowledgePoint[]>([]);
const depth = ref(2);
const direction = ref<KnowledgeGraphDirection>('out');
const selectedPointId = ref<string | null>(null);
const hoveredPointId = ref<string | null>(null);
const loadError = ref<string | null>(null);

const navigateHandlers = computed(() => ({
  router,
  selectPage: async (pageId: string) => {
    await router.push({ path: '/', query: { pageId } });
  },
  currentPageId: workspaceStore.currentPageId,
}));

const selectedPoint = computed(() =>
  graphNodes.value.find((item) => item.id === selectedPointId.value) ?? null,
);

const hoveredPoint = computed(() =>
  graphNodes.value.find((item) => item.id === hoveredPointId.value) ?? null,
);

const needsCenterPoint = computed(() => mode.value !== 'full');

const centerPointReady = computed(() => !needsCenterPoint.value || Boolean(centerPointId.value.trim()));

const activeTypeKeys = computed(() => {
  if (mode.value === 'prerequisite') return ['prerequisite'];
  return selectedTypeKeys.value.length ? selectedTypeKeys.value : relationTypes.value.map((item) => item.typeKey);
});

const modeOptions: Array<{ value: KnowledgeGraphMode; label: string }> = [
  { value: 'full', label: '全库图谱' },
  { value: 'centered', label: '以选中点为中心' },
  { value: 'prerequisite', label: '前置子图' },
];

const emptyState = computed(() => {
  if (!centerPointReady.value) {
    return {
      description: '请先选择中心知识点，再查看以该点为中心的关联子图。',
      showSelectCenter: true,
      showGotoPoints: true,
      showSwitchFull: false,
    };
  }
  if (loadError.value) {
    return {
      description: loadError.value,
      showSelectCenter: needsCenterPoint.value,
      showGotoPoints: true,
      showSwitchFull: true,
    };
  }
  if (graphMeta.value?.totalPoints === 0) {
    return {
      description: '当前知识库还没有知识点。可先在「知识点」Tab 从页面结构生成，或从文档标题/划选内容创建知识点并建立关联。',
      showSelectCenter: false,
      showGotoPoints: true,
      showSwitchFull: false,
    };
  }
  if (graphNodes.value.length === 0) {
    return {
      description: needsCenterPoint.value
        ? '当前中心点在该深度与筛选下没有可展示的节点。可增大展开深度、调整关系类型，或切换到全库图谱。'
        : '当前筛选下没有可展示的知识点。请检查关系类型筛选，或确认知识点之间已建立关联。',
      showSelectCenter: needsCenterPoint.value,
      showGotoPoints: false,
      showSwitchFull: needsCenterPoint.value,
    };
  }
  return null;
});

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

function syncCenterPointTitle() {
  const id = centerPointId.value.trim();
  if (!id) {
    centerPointTitle.value = '';
    return;
  }
  const found = findPointInTree(pointTree.value, id);
  centerPointTitle.value = found?.title ?? id;
}

async function loadPointTree() {
  pointTree.value = await getKnowledgePointTree(props.kbId);
  syncCenterPointTitle();
}

async function loadRelationTypes() {
  relationTypes.value = await listRelationTypes(props.kbId);
  if (!selectedTypeKeys.value.length) {
    selectedTypeKeys.value = relationTypes.value.map((item) => item.typeKey);
  }
}

async function refreshGraph() {
  loadError.value = null;
  if (!centerPointReady.value) {
    graphData.value = null;
    graphNodes.value = [];
    lastGraphResponse.value = null;
    graphMeta.value = null;
    return;
  }

  loading.value = true;
  try {
    const response = await getKnowledgeGraph(props.kbId, {
      mode: mode.value,
      centerPointId: mode.value === 'full' ? undefined : centerPointId.value.trim(),
      depth: depth.value,
      direction: mode.value === 'prerequisite' ? direction.value : undefined,
      relationTypeKeys: mode.value === 'prerequisite' ? undefined : activeTypeKeys.value,
      maxNodes: 500,
    });
    graphNodes.value = response.nodes;
    lastGraphResponse.value = response;
    graphMeta.value = {
      truncated: response.meta.truncated,
      warnings: response.meta.warnings,
      totalPoints: response.meta.totalPoints,
      totalRelations: response.meta.totalRelations,
    };
    graphData.value = projectKnowledgeGraphToGraphData(response, {
      highlightPointId: selectedPointId.value ?? centerPointId.value ?? null,
    });
    if (selectedPointId.value && !response.nodes.some((item) => item.id === selectedPointId.value)) {
      selectedPointId.value = null;
    }
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '加载知识图谱失败';
    graphData.value = null;
    graphNodes.value = [];
    lastGraphResponse.value = null;
    graphMeta.value = null;
    ElMessage.error(loadError.value);
  } finally {
    loading.value = false;
  }
}

function applyHighlight(pointId: string | null) {
  if (!lastGraphResponse.value) return;
  graphData.value = projectKnowledgeGraphToGraphData(lastGraphResponse.value, {
    highlightPointId: pointId,
  });
}

function onNodeClick(pointId: string) {
  selectedPointId.value = pointId;
  applyHighlight(pointId);
}

function onNodeHover(pointId: string | null) {
  hoveredPointId.value = pointId;
}

async function openSelectedPoint() {
  if (!selectedPointId.value) return;
  await navigateKnowledgePoint(selectedPointId.value, navigateHandlers.value);
}

function fitCanvas() {
  viewerRef.value?.fitToContent();
}

async function openCenterPicker() {
  const point = await openKnowledgePointPicker({
    kbId: props.kbId,
    title: '选择图谱中心知识点',
    selectedId: centerPointId.value || null,
    hint: '选择作为图谱中心的知识点',
    allowManage: true,
  });
  if (!point) return;
  onCenterPointSelected(point);
}

function onCenterPointSelected(point: KnowledgePoint) {
  centerPointId.value = point.id;
  centerPointTitle.value = point.title;
  selectedPointId.value = point.id;
  void refreshGraph();
}

function onModeChange(nextMode: KnowledgeGraphMode) {
  mode.value = nextMode;
  if (nextMode !== 'full' && !centerPointId.value.trim()) {
    void openCenterPicker();
    graphData.value = null;
    graphNodes.value = [];
    lastGraphResponse.value = null;
    graphMeta.value = null;
    loadError.value = null;
    return;
  }
  void refreshGraph();
}

function clearCenterPoint() {
  centerPointId.value = '';
  centerPointTitle.value = '';
  selectedPointId.value = null;
  graphData.value = null;
  graphNodes.value = [];
  lastGraphResponse.value = null;
  graphMeta.value = null;
  loadError.value = null;
}

function gotoKnowledgePointsTab() {
  void router.push({ path: '/resources', query: { tab: 'knowledgePoints' } });
}

function switchToFullGraph() {
  mode.value = 'full';
  void refreshGraph();
}

watch(
  () => props.kbId,
  async () => {
    await Promise.all([loadRelationTypes(), loadPointTree()]);
    await refreshGraph();
  },
  { immediate: true },
);

watch(
  () => props.initialCenterPointId,
  (value) => {
    if (!value) return;
    centerPointId.value = value;
    if (props.initialMode) mode.value = props.initialMode;
    else if (mode.value === 'full') mode.value = 'centered';
    selectedPointId.value = value;
    syncCenterPointTitle();
    void refreshGraph();
  },
);

watch(
  () => props.initialMode,
  (value) => {
    if (!value) return;
    mode.value = value;
    void refreshGraph();
  },
);
</script>

<template>
  <section class="kg-panel" v-loading="loading">
    <div class="kg-panel__toolbar">
      <ElSelect :model-value="mode" style="width: 160px" @change="onModeChange">
        <ElOption
          v-for="item in modeOptions"
          :key="item.value"
          :label="item.label"
          :value="item.value"
        />
      </ElSelect>

      <template v-if="needsCenterPoint">
        <div class="kg-panel__center">
          <span class="kg-panel__center-label">中心知识点</span>
          <ElTag v-if="centerPointTitle" type="primary" closable @close="clearCenterPoint">
            {{ centerPointTitle }}
          </ElTag>
          <span v-else class="kg-panel__center-placeholder">未选择</span>
          <ElButton type="primary" plain @click="openCenterPicker">选择知识点</ElButton>
        </div>
      </template>

      <label class="kg-panel__field">
        <span>展开深度</span>
        <ElSelect v-model="depth" style="width: 88px" @change="refreshGraph">
          <ElOption :value="1" label="1" />
          <ElOption :value="2" label="2" />
          <ElOption :value="3" label="3" />
        </ElSelect>
      </label>

      <template v-if="mode === 'prerequisite'">
        <ElSelect v-model="direction" style="width: 140px" @change="refreshGraph">
          <ElOption value="out" label="前置依赖链" />
          <ElOption value="in" label="被谁依赖" />
          <ElOption value="both" label="双向展开" />
        </ElSelect>
      </template>

      <ElButton :disabled="!centerPointReady" @click="refreshGraph">刷新</ElButton>
      <ElButton :disabled="!graphData?.nodes.length" @click="fitCanvas">适应画布</ElButton>
    </div>

    <div v-if="mode !== 'prerequisite'" class="kg-panel__filters">
      <span class="kg-panel__filters-label">关系类型</span>
      <ElCheckboxGroup v-model="selectedTypeKeys" @change="refreshGraph">
        <ElCheckbox
          v-for="type in relationTypes"
          :key="type.typeKey"
          :value="type.typeKey"
        >
          <span :style="{ color: type.color || '#1677ff' }">{{ type.label }}</span>
        </ElCheckbox>
      </ElCheckboxGroup>
    </div>

    <ElAlert
      v-if="needsCenterPoint && !centerPointReady"
      type="info"
      :closable="false"
      show-icon
      title="「以选中点为中心」和「前置子图」需要先选定一个知识点作为中心。"
      class="kg-panel__alert"
    />

    <ElAlert
      v-if="graphMeta?.truncated"
      type="warning"
      :closable="false"
      show-icon
      title="图谱节点已达上限，部分知识点未展示。可切换到「以选中点为中心」或提高筛选精度。"
      class="kg-panel__alert"
    />
    <ElAlert
      v-for="(warning, index) in graphMeta?.warnings ?? []"
      :key="`${warning}-${index}`"
      type="info"
      :closable="false"
      show-icon
      :title="warning"
      class="kg-panel__alert"
    />

    <div class="kg-panel__body">
      <div class="kg-panel__canvas-wrap">
        <KnowledgeGraphViewer
          v-if="graphData?.nodes.length"
          ref="viewerRef"
          :graph-data="graphData"
          @node-click="onNodeClick"
          @node-hover="onNodeHover"
        />
        <div v-else class="kg-panel__empty">
          <ElEmpty :description="emptyState?.description ?? '当前筛选下暂无知识点或关系'">
            <div class="kg-panel__empty-actions">
              <ElButton
                v-if="emptyState?.showSelectCenter"
                type="primary"
                @click="openCenterPicker"
              >
                选择中心知识点
              </ElButton>
              <ElButton
                v-if="emptyState?.showGotoPoints"
                @click="gotoKnowledgePointsTab"
              >
                去知识点 Tab
              </ElButton>
              <ElButton
                v-if="emptyState?.showSwitchFull"
                @click="switchToFullGraph"
              >
                切换到全库图谱
              </ElButton>
            </div>
          </ElEmpty>
        </div>
      </div>

      <aside class="kg-panel__side">
        <div class="kg-panel__legend">
          <div class="kg-panel__side-title">关系图例</div>
          <div class="kg-panel__legend-items">
            <span
              v-for="type in relationTypes"
              :key="type.typeKey"
              class="kg-panel__legend-item"
            >
              <i :style="{ background: type.color || '#1677ff' }" />
              {{ type.label }}
            </span>
          </div>
        </div>

        <div class="kg-panel__detail">
          <div class="kg-panel__side-title">节点详情</div>
          <template v-if="selectedPoint">
            <h4>{{ selectedPoint.title }}</h4>
            <p v-if="selectedPoint.summary" class="kg-panel__summary">{{ selectedPoint.summary }}</p>
            <p v-if="selectedPoint.estimatedHours != null" class="kg-panel__meta">
              预估学时：{{ selectedPoint.estimatedHours }} h
            </p>
            <ElButton type="primary" @click="openSelectedPoint">跳转到主证据</ElButton>
          </template>
          <p v-else-if="hoveredPoint" class="kg-panel__hint">
            {{ hoveredPoint.title }}
            <span v-if="hoveredPoint.estimatedHours != null"> · {{ hoveredPoint.estimatedHours }} h</span>
          </p>
          <p v-else class="kg-panel__hint">点击节点查看详情</p>
        </div>

        <div v-if="graphMeta" class="kg-panel__stats">
          <ElTag type="info">节点 {{ graphNodes.length }} / {{ graphMeta.totalPoints }}</ElTag>
          <ElTag type="info">关系 {{ graphData?.edges?.length ?? 0 }} / {{ graphMeta.totalRelations }}</ElTag>
        </div>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.kg-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  min-height: 0;
}

.kg-panel__toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.kg-panel__center {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.kg-panel__center-label {
  font-size: 13px;
  color: #4b5563;
}

.kg-panel__center-placeholder {
  font-size: 13px;
  color: #9ca3af;
}

.kg-panel__field {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #4b5563;
}

.kg-panel__filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  align-items: center;
}

.kg-panel__filters-label {
  font-size: 13px;
  color: #6b7280;
}

.kg-panel__alert {
  margin: 0;
}

.kg-panel__body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 260px;
  gap: 12px;
  flex: 1;
  min-height: 0;
}

.kg-panel__canvas-wrap {
  min-height: 420px;
  min-width: 0;
}

.kg-panel__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 420px;
  border: 1px dashed #d1d5db;
  border-radius: 8px;
  background: #fafafa;
}

.kg-panel__empty-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}

.kg-panel__side {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fafafa;
  min-height: 420px;
}

.kg-panel__side-title {
  font-size: 13px;
  font-weight: 600;
  color: #374151;
  margin-bottom: 8px;
}

.kg-panel__legend-items {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.kg-panel__legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #4b5563;
}

.kg-panel__legend-item i {
  width: 14px;
  height: 3px;
  border-radius: 2px;
  display: inline-block;
}

.kg-panel__detail h4 {
  margin: 0 0 8px;
  font-size: 15px;
}

.kg-panel__summary,
.kg-panel__meta,
.kg-panel__hint {
  margin: 0 0 10px;
  font-size: 13px;
  color: #6b7280;
  line-height: 1.5;
}

.kg-panel__stats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: auto;
}

@media (max-width: 1100px) {
  .kg-panel__body {
    grid-template-columns: 1fr;
  }

  .kg-panel__side {
    min-height: auto;
  }
}
</style>

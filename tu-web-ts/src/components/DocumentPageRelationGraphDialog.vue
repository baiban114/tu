<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { ElAlert, ElMessage } from 'element-plus';
import type { GraphData, KnowledgeGraphResponse } from '@/api/types';
import { getPageRelationGraph } from '@/api/knowledgeGraph';
import KnowledgeGraphViewer from '@/components/knowledge/KnowledgeGraphViewer.vue';
import { projectKnowledgeGraphToGraphData } from '@/utils/knowledgeGraphProjection';

const props = defineProps<{
  modelValue: boolean;
  kbId: string;
  pageId: string;
  pageTitle: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
}>();

const canvasHostRef = ref<HTMLElement | null>(null);
const canvasWidth = ref(720);
const canvasHeight = ref(420);
const loading = ref(false);
const loadError = ref<string | null>(null);
const graphResponse = ref<KnowledgeGraphResponse | null>(null);

const graphData = computed<GraphData | null>(() => {
  if (!graphResponse.value) return null;
  const focusPointIds = graphResponse.value.meta.focusPointIds ?? [];
  return projectKnowledgeGraphToGraphData(graphResponse.value, {
    highlightPointIds: focusPointIds,
  });
});

const metaWarnings = computed(() => graphResponse.value?.meta.warnings ?? []);
const isEmpty = computed(() => !loading.value && graphResponse.value?.nodes.length === 0);

function close() {
  emit('update:modelValue', false);
}

function measureCanvas() {
  const el = canvasHostRef.value;
  if (!el) return;
  canvasWidth.value = Math.max(320, el.clientWidth);
  canvasHeight.value = Math.max(240, el.clientHeight);
}

async function loadGraph() {
  if (!props.kbId || !props.pageId) {
    loadError.value = '缺少知识库或页面上下文';
    graphResponse.value = null;
    return;
  }
  loading.value = true;
  loadError.value = null;
  try {
    graphResponse.value = await getPageRelationGraph(props.kbId, props.pageId);
  } catch (error) {
    graphResponse.value = null;
    loadError.value = error instanceof Error ? error.message : '加载文档联系图失败';
    ElMessage.error(loadError.value);
  } finally {
    loading.value = false;
  }
}

watch(
  () => props.modelValue,
  async (visible) => {
    if (!visible) return;
    await loadGraph();
    await nextTick();
    measureCanvas();
  },
);
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    class="tu-dialog-viewport document-page-relation-graph-dialog"
    title="文档联系图"
    width="min(960px, 96vw)"
    align-center
    destroy-on-close
    @update:model-value="emit('update:modelValue', $event)"
    @closed="close"
  >
    <div class="document-page-relation-graph-dialog__body">
      <p class="document-page-relation-graph-dialog__hint">
        基于当前文档「{{ pageTitle }}」已绑定的知识点及其语义关联生成只读联系图；高亮节点为本页证据绑定的知识点。
      </p>

      <ElAlert
        v-for="(warning, index) in metaWarnings"
        :key="`${warning}-${index}`"
        type="info"
        :closable="false"
        show-icon
        :title="warning"
        class="document-page-relation-graph-dialog__alert"
      />

      <ElAlert
        v-if="loadError"
        type="error"
        :closable="false"
        show-icon
        :title="loadError"
        class="document-page-relation-graph-dialog__alert"
      />

      <div
        v-if="loading"
        class="document-page-relation-graph-dialog__empty"
      >
        正在分析当前文档关联…
      </div>
      <div
        v-else-if="isEmpty"
        class="document-page-relation-graph-dialog__empty"
      >
        当前文档暂无知识点证据绑定，或尚无对外语义关联。可先使用「建立关联」或「AI 分析标记」为本页内容挂靠知识点。
      </div>
      <div
        v-else
        ref="canvasHostRef"
        class="document-page-relation-graph-dialog__canvas"
      >
        <KnowledgeGraphViewer
          v-if="graphData"
          :key="`${pageId}-${graphData.nodes.length}-${canvasWidth}x${canvasHeight}`"
          :graph-data="graphData"
        />
      </div>
    </div>
  </el-dialog>
</template>

<style scoped>
.document-page-relation-graph-dialog__body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  height: min(68vh, 560px);
}

.document-page-relation-graph-dialog__hint {
  margin: 0;
  color: #6b7280;
  font-size: 13px;
  line-height: 1.45;
}

.document-page-relation-graph-dialog__alert {
  flex: 0 0 auto;
}

.document-page-relation-graph-dialog__empty {
  flex: 1;
  min-height: 240px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  border: 1px dashed #d9dee8;
  border-radius: 12px;
  color: #6b7280;
  font-size: 13px;
  line-height: 1.5;
  text-align: center;
}

.document-page-relation-graph-dialog__canvas {
  flex: 1;
  min-height: 0;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  overflow: hidden;
  background: #fcfcfd;
}
</style>

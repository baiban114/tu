<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Graph } from '@antv/x6';
import type { GraphData } from '@/api/types';
import { getKnowledgeGraphBounds, parseKnowledgePointNodeId } from '@/utils/knowledgeGraphProjection';

const props = defineProps<{
  graphData: GraphData | null;
}>();

const emit = defineEmits<{
  'node-click': [pointId: string];
  'node-hover': [pointId: string | null];
}>();

const containerRef = ref<HTMLElement | null>(null);
let graph: Graph | null = null;

function disposeGraph() {
  if (graph) {
    graph.dispose();
    graph = null;
  }
}

function renderGraphData(data: GraphData | null) {
  if (!graph || !data) return;
  graph.clearCells();
  if (!data.nodes.length) return;
  graph.fromJSON({
    nodes: data.nodes as never[],
    edges: data.edges as never[],
  });
}

function initGraph() {
  if (!containerRef.value) return;
  disposeGraph();

  graph = new Graph({
    container: containerRef.value,
    autoResize: true,
    background: { color: '#fcfcfd' },
    grid: {
      size: 20,
      visible: true,
      type: 'doubleMesh',
      args: [
        { color: '#eef1f6', thickness: 1 },
        { color: '#d9dee8', thickness: 1, factor: 4 },
      ],
    },
    panning: {
      enabled: true,
      eventTypes: ['leftMouseDown', 'mouseWheel'],
    },
    mousewheel: {
      enabled: true,
      modifiers: ['ctrl', 'meta'],
      minScale: 0.2,
      maxScale: 2.5,
      factor: 1.08,
    },
    interacting: {
      nodeMovable: false,
      edgeMovable: false,
      edgeLabelMovable: false,
      magnetConnectable: false,
    },
  });

  graph.on('node:click', ({ node }) => {
    const pointId = parseKnowledgePointNodeId(node.id);
    if (pointId) emit('node-click', pointId);
  });

  graph.on('node:mouseenter', ({ node }) => {
    const pointId = parseKnowledgePointNodeId(node.id);
    emit('node-hover', pointId);
  });

  graph.on('node:mouseleave', () => {
    emit('node-hover', null);
  });

  renderGraphData(props.graphData);
}

function fitToContent(padding = 48) {
  if (!graph || !props.graphData?.nodes.length) return;
  const bounds = getKnowledgeGraphBounds(props.graphData);
  if (!bounds) return;
  graph.zoomToFit({
    padding,
    minScale: 0.25,
    maxScale: 1.2,
  });
}

defineExpose({ fitToContent });

watch(
  () => props.graphData,
  async (data) => {
    if (!graph) return;
    renderGraphData(data);
    await nextTick();
    if (data?.nodes.length) fitToContent();
  },
  { deep: true },
);

onMounted(() => {
  initGraph();
  if (props.graphData?.nodes.length) {
    void nextTick(() => fitToContent());
  }
});

onBeforeUnmount(() => {
  disposeGraph();
});
</script>

<template>
  <div ref="containerRef" class="knowledge-graph-viewer" />
</template>

<style scoped>
.knowledge-graph-viewer {
  width: 100%;
  height: 100%;
  min-height: 420px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
  background: #fcfcfd;
}
</style>

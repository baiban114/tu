<template>
  <div class="line-wrapper">
    <div
      ref="containerRef"
      class="line-container"
      :class="{ 'line-visible': isVisible }"
    ></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick, watch } from 'vue';
import { Graph } from '@antv/x6';

interface Props {
  timelineData?: Array<{
    id: string;
    title: string;
    content: string;
    date: string;
    color: string;
    lightColor: string;
    type: 'normal' | 'milestone';
  }>;
}

const props = withDefaults(defineProps<Props>(), {
  timelineData: undefined,
});

const containerRef = ref<HTMLElement | null>(null);
const isVisible = ref(false);
let graph: Graph | null = null;

const defaultTimelineData: Array<{
  id: string;
  title: string;
  content: string;
  date: string;
  color: string;
  lightColor: string;
  type: 'normal' | 'milestone';
}> = [];

const getTimelineSource = () => props.timelineData?.length ? props.timelineData : defaultTimelineData;

const loadTimeline = () => {
  if (!graph) return;

  const cells: any[] = [];
  const timeline = getTimelineSource();

  timeline.forEach((item, index) => {
    cells.push(graph!.createNode({
      id: item.id,
      x: 100 + index * 150,
      y: 100,
      width: 120,
      height: 60,
      data: {
        title: item.title,
        date: item.date,
        color: item.color,
      },
      attrs: {
        body: {
          fill: item.lightColor,
          stroke: item.color,
          rx: 4,
          ry: 4,
        },
        label: {
          text: item.title,
          fill: item.color,
          fontSize: 14,
          fontWeight: item.type === 'milestone' ? 'bold' : 'normal',
        },
      },
    }));
  });

  for (let i = 0; i < timeline.length - 1; i += 1) {
    cells.push(graph!.createEdge({
      source: timeline[i].id,
      target: timeline[i + 1].id,
      attrs: {
        line: {
          stroke: '#999',
          strokeWidth: 2,
          targetMarker: {
            type: 'path',
            d: 'M 10 -5 0 0 10 5 z',
            fill: '#999',
          },
        },
      },
    }));
  }

  graph.resetCells(cells);
};

const initGraph = () => {
  if (!containerRef.value) return;

  graph = new Graph({
    container: containerRef.value,
    width: 800,
    height: 600,
    grid: {
      size: 10,
      visible: true,
    },
    panning: {
      enabled: true,
      eventTypes: ['leftMouseDown', 'mouseWheel'],
    },
    mousewheel: {
      enabled: true,
      modifiers: 'ctrl',
      factor: 1.1,
      maxScale: 3,
      minScale: 0.1,
    },
  });

  loadTimeline();

  nextTick(() => {
    isVisible.value = true;
    graph?.zoomToFit({ padding: 20, maxScale: 1 });
  });
};

onMounted(() => {
  initGraph();
});

onBeforeUnmount(() => {
  if (graph) {
    graph.dispose();
    graph = null;
  }
});

watch(
  () => props.timelineData,
  () => {
    if (graph) {
      graph.dispose();
      graph = null;
    }
    initGraph();
  },
  { deep: true },
);
</script>

<style scoped>
.line-wrapper {
  width: 100%;
  height: 600px;
  background: #fff;
  margin: 0;
  padding: 0;
  overflow: hidden;
  position: relative;
}

.line-container {
  width: 100%;
  height: 100%;
  opacity: 0;
  transition: opacity 0.3s ease-in-out;
}

.line-container.line-visible {
  opacity: 1;
}
</style>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { KnowledgePoint } from '@/api/types';
import { getPageKnowledgeContext } from '@/api/knowledgePoint';
import {
  navigateKnowledgePoint,
  type KnowledgeAnchorNavigateHandlers,
} from '@/utils/knowledgeAnchor';

const props = defineProps<{
  kbId: string;
  pageId: string;
  navigate: KnowledgeAnchorNavigateHandlers;
  refreshKey?: number;
}>();

const loading = ref(false);
const pagePoints = ref<KnowledgePoint[]>([]);
const prerequisites = ref<KnowledgePoint[]>([]);
const successors = ref<KnowledgePoint[]>([]);

const hasContent = computed(() =>
  pagePoints.value.length > 0
  || prerequisites.value.length > 0
  || successors.value.length > 0,
);

async function refresh() {
  if (!props.kbId || !props.pageId) {
    pagePoints.value = [];
    prerequisites.value = [];
    successors.value = [];
    return;
  }
  loading.value = true;
  try {
    const context = await getPageKnowledgeContext(props.kbId, props.pageId);
    pagePoints.value = context.pagePoints;
    prerequisites.value = context.prerequisites;
    successors.value = context.successors;
  } finally {
    loading.value = false;
  }
}

function onNavigate(pointId: string) {
  void navigateKnowledgePoint(pointId, props.navigate);
}

watch(
  () => [props.kbId, props.pageId, props.refreshKey] as const,
  () => { void refresh(); },
  { immediate: true },
);

defineExpose({ refresh });
</script>

<template>
  <section
    v-if="hasContent || loading"
    v-loading="loading"
    class="page-knowledge-context-bar"
    aria-label="页面知识点关联"
  >
    <div v-if="pagePoints.length" class="page-knowledge-context-bar__group">
      <span class="page-knowledge-context-bar__label">本页知识点</span>
      <button
        v-for="point in pagePoints"
        :key="point.id"
        type="button"
        class="knowledge-chip knowledge-chip--page"
        @click="onNavigate(point.id)"
      >
        {{ point.title }}
      </button>
    </div>
    <div v-if="prerequisites.length" class="page-knowledge-context-bar__group">
      <span class="page-knowledge-context-bar__label">前驱</span>
      <button
        v-for="point in prerequisites"
        :key="point.id"
        type="button"
        class="knowledge-chip knowledge-chip--prerequisite"
        @click="onNavigate(point.id)"
      >
        {{ point.title }}
      </button>
    </div>
    <div v-if="successors.length" class="page-knowledge-context-bar__group">
      <span class="page-knowledge-context-bar__label">后继</span>
      <button
        v-for="point in successors"
        :key="point.id"
        type="button"
        class="knowledge-chip knowledge-chip--successor"
        @click="onNavigate(point.id)"
      >
        {{ point.title }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.page-knowledge-context-bar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0 0 12px;
  min-height: 0;
}

.page-knowledge-context-bar__group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.page-knowledge-context-bar__label {
  flex-shrink: 0;
  font-size: 12px;
  color: #8c8c8c;
  min-width: 72px;
}

.knowledge-chip {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  border: 1px solid transparent;
  padding: 4px 10px;
  font-size: 12px;
  line-height: 1.4;
  cursor: pointer;
  background: transparent;
}

.knowledge-chip--page {
  --chip-color: #1677ff;
  border-color: color-mix(in srgb, var(--chip-color) 30%, white);
  background: color-mix(in srgb, var(--chip-color) 12%, white);
  color: color-mix(in srgb, var(--chip-color) 85%, black);
}

.knowledge-chip--prerequisite,
.knowledge-chip--successor {
  --chip-color: #fa8c16;
  border-color: color-mix(in srgb, var(--chip-color) 30%, white);
  background: color-mix(in srgb, var(--chip-color) 12%, white);
  color: color-mix(in srgb, var(--chip-color) 85%, black);
}

.knowledge-chip:hover {
  filter: brightness(0.97);
}
</style>

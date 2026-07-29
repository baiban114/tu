<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElButton } from 'element-plus'
import { composeKnowledgePointDocumentForKb } from '@/knowledge/display'
import type { KnowledgePointDocumentViewModel } from '@/knowledge/display'
import {
  navigateKnowledgeAnchor,
  navigateKnowledgePoint,
  type KnowledgeAnchorNavigateHandlers,
} from '@/utils/knowledgeAnchor'
import type { KnowledgeAnchorKind } from '@/api/types'

const props = defineProps<{
  kbId: string
  pointId: string
  displayTypeCode?: string
  navigate: KnowledgeAnchorNavigateHandlers
}>()

const emit = defineEmits<{
  close: []
}>()

const loading = ref(false)
const error = ref('')
const viewModel = ref<KnowledgePointDocumentViewModel | null>(null)

async function load() {
  if (!props.kbId || !props.pointId) {
    viewModel.value = null
    return
  }
  loading.value = true
  error.value = ''
  try {
    viewModel.value = await composeKnowledgePointDocumentForKb({
      kbId: props.kbId,
      pointId: props.pointId,
      displayTypeCode: props.displayTypeCode,
    })
  } catch (err) {
    viewModel.value = null
    error.value = err instanceof Error ? err.message : '加载知识点解析失败'
  } finally {
    loading.value = false
  }
}

function onOpenPoint(pointId: string) {
  void navigateKnowledgePoint(pointId, props.navigate)
}

function onOpenAnchor(locator: string, kind: string) {
  void navigateKnowledgeAnchor(
    { kind: kind as KnowledgeAnchorKind, locator },
    props.navigate,
  )
}

watch(
  () => [props.kbId, props.pointId, props.displayTypeCode] as const,
  () => { void load() },
  { immediate: true },
)
</script>

<template>
  <aside
    v-loading="loading"
    class="kp-reading-preview"
    aria-label="前置知识点"
  >
    <header class="kp-reading-preview__header">
      <div class="kp-reading-preview__heading">
        <span class="kp-reading-preview__badge">前置知识点</span>
        <h2 class="kp-reading-preview__title">{{ viewModel?.title || '知识点' }}</h2>
      </div>
      <ElButton link type="primary" size="small" @click="emit('close')">关闭</ElButton>
    </header>

    <p v-if="error" class="kp-reading-preview__error">{{ error }}</p>

    <div v-else-if="viewModel" class="kp-reading-preview__body">
      <section
        v-for="section in viewModel.sections"
        :key="section.key"
        class="kp-reading-preview__section"
      >
        <h3 class="kp-reading-preview__section-title">{{ section.title }}</h3>
        <p v-if="section.kind === 'text' && section.body" class="kp-reading-preview__text">
          {{ section.body }}
        </p>
        <ul v-else-if="section.kind === 'pointList' && section.points?.length" class="kp-reading-preview__list">
          <li v-for="point in section.points" :key="point.id">
            <button type="button" class="kp-reading-preview__link" @click="onOpenPoint(point.id)">
              {{ point.title }}
            </button>
            <span v-if="point.summary" class="kp-reading-preview__sub">{{ point.summary }}</span>
          </li>
        </ul>
        <ul v-else-if="section.kind === 'anchorList' && section.anchors?.length" class="kp-reading-preview__list">
          <li v-for="anchor in section.anchors" :key="anchor.id">
            <button
              type="button"
              class="kp-reading-preview__link"
              @click="onOpenAnchor(anchor.locator, anchor.kind)"
            >
              {{ anchor.label }}
            </button>
            <span v-if="anchor.primary" class="kp-reading-preview__sub">主证据</span>
          </li>
        </ul>
        <p v-else class="kp-reading-preview__empty">暂无内容</p>
      </section>
    </div>
  </aside>
</template>

<style scoped>
.kp-reading-preview {
  flex-shrink: 0;
  margin: 0 0 16px;
  border: 1px solid #d6e4ff;
  border-radius: 12px;
  background: linear-gradient(180deg, #f7faff 0%, #ffffff 48%);
  box-shadow: 0 1px 0 color-mix(in srgb, #1677ff 8%, transparent);
  padding: 12px 14px 14px;
  box-sizing: border-box;
}

.kp-reading-preview__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.kp-reading-preview__heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.kp-reading-preview__badge {
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  background: color-mix(in srgb, #fa8c16 14%, white);
  color: #d46b08;
  font-size: 12px;
  font-weight: 600;
}

.kp-reading-preview__title {
  margin: 0;
  font-size: 16px;
  font-weight: 650;
  color: #1f1f1f;
  line-height: 1.35;
}

.kp-reading-preview__body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: min(360px, 42vh);
  overflow-y: auto;
  min-height: 0;
}

.kp-reading-preview__section-title {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 600;
  color: #8c8c8c;
}

.kp-reading-preview__text {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: #434343;
  white-space: pre-wrap;
}

.kp-reading-preview__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.kp-reading-preview__link {
  border: none;
  background: transparent;
  padding: 0;
  color: #1677ff;
  font-size: 13px;
  cursor: pointer;
  text-align: left;
}

.kp-reading-preview__link:hover {
  text-decoration: underline;
}

.kp-reading-preview__sub {
  display: block;
  margin-top: 2px;
  font-size: 12px;
  color: #8c8c8c;
}

.kp-reading-preview__empty,
.kp-reading-preview__error {
  margin: 0;
  font-size: 13px;
  color: #8c8c8c;
}

.kp-reading-preview__error {
  color: #cf1322;
}
</style>

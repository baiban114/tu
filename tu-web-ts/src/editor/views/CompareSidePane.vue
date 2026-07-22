<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  getResourceExcerpt,
  getResourceItem,
  type ResourceExcerpt,
  type ResourceItem,
} from '@/api/externalResource'
import type { Block, ExternalResourceEmbedData, ExternalResourceSnapshot } from '@/api/types'
import { resourcePositionDisplay } from '@/utils/resourcePositionLocator'
import TuEditor from '@/components/TuEditor.vue'

const props = defineProps<{
  sideLabel: string
  binding: ExternalResourceEmbedData | null
  paneHeight: number
}>()

const emit = defineEmits<{
  bind: []
}>()

const latestItem = ref<ResourceItem | null>(null)
const latestExcerpt = ref<ResourceExcerpt | null>(null)
const loading = ref(false)
const loadError = ref('')

const snapshot = computed<ExternalResourceSnapshot>(() => (
  props.binding?.snapshot || { resourceTitle: '' }
))
const isExcerpt = computed(() => (
  props.binding?.mode === 'excerpt' || Boolean(props.binding?.resourceExcerptId)
))
const resourceTitle = computed(() => latestItem.value?.title || snapshot.value.resourceTitle || '')
const excerptTitle = computed(() => latestExcerpt.value?.title || snapshot.value.excerptTitle || '')
const excerptLocator = computed(() => latestExcerpt.value?.locator || snapshot.value.excerptLocator || '')
const excerptText = computed(() => latestExcerpt.value?.excerptText || snapshot.value.excerptText || '')
const usingSnapshot = computed(() => Boolean(
  loadError.value || (!latestItem.value && snapshot.value.resourceTitle),
))

const cardTitle = computed(() => (
  isExcerpt.value
    ? (excerptTitle.value || resourceTitle.value || '已定位内容')
    : (resourceTitle.value || '已定位资源')
))

const locatorDisplay = computed(() => resourcePositionDisplay(excerptLocator.value))

const excerptEditorBlocks = computed<Block[]>(() => [{
  id: `compare-side-${props.sideLabel}`,
  type: 'richtext',
  content: excerptText.value,
}])

const loadResource = async () => {
  if (!props.binding?.resourceItemId) {
    latestItem.value = null
    latestExcerpt.value = null
    loadError.value = ''
    return
  }
  loading.value = true
  loadError.value = ''
  latestItem.value = null
  latestExcerpt.value = null
  try {
    latestItem.value = await getResourceItem(props.binding.resourceItemId)
    if (props.binding.resourceExcerptId) {
      latestExcerpt.value = await getResourceExcerpt(props.binding.resourceExcerptId)
    }
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : '资源加载失败'
  } finally {
    loading.value = false
  }
}

watch(
  () => [props.binding?.resourceItemId, props.binding?.resourceExcerptId] as const,
  () => {
    void loadResource()
  },
)

onMounted(() => {
  void loadResource()
})
</script>

<template>
  <section class="compare-side">
    <header class="compare-side__header">
      <span class="compare-side__label">{{ sideLabel }}</span>
      <template v-if="binding">
        <span class="compare-side__title" :title="cardTitle">{{ cardTitle }}</span>
        <span v-if="locatorDisplay" class="compare-side__chip" :title="excerptLocator">
          {{ locatorDisplay }}
        </span>
        <span v-if="usingSnapshot" class="compare-side__badge">快照</span>
        <span v-if="loading" class="compare-side__status">加载中…</span>
      </template>
      <button type="button" class="compare-side__bind-btn" @click="emit('bind')">
        {{ binding ? '更换' : '选择定位' }}
      </button>
    </header>

    <div class="compare-side__body" :style="{ height: `${paneHeight}px` }">
      <div v-if="!binding" class="compare-side__empty">
        <p>尚未绑定定位</p>
        <button type="button" class="compare-side__empty-btn" @click="emit('bind')">
          选择外部资源节选
        </button>
      </div>
      <div
        v-else-if="isExcerpt && excerptText.trim()"
        class="compare-side__scroll"
      >
        <TuEditor
          :blocks="excerptEditorBlocks"
          :editable="false"
          :hover-handle="false"
          class="compare-side__editor"
        />
      </div>
      <div v-else class="compare-side__empty compare-side__empty--bound">
        <p v-if="loading">正在加载…</p>
        <p v-else-if="loadError && !excerptText">{{ loadError }}（无可用正文）</p>
        <p v-else>已绑定资源，暂无节选正文</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.compare-side {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
  overflow: hidden;
}

.compare-side__header {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  min-height: 36px;
  padding: 6px 8px;
  border-bottom: 1px solid #eef2f7;
  background: #f8fafc;
}

.compare-side__label {
  flex-shrink: 0;
  padding: 1px 8px;
  border-radius: 999px;
  background: #e0f2fe;
  color: #075985;
  font-size: 11px;
  font-weight: 600;
}

.compare-side__title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 600;
  color: #1f2937;
}

.compare-side__chip,
.compare-side__badge,
.compare-side__status {
  flex-shrink: 0;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: #64748b;
}

.compare-side__badge {
  padding: 1px 6px;
  border-radius: 999px;
  background: #fef3c7;
  color: #92400e;
}

.compare-side__bind-btn {
  flex-shrink: 0;
  margin-left: auto;
  padding: 2px 8px;
  border: 1px solid #dbe3f0;
  border-radius: 6px;
  background: #fff;
  color: #1677ff;
  font-size: 11px;
  cursor: pointer;
}

.compare-side__bind-btn:hover {
  background: #e6f4ff;
}

.compare-side__body {
  flex: none;
  min-height: 0;
  overflow: hidden;
}

.compare-side__scroll {
  height: 100%;
  overflow: auto;
  padding: 8px 10px;
  box-sizing: border-box;
}

.compare-side__editor {
  pointer-events: none;
}

.compare-side__empty {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 16px;
  box-sizing: border-box;
  color: #94a3b8;
  font-size: 12px;
  text-align: center;
}

.compare-side__empty p {
  margin: 0;
}

.compare-side__empty-btn {
  padding: 6px 12px;
  border: 1px dashed #91caff;
  border-radius: 8px;
  background: #f0f7ff;
  color: #1677ff;
  font-size: 12px;
  cursor: pointer;
}

.compare-side__empty-btn:hover {
  background: #e6f4ff;
}
</style>

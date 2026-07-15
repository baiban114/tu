<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { DocumentMarkingSuggestion } from '@/api/types'

const props = defineProps<{
  visible: boolean
  suggestions: DocumentMarkingSuggestion[]
  loading?: boolean
  progressMessage?: string
  pageTitle?: string
  sectionTitle?: string
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  apply: [payload: { selectedIds: string[]; replaceExistingAi: boolean }]
  cancel: []
}>()

const selectedIds = ref<Set<string>>(new Set())
const replaceExistingAi = ref(false)

watch(
  () => props.suggestions,
  (list) => {
    selectedIds.value = new Set(list.map((item) => item.id))
  },
  { immediate: true },
)

const actionLabel: Record<string, string> = {
  bindSource: '标记来源',
  setBasis: '设置依据',
  markExcerpt: '标记节选',
  createRelation: '建立关联',
}

// locator 类型翻译，方便用户快速理解建议指向的"原标记"位置
const locatorTypeLabel: Record<string, string> = {
  heading: '标题块',
  annotation: '高亮批注',
  block: '内容块',
  excerpt: '资源节选',
  page: '整页',
}

function locatorKind(locator: string): keyof typeof locatorTypeLabel | 'unknown' {
  if (locator.includes(':heading:')) return 'heading'
  if (locator.includes(':annotation:')) return 'annotation'
  if (locator.includes(':block:')) return 'block'
  if (locator.startsWith('resource:') && locator.includes(':excerpt:')) return 'excerpt'
  if (locator.startsWith('page:')) return 'page'
  return 'unknown'
}

const sortedSuggestions = computed(() => [...props.suggestions])

// 计算每条建议的"原标记"展示信息
interface OriginalMarkingView {
  kindLabel: string
  locator: string
  excerptTitle?: string
  excerptText?: string
  hasContent: boolean
}

function buildOriginalMarking(item: DocumentMarkingSuggestion): OriginalMarkingView {
  const kind = locatorKind(item.locator)
  const kindLabel = locatorTypeLabel[kind] || '其他'
  const excerptTitle = item.excerptTitle?.trim() || undefined
  const excerptText = item.excerptText?.trim() || undefined
  return {
    kindLabel,
    locator: item.locator,
    excerptTitle,
    excerptText,
    hasContent: Boolean(excerptTitle || excerptText),
  }
}

// 按 id 缓存，避免模板中多次重复计算
const originalMarkingMap = computed(() => {
  const map = new Map<string, OriginalMarkingView>()
  for (const item of props.suggestions) {
    map.set(item.id, buildOriginalMarking(item))
  }
  return map
})

const displayPageTitle = computed(() => props.pageTitle?.trim() || '未命名页面')
const displaySectionTitle = computed(() => props.sectionTitle?.trim() || '')

const dialogTitle = computed(() => {
  if (displaySectionTitle.value) {
    return `AI 文档标记建议 · ${displaySectionTitle.value}`
  }
  return `AI 文档标记建议 · ${displayPageTitle.value}`
})

function toggle(id: string, checked: boolean) {
  const next = new Set(selectedIds.value)
  if (checked) next.add(id)
  else next.delete(id)
  selectedIds.value = next
}

function toggleAll(checked: boolean) {
  selectedIds.value = checked
    ? new Set(props.suggestions.map((item) => item.id))
    : new Set()
}

function close() {
  emit('update:visible', false)
  emit('cancel')
}

function confirm() {
  emit('apply', {
    selectedIds: [...selectedIds.value],
    replaceExistingAi: replaceExistingAi.value,
  })
}

function locatorPreview(locator: string): string {
  const parts = locator.split(':')
  return parts.slice(-2).join(':') || locator
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    :title="dialogTitle"
    width="720px"
    class="tu-dialog-viewport"
    destroy-on-close
    @update:model-value="emit('update:visible', $event)"
    @close="close"
  >
    <div class="dmr-page-header">
      <span class="dmr-page-header__label">分析页面</span>
      <span class="dmr-page-header__title" :title="displayPageTitle">{{ displayPageTitle }}</span>
    </div>
    <div v-if="loading" class="dmr-loading">{{ progressMessage || '正在分析…' }}</div>
    <template v-else>
      <p class="dmr-hint">勾选要应用的建议。手动标记区域不会被覆盖。</p>
      <label class="dmr-replace">
        <input v-model="replaceExistingAi" type="checkbox" />
        替换本页已有 AI 标记
      </label>
      <div class="dmr-toolbar">
        <button type="button" class="dmr-link" @click="toggleAll(true)">全选</button>
        <button type="button" class="dmr-link" @click="toggleAll(false)">全不选</button>
        <span class="dmr-count">共 {{ suggestions.length }} 条</span>
      </div>
      <div class="dmr-list">
        <label
          v-for="item in sortedSuggestions"
          :key="item.id"
          class="dmr-item"
        >
          <input
            type="checkbox"
            :checked="selectedIds.has(item.id)"
            @change="toggle(item.id, ($event.target as HTMLInputElement).checked)"
          />
          <div class="dmr-item__body">
            <div class="dmr-item__head">
              <span class="dmr-action">{{ actionLabel[item.action] || item.action }}</span>
              <span v-if="item.confidence != null" class="dmr-confidence">{{ Math.round(item.confidence * 100) }}%</span>
              <span class="dmr-locator-kind">{{ originalMarkingMap.get(item.id)?.kindLabel }}</span>
            </div>
            <div class="dmr-locator" :title="item.locator">{{ locatorPreview(item.locator) }}</div>
            <template v-if="originalMarkingMap.get(item.id)?.hasContent">
              <div class="dmr-original">
                <div class="dmr-original__label">原标记</div>
                <div v-if="originalMarkingMap.get(item.id)?.excerptTitle" class="dmr-original__title">
                  {{ originalMarkingMap.get(item.id)?.excerptTitle }}
                </div>
                <div v-if="originalMarkingMap.get(item.id)?.excerptText" class="dmr-original__text">
                  {{ originalMarkingMap.get(item.id)?.excerptText }}
                </div>
              </div>
            </template>
            <div v-if="item.relationTypeKey || item.toPointId" class="dmr-target">
              <span v-if="item.relationTypeKey" class="dmr-target__chip">{{ item.relationTypeKey }}</span>
              <span v-if="item.toPointId" class="dmr-target__point">→ {{ item.toPointId }}</span>
            </div>
            <div v-if="item.reason" class="dmr-reason">{{ item.reason }}</div>
          </div>
        </label>
      </div>
    </template>
    <template #footer>
      <el-button @click="close">取消</el-button>
      <el-button
        type="primary"
        :disabled="loading || selectedIds.size === 0"
        @click="confirm"
      >
        应用选中 ({{ selectedIds.size }})
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.dmr-loading {
  padding: 24px 0;
  text-align: center;
  color: #666;
}
.dmr-page-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  margin-bottom: 12px;
  background: #f5f7fa;
  border-radius: 6px;
}
.dmr-page-header__label {
  font-size: 12px;
  color: #999;
  flex-shrink: 0;
}
.dmr-page-header__title {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dmr-hint {
  margin: 0 0 12px;
  color: #666;
  font-size: 13px;
}
.dmr-replace {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  font-size: 13px;
}
.dmr-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}
.dmr-link {
  border: none;
  background: none;
  color: #1677ff;
  cursor: pointer;
  font-size: 13px;
  padding: 0;
}
.dmr-count {
  margin-left: auto;
  font-size: 12px;
  color: #999;
}
.dmr-list {
  max-height: min(50vh, 460px);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.dmr-item {
  display: flex;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid #eee;
  border-radius: 8px;
  cursor: pointer;
}
.dmr-item__body {
  flex: 1;
  min-width: 0;
}
.dmr-item__head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.dmr-action {
  font-weight: 600;
  font-size: 13px;
}
.dmr-confidence {
  font-size: 12px;
  color: #1677ff;
}
.dmr-locator-kind {
  font-size: 11px;
  color: #7a4dd1;
  background: #f3ecff;
  padding: 1px 6px;
  border-radius: 4px;
}
.dmr-locator {
  margin-top: 2px;
  font-size: 12px;
  color: #888;
  font-family: ui-monospace, monospace;
  word-break: break-all;
}
.dmr-original {
  margin-top: 6px;
  padding: 6px 8px;
  background: #fafafa;
  border-left: 3px solid #1677ff;
  border-radius: 4px;
}
.dmr-original__label {
  font-size: 11px;
  color: #999;
  margin-bottom: 2px;
}
.dmr-original__title {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
}
.dmr-original__text {
  margin-top: 2px;
  font-size: 12px;
  color: #555;
  line-height: 1.5;
  max-height: 4.5em;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}
.dmr-target {
  margin-top: 6px;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.dmr-target__chip {
  font-size: 11px;
  color: #1677ff;
  background: #e6f4ff;
  padding: 1px 6px;
  border-radius: 4px;
}
.dmr-target__point {
  font-size: 11px;
  color: #666;
  font-family: ui-monospace, monospace;
}
.dmr-reason {
  margin-top: 4px;
  font-size: 13px;
  color: #444;
}
</style>

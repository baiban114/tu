<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { DocumentMarkingSuggestion } from '@/api/types'

const props = defineProps<{
  visible: boolean
  suggestions: DocumentMarkingSuggestion[]
  loading?: boolean
  progressMessage?: string
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

const sortedSuggestions = computed(() => [...props.suggestions])

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
    title="AI 文档标记建议"
    width="640px"
    class="tu-dialog-viewport"
    destroy-on-close
    @update:model-value="emit('update:visible', $event)"
    @close="close"
  >
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
            </div>
            <div class="dmr-locator">{{ locatorPreview(item.locator) }}</div>
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
  max-height: min(50vh, 420px);
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
.dmr-item__head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.dmr-action {
  font-weight: 600;
  font-size: 13px;
}
.dmr-confidence {
  font-size: 12px;
  color: #1677ff;
}
.dmr-locator {
  font-size: 12px;
  color: #888;
  font-family: ui-monospace, monospace;
}
.dmr-reason {
  margin-top: 4px;
  font-size: 13px;
  color: #444;
}
</style>

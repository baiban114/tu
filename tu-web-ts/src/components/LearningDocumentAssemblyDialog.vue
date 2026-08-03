<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  ElButton,
  ElCheckbox,
  ElDialog,
  ElInput,
  ElMessage,
  ElPagination,
  ElScrollbar,
} from 'element-plus'
import {
  assembleLearningDocumentStream,
  type AssemblyInsert,
  type LearningDocumentAssemblyPlan,
} from '@/api/aiLearningDocument'
import { useWorkspaceStore } from '@/stores/workspace'
import {
  assemblyInsertKey,
  assemblyInsertLabel,
  filterSelectedInserts,
} from '@/utils/learningDocumentAssembly'
import { createLearningDocumentPageFromPlan } from '@/utils/learningDocumentAssemblyApply'
import { DEFAULT_PAGE_SIZE } from '@/constants/pagination'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
}>()

const store = useWorkspaceStore()

const topic = ref('')
const loading = ref(false)
const applying = ref(false)
const progressMessage = ref('')
const plan = ref<LearningDocumentAssemblyPlan | null>(null)
const selectedKeys = ref<Set<string>>(new Set())
const previewPage = ref(0)
const abortController = ref<AbortController | null>(null)

const kbId = computed(() => store.currentKbId || '')
const kbName = computed(() => {
  const id = kbId.value
  if (!id) return ''
  return store.kbList.find((kb) => kb.id === id)?.name || id
})

const insertRows = computed(() => {
  if (!plan.value) return []
  return plan.value.inserts.map((insert, index) => {
    const key = assemblyInsertKey(insert, index)
    return {
      key,
      insert,
      label: assemblyInsertLabel(insert),
      forPointId: insert.forPointId,
    }
  })
})

const pagedRows = computed(() => {
  const start = previewPage.value * DEFAULT_PAGE_SIZE
  return insertRows.value.slice(start, start + DEFAULT_PAGE_SIZE)
})

const previewTotal = computed(() => insertRows.value.length)

const pointsWithoutMaterial = computed(() => {
  if (!plan.value) return [] as string[]
  const withMaterial = new Set(
    plan.value.inserts.filter((item) => item.type !== 'heading').map((item) => item.forPointId),
  )
  return plan.value.orderedPointIds.filter((id) => !withMaterial.has(id))
})

const pointTitleById = computed(() => {
  const map = new Map<string, string>()
  for (const insert of plan.value?.inserts || []) {
    if (insert.type === 'heading' && insert.text.trim()) {
      map.set(insert.forPointId, insert.text.trim())
    }
  }
  return map
})

function pointLabel(pointId: string): string {
  return pointTitleById.value.get(pointId) || pointId
}

watch(
  () => props.visible,
  (open) => {
    if (open) {
      topic.value = ''
      plan.value = null
      selectedKeys.value = new Set()
      progressMessage.value = ''
      previewPage.value = 0
      return
    }
    abortRunning()
  },
)

function setVisible(value: boolean) {
  emit('update:visible', value)
}

function abortRunning() {
  abortController.value?.abort()
  abortController.value = null
  loading.value = false
}

function toggleKey(key: string, checked: boolean) {
  const next = new Set(selectedKeys.value)
  if (checked) next.add(key)
  else next.delete(key)
  selectedKeys.value = next
}

function toggleAll(checked: boolean) {
  selectedKeys.value = checked
    ? new Set(insertRows.value.map((row) => row.key))
    : new Set()
}

async function startAssemble() {
  const trimmed = topic.value.trim()
  if (!trimmed) {
    ElMessage.warning('请输入学习主题')
    return
  }
  if (!kbId.value) {
    ElMessage.warning('请先选择知识库')
    return
  }
  abortRunning()
  plan.value = null
  selectedKeys.value = new Set()
  previewPage.value = 0
  loading.value = true
  progressMessage.value = '准备开始…'
  const controller = new AbortController()
  abortController.value = controller
  try {
    const result = await assembleLearningDocumentStream(
      { topic: trimmed, kbId: kbId.value },
      {
        signal: controller.signal,
        onEvent: (event) => {
          progressMessage.value = event.message || progressMessage.value
          if (event.phase === 'completed' && event.result) {
            plan.value = event.result
          }
        },
      },
    )
    plan.value = result
    selectedKeys.value = new Set(
      result.inserts.map((insert, index) => assemblyInsertKey(insert, index)),
    )
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      progressMessage.value = '已取消'
      return
    }
    ElMessage.error(err instanceof Error ? err.message : '学习文档编排失败')
  } finally {
    loading.value = false
    abortController.value = null
  }
}

async function confirmCreate() {
  if (!plan.value || !kbId.value) return
  const selected = filterSelectedInserts(plan.value, selectedKeys.value)
  if (!selected.length) {
    ElMessage.warning('请至少勾选一条材料')
    return
  }
  applying.value = true
  try {
    await createLearningDocumentPageFromPlan({
      kbId: kbId.value,
      plan: plan.value,
      selectedInserts: selected,
      refreshPageTree: () => store.refreshPageTree(),
      selectPage: (pageId) => store.selectPage(pageId),
    })
    ElMessage.success('已新建学习文档页')
    setVisible(false)
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '创建学习文档失败')
  } finally {
    applying.value = false
  }
}

function onClosed() {
  abortRunning()
}

function typeBadge(insert: AssemblyInsert): string {
  switch (insert.type) {
    case 'heading':
      return '标题'
    case 'refBlock':
      return '引用'
    case 'externalResourceBlock':
      return '资源'
    case 'pdfExcerptBlock':
      return 'PDF'
    default:
      return '其他'
  }
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    title="AI 学习文档"
    width="720px"
    class="tu-dialog-viewport learning-doc-assembly-dialog"
    destroy-on-close
    @update:model-value="setVisible"
    @closed="onClosed"
  >
    <div class="assembly-root">
      <div class="assembly-form">
        <div class="field">
          <div class="field-label">当前知识库</div>
          <div class="field-value">{{ kbName || '未选择' }}</div>
        </div>
        <div class="field">
          <div class="field-label">学习主题</div>
          <ElInput
            v-model="topic"
            placeholder="例如：数据结构入门"
            maxlength="512"
            show-word-limit
            :disabled="loading || applying"
            @keydown.enter.prevent="startAssemble"
          />
        </div>
        <div class="form-actions">
          <ElButton
            type="primary"
            :loading="loading"
            :disabled="!kbId || applying"
            @click="startAssemble"
          >
            开始分析
          </ElButton>
          <ElButton v-if="loading" @click="abortRunning">取消</ElButton>
        </div>
        <div class="progress-slot">
          <span v-if="loading || progressMessage">{{ progressMessage || '…' }}</span>
          <span v-else class="muted">输入主题后开始编排；确认后将新建一页写入引用材料，不会改写当前打开的页面。</span>
        </div>
      </div>

      <div class="assembly-preview">
        <div class="preview-toolbar">
          <span class="preview-title">编排预览</span>
          <ElCheckbox
            :model-value="selectedKeys.size > 0 && selectedKeys.size === insertRows.length"
            :indeterminate="selectedKeys.size > 0 && selectedKeys.size < insertRows.length"
            :disabled="!insertRows.length || loading || applying"
            @change="(v: boolean | string | number) => toggleAll(Boolean(v))"
          >
            全选
          </ElCheckbox>
        </div>
        <div class="preview-body">
          <ElScrollbar class="preview-scroll">
            <div v-if="!plan && !loading" class="empty-state">
              分析完成后将在此展示知识点顺序与可插入材料。
            </div>
            <div v-else-if="loading && !plan" class="empty-state">
              正在编排… {{ progressMessage }}
            </div>
            <template v-else>
              <div v-if="plan?.orderedPointIds?.length" class="point-order">
                <div class="section-label">知识点顺序</div>
                <ol>
                  <li v-for="pointId in plan.orderedPointIds" :key="pointId">
                    {{ pointLabel(pointId) }}
                    <span v-if="pointsWithoutMaterial.includes(pointId)" class="warn-tag">暂无可用引用</span>
                  </li>
                </ol>
              </div>
              <div v-if="plan?.warnings?.length" class="warnings">
                <div class="section-label">提示</div>
                <ul>
                  <li v-for="(w, i) in plan.warnings" :key="i">{{ w }}</li>
                </ul>
              </div>
              <div class="insert-list">
                <div class="section-label">材料（勾选后写入新页）</div>
                <div
                  v-for="row in pagedRows"
                  :key="row.key"
                  class="insert-row"
                >
                  <ElCheckbox
                    :model-value="selectedKeys.has(row.key)"
                    :disabled="applying"
                    @change="(v: boolean | string | number) => toggleKey(row.key, Boolean(v))"
                  />
                  <span class="type-badge">{{ typeBadge(row.insert) }}</span>
                  <span class="insert-label" :title="row.label">{{ row.label }}</span>
                </div>
                <div v-if="!insertRows.length" class="empty-state compact">暂无可插入材料</div>
              </div>
            </template>
          </ElScrollbar>
        </div>
        <div class="preview-footer">
          <ElPagination
            v-if="previewTotal > DEFAULT_PAGE_SIZE"
            small
            layout="prev, pager, next"
            :page-size="DEFAULT_PAGE_SIZE"
            :current-page="previewPage + 1"
            :total="previewTotal"
            @current-change="(p: number) => { previewPage = Math.max(0, p - 1) }"
          />
          <span v-else class="muted">共 {{ previewTotal }} 条</span>
        </div>
      </div>
    </div>

    <template #footer>
      <ElButton @click="setVisible(false)">关闭</ElButton>
      <ElButton
        type="primary"
        :loading="applying"
        :disabled="!plan || loading || selectedKeys.size === 0"
        @click="confirmCreate"
      >
        确认生成新页
      </ElButton>
    </template>
  </el-dialog>
</template>

<style scoped>
.assembly-root {
  height: min(560px, calc(100dvh - 180px));
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}

.assembly-form {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.field-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.field-value {
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.form-actions {
  display: flex;
  gap: 8px;
}

.progress-slot {
  min-height: 36px;
  font-size: 12px;
  color: var(--el-text-color-regular);
  display: flex;
  align-items: center;
}

.muted {
  color: var(--el-text-color-secondary);
}

.assembly-preview {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  overflow: hidden;
}

.preview-toolbar,
.preview-footer {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-blank);
}

.preview-footer {
  border-bottom: none;
  border-top: 1px solid var(--el-border-color-lighter);
  min-height: 40px;
}

.preview-title {
  font-size: 13px;
  font-weight: 600;
}

.preview-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.preview-scroll {
  height: 100%;
}

.empty-state {
  min-height: 160px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
  text-align: center;
  box-sizing: border-box;
}

.empty-state.compact {
  min-height: 80px;
}

.section-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
  margin: 8px 10px 4px;
}

.point-order ol,
.warnings ul {
  margin: 0 10px 8px;
  padding-left: 20px;
  font-size: 12px;
}

.warn-tag {
  margin-left: 6px;
  color: var(--el-color-warning);
  font-size: 11px;
}

.warnings li {
  color: var(--el-color-warning-dark-2);
}

.insert-list {
  padding-bottom: 8px;
}

.insert-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  min-height: 32px;
}

.type-badge {
  flex-shrink: 0;
  font-size: 11px;
  padding: 0 6px;
  border-radius: 4px;
  background: var(--el-fill-color);
  color: var(--el-text-color-regular);
}

.insert-label {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>

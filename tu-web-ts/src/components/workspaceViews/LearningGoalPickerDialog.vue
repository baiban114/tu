<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  ElButton,
  ElDialog,
  ElInput,
  ElMessage,
  ElPagination,
  ElScrollbar,
} from 'element-plus'
import {
  createLearningGoal,
  listLearningGoals,
  setCurrentLearningGoal,
  updateLearningGoal,
  type LearningGoal,
} from '@/api/learningGoal'
import { DEFAULT_PAGE_SIZE } from '@/constants/pagination'
import { useAuthStore } from '@/stores/auth'
import { useWorkspaceStore } from '@/stores/workspace'
import { openKnowledgePointPicker } from '@/utils/knowledgePointPicker'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  select: [goal: LearningGoal]
}>()

const auth = useAuthStore()
const workspace = useWorkspaceStore()

const loading = ref(false)
const saving = ref(false)
const items = ref<LearningGoal[]>([])
const total = ref(0)
const page = ref(0)
const selectedId = ref<string | null>(null)
const draftTitle = ref('')
const editingId = ref<string | null>(null)
const editTitle = ref('')
const error = ref('')

const userId = computed(() => auth.user?.id ?? null)

const dialogVisible = computed({
  get: () => props.visible,
  set: (value: boolean) => emit('update:visible', value),
})

async function reload(nextPage = page.value) {
  loading.value = true
  error.value = ''
  try {
    const result = await listLearningGoals(nextPage, DEFAULT_PAGE_SIZE, userId.value)
    items.value = result.items
    total.value = result.total
    page.value = result.page
    const current = result.items.find((item) => item.currentFlag)
    if (current && !selectedId.value) selectedId.value = current.id
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载 StudyFlow 目标失败（请确认 studyflow-service 已启动）'
    items.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

watch(
  () => props.visible,
  (open) => {
    if (!open) return
    selectedId.value = null
    editingId.value = null
    draftTitle.value = ''
    void reload(0)
  },
)

function close() {
  dialogVisible.value = false
}

async function onCreateFreeText() {
  const title = draftTitle.value.trim()
  if (!title) return
  saving.value = true
  try {
    const goal = await createLearningGoal({
      title,
      sourceKind: 'free_text',
      kbId: workspace.currentKbId,
      setCurrent: true,
    }, userId.value)
    draftTitle.value = ''
    selectedId.value = goal.id
    await reload(0)
    ElMessage.success('已在 StudyFlow 新建并设为当前目标')
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '新建失败')
  } finally {
    saving.value = false
  }
}

async function onCreateFromKnowledgePoint() {
  const kbId = workspace.currentKbId
  if (!kbId) {
    ElMessage.warning('请先选择知识库')
    return
  }
  const point = await openKnowledgePointPicker({
    kbId,
    title: '选择目标知识点并同步到 StudyFlow',
    confirmText: '设为 StudyFlow 目标',
    hint: '将创建/更新 StudyFlow 当前目标，并用于学习计划视图',
  })
  if (!point) return
  saving.value = true
  try {
    const goal = await createLearningGoal({
      title: point.title,
      sourceKind: 'knowledge_point',
      kbId,
      knowledgePointId: point.id,
      setCurrent: true,
    }, userId.value)
    selectedId.value = goal.id
    await reload(0)
    ElMessage.success('已同步知识点目标到 StudyFlow')
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '同步失败')
  } finally {
    saving.value = false
  }
}

function startEdit(goal: LearningGoal) {
  editingId.value = goal.id
  editTitle.value = goal.title
}

async function saveEdit() {
  if (!editingId.value) return
  const title = editTitle.value.trim()
  if (!title) return
  const existing = items.value.find((item) => item.id === editingId.value)
  if (!existing) return
  saving.value = true
  try {
    await updateLearningGoal(editingId.value, {
      title,
      kbId: existing.kbId ?? workspace.currentKbId,
      sourceKind: existing.sourceKind,
      knowledgePointId: existing.knowledgePointId,
      resourceItemId: existing.resourceItemId,
      resourceExcerptId: existing.resourceExcerptId,
      snapshotJson: existing.snapshotJson,
      setCurrent: Boolean(existing.currentFlag),
    }, userId.value)
    editingId.value = null
    await reload(page.value)
    ElMessage.success('已更新 StudyFlow 目标')
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '更新失败')
  } finally {
    saving.value = false
  }
}

async function confirmSelect() {
  const goal = items.value.find((item) => item.id === selectedId.value)
  if (!goal) {
    ElMessage.warning('请先选择一个目标')
    return
  }
  saving.value = true
  try {
    const activated = goal.currentFlag
      ? goal
      : await setCurrentLearningGoal(goal.id, userId.value)
    emit('select', activated)
    close()
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '设为当前目标失败')
  } finally {
    saving.value = false
  }
}

function sourceLabel(kind: string): string {
  if (kind === 'knowledge_point') return '知识点'
  if (kind === 'resource_item') return '资源'
  if (kind === 'resource_excerpt') return '节选'
  return '自拟'
}
</script>

<template>
  <ElDialog
    v-model="dialogVisible"
    title="选择 StudyFlow 学习目标"
    width="560px"
    class="tu-dialog-viewport learning-goal-picker-dialog"
    append-to-body
    destroy-on-close
    @click.stop
  >
    <div class="learning-goal-picker">
      <p class="learning-goal-picker__hint">
        选用 StudyFlow 中已设立的目标；也可在此新建/修改并写回 StudyFlow 当前目标。
      </p>

      <div class="learning-goal-picker__composer">
        <ElInput
          v-model="draftTitle"
          size="small"
          placeholder="自拟目标标题"
          :disabled="saving"
          @keyup.enter="onCreateFreeText"
        />
        <ElButton size="small" :disabled="saving || !draftTitle.trim()" @click="onCreateFreeText">
          新建并设为当前
        </ElButton>
        <ElButton size="small" :disabled="saving || !workspace.currentKbId" @click="onCreateFromKnowledgePoint">
          从知识点点同步
        </ElButton>
      </div>

      <p v-if="error" class="learning-goal-picker__error">{{ error }}</p>

      <div v-loading="loading" class="learning-goal-picker__list-host">
        <ElScrollbar class="learning-goal-picker__scroll">
          <button
            v-for="goal in items"
            :key="goal.id"
            type="button"
            class="learning-goal-picker__row"
            :class="{
              'learning-goal-picker__row--active': selectedId === goal.id,
              'learning-goal-picker__row--current': goal.currentFlag,
            }"
            @click="selectedId = goal.id"
          >
            <template v-if="editingId === goal.id">
              <ElInput
                v-model="editTitle"
                size="small"
                @click.stop
                @keyup.enter="saveEdit"
              />
              <ElButton size="small" link type="primary" @click.stop="saveEdit">保存</ElButton>
              <ElButton size="small" link @click.stop="editingId = null">取消</ElButton>
            </template>
            <template v-else>
              <span class="learning-goal-picker__title">{{ goal.title }}</span>
              <span class="learning-goal-picker__meta">
                {{ sourceLabel(String(goal.sourceKind)) }}
                <template v-if="goal.currentFlag"> · 当前</template>
              </span>
              <ElButton size="small" link @click.stop="startEdit(goal)">改标题</ElButton>
            </template>
          </button>
          <div v-if="!loading && items.length === 0" class="learning-goal-picker__empty">
            暂无目标，请新建或在 StudyFlow「目标」页设立。
          </div>
        </ElScrollbar>
      </div>

      <div class="learning-goal-picker__pager">
        <ElPagination
          small
          layout="prev, pager, next"
          :total="total"
          :page-size="DEFAULT_PAGE_SIZE"
          :current-page="page + 1"
          @current-change="(p: number) => reload(p - 1)"
        />
      </div>
    </div>

    <template #footer>
      <ElButton @click="close">取消</ElButton>
      <ElButton type="primary" :disabled="!selectedId || saving" :loading="saving" @click="confirmSelect">
        选用并设为当前
      </ElButton>
    </template>
  </ElDialog>
</template>

<style scoped>
.learning-goal-picker {
  display: flex;
  flex-direction: column;
  height: min(480px, calc(100dvh - 180px));
  min-height: 360px;
}

.learning-goal-picker__hint {
  margin: 0 0 10px;
  flex-shrink: 0;
  font-size: 12px;
  color: #909399;
  line-height: 1.5;
}

.learning-goal-picker__composer {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.learning-goal-picker__composer :deep(.el-input) {
  flex: 1;
  min-width: 140px;
}

.learning-goal-picker__error {
  margin: 0 0 8px;
  flex-shrink: 0;
  font-size: 12px;
  color: #f56c6c;
}

.learning-goal-picker__list-host {
  flex: 1;
  min-height: 0;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  overflow: hidden;
  background: #fff;
}

.learning-goal-picker__scroll {
  height: 100%;
}

.learning-goal-picker__row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border: none;
  border-bottom: 1px solid #f0f2f5;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.learning-goal-picker__row:hover {
  background: #f5f7fa;
}

.learning-goal-picker__row--active {
  background: #ecf5ff;
}

.learning-goal-picker__row--current .learning-goal-picker__meta {
  color: #e6a23c;
}

.learning-goal-picker__title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  color: #303133;
}

.learning-goal-picker__meta {
  flex-shrink: 0;
  font-size: 11px;
  color: #909399;
}

.learning-goal-picker__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  padding: 16px;
  font-size: 12px;
  color: #909399;
  text-align: center;
}

.learning-goal-picker__pager {
  flex-shrink: 0;
  display: flex;
  justify-content: center;
  min-height: 32px;
  padding-top: 8px;
}
</style>

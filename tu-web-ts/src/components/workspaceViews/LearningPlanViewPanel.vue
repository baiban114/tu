<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage, ElTooltip } from 'element-plus'
import type { LearningGoal } from '@/api/learningGoal'
import {
  masteryStatusLabel,
  nextMasteryStatus,
  projectKnowledgePointMastery,
  upsertKnowledgePointMastery,
  type MasteryStatus,
} from '@/api/learningMastery'
import { useAuthStore } from '@/stores/auth'
import { useWorkspaceStore } from '@/stores/workspace'
import { useWorkspaceViewsStore } from '@/stores/workspaceViews'
import LearningGoalPickerDialog from './LearningGoalPickerDialog.vue'
import LearningPlanRouteTable from './LearningPlanRouteTable.vue'
import LearningRouteChatDialog from './LearningRouteChatDialog.vue'

const workspace = useWorkspaceStore()
const views = useWorkspaceViewsStore()
const auth = useAuthStore()

const masteryByPointId = ref<Record<string, MasteryStatus | string>>({})
const suggestedNextPointId = ref<string | null>(null)
const masteryLoading = ref(false)

const kbName = computed(() => (
  workspace.kbList.find((kb) => kb.id === workspace.currentKbId)?.name ?? '未选择'
))

const emptyText = computed(() => {
  if (views.learningPlanError) return views.learningPlanError
  if (!workspace.currentKbId) return '请先切换到「知识库」并选择一个知识库作为数据源。'
  return '暂无知识点行。点「选目标」从 StudyFlow 选用目标后重建。'
})

const nextHint = computed(() => {
  if (!suggestedNextPointId.value) {
    const rows = views.learningPlanSnapshot?.rows ?? []
    if (!rows.length) return ''
    return '路线步骤均已掌握（或尚无进度）'
  }
  const row = views.learningPlanSnapshot?.rows.find((r) => r.pointId === suggestedNextPointId.value)
  return row ? `建议下一项：${row.title}` : `建议下一项：${suggestedNextPointId.value}`
})

watch(
  () => workspace.currentKbId,
  () => {
    if (views.isViewsMode && views.isLearningPlanView) {
      void views.rebuildLearningPlanView()
    }
  },
)

watch(
  () => [
    views.learningPlanSnapshot?.kbId,
    views.learningPlanSnapshot?.rows.map((r) => r.pointId).join(','),
    views.learningPlanSnapshot?.builtAt,
  ] as const,
  () => {
    void refreshMasteryProjection()
  },
  { immediate: true },
)

async function refreshMasteryProjection() {
  const snapshot = views.learningPlanSnapshot
  if (!snapshot?.rows.length) {
    masteryByPointId.value = {}
    suggestedNextPointId.value = null
    return
  }
  masteryLoading.value = true
  try {
    const projection = await projectKnowledgePointMastery(
      snapshot.rows.map((row) => row.pointId),
      snapshot.kbId,
      auth.user?.id,
    )
    const map: Record<string, string> = {}
    for (const item of projection.items) {
      map[item.knowledgePointId] = item.status
    }
    masteryByPointId.value = map
    suggestedNextPointId.value = projection.suggestedNextPointId ?? null
  } catch {
    masteryByPointId.value = {}
    suggestedNextPointId.value = null
  } finally {
    masteryLoading.value = false
  }
}

function onSelectRow(pointId: string) {
  views.setPrimarySelectedPoint(pointId)
}

function onSelectedIdsUpdate(ids: string[]) {
  views.setSelectedPointIds(ids)
}

async function onCycleMastery(pointId: string) {
  const current = masteryByPointId.value[pointId] || 'unknown'
  const next = nextMasteryStatus(current)
  try {
    await upsertKnowledgePointMastery({
      knowledgePointId: pointId,
      kbId: workspace.currentKbId,
      status: next,
    }, auth.user?.id)
    masteryByPointId.value = {
      ...masteryByPointId.value,
      [pointId]: next,
    }
    await refreshMasteryProjection()
    ElMessage.success(`已标记为「${masteryStatusLabel(next)}」`)
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '更新掌握度失败')
  }
}

async function onGoalPicked(goal: LearningGoal) {
  await views.applyStudyflowGoal(goal)
}
</script>

<template>
  <div class="learning-plan-view">
    <div class="learning-plan-view__toolbar">
      <div class="learning-plan-view__goal">
        <span class="learning-plan-view__goal-label">目标</span>
        <ElTooltip
          :content="views.learningPlanSnapshot?.goal.label || views.learningPlanError || '未设置'"
          placement="top"
          :show-after="400"
        >
          <span class="learning-plan-view__goal-value">
            {{ views.learningPlanSnapshot?.goal.label || '—' }}
          </span>
        </ElTooltip>
      </div>
      <div class="learning-plan-view__actions">
        <el-button
          link
          size="small"
          :disabled="views.busy"
          @click.stop="views.openGoalPicker()"
        >
          选目标
        </el-button>
        <el-button
          link
          size="small"
          :disabled="!workspace.currentKbId || views.busy || !(views.manualGoal || views.learningPlanSnapshot?.goal)"
          @click.stop="views.openLearningRouteDialog()"
        >
          AI 路线
        </el-button>
        <el-button
          link
          size="small"
          :disabled="!workspace.currentKbId || views.busy"
          @click.stop="views.clearManualGoalAndRebuild()"
        >
          重建
        </el-button>
      </div>
    </div>

    <p class="learning-plan-view__meta">
      数据源：{{ kbName }}
      <template v-if="views.learningPlanSnapshot">
        · {{ views.learningPlanSnapshot.rows.length }} 个知识点
        <template v-if="views.learningPlanSnapshot.goal.source === 'studyflow-goal'">
          · StudyFlow
        </template>
      </template>
      <template v-if="views.routeStatus">
        · {{ views.routeStatus }}
      </template>
      <template v-if="nextHint">
        · {{ nextHint }}
      </template>
    </p>

    <LearningPlanRouteTable
      class="learning-plan-view__table"
      :rows="views.learningPlanSnapshot?.rows ?? []"
      :selected-point-id="views.selectedPointId"
      :selected-point-ids="views.selectedPointIds"
      :busy="views.busy || masteryLoading"
      :empty-text="emptyText"
      :page="views.listPage"
      show-mastery
      multi-select
      :mastery-by-point-id="masteryByPointId"
      :suggested-next-point-id="suggestedNextPointId"
      @update:page="views.setListPage"
      @update:selected-point-ids="onSelectedIdsUpdate"
      @select="onSelectRow"
      @cycle-mastery="onCycleMastery"
    />

    <LearningGoalPickerDialog
      :visible="views.goalPickerVisible"
      @update:visible="views.setGoalPickerVisible"
      @select="onGoalPicked"
    />
    <LearningRouteChatDialog
      :visible="views.routeDialogVisible"
      @update:visible="views.setRouteDialogVisible"
    />
  </div>
</template>

<style scoped>
.learning-plan-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.learning-plan-view__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  flex-shrink: 0;
  padding: 0 2px 6px;
}

.learning-plan-view__goal {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 1;
}

.learning-plan-view__goal-label {
  flex-shrink: 0;
  font-size: 11px;
  color: #909399;
}

.learning-plan-view__goal-value {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 600;
  color: #303133;
}

.learning-plan-view__actions {
  display: flex;
  flex-shrink: 0;
  gap: 2px;
}

.learning-plan-view__meta {
  margin: 0 2px 8px;
  flex-shrink: 0;
  font-size: 11px;
  color: #909399;
  line-height: 1.4;
}

.learning-plan-view__table {
  flex: 1;
  min-height: 0;
}
</style>

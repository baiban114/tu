<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElCheckbox, ElPagination, ElScrollbar, ElTooltip } from 'element-plus'
import { masteryStatusLabel, type MasteryStatus } from '@/api/learningMastery'
import { LEARNING_PLAN_PAGE_SIZE } from '@/constants/pagination'
import { paginateLearningPlanRows } from '@/workspaceViews/learningPlanView'
import type { LearningPlanViewRow } from '@/workspaceViews/types'

const props = withDefaults(defineProps<{
  rows: LearningPlanViewRow[]
  /** Primary (last) selection — used for reading pane / focus. */
  selectedPointId?: string | null
  /** Multi-select set. */
  selectedPointIds?: string[]
  busy?: boolean
  emptyText?: string
  /** 0-based page index */
  page?: number
  pageSize?: number
  /** pointId → mastery status */
  masteryByPointId?: Record<string, MasteryStatus | string>
  suggestedNextPointId?: string | null
  /** Show mastery column (StudyFlow projection). */
  showMastery?: boolean
  /** Enable checkbox multi-select column. */
  multiSelect?: boolean
}>(), {
  selectedPointId: null,
  selectedPointIds: () => [],
  busy: false,
  emptyText: '暂无知识点行。',
  page: 0,
  pageSize: LEARNING_PLAN_PAGE_SIZE,
  masteryByPointId: () => ({}),
  suggestedNextPointId: null,
  showMastery: false,
  multiSelect: true,
})

const emit = defineEmits<{
  'update:page': [page: number]
  select: [pointId: string, event: MouseEvent]
  'update:selected-point-ids': [ids: string[]]
  'cycle-mastery': [pointId: string]
}>()

const expandedIds = ref<Set<string>>(new Set())
const lastClickedId = ref<string | null>(null)

const pageSize = computed(() => Math.max(1, props.pageSize || LEARNING_PLAN_PAGE_SIZE))

const pageResult = computed(() => paginateLearningPlanRows(
  props.rows,
  props.page,
  pageSize.value,
))

const selectedSet = computed(() => new Set(props.selectedPointIds ?? []))

const pageIds = computed(() => pageResult.value.items.map((row) => row.pointId))

const allPageSelected = computed(() => (
  pageIds.value.length > 0 && pageIds.value.every((id) => selectedSet.value.has(id))
))

const somePageSelected = computed(() => (
  pageIds.value.some((id) => selectedSet.value.has(id)) && !allPageSelected.value
))

watch(
  () => [props.rows.length, pageSize.value] as const,
  () => {
    const maxPage = Math.max(0, Math.ceil(props.rows.length / pageSize.value) - 1)
    if (props.page > maxPage) emit('update:page', maxPage)
  },
)

function statusOf(pointId: string): string {
  return props.masteryByPointId?.[pointId] || 'unknown'
}

function isExpanded(pointId: string): boolean {
  return expandedIds.value.has(pointId)
}

function canExpand(row: LearningPlanViewRow): boolean {
  return Boolean(row.children?.length) || Boolean(row.summary?.trim())
}

function toggleExpand(pointId: string, event: Event) {
  event.stopPropagation()
  const next = new Set(expandedIds.value)
  if (next.has(pointId)) next.delete(pointId)
  else next.add(pointId)
  expandedIds.value = next
}

function emitIds(ids: string[]) {
  emit('update:selected-point-ids', ids)
}

function onSelectRow(pointId: string, event: MouseEvent) {
  if (!props.multiSelect) {
    emit('select', pointId, event)
    emitIds([pointId])
    lastClickedId.value = pointId
    return
  }

  const orderedIds = props.rows.map((row) => row.pointId)
  let next = [...(props.selectedPointIds ?? [])]

  if (event.shiftKey && lastClickedId.value) {
    const from = orderedIds.indexOf(lastClickedId.value)
    const to = orderedIds.indexOf(pointId)
    if (from >= 0 && to >= 0) {
      const [a, b] = from < to ? [from, to] : [to, from]
      const range = orderedIds.slice(a, b + 1)
      const set = new Set(next)
      for (const id of range) set.add(id)
      next = [...set]
    } else {
      next = [pointId]
    }
  } else if (event.ctrlKey || event.metaKey) {
    const set = new Set(next)
    if (set.has(pointId)) set.delete(pointId)
    else set.add(pointId)
    next = [...set]
  } else {
    next = [pointId]
  }

  lastClickedId.value = pointId
  emitIds(next)
  emit('select', pointId, event)
}

function onToggleCheckbox(pointId: string, checked: boolean) {
  const set = new Set(props.selectedPointIds ?? [])
  if (checked) set.add(pointId)
  else set.delete(pointId)
  const next = [...set]
  emitIds(next)
  if (checked) {
    lastClickedId.value = pointId
    emit('select', pointId, new MouseEvent('click'))
  }
}

function onToggleAllPage(checked: boolean) {
  const set = new Set(props.selectedPointIds ?? [])
  if (checked) {
    for (const id of pageIds.value) set.add(id)
  } else {
    for (const id of pageIds.value) set.delete(id)
  }
  emitIds([...set])
}

function onCycleMastery(pointId: string, event: Event) {
  event.stopPropagation()
  emit('cycle-mastery', pointId)
}

function onPageChange(p: number) {
  emit('update:page', p - 1)
}
</script>

<template>
  <div
    v-loading="busy"
    class="learning-plan-route-table"
  >
    <div class="learning-plan-route-table__host">
      <ElScrollbar class="learning-plan-route-table__scroll">
        <table
          v-if="pageResult.items.length > 0"
          class="learning-plan-route-table__table"
        >
          <thead>
            <tr>
              <th
                v-if="multiSelect"
                class="col-check"
              >
                <ElCheckbox
                  :model-value="allPageSelected"
                  :indeterminate="somePageSelected"
                  @change="(v: boolean | string | number) => onToggleAllPage(Boolean(v))"
                  @click.stop
                />
              </th>
              <th class="col-expand" />
              <th class="col-order">#</th>
              <th class="col-title">知识点</th>
              <th
                v-if="showMastery"
                class="col-mastery"
              >
                掌握
              </th>
              <th class="col-hours">学时</th>
            </tr>
          </thead>
          <tbody>
            <template
              v-for="row in pageResult.items"
              :key="row.pointId"
            >
              <tr
                class="learning-plan-route-table__row"
                :class="{
                  'learning-plan-route-table__row--active': selectedSet.has(row.pointId) || selectedPointId === row.pointId,
                  'learning-plan-route-table__row--goal': row.role === 'goal',
                  'learning-plan-route-table__row--next': suggestedNextPointId === row.pointId,
                  'learning-plan-route-table__row--mastered': statusOf(row.pointId) === 'mastered',
                }"
                @click.stop="onSelectRow(row.pointId, $event)"
              >
                <td
                  v-if="multiSelect"
                  class="col-check"
                  @click.stop
                >
                  <ElCheckbox
                    :model-value="selectedSet.has(row.pointId)"
                    @change="(v: boolean | string | number) => onToggleCheckbox(row.pointId, Boolean(v))"
                  />
                </td>
                <td class="col-expand">
                  <button
                    v-if="canExpand(row)"
                    type="button"
                    class="expand-btn"
                    :title="isExpanded(row.pointId) ? '收起' : '展开细粒度计划'"
                    @click="toggleExpand(row.pointId, $event)"
                  >
                    {{ isExpanded(row.pointId) ? '▼' : '▶' }}
                  </button>
                </td>
                <td class="col-order">{{ row.order + 1 }}</td>
                <td class="col-title">
                  <ElTooltip :content="row.title" placement="right" :show-after="400">
                    <span class="title-text">
                      {{ row.title }}
                      <span
                        v-if="suggestedNextPointId === row.pointId"
                        class="next-badge"
                      >建议</span>
                      <span
                        v-if="row.children?.length"
                        class="child-count"
                      >{{ row.children.length }}</span>
                    </span>
                  </ElTooltip>
                </td>
                <td
                  v-if="showMastery"
                  class="col-mastery"
                >
                  <button
                    type="button"
                    class="mastery-chip"
                    :class="`mastery-chip--${statusOf(row.pointId)}`"
                    title="点击切换掌握状态"
                    @click="onCycleMastery(row.pointId, $event)"
                  >
                    {{ masteryStatusLabel(statusOf(row.pointId)) }}
                  </button>
                </td>
                <td class="col-hours">{{ row.estimatedHours ?? '—' }}</td>
              </tr>
              <tr
                v-if="isExpanded(row.pointId) && canExpand(row)"
                class="learning-plan-route-table__child-row"
              >
                <td :colspan="(multiSelect ? 4 : 3) + (showMastery ? 1 : 0) + 1">
                  <div class="child-panel">
                    <p
                      v-if="row.summary?.trim()"
                      class="child-summary"
                    >
                      {{ row.summary }}
                    </p>
                    <ul
                      v-if="row.children?.length"
                      class="child-list"
                    >
                      <li
                        v-for="(child, idx) in row.children"
                        :key="child.pointId || `${row.pointId}-c-${idx}`"
                      >
                        <span class="child-order">{{ idx + 1 }}.</span>
                        <span class="child-title">{{ child.title }}</span>
                        <span
                          v-if="child.estimatedHours != null"
                          class="child-hours"
                        >{{ child.estimatedHours }}h</span>
                        <p
                          v-if="child.summary?.trim()"
                          class="child-summary nested"
                        >
                          {{ child.summary }}
                        </p>
                        <ul
                          v-if="child.children?.length"
                          class="child-list nested"
                        >
                          <li
                            v-for="(grand, gIdx) in child.children"
                            :key="grand.pointId || `${child.pointId}-g-${gIdx}`"
                          >
                            <span class="child-order">{{ idx + 1 }}.{{ gIdx + 1 }}</span>
                            <span class="child-title">{{ grand.title }}</span>
                          </li>
                        </ul>
                      </li>
                    </ul>
                    <p
                      v-else-if="!row.summary?.trim()"
                      class="child-empty"
                    >
                      暂无更细粒度步骤
                    </p>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>

        <div v-else class="learning-plan-route-table__empty">
          <p>{{ emptyText }}</p>
        </div>
      </ElScrollbar>
    </div>

    <div class="learning-plan-route-table__pager">
      <ElPagination
        small
        layout="prev, pager, next"
        :total="pageResult.total"
        :page-size="pageResult.pageSize"
        :current-page="pageResult.page + 1"
        @current-change="onPageChange"
      />
    </div>
  </div>
</template>

<style scoped>
.learning-plan-route-table {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.learning-plan-route-table__host {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  overflow: hidden;
  background: #fff;
}

.learning-plan-route-table__scroll {
  flex: 1;
  min-height: 0;
  height: 100%;
}

.learning-plan-route-table__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  table-layout: fixed;
}

.learning-plan-route-table__table th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: #f5f7fa;
  color: #606266;
  font-weight: 600;
  text-align: left;
  padding: 6px 8px;
  border-bottom: 1px solid #ebeef5;
}

.learning-plan-route-table__row td {
  padding: 6px 8px;
  border-bottom: 1px solid #f0f2f5;
  color: #303133;
  vertical-align: middle;
}

.learning-plan-route-table__row {
  cursor: pointer;
}

.learning-plan-route-table__row:hover {
  background: #f5f7fa;
}

.learning-plan-route-table__row--active {
  background: #ecf5ff;
}

.learning-plan-route-table__row--next {
  background: #f0f9eb;
}

.learning-plan-route-table__row--mastered .title-text {
  color: #909399;
}

.col-check {
  width: 28px;
  text-align: center;
}

.col-expand {
  width: 22px;
  padding-left: 4px !important;
  padding-right: 0 !important;
}

.expand-btn {
  margin: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: #909399;
  font-size: 10px;
  cursor: pointer;
  line-height: 1;
}

.col-order {
  width: 28px;
  color: #909399;
  white-space: nowrap;
}

.col-mastery {
  width: 64px;
  white-space: nowrap;
}

.col-hours {
  width: 48px;
  text-align: right;
  white-space: nowrap;
}

.col-title {
  width: auto;
}

.title-text {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.next-badge,
.child-count {
  flex-shrink: 0;
  font-size: 10px;
  padding: 0 4px;
  border-radius: 3px;
  color: #fff;
}

.next-badge {
  background: #67c23a;
}

.child-count {
  background: #909399;
}

.mastery-chip {
  margin: 0;
  padding: 1px 6px;
  border: none;
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
  background: #f2f3f5;
  color: #606266;
}

.mastery-chip--learning {
  background: #ecf5ff;
  color: #409eff;
}

.mastery-chip--mastered {
  background: #f0f9eb;
  color: #67c23a;
}

.learning-plan-route-table__child-row td {
  padding: 0;
  background: #fafafa;
  border-bottom: 1px solid #ebeef5;
}

.child-panel {
  padding: 8px 10px 10px 36px;
  max-height: 160px;
  overflow-y: auto;
  box-sizing: border-box;
}

.child-summary {
  margin: 0 0 6px;
  font-size: 12px;
  color: #606266;
  line-height: 1.45;
  white-space: pre-wrap;
}

.child-summary.nested {
  margin: 4px 0 0 18px;
  font-size: 11px;
  color: #909399;
}

.child-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.child-list > li {
  padding: 4px 0;
  border-bottom: 1px dashed #ebeef5;
  font-size: 12px;
  color: #303133;
}

.child-list > li:last-child {
  border-bottom: none;
}

.child-list.nested {
  margin-left: 16px;
}

.child-order {
  color: #909399;
  margin-right: 6px;
}

.child-title {
  font-weight: 500;
}

.child-hours {
  margin-left: 8px;
  color: #909399;
  font-size: 11px;
}

.child-empty {
  margin: 0;
  font-size: 12px;
  color: #c0c4cc;
}

.learning-plan-route-table__empty {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  min-height: 160px;
  padding: 16px;
  text-align: center;
  font-size: 12px;
  color: #909399;
  line-height: 1.5;
}

.learning-plan-route-table__empty p {
  margin: 0;
}

.learning-plan-route-table__pager {
  flex-shrink: 0;
  display: flex;
  justify-content: center;
  padding-top: 8px;
  min-height: 32px;
}
</style>

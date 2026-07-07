<script setup lang="ts">
import { computed } from 'vue'
import type { MultiTableRecord, MultiTableSubtask } from '@/api/types'

interface LearningPlanKanbanNode {
  id: string
  title: string
  description: string
  resource: string
  hoursLabel: string
  children: LearningPlanKanbanNode[]
}

const props = withDefaults(defineProps<{
  record: MultiTableRecord
  title: string
  statusLabel: string
  showHours?: boolean
  hoursLabel?: string
  isTaskTable?: boolean
  isLearningPlan?: boolean
  learningChildren?: LearningPlanKanbanNode[]
  editable?: boolean
}>(), {
  showHours: false,
  hoursLabel: '',
  isTaskTable: false,
  isLearningPlan: false,
  learningChildren: () => [],
  editable: true,
})

const emit = defineEmits<{
  (e: 'add-subtask'): void
  (e: 'update-subtask', subtaskId: string, patch: Partial<MultiTableSubtask>): void
  (e: 'delete-subtask', subtaskId: string): void
  (e: 'native-dragstart', event: DragEvent): void
}>()

const subtasks = computed(() => props.record.subtasks || [])

const toFiniteNumber = (value: unknown) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

const formatHours = (value: number) => {
  const rounded = Math.round(value * 100) / 100
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(2)} 小时`
}
</script>

<template>
  <article
    class="kanban-card"
    :data-record-id="record.id"
    :draggable="editable"
    @dragstart="emit('native-dragstart', $event)"
  >
    <strong>{{ title }}</strong>
    <p>{{ statusLabel }}</p>
    <p v-if="showHours" class="kanban-card__hours">
      {{ hoursLabel }}
    </p>
    <div v-if="isTaskTable" class="record-subtasks" @pointerdown.stop @mousedown.stop @dragstart.stop>
      <label v-for="subtask in subtasks" :key="subtask.id" class="record-subtask">
        <input
          v-if="editable"
          type="checkbox"
          :checked="Boolean(subtask.done)"
          @change.stop="emit('update-subtask', subtask.id, { done: ($event.target as HTMLInputElement).checked })"
        />
        <span v-else-if="subtask.done" class="record-subtask__done">✓</span>
        <input
          v-if="editable"
          class="record-subtask__title"
          :value="subtask.title"
          @input.stop="emit('update-subtask', subtask.id, { title: ($event.target as HTMLInputElement).value })"
        />
        <span v-else class="record-subtask__title">{{ subtask.title }}</span>
        <input
          v-if="editable"
          class="record-subtask__hours"
          type="number"
          min="0"
          step="0.5"
          :value="String(subtask.estimatedHours ?? 0)"
          @input.stop="emit('update-subtask', subtask.id, { estimatedHours: Number(($event.target as HTMLInputElement).value) })"
        />
        <span v-else class="record-subtask__hours">{{ formatHours(toFiniteNumber(subtask.estimatedHours)) }}</span>
        <button
          v-if="editable"
          type="button"
          class="record-subtask__delete"
          title="删除子任务"
          @click.stop="emit('delete-subtask', subtask.id)"
        >
          删除
        </button>
      </label>
      <button v-if="editable" type="button" class="record-subtasks__add" @click.stop="emit('add-subtask')">
        + 子任务
      </button>
    </div>
    <ul v-if="isLearningPlan && learningChildren.length" class="learning-plan-card-tree">
      <li v-for="child in learningChildren" :key="child.id">
        <div class="learning-plan-card-tree__row">
          <span>{{ child.title }}</span>
          <small>{{ child.hoursLabel }}</small>
        </div>
        <p v-if="child.description">{{ child.description }}</p>
        <a v-if="child.resource" :href="child.resource" target="_blank" rel="noreferrer" @pointerdown.stop @mousedown.stop>
          {{ child.resource }}
        </a>
        <ul v-if="child.children.length">
          <li v-for="grandchild in child.children" :key="grandchild.id">
            <div class="learning-plan-card-tree__row">
              <span>{{ grandchild.title }}</span>
              <small>{{ grandchild.hoursLabel }}</small>
            </div>
          </li>
        </ul>
      </li>
    </ul>
  </article>
</template>

<style scoped>
.kanban-card {
  border: 1px solid #d8dee8;
  border-radius: 8px;
  padding: 10px;
  background: #fff;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
  cursor: grab;
  user-select: none;
  touch-action: none;
}

.kanban-card--chosen,
.kanban-card--drag {
  cursor: grabbing;
}

.kanban-card--ghost {
  opacity: 0.65;
  background: #eff6ff;
}

.kanban-card p {
  margin: 6px 0 0;
  color: #64748b;
  font-size: 12px;
}

.kanban-card__hours {
  font-weight: 700;
  color: #334155 !important;
}

.record-subtasks {
  display: grid;
  gap: 6px;
  margin-top: 8px;
}

.record-subtask {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) 74px auto;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.record-subtask input[type='checkbox'] {
  width: auto;
}

.record-subtask__title {
  min-width: 0;
}

.record-subtask__hours {
  width: 74px;
}

.record-subtask__done {
  color: #16a34a;
  font-weight: 700;
}

.record-subtask__delete,
.record-subtasks__add {
  padding: 3px 6px;
  font-size: 12px;
}

.record-subtask__delete {
  border-color: transparent;
  color: #b91c1c;
  background: transparent;
}

.record-subtasks__add {
  width: fit-content;
  color: #1677ff;
}

.learning-plan-card-tree {
  display: grid;
  gap: 8px;
  margin: 10px 0 0;
  padding: 0;
  list-style: none;
}

.learning-plan-card-tree ul {
  display: grid;
  gap: 4px;
  margin: 6px 0 0 12px;
  padding: 0;
  list-style: none;
}

.learning-plan-card-tree__row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  color: #334155;
  font-size: 12px;
}

.learning-plan-card-tree small {
  flex: none;
  color: #64748b;
}

.learning-plan-card-tree a {
  display: block;
  overflow: hidden;
  margin-top: 2px;
  color: #1677ff;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>

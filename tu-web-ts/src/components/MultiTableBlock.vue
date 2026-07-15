<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'
import type {
  MultiTableData,
  MultiTableField,
  MultiTableFieldOption,
  MultiTableFieldType,
  MultiTableRecord,
  MultiTableSubtask,
  MultiTableView,
} from '@/api/types'
import {
  generateLearningPlanStream,
  type LearningPlanNode,
  type LearningPlanProgressPhase,
  type LearningPlanResponse,
} from '@/api/aiAgent'
import { useWorkspaceStore } from '@/stores/workspace'
import {
  MultiTableColumnController,
} from './tableCore'
import { useViewportClampedFixedPanel } from '@/utils/viewportPanel'
import MultiTableKanbanCard from './MultiTableKanbanCard.vue'
import TableCellRichEditor from './TableCellRichEditor.vue'

const props = withDefaults(defineProps<{
  data?: MultiTableData
  editable?: boolean
}>(), {
  editable: true,
})

const emit = defineEmits<{
  (e: 'change', data: MultiTableData): void
}>()

const workspaceStore = useWorkspaceStore()

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const fieldTypes: Array<{ value: MultiTableFieldType; label: string }> = [
  { value: 'text', label: '文本' },
  { value: 'number', label: '数字' },
  { value: 'date', label: '日期' },
  { value: 'singleSelect', label: '枚举' },
  { value: 'checkbox', label: '勾选' },
  { value: 'url', label: 'URL' },
  { value: 'estimatedHours', label: '预估工时' },
  { value: 'lifecycle', label: '生命周期' },
]

const lifecycleOptions = (): MultiTableFieldOption[] => [
  { id: 'not-started', label: '未开始', color: '#e2e8f0' },
  { id: 'active', label: '进行中', color: '#dbeafe' },
  { id: 'blocked', label: '阻塞', color: '#fee2e2' },
  { id: 'done', label: '已完成', color: '#dcfce7' },
  { id: 'archived', label: '归档', color: '#f1f5f9' },
]

const emptyData = (): MultiTableData => ({
  fields: [],
  records: [],
  views: [
    { id: 'view-table', name: '表格', type: 'table' },
  ],
  activeViewId: 'view-table',
})

const taskBoardPreset = (): MultiTableData => ({
  fields: [
    { id: 'title', name: '任务', type: 'text', required: true },
    {
      id: 'status',
      name: '状态',
      type: 'singleSelect',
      options: [
        { id: 'todo', label: '待处理', color: '#e2e8f0' },
        { id: 'doing', label: '进行中', color: '#dbeafe' },
        { id: 'done', label: '已完成', color: '#dcfce7' },
      ],
    },
    { id: 'owner', name: '负责人', type: 'text' },
    { id: 'dueDate', name: '截止日期', type: 'date' },
    { id: 'estimatedHours', name: '预估工时', type: 'estimatedHours' },
  ],
  records: [],
  views: [
    { id: 'view-table', name: '表格', type: 'table' },
    { id: 'view-kanban', name: '看板', type: 'kanban', groupByFieldId: 'status' },
  ],
  activeViewId: 'view-kanban',
})

const learningPlanPreset = (): MultiTableData => ({
  fields: [
    { id: 'title', name: '学习任务', type: 'text', required: true },
    {
      id: 'status',
      name: '状态',
      type: 'singleSelect',
      options: [
        { id: 'todo', label: '待学习', color: '#e2e8f0' },
        { id: 'doing', label: '学习中', color: '#dbeafe' },
        { id: 'done', label: '已完成', color: '#dcfce7' },
      ],
    },
    { id: 'estimatedHours', name: '预估工时', type: 'estimatedHours' },
    { id: 'description', name: '说明', type: 'text' },
    { id: 'resource', name: '资源', type: 'url' },
  ],
  records: [],
  views: [
    { id: 'view-table', name: '表格', type: 'table' },
    { id: 'view-kanban', name: '看板', type: 'kanban', groupByFieldId: 'status' },
  ],
  activeViewId: 'view-table',
})

const fallbackData = ref<MultiTableData>(emptyData())
const settingsFieldId = ref('')
const kanbanMenu = ref({
  visible: false,
  fieldId: '',
  optionId: '',
  x: 0,
  y: 0,
})

type KanbanColumn = {
  id: string
  label: string
  color?: string
  records: MultiTableRecord[]
}

interface LearningPlanKanbanNode {
  id: string
  title: string
  description: string
  resource: string
  hoursLabel: string
  children: LearningPlanKanbanNode[]
}

interface PlanProgressStep {
  phase: LearningPlanProgressPhase
  message: string
  at: number
}

const kanbanColumns = ref<KanbanColumn[]>([])
const kanbanDragActive = ref(false)
const nativeDraggedRecordId = ref('')
const showAiPanel = ref(false)
const generatingPlan = ref(false)
const aiPlanError = ref('')
const generatedPlan = ref<LearningPlanResponse | null>(null)
const planProgressSteps = ref<PlanProgressStep[]>([])
const planAbortController = ref<AbortController | null>(null)
const planElapsedMs = ref(0)
let planElapsedTimer: number | null = null
const learningPlanPreviewRef = ref<HTMLElement | null>(null)
const learningPlanPreviewHeight = ref<number | null>(null)
const learningPlanPreviewResizeCleanup = ref<(() => void) | null>(null)
const learningPlanForm = ref({
  topic: '',
  totalHours: '',
  dailyHours: '',
  deadline: '',
  enableWebSearch: false,
})
const fieldMenu = ref({
  visible: false,
  fieldId: '',
  x: 0,
  y: 0,
})

const fieldMenuSourcePoint = computed(() =>
  fieldMenu.value.visible ? { x: fieldMenu.value.x, y: fieldMenu.value.y } : null,
)
const { panelRef: fieldMenuRef, position: fieldMenuPosition } = useViewportClampedFixedPanel({
  visible: computed(() => fieldMenu.value.visible),
  getSourcePoint: () => fieldMenuSourcePoint.value,
})

const kanbanMenuSourcePoint = computed(() =>
  kanbanMenu.value.visible ? { x: kanbanMenu.value.x, y: kanbanMenu.value.y } : null,
)
const { panelRef: kanbanMenuRef, position: kanbanMenuPosition } = useViewportClampedFixedPanel({
  visible: computed(() => kanbanMenu.value.visible),
  getSourcePoint: () => kanbanMenuSourcePoint.value,
})

const normalized = computed<MultiTableData>(() => {
  const base = props.data ?? fallbackData.value
  const fallbackViews = emptyData().views
  return {
    fields: base.fields || [],
    records: base.records || [],
    views: base.views?.length ? base.views : fallbackViews,
    activeViewId: base.activeViewId || base.views?.[0]?.id || fallbackViews[0].id,
  }
})

const activeView = computed<MultiTableView>(() => {
  return normalized.value.views.find((view) => view.id === normalized.value.activeViewId) || normalized.value.views[0]
})

const selectableFields = computed(() => {
  return normalized.value.fields.filter((field) => field.type === 'singleSelect' || field.type === 'lifecycle')
})

const kanbanField = computed<MultiTableField | undefined>(() => {
  const groupBy = activeView.value?.groupByFieldId || selectableFields.value[0]?.id
  return normalized.value.fields.find((field) => field.id === groupBy)
})

const settingsField = computed(() => {
  return normalized.value.fields.find((field) => field.id === settingsFieldId.value)
})

const clone = (): MultiTableData => JSON.parse(JSON.stringify(normalized.value))

const commit = (next: MultiTableData) => {
  if (!props.data) {
    fallbackData.value = next
  }
  emit('change', next)
}

const closeKanbanMenu = () => {
  kanbanMenu.value.visible = false
}

const closeFieldMenu = () => {
  fieldMenu.value.visible = false
}

const closeContextMenus = () => {
  closeKanbanMenu()
  closeFieldMenu()
}

const closeContextMenusOnEscape = (event: KeyboardEvent) => {
  if (event.key === 'Escape') closeContextMenus()
}

const defaultValueForField = (field: Pick<MultiTableField, 'type' | 'options'>) => {
  if (field.type === 'checkbox') return false
  if (field.type === 'estimatedHours') return 0
  if (field.type === 'singleSelect' || field.type === 'lifecycle') return field.options?.[0]?.id || ''
  return ''
}

const toFiniteNumber = (value: unknown) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

const formatHours = (value: number) => {
  const rounded = Math.round(value * 100) / 100
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(2)} 小时`
}

function plainTextPreview(value: unknown, max = 160): string {
  const text = String(value ?? '')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '[图片]')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .replace(/^#+\s/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!text) return ''
  if (text.length <= max) return text
  return `${text.slice(0, max)}…`
}

const textCellId = (recordId: string, fieldId: string) => `multi-table-${recordId}-${fieldId}`

const normalizeValueForType = (value: unknown, field: MultiTableField) => {
  if (field.type === 'checkbox') return Boolean(value)
  if (field.type === 'number') return value === '' || value === null || value === undefined ? '' : toFiniteNumber(value)
  if (field.type === 'estimatedHours') return value === '' || value === null || value === undefined ? 0 : toFiniteNumber(value)
  if (field.type === 'singleSelect' || field.type === 'lifecycle') {
    const options = field.options || []
    const current = String(value ?? '')
    return options.some((option) => option.id === current) ? current : options[0]?.id || ''
  }
  return String(value ?? '')
}

const inputTypeForField = (field: MultiTableField) => {
  if (field.type === 'date') return 'date'
  if (field.type === 'number' || field.type === 'estimatedHours') return 'number'
  if (field.type === 'url') return 'url'
  return 'text'
}

const setActiveView = (viewId: string) => {
  const next = clone()
  next.activeViewId = viewId
  commit(next)
}

const applyTaskBoardPreset = () => {
  const hasExistingContent = normalized.value.fields.length > 0 || normalized.value.records.length > 0
  if (hasExistingContent && !window.confirm('应用任务看板预设会替换当前多维表格内容，继续？')) return
  closeContextMenus()
  settingsFieldId.value = ''
  commit(taskBoardPreset())
}

const applyLearningPlanPreset = () => {
  const hasExistingContent = normalized.value.fields.length > 0 || normalized.value.records.length > 0
  if (hasExistingContent && !window.confirm('应用学习计划预设会替换当前多维表格内容，继续？')) return
  closeContextMenus()
  settingsFieldId.value = ''
  generatedPlan.value = null
  commit(learningPlanPreset())
}

const addRecord = () => {
  const next = clone()
  if (!next.fields.length) {
    next.fields.push({
      id: `field-${uid()}`,
      name: '字段 1',
      type: 'text',
    })
  }
  const values: MultiTableRecord['values'] = {}
  next.fields.forEach((field) => {
    values[field.id] = defaultValueForField(field)
  })
  next.records.push({ id: `record-${uid()}`, values })
  commit(next)
}

const addFieldByType = (type: MultiTableFieldType, name?: string) => {
  const next = clone()
  const id = `field-${uid()}`
  const field: MultiTableField = { id, name: name || `字段 ${next.fields.length + 1}`, type }
  if (type === 'singleSelect') {
    field.options = [
      { id: `option-${uid()}`, label: '选项 1', color: '#e2e8f0' },
      { id: `option-${uid()}`, label: '选项 2', color: '#dbeafe' },
    ]
  }
  if (type === 'lifecycle') {
    field.options = lifecycleOptions()
    field.lifecyclePreset = true
  }
  next.fields.push(field)
  next.records.forEach((record) => {
    record.values[id] = defaultValueForField(field)
  })
  settingsFieldId.value = id
  commit(next)
}

const addField = () => addFieldByType('text')

const updateField = (fieldId: string, patch: Partial<MultiTableField>) => {
  const next = clone()
  const field = next.fields.find((item) => item.id === fieldId)
  if (!field) return
  Object.assign(field, patch)
  commit(next)
}

const updateFieldName = (fieldId: string, value: string) => {
  const next = clone()
  new MultiTableColumnController(next, {
    createFieldId: () => `field-${uid()}`,
    defaultValueForField,
  }).renameColumn(fieldId, value)
  commit(next)
}

const updateFieldType = (fieldId: string, type: MultiTableFieldType) => {
  const next = clone()
  const field = next.fields.find((item) => item.id === fieldId)
  if (!field) return
  field.type = type
  if (type === 'singleSelect' && !field.options?.length) {
    field.options = [{ id: `option-${uid()}`, label: '选项 1', color: '#e2e8f0' }]
  } else if (type === 'lifecycle') {
    field.options = field.options?.length ? field.options : lifecycleOptions()
    field.lifecyclePreset = true
  } else {
    delete field.lifecyclePreset
    delete field.options
  }
  next.records.forEach((record) => {
    record.values[field.id] = normalizeValueForType(record.values[field.id], field)
  })
  next.views.forEach((view) => {
    if (view.type === 'kanban' && view.groupByFieldId === field.id && !['singleSelect', 'lifecycle'].includes(type)) {
      view.groupByFieldId = next.fields.find((item) => item.type === 'singleSelect' || item.type === 'lifecycle')?.id
    }
  })
  commit(next)
}

const deleteField = (fieldId: string) => {
  const next = clone()
  const controller = new MultiTableColumnController(next, {
    createFieldId: () => `field-${uid()}`,
    defaultValueForField,
  })
  const index = controller.getColumnIndex(fieldId)
  if (index < 0) return
  controller.deleteColumnAt(index)
  if (settingsFieldId.value === fieldId) settingsFieldId.value = ''
  commit(next)
}

const updateCell = (recordId: string, fieldId: string, value: string | number | boolean | null) => {
  const next = clone()
  const record = next.records.find((item) => item.id === recordId)
  if (record) {
    record.values[fieldId] = value
    if (isLearningPlan.value && fieldId === 'status') {
      descendantRecords(record, next.records).forEach((child) => {
        child.values[fieldId] = value
      })
    }
  }
  commit(next)
}

const estimatedHoursField = computed(() => {
  return normalized.value.fields.find((field) => field.type === 'estimatedHours')
})

const taskTitleField = computed(() => {
  return normalized.value.fields.find((field) => field.id === 'title') || normalized.value.fields[0]
})

const isTaskTable = computed(() => Boolean(taskTitleField.value && estimatedHoursField.value))
const isLearningPlan = computed(() => {
  const fieldIds = new Set(normalized.value.fields.map((field) => field.id))
  return fieldIds.has('title')
    && fieldIds.has('status')
    && fieldIds.has('estimatedHours')
    && fieldIds.has('description')
    && fieldIds.has('resource')
})

const recordSubtasks = (record: MultiTableRecord): MultiTableSubtask[] => record.subtasks || []

const subtaskHours = (record: MultiTableRecord) => {
  return recordSubtasks(record).reduce((sum, subtask) => sum + toFiniteNumber(subtask.estimatedHours), 0)
}

const recordEstimatedHours = (record: MultiTableRecord) => {
  const field = estimatedHoursField.value
  return field ? toFiniteNumber(record.values[field.id]) : 0
}

const childrenOf = (recordId: string, records = normalized.value.records) => {
  return records
    .filter((record) => record.parentId === recordId)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}

const rootRecords = (records = normalized.value.records) => {
  return records
    .filter((record) => !record.parentId)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}

const recordHasChildren = (record: MultiTableRecord) => childrenOf(record.id).length > 0

const descendantRecords = (record: MultiTableRecord, records = normalized.value.records): MultiTableRecord[] => {
  const children = childrenOf(record.id, records)
  return children.flatMap((child) => [child, ...descendantRecords(child, records)])
}

const recordTotalHours = (record: MultiTableRecord, records = normalized.value.records): number => {
  const childTotal = childrenOf(record.id, records).reduce((sum, child) => sum + recordTotalHours(child, records), 0)
  return recordEstimatedHours(record) + subtaskHours(record) + childTotal
}

const totalEstimatedHours = computed(() => {
  const records = isLearningPlan.value ? rootRecords() : normalized.value.records
  return records.reduce((sum, record) => sum + recordTotalHours(record), 0)
})

const recordTitle = (record: MultiTableRecord) => {
  const field = taskTitleField.value
  const raw = String((field ? record.values[field.id] : '') || '')
  return plainTextPreview(raw, 80) || '未命名'
}

const recordDescription = (record: MultiTableRecord) => plainTextPreview(record.values.description, 120)

const recordResource = (record: MultiTableRecord) => String(record.values.resource || '')

const recordDepth = (record: MultiTableRecord) => {
  let depth = 0
  let currentParentId = record.parentId
  const recordsById = new Map(normalized.value.records.map((item) => [item.id, item]))
  while (currentParentId && recordsById.has(currentParentId) && depth < 8) {
    depth += 1
    currentParentId = recordsById.get(currentParentId)?.parentId ?? null
  }
  return depth
}

const flattenLearningPlanRecords = () => {
  const flatten = (records: MultiTableRecord[]): MultiTableRecord[] => {
    return records.flatMap((record) => [record, ...flatten(childrenOf(record.id))])
  }
  return flatten(rootRecords())
}

const displayRecords = computed(() => {
  return isLearningPlan.value ? flattenLearningPlanRecords() : normalized.value.records
})

const kanbanRecords = (records = normalized.value.records) => {
  return isLearningPlan.value ? rootRecords(records) : records
}

const learningPlanKanbanTree = (record: MultiTableRecord): LearningPlanKanbanNode[] => {
  return childrenOf(record.id).map((child) => ({
    id: child.id,
    title: recordTitle(child),
    description: recordDescription(child),
    resource: recordResource(child),
    hoursLabel: formatHours(recordTotalHours(child)),
    children: learningPlanKanbanTree(child),
  }))
}

const learningPlanPreviewTotalHours = computed(() => generatedPlan.value?.totalEstimatedHours || 0)

const learningPlanPreviewStyle = computed(() => {
  return learningPlanPreviewHeight.value == null
    ? undefined
    : { height: `${learningPlanPreviewHeight.value}px` }
})

const planNodeHours = (node: LearningPlanNode): number => {
  const own = toFiniteNumber(node.estimatedHours)
  const children = (node.children || []).reduce((sum, child) => sum + planNodeHours(child), 0)
  return own + children
}

const formatPlanElapsed = (ms: number) => {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

const startPlanElapsedTimer = () => {
  planElapsedMs.value = 0
  if (planElapsedTimer != null) {
    window.clearInterval(planElapsedTimer)
  }
  planElapsedTimer = window.setInterval(() => {
    planElapsedMs.value += 1000
  }, 1000)
}

const stopPlanElapsedTimer = () => {
  if (planElapsedTimer != null) {
    window.clearInterval(planElapsedTimer)
    planElapsedTimer = null
  }
}

const cancelPlanGeneration = () => {
  planAbortController.value?.abort()
}

const generatePlan = async () => {
  const topic = learningPlanForm.value.topic.trim()
  aiPlanError.value = ''
  generatedPlan.value = null
  learningPlanPreviewHeight.value = null
  planProgressSteps.value = []
  if (!topic) {
    aiPlanError.value = '请先填写学习目标。'
    return
  }
  planAbortController.value?.abort()
  const abortController = new AbortController()
  planAbortController.value = abortController
  generatingPlan.value = true
  startPlanElapsedTimer()
  try {
    generatedPlan.value = await generateLearningPlanStream({
      topic,
      totalHours: learningPlanForm.value.totalHours ? Number(learningPlanForm.value.totalHours) : undefined,
      dailyHours: learningPlanForm.value.dailyHours ? Number(learningPlanForm.value.dailyHours) : undefined,
      deadline: learningPlanForm.value.deadline || undefined,
      kbId: workspaceStore.currentKbId || undefined,
      enableWebSearch: learningPlanForm.value.enableWebSearch || undefined,
    }, {
      signal: abortController.signal,
      onEvent(event) {
        planProgressSteps.value.push({
          phase: event.phase,
          message: event.message,
          at: Date.now(),
        })
      },
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      aiPlanError.value = '已中止生成'
      return
    }
    const message = error instanceof Error ? error.message : '生成学习计划失败。'
    aiPlanError.value = message.includes('configuration incomplete')
      ? 'AI Agent 配置不完整，请先到系统设置中设置 Base URL、Model 和 API Key。'
      : message
  } finally {
    generatingPlan.value = false
    stopPlanElapsedTimer()
    planAbortController.value = null
  }
}

const nodesToRecords = (
  nodes: LearningPlanNode[],
  parentId: string | null = null,
): MultiTableRecord[] => {
  return nodes.flatMap((node, index) => {
    const id = `learn-${uid()}`
    const children = node.children || []
    const record: MultiTableRecord = {
      id,
      parentId,
      order: index,
      nodeType: children.length ? 'section' : 'step',
      values: {
        title: node.title,
        status: 'todo',
        estimatedHours: children.length ? 0 : Math.max(0, toFiniteNumber(node.estimatedHours)),
        description: node.description || '',
        resource: node.resource || '',
      },
    }
    return [record, ...nodesToRecords(children, id)]
  })
}

const confirmGeneratedPlan = () => {
  if (!generatedPlan.value) return
  const next = learningPlanPreset()
  next.records = nodesToRecords(generatedPlan.value.items)
  next.activeViewId = 'view-table'
  commit(next)
}

const startLearningPlanPreviewResize = (event: MouseEvent | PointerEvent) => {
  const preview = learningPlanPreviewRef.value
  if (!preview) return
  learningPlanPreviewResizeCleanup.value?.()
  if ('pointerId' in event && event.currentTarget instanceof HTMLElement) {
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }
  const startY = event.clientY
  const startHeight = preview.getBoundingClientRect().height
  const minHeight = 160
  learningPlanPreviewHeight.value = Math.max(minHeight, Math.round(startHeight))

  const onMove = (moveEvent: MouseEvent | PointerEvent) => {
    const nextHeight = Math.round(startHeight + moveEvent.clientY - startY)
    learningPlanPreviewHeight.value = Math.max(minHeight, nextHeight)
  }

  const cleanup = () => {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('pointermove', onMove)
    document.removeEventListener('mouseup', cleanup)
    document.removeEventListener('pointerup', cleanup)
    document.removeEventListener('pointercancel', cleanup)
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
    learningPlanPreviewResizeCleanup.value = null
  }

  learningPlanPreviewResizeCleanup.value = cleanup
  document.body.style.userSelect = 'none'
  document.body.style.cursor = 'ns-resize'
  document.addEventListener('mousemove', onMove)
  document.addEventListener('pointermove', onMove)
  document.addEventListener('mouseup', cleanup)
  document.addEventListener('pointerup', cleanup)
  document.addEventListener('pointercancel', cleanup)
}

const addSubtask = (recordId: string) => {
  const next = clone()
  const record = next.records.find((item) => item.id === recordId)
  if (!record) return
  const subtasks = record.subtasks || []
  subtasks.push({
    id: `subtask-${uid()}`,
    title: `子任务 ${subtasks.length + 1}`,
    estimatedHours: 0,
    done: false,
  })
  record.subtasks = subtasks
  commit(next)
}

const updateSubtask = (recordId: string, subtaskId: string, patch: Partial<MultiTableSubtask>) => {
  const next = clone()
  const record = next.records.find((item) => item.id === recordId)
  const subtask = record?.subtasks?.find((item) => item.id === subtaskId)
  if (!subtask) return
  Object.assign(subtask, patch)
  if ('estimatedHours' in patch) subtask.estimatedHours = Math.max(0, toFiniteNumber(patch.estimatedHours))
  commit(next)
}

const deleteSubtask = (recordId: string, subtaskId: string) => {
  const next = clone()
  const record = next.records.find((item) => item.id === recordId)
  if (!record?.subtasks) return
  record.subtasks = record.subtasks.filter((subtask) => subtask.id !== subtaskId)
  commit(next)
}

const addOption = (fieldId: string) => {
  const next = clone()
  const field = next.fields.find((item) => item.id === fieldId)
  if (!field) return
  field.options = field.options || []
  field.options.push({ id: `option-${uid()}`, label: `选项 ${field.options.length + 1}`, color: '#e2e8f0' })
  commit(next)
}

const updateOption = (fieldId: string, optionId: string, patch: Partial<MultiTableFieldOption>) => {
  const next = clone()
  const field = next.fields.find((item) => item.id === fieldId)
  const option = field?.options?.find((item) => item.id === optionId)
  if (!option) return
  Object.assign(option, patch)
  commit(next)
}

const deleteOption = (fieldId: string, optionId: string) => {
  const next = clone()
  const field = next.fields.find((item) => item.id === fieldId)
  if (!field?.options) return
  field.options = field.options.filter((option) => option.id !== optionId)
  next.records.forEach((record) => {
    if (record.values[fieldId] === optionId) record.values[fieldId] = field.options?.[0]?.id || ''
  })
  commit(next)
}

const openFieldMenu = (event: MouseEvent, fieldId: string) => {
  if (!props.editable) return
  event.preventDefault()
  event.stopPropagation()
  closeKanbanMenu()
  fieldMenu.value = {
    visible: true,
    fieldId,
    x: event.clientX,
    y: event.clientY,
  }
}

const openKanbanColumnMenu = (event: MouseEvent, groupId: string) => {
  if (!props.editable || !kanbanField.value) return
  event.preventDefault()
  event.stopPropagation()
  closeFieldMenu()
  kanbanMenu.value = {
    visible: true,
    fieldId: kanbanField.value.id,
    optionId: groupId,
    x: event.clientX,
    y: event.clientY,
  }
}

const onMultiTableContextMenu = (event: MouseEvent) => {
  const target = event.target
  if (!(target instanceof Element)) return
  const fieldHeader = target.closest<HTMLElement>('[data-field-id]')
  if (fieldHeader?.dataset.fieldId) {
    openFieldMenu(event, fieldHeader.dataset.fieldId)
    return
  }
  const kanbanColumn = target.closest<HTMLElement>('[data-kanban-group-id]')
  if (kanbanColumn?.dataset.kanbanGroupId) {
    openKanbanColumnMenu(event, kanbanColumn.dataset.kanbanGroupId)
  }
}

const selectedField = computed(() => {
  return normalized.value.fields.find((field) => field.id === fieldMenu.value.fieldId)
})

const configureSelectedField = () => {
  if (!selectedField.value) return
  settingsFieldId.value = selectedField.value.id
  closeFieldMenu()
}

const renameSelectedField = () => {
  const field = selectedField.value
  if (!field) return
  const nextName = window.prompt('字段名称', field.name)?.trim()
  if (!nextName) return
  updateFieldName(field.id, nextName)
  closeFieldMenu()
}

const insertFieldByMenu = (position: 'before' | 'after') => {
  const field = selectedField.value
  if (!field) return
  const next = clone()
  const controller = new MultiTableColumnController(next, {
    createFieldId: () => `field-${uid()}`,
    defaultValueForField,
  })
  const index = controller.getColumnIndex(field.id)
  if (index < 0) return
  const inserted = controller.insertColumnAt(position === 'before' ? index : index + 1)
  settingsFieldId.value = inserted.id
  commit(next)
  closeFieldMenu()
}

const deleteSelectedField = () => {
  const field = selectedField.value
  if (!field) return
  if (!window.confirm(`删除字段「${field.name}」？该字段下的数据会一并删除。`)) return
  deleteField(field.id)
  closeFieldMenu()
}

const selectedKanbanOption = computed(() => {
  const field = normalized.value.fields.find((item) => item.id === kanbanMenu.value.fieldId)
  return field?.options?.find((option) => option.id === kanbanMenu.value.optionId)
})

const renameKanbanGroup = () => {
  const fieldId = kanbanMenu.value.fieldId
  const option = selectedKanbanOption.value
  if (!fieldId || !option) return
  const nextLabel = window.prompt('分组名称', option.label)?.trim()
  if (!nextLabel) return
  updateOption(fieldId, option.id, { label: nextLabel })
  closeKanbanMenu()
}

const setKanbanGroupColor = (color: string) => {
  const fieldId = kanbanMenu.value.fieldId
  const option = selectedKanbanOption.value
  if (!fieldId || !option) return
  updateOption(fieldId, option.id, { color })
  closeKanbanMenu()
}

const moveKanbanGroup = (direction: -1 | 1) => {
  const next = clone()
  const field = next.fields.find((item) => item.id === kanbanMenu.value.fieldId)
  const options = field?.options
  if (!options) return
  const index = options.findIndex((option) => option.id === kanbanMenu.value.optionId)
  const nextIndex = index + direction
  if (index < 0 || nextIndex < 0 || nextIndex >= options.length) return
  const [option] = options.splice(index, 1)
  options.splice(nextIndex, 0, option)
  commit(next)
  closeKanbanMenu()
}

const addKanbanGroupAfter = () => {
  const next = clone()
  const field = next.fields.find((item) => item.id === kanbanMenu.value.fieldId)
  if (!field) return
  field.options = field.options || []
  const index = field.options.findIndex((option) => option.id === kanbanMenu.value.optionId)
  const option = { id: `option-${uid()}`, label: `分组 ${field.options.length + 1}`, color: '#e2e8f0' }
  field.options.splice(index >= 0 ? index + 1 : field.options.length, 0, option)
  commit(next)
  closeKanbanMenu()
}

const deleteKanbanGroup = () => {
  const fieldId = kanbanMenu.value.fieldId
  const optionId = kanbanMenu.value.optionId
  const field = normalized.value.fields.find((item) => item.id === fieldId)
  if (!field?.options || field.options.length <= 1) return
  const option = field.options.find((item) => item.id === optionId)
  if (!option) return
  if (!window.confirm(`删除分组「${option.label}」？该列任务会移动到剩余第一个分组。`)) return
  deleteOption(fieldId, optionId)
  closeKanbanMenu()
}

const optionLabel = (field: MultiTableField | undefined, value: unknown) => {
  if (!field) return String(value || '未分组')
  return field.options?.find((option) => option.id === value)?.label || String(value || '未分组')
}

const optionColor = (field: MultiTableField | undefined, value: unknown) => {
  return field?.options?.find((option) => option.id === value)?.color || '#e2e8f0'
}

const displayValue = (field: MultiTableField, value: unknown) => {
  if (field.type === 'checkbox') return value ? '是' : '否'
  if (field.type === 'singleSelect' || field.type === 'lifecycle') return optionLabel(field, value)
  if (field.type === 'estimatedHours') return formatHours(toFiniteNumber(value))
  if (field.type === 'text') return plainTextPreview(value)
  return String(value ?? '')
}

const buildKanbanColumns = (): KanbanColumn[] => {
  const field = kanbanField.value
  const options = field?.options?.length ? field.options : [{ id: '', label: '未分组' }]
  return options.map((option) => ({
    id: option.id,
    label: option.label,
    color: option.color,
    records: kanbanRecords().filter((record) => String(record.values[field?.id || ''] || '') === option.id),
  }))
}

const syncKanbanColumns = () => {
  if (kanbanDragActive.value) return
  kanbanColumns.value = buildKanbanColumns()
}

const startKanbanDrag = () => {
  kanbanDragActive.value = true
  closeContextMenus()
}

const commitKanbanDrag = () => {
  const field = kanbanField.value
  const next = clone()
  const recordsById = new Map(next.records.map((record) => [record.id, record]))
  const orderedRecords: MultiTableRecord[] = []
  const orderedRecordIds = new Set<string>()

  kanbanColumns.value.forEach((column) => {
    column.records.forEach((draftRecord, index) => {
      const record = recordsById.get(draftRecord.id)
      if (!record || orderedRecordIds.has(record.id)) return
      if (field) {
        record.values[field.id] = column.id
        if (isLearningPlan.value) {
          record.order = index
          descendantRecords(record, next.records).forEach((child) => {
            child.values[field.id] = column.id
          })
        }
      }
      orderedRecordIds.add(record.id)
      orderedRecords.push(record)
      if (isLearningPlan.value) {
        descendantRecords(record, next.records).forEach((child) => {
          if (!orderedRecordIds.has(child.id)) {
            orderedRecordIds.add(child.id)
            orderedRecords.push(child)
          }
        })
      }
    })
  })

  next.records.forEach((record) => {
    if (!orderedRecordIds.has(record.id)) orderedRecords.push(record)
  })

  next.records = orderedRecords
  commit(next)
}

const finishKanbanDrag = () => {
  commitKanbanDrag()
  kanbanDragActive.value = false
  syncKanbanColumns()
}

const startNativeKanbanDrag = (event: DragEvent, recordId: string) => {
  nativeDraggedRecordId.value = recordId
  event.dataTransfer?.setData('text/plain', recordId)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

const dropNativeKanbanCard = (event: DragEvent, columnId: string) => {
  event.preventDefault()
  const recordId = event.dataTransfer?.getData('text/plain') || nativeDraggedRecordId.value
  nativeDraggedRecordId.value = ''
  const field = kanbanField.value
  if (!recordId || !field) return
  const next = clone()
  const record = next.records.find((item) => item.id === recordId)
  if (!record) return
  record.values[field.id] = columnId
  if (isLearningPlan.value) {
    descendantRecords(record, next.records).forEach((child) => {
      child.values[field.id] = columnId
    })
  }
  commit(next)
}

const hasContextMenu = computed(() => kanbanMenu.value.visible || fieldMenu.value.visible)

watch(() => hasContextMenu.value, (visible) => {
  if (visible) {
    window.addEventListener('click', closeContextMenus)
    window.addEventListener('keydown', closeContextMenusOnEscape)
  } else {
    window.removeEventListener('click', closeContextMenus)
    window.removeEventListener('keydown', closeContextMenusOnEscape)
  }
})

watch(
  () => [
    activeView.value?.id,
    activeView.value?.type,
    kanbanField.value?.id,
    kanbanField.value?.options,
    normalized.value.records,
  ],
  syncKanbanColumns,
  { deep: true, immediate: true },
)

onBeforeUnmount(() => {
  planAbortController.value?.abort()
  stopPlanElapsedTimer()
  learningPlanPreviewResizeCleanup.value?.()
  window.removeEventListener('click', closeContextMenus)
  window.removeEventListener('keydown', closeContextMenusOnEscape)
})
</script>

<template>
  <section class="multi-table" @contextmenu.capture="onMultiTableContextMenu">
    <header class="multi-table__toolbar">
      <div class="multi-table__views">
        <button
          v-for="view in normalized.views"
          :key="view.id"
          type="button"
          :class="{ 'multi-table__view--active': view.id === activeView.id }"
          @click="setActiveView(view.id)"
        >
          {{ view.name }}
        </button>
      </div>
      <div class="multi-table__actions" v-if="editable">
        <button type="button" @click="applyTaskBoardPreset">任务看板</button>
        <button type="button" @click="applyLearningPlanPreset">学习计划</button>
        <button type="button" @click="showAiPanel = !showAiPanel">AI 生成计划</button>
        <button type="button" @click="addField">字段</button>
        <button type="button" @click="addFieldByType('url', '链接')">URL字段</button>
        <button type="button" @click="addFieldByType('lifecycle', '生命周期')">生命周期</button>
        <button type="button" @click="addRecord">记录</button>
      </div>
      <div v-if="estimatedHoursField" class="multi-table__summary">
        总工时 {{ formatHours(totalEstimatedHours) }}
      </div>
    </header>

    <section v-if="editable && showAiPanel" class="learning-plan-ai">
      <div class="learning-plan-ai__form">
        <label class="learning-plan-ai__topic">
          学习目标
          <textarea v-model="learningPlanForm.topic" rows="3" placeholder="例如：两周内入门机器学习基础"></textarea>
        </label>
        <label>
          总可用小时
          <input v-model="learningPlanForm.totalHours" type="number" min="0" step="0.5" />
        </label>
        <label>
          每日小时
          <input v-model="learningPlanForm.dailyHours" type="number" min="0" step="0.5" />
        </label>
        <label>
          截止日期
          <input v-model="learningPlanForm.deadline" type="date" />
        </label>
        <label class="learning-plan-ai__option">
          <input v-model="learningPlanForm.enableWebSearch" type="checkbox" />
          联网搜索参考资料
        </label>
        <div class="learning-plan-ai__actions">
          <button type="button" :disabled="generatingPlan" @click="generatePlan">
            {{ generatingPlan ? '生成中...' : '生成' }}
          </button>
          <button v-if="generatingPlan" type="button" class="learning-plan-ai__cancel" @click="cancelPlanGeneration">
            中止
          </button>
        </div>
      </div>
      <div v-if="generatingPlan || planProgressSteps.length" class="learning-plan-ai__progress">
        <div class="learning-plan-ai__progress-head">
          <span>{{ generatingPlan ? '正在生成学习计划' : '生成过程' }}</span>
          <span v-if="generatingPlan">已用时 {{ formatPlanElapsed(planElapsedMs) }}</span>
        </div>
        <ol class="learning-plan-ai__progress-log">
          <li
            v-for="(step, index) in planProgressSteps"
            :key="`${step.at}-${index}`"
            :class="{
              'learning-plan-ai__progress-log-item--latest':
                generatingPlan && index === planProgressSteps.length - 1,
            }"
          >
            {{ step.message }}
          </li>
        </ol>
      </div>
      <p v-if="aiPlanError" class="learning-plan-ai__error">{{ aiPlanError }}</p>
      <div
        v-if="generatedPlan"
        ref="learningPlanPreviewRef"
        class="learning-plan-ai__preview"
        :style="learningPlanPreviewStyle"
      >
        <div class="learning-plan-ai__preview-head">
          <strong>{{ generatedPlan.title }}</strong>
          <span>总工时 {{ formatHours(learningPlanPreviewTotalHours) }}</span>
          <button type="button" @click="confirmGeneratedPlan">确认替换当前学习计划</button>
        </div>
        <div class="learning-plan-ai__preview-body">
          <ul class="learning-plan-preview">
            <li v-for="item in generatedPlan.items" :key="item.title">
              <strong>{{ item.title }}</strong>
              <span>{{ formatHours(planNodeHours(item)) }}</span>
              <p v-if="item.description">{{ item.description }}</p>
              <ul v-if="item.children?.length">
                <li v-for="child in item.children" :key="child.title">
                  <span>{{ child.title }}</span>
                  <small>{{ formatHours(planNodeHours(child)) }}</small>
                </li>
              </ul>
            </li>
          </ul>
        </div>
        <div
          class="learning-plan-ai__preview-resize"
          title="拖拽调整预览高度"
          @pointerdown.prevent.stop="startLearningPlanPreviewResize"
          @mousedown.prevent.stop="startLearningPlanPreviewResize"
        />
      </div>
    </section>

    <section v-if="editable && settingsField" class="field-settings">
      <div class="field-settings__main">
        <label>
          字段名
          <input
            :value="settingsField.name"
            @input="updateFieldName(settingsField.id, ($event.target as HTMLInputElement).value)"
          />
        </label>
        <label>
          类型
          <select
            :value="settingsField.type"
            @change="updateFieldType(settingsField.id, ($event.target as HTMLSelectElement).value as MultiTableFieldType)"
          >
            <option v-for="type in fieldTypes" :key="type.value" :value="type.value">{{ type.label }}</option>
          </select>
        </label>
        <label class="field-settings__check">
          <input
            type="checkbox"
            :checked="Boolean(settingsField.required)"
            @change="updateField(settingsField.id, { required: ($event.target as HTMLInputElement).checked })"
          />
          必填
        </label>
        <button type="button" class="field-settings__danger" @click="deleteField(settingsField.id)">删除字段</button>
      </div>

      <div v-if="settingsField.type === 'singleSelect' || settingsField.type === 'lifecycle'" class="field-options">
        <div class="field-options__head">
          <span>枚举选项</span>
          <button type="button" @click="addOption(settingsField.id)">新增选项</button>
        </div>
        <div v-for="option in settingsField.options || []" :key="option.id" class="field-option">
          <input
            type="color"
            :value="option.color || '#e2e8f0'"
            @input="updateOption(settingsField!.id, option.id, { color: ($event.target as HTMLInputElement).value })"
          />
          <input
            :value="option.label"
            @input="updateOption(settingsField!.id, option.id, { label: ($event.target as HTMLInputElement).value })"
          />
          <button type="button" @click="deleteOption(settingsField!.id, option.id)">删除</button>
        </div>
      </div>
    </section>

    <div v-if="activeView.type === 'kanban'" class="multi-table__kanban">
      <section
        v-for="column in kanbanColumns"
        :key="column.id"
        class="kanban-column"
        :data-kanban-group-id="column.id"
      >
        <header
          class="kanban-column__header"
          :data-kanban-group-id="column.id"
          @contextmenu.prevent.stop="openKanbanColumnMenu($event, column.id)"
        >
          <span class="kanban-column__swatch" :style="{ background: column.color || '#e2e8f0' }"></span>
          <strong>{{ column.label }}</strong>
          <small class="kanban-column__count">{{ column.records.length }}</small>
          <small v-if="estimatedHoursField">{{ formatHours(column.records.reduce((sum, record) => sum + recordTotalHours(record), 0)) }}</small>
          <button
            v-if="editable"
            type="button"
            class="kanban-column__menu-button"
            title="列操作"
            @click.prevent.stop="openKanbanColumnMenu($event, column.id)"
          >
            ⋯
          </button>
        </header>
        <VueDraggable
          v-model="column.records"
          class="kanban-column__body"
          :data-kanban-group-id="column.id"
          @dragover.prevent
          @drop="dropNativeKanbanCard($event, column.id)"
          group="multi-table-kanban"
          draggable=".kanban-card"
          filter="input, textarea, select, button, a, [contenteditable='true'], .record-subtasks, .multi-table__text-cell, .table-cell-rich-editor"
          ghost-class="kanban-card--ghost"
          chosen-class="kanban-card--chosen"
          drag-class="kanban-card--drag"
          :animation="150"
          :disabled="!editable"
          :empty-insert-threshold="24"
          :fallback-on-body="true"
          :force-fallback="true"
          :prevent-on-filter="false"
          @start="startKanbanDrag"
          @end="finishKanbanDrag"
        >
          <MultiTableKanbanCard
            v-for="record in column.records"
            :key="record.id"
            :record="record"
            :title="recordTitle(record)"
            :status-label="optionLabel(kanbanField, record.values[kanbanField?.id || ''])"
            :show-hours="Boolean(estimatedHoursField)"
            :hours-label="formatHours(recordTotalHours(record))"
            :is-task-table="isTaskTable && !isLearningPlan"
            :is-learning-plan="isLearningPlan"
            :learning-children="learningPlanKanbanTree(record)"
            :editable="editable"
            @add-subtask="addSubtask(record.id)"
            @update-subtask="(subtaskId, patch) => updateSubtask(record.id, subtaskId, patch)"
            @delete-subtask="(subtaskId) => deleteSubtask(record.id, subtaskId)"
            @native-dragstart="(event) => startNativeKanbanDrag(event, record.id)"
          />
        </VueDraggable>
      </section>
    </div>

    <div v-else class="multi-table__grid">
      <table>
        <thead>
          <tr>
            <th
              v-for="field in normalized.fields"
              :key="field.id"
              :data-field-id="field.id"
              @contextmenu.prevent.stop="openFieldMenu($event, field.id)"
            >
              <div class="field-header">
                <input
                  v-if="editable"
                  :value="field.name"
                  @change="updateFieldName(field.id, ($event.target as HTMLInputElement).value)"
                />
                <span v-else>{{ field.name }}</span>
                <button v-if="editable" type="button" title="字段设置" @click="settingsFieldId = field.id">设置</button>
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="record in displayRecords"
            :key="record.id"
            :class="{ 'multi-table__tree-row': isLearningPlan, 'multi-table__tree-section': isLearningPlan && recordHasChildren(record) }"
          >
            <td v-for="field in normalized.fields" :key="field.id">
              <select
                v-if="editable && (field.type === 'singleSelect' || field.type === 'lifecycle')"
                :value="String(record.values[field.id] || '')"
                @change="updateCell(record.id, field.id, ($event.target as HTMLSelectElement).value)"
              >
                <option v-for="option in field.options || []" :key="option.id" :value="option.id">{{ option.label }}</option>
              </select>
              <input
                v-else-if="editable && field.type === 'checkbox'"
                type="checkbox"
                :checked="Boolean(record.values[field.id])"
                @change="updateCell(record.id, field.id, ($event.target as HTMLInputElement).checked)"
              />
              <span
                v-else-if="isLearningPlan && field.type === 'estimatedHours' && recordHasChildren(record)"
                class="learning-plan-hours"
              >
                {{ formatHours(recordTotalHours(record)) }}
              </span>
              <TableCellRichEditor
                v-else-if="field.type === 'text'"
                :cell-id="textCellId(record.id, field.id)"
                :content="String(record.values[field.id] ?? '')"
                :editable="editable"
                class="multi-table__text-cell"
                :class="{ 'multi-table__text-cell--tree': isLearningPlan && field.id === taskTitleField?.id }"
                :style="isLearningPlan && field.id === taskTitleField?.id
                  ? { '--multi-table-tree-indent': `${recordDepth(record) * 20}px` }
                  : undefined"
                @change="(value) => updateCell(record.id, field.id, value)"
              />
              <input
                v-else-if="editable"
                :type="inputTypeForField(field)"
                :min="field.type === 'estimatedHours' ? 0 : undefined"
                :step="field.type === 'estimatedHours' ? 0.5 : undefined"
                :value="String(record.values[field.id] ?? '')"
                :style="isLearningPlan && field.id === taskTitleField?.id ? { paddingLeft: `${recordDepth(record) * 20 + 8}px` } : undefined"
                @input="updateCell(record.id, field.id, field.type === 'number' || field.type === 'estimatedHours' ? Number(($event.target as HTMLInputElement).value) : ($event.target as HTMLInputElement).value)"
              />
              <a
                v-else-if="field.type === 'url' && record.values[field.id]"
                :href="String(record.values[field.id])"
                target="_blank"
                rel="noreferrer"
              >
                {{ record.values[field.id] }}
              </a>
              <span
                v-else-if="field.type === 'singleSelect' || field.type === 'lifecycle'"
                class="option-badge"
                :style="{ background: optionColor(field, record.values[field.id]) }"
              >
                {{ optionLabel(field, record.values[field.id]) }}
              </span>
              <span v-else>{{ displayValue(field, record.values[field.id]) }}</span>
              <div
                v-if="isTaskTable && !isLearningPlan && field.id === taskTitleField?.id"
                class="record-subtasks record-subtasks--grid"
                @pointerdown.stop
                @mousedown.stop
                @dragstart.stop
              >
                <label v-for="subtask in recordSubtasks(record)" :key="subtask.id" class="record-subtask">
                  <input
                    v-if="editable"
                    type="checkbox"
                    :checked="Boolean(subtask.done)"
                    @change.stop="updateSubtask(record.id, subtask.id, { done: ($event.target as HTMLInputElement).checked })"
                  />
                  <span v-else-if="subtask.done" class="record-subtask__done">✓</span>
                  <input
                    v-if="editable"
                    class="record-subtask__title"
                    :value="subtask.title"
                    @input.stop="updateSubtask(record.id, subtask.id, { title: ($event.target as HTMLInputElement).value })"
                  />
                  <span v-else class="record-subtask__title">{{ subtask.title }}</span>
                  <input
                    v-if="editable"
                    class="record-subtask__hours"
                    type="number"
                    min="0"
                    step="0.5"
                    :value="String(subtask.estimatedHours ?? 0)"
                    @input.stop="updateSubtask(record.id, subtask.id, { estimatedHours: Number(($event.target as HTMLInputElement).value) })"
                  />
                  <span v-else class="record-subtask__hours">{{ formatHours(toFiniteNumber(subtask.estimatedHours)) }}</span>
                  <button
                    v-if="editable"
                    type="button"
                    class="record-subtask__delete"
                    title="删除子任务"
                    @click.stop="deleteSubtask(record.id, subtask.id)"
                  >
                    删除
                  </button>
                </label>
                <button v-if="editable" type="button" class="record-subtasks__add" @click.stop="addSubtask(record.id)">
                  + 子任务
                </button>
              </div>
            </td>
          </tr>
          <tr v-if="editable" class="multi-table__add-row">
            <td :colspan="Math.max(1, normalized.fields.length)">
              <button type="button" @click="addRecord">+ 新增一行</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <Teleport to="body">
      <div
        v-if="fieldMenu.visible"
        ref="fieldMenuRef"
        class="multi-table-menu"
        :style="{ left: `${fieldMenuPosition.left}px`, top: `${fieldMenuPosition.top}px` }"
        @mousedown.stop
        @click.stop
        @contextmenu.prevent.stop
      >
        <button type="button" @click="configureSelectedField">字段设置</button>
        <button type="button" @click="renameSelectedField">重命名字段</button>
        <button type="button" @click="insertFieldByMenu('before')">在左侧新增列</button>
        <button type="button" @click="insertFieldByMenu('after')">在右侧新增列</button>
        <button type="button" class="multi-table-menu__danger" @click="deleteSelectedField">删除字段</button>
      </div>

      <div
        v-if="kanbanMenu.visible"
        ref="kanbanMenuRef"
        class="multi-table-menu"
        :style="{ left: `${kanbanMenuPosition.left}px`, top: `${kanbanMenuPosition.top}px` }"
        @mousedown.stop
        @click.stop
        @contextmenu.prevent.stop
      >
        <button type="button" @click="renameKanbanGroup">重命名分组</button>
        <button type="button" @click="addKanbanGroupAfter">在右侧新增分组</button>
        <button type="button" @click="moveKanbanGroup(-1)">左移</button>
        <button type="button" @click="moveKanbanGroup(1)">右移</button>
        <div class="multi-table-menu__colors">
          <span>颜色</span>
          <button
            v-for="color in ['#e2e8f0', '#dbeafe', '#dcfce7', '#fef3c7', '#fee2e2', '#ede9fe']"
            :key="color"
            type="button"
            :style="{ background: color }"
            @click="setKanbanGroupColor(color)"
          />
        </div>
        <button type="button" class="multi-table-menu__danger" @click="deleteKanbanGroup">删除分组</button>
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.multi-table {
  overflow: hidden;
  border: 1px solid #d8dee8;
  border-radius: 8px;
  background: #fff;
}

.multi-table__toolbar {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 10px;
  border-bottom: 1px solid #e2e8f0;
  background: #f8fafc;
}

.multi-table__views,
.multi-table__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.multi-table__summary {
  flex: none;
  align-self: center;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 5px 9px;
  color: #334155;
  font-size: 13px;
  background: #fff;
}

.learning-plan-ai {
  display: grid;
  gap: 10px;
  padding: 10px;
  border-bottom: 1px solid #e2e8f0;
  background: #f9fbfd;
}

.learning-plan-ai__form {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) repeat(3, minmax(110px, 150px)) minmax(140px, auto) auto;
  align-items: end;
  gap: 10px;
}

.learning-plan-ai__option {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #475569;
  font-size: 12px;
  min-height: 32px;
}

.learning-plan-ai__option input[type='checkbox'] {
  margin: 0;
}

.learning-plan-ai__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.learning-plan-ai__cancel {
  border: 1px solid #fecaca;
  border-radius: 6px;
  padding: 7px 12px;
  color: #b91c1c;
  background: #fff;
  cursor: pointer;
}

.learning-plan-ai__progress {
  display: grid;
  gap: 8px;
  border: 1px solid #dbeafe;
  border-radius: 8px;
  padding: 10px;
  background: #fff;
}

.learning-plan-ai__progress-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: #475569;
  font-size: 12px;
}

.learning-plan-ai__progress-log {
  max-height: 160px;
  margin: 0;
  padding-left: 18px;
  overflow-y: auto;
  color: #334155;
  font-size: 13px;
}

.learning-plan-ai__progress-log li {
  padding: 2px 0;
}

.learning-plan-ai__progress-log-item--latest {
  color: #1d4ed8;
  font-weight: 600;
}

.learning-plan-ai label {
  display: grid;
  gap: 4px;
  color: #475569;
  font-size: 12px;
}

.learning-plan-ai textarea {
  min-height: 70px;
  resize: vertical;
}

.learning-plan-ai input,
.learning-plan-ai textarea {
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 6px 8px;
  color: #334155;
  background: #fff;
}

.learning-plan-ai__error {
  margin: 0;
  color: #b91c1c;
  font-size: 13px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.learning-plan-ai__preview {
  position: relative;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 8px;
  border: 1px solid #d8dee8;
  border-radius: 8px;
  min-height: 160px;
  padding: 10px 10px 14px;
  background: #fff;
}

.learning-plan-ai__preview-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.learning-plan-ai__preview-body {
  min-height: 0;
  overflow: auto;
}

.learning-plan-ai__preview-resize {
  justify-self: center;
  width: 54px;
  height: 12px;
  border: 1px solid rgba(22, 119, 255, 0.3);
  border-radius: 4px;
  background: rgba(22, 119, 255, 0.08);
  cursor: ns-resize;
  pointer-events: auto;
}

.learning-plan-ai__preview-resize:hover {
  border-color: #1677ff;
  background: rgba(22, 119, 255, 0.2);
  box-shadow: 0 0 4px rgba(22, 119, 255, 0.3);
}

.learning-plan-preview {
  display: grid;
  gap: 8px;
  margin: 0;
  padding-left: 18px;
}

.learning-plan-preview p {
  margin: 4px 0;
  color: #64748b;
  font-size: 13px;
}

.learning-plan-preview small,
.learning-plan-preview span {
  margin-left: 6px;
  color: #64748b;
}

button {
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 5px 9px;
  background: #fff;
  color: #334155;
  cursor: pointer;
}

.multi-table__view--active {
  border-color: #1677ff;
  color: #1677ff;
  background: #eff6ff;
}

.field-settings {
  display: grid;
  gap: 10px;
  padding: 10px;
  border-bottom: 1px solid #e2e8f0;
  background: #fbfdff;
}

.field-settings__main,
.field-options__head,
.field-option {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 10px;
}

.field-settings label {
  display: grid;
  gap: 4px;
  min-width: 140px;
  color: #475569;
  font-size: 12px;
}

.field-settings__check {
  display: flex !important;
  flex-direction: row;
  align-items: center;
  min-width: auto !important;
  padding-bottom: 6px;
}

.field-settings__check input {
  width: auto;
}

.field-settings__danger {
  border-color: #fecaca;
  color: #b91c1c;
}

.field-options {
  display: grid;
  gap: 8px;
}

.field-options__head {
  justify-content: space-between;
  color: #334155;
  font-size: 13px;
  font-weight: 700;
}

.field-option input[type='color'] {
  width: 42px;
  height: 30px;
  padding: 2px;
}

.field-option input:not([type='color']) {
  max-width: 220px;
}

.multi-table__grid {
  overflow: auto;
  max-height: 520px;
}

table {
  width: 100%;
  min-width: 720px;
  border-collapse: collapse;
}

th,
td {
  min-width: 150px;
  border-right: 1px solid #e2e8f0;
  border-bottom: 1px solid #e2e8f0;
  padding: 8px;
  text-align: left;
}

th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: #f8fafc;
}

.field-header {
  display: flex;
  align-items: center;
  gap: 6px;
}

.field-header button {
  flex: none;
  padding: 4px 7px;
  font-size: 12px;
}

input,
select {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid transparent;
  border-radius: 5px;
  padding: 5px 6px;
  font: inherit;
  background: transparent;
}

input:focus,
select:focus {
  border-color: #1677ff;
  outline: none;
  background: #fff;
}

td input[type='checkbox'] {
  width: auto;
}

td:has(.multi-table__text-cell) {
  padding: 0;
  vertical-align: top;
}

.multi-table__text-cell {
  min-height: 38px;
}

.multi-table__text-cell--tree :deep(.tu-editor-content) {
  padding-left: calc(10px + var(--multi-table-tree-indent, 0px));
}

.multi-table__text-cell :deep(.tu-editor-wrapper) {
  min-height: 38px;
}

.multi-table__text-cell :deep(.tu-editor-content) {
  min-height: 38px;
}

.multi-table__text-cell :deep(.tu-editor-content img) {
  max-width: 100%;
  height: auto;
}

.learning-plan-hours {
  display: inline-block;
  color: #334155;
  font-weight: 700;
}

.multi-table__tree-section td {
  background: #f8fafc;
  font-weight: 700;
}

.multi-table__add-row td {
  padding: 0;
  background: #f8fafc;
}

.multi-table__add-row button {
  width: 100%;
  border: 0;
  border-radius: 0;
  padding: 10px 12px;
  color: #64748b;
  text-align: left;
  background: transparent;
}

.multi-table__add-row button:hover {
  color: #1677ff;
  background: #eff6ff;
}

.option-badge {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  border-radius: 999px;
  padding: 2px 8px;
  color: #334155;
  font-size: 12px;
}

.multi-table__kanban {
  display: grid;
  grid-auto-columns: minmax(240px, 1fr);
  grid-auto-flow: column;
  gap: 12px;
  position: relative;
  overflow-x: auto;
  padding: 12px;
}

.kanban-column {
  display: flex;
  flex-direction: column;
  min-height: 280px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #f8fafc;
}

.kanban-column__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px;
  font-weight: 700;
  user-select: none;
}

.kanban-column__swatch {
  width: 10px;
  height: 10px;
  flex: none;
  border-radius: 999px;
}

.kanban-column__count {
  margin-left: auto;
}

.kanban-column__header small {
  color: #64748b;
}

.kanban-column__menu-button {
  flex: none;
  width: 26px;
  height: 26px;
  padding: 0;
  border-color: transparent;
  background: transparent;
  color: #64748b;
  font-size: 18px;
  line-height: 1;
}

.kanban-column__menu-button:hover {
  border-color: #cbd5e1;
  background: #fff;
}

.kanban-column__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 8px;
  padding: 0 10px 10px;
}

.record-subtasks {
  display: grid;
  gap: 6px;
  margin-top: 8px;
}

.record-subtasks--grid {
  min-width: 260px;
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

.multi-table-menu {
  position: fixed;
  z-index: 1000;
  display: grid;
  min-width: 168px;
  gap: 4px;
  border: 1px solid #d8dee8;
  border-radius: 8px;
  padding: 6px;
  background: #fff;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.16);
}

.multi-table-menu button {
  width: 100%;
  border-color: transparent;
  text-align: left;
  background: transparent;
}

.multi-table-menu button:hover {
  background: #f1f5f9;
}

.multi-table-menu__colors {
  display: grid;
  grid-template-columns: repeat(6, 22px);
  gap: 6px;
  padding: 6px 4px;
}

.multi-table-menu__colors span {
  grid-column: 1 / -1;
  color: #64748b;
  font-size: 12px;
}

.multi-table-menu__colors button {
  width: 22px;
  height: 22px;
  border: 1px solid #cbd5e1;
  border-radius: 999px;
  padding: 0;
}

.multi-table-menu .multi-table-menu__danger {
  color: #b91c1c;
}
</style>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import {
  ElButton,
  ElDialog,
  ElInput,
  ElMessage,
  ElScrollbar,
  ElSwitch,
} from 'element-plus'
import {
  generateLearningRouteStream,
  type LearningRouteChatMessage,
  type LearningRouteItem,
  type LearningRoutePlan,
  type LearningRouteProgressEvent,
} from '@/api/aiLearningRoute'
import { useWorkspaceStore } from '@/stores/workspace'
import { useWorkspaceViewsStore } from '@/stores/workspaceViews'
import { applyLearningRoutePlan } from '@/utils/applyLearningRoute'
import { updateLearningGoal } from '@/api/learningGoal'
import { useAuthStore } from '@/stores/auth'
import type { LearningPlanViewRow } from '@/workspaceViews/types'
import LearningPlanRouteTable from './LearningPlanRouteTable.vue'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  applied: []
}>()

const workspace = useWorkspaceStore()
const views = useWorkspaceViewsStore()
const auth = useAuthStore()

interface TraceLine {
  id: string
  phase: string
  message: string
  toolName?: string | null
  round?: number | null
  at: number
}

interface ChatBubble {
  id: string
  role: 'user' | 'assistant' | 'system' | 'thinking'
  content: string
  /** Present when role === 'thinking' */
  traces?: TraceLine[]
  thinkingStatus?: 'running' | 'done' | 'cancelled' | 'failed'
  thinkingExpanded?: boolean
}

interface EditableRouteItem extends LearningRouteItem {
  key: string
  children?: EditableRouteItem[]
}

const loading = ref(false)
const applying = ref(false)
const draft = ref('')
const plan = ref<LearningRoutePlan | null>(null)
const editableItems = ref<EditableRouteItem[]>([])
const bubbles = ref<ChatBubble[]>([])
const chatMessages = ref<LearningRouteChatMessage[]>([])
const abortController = ref<AbortController | null>(null)
const chatScrollRef = ref<InstanceType<typeof ElScrollbar> | null>(null)
const activeThinkingId = ref<string | null>(null)
const draftListPage = ref(0)
const selectedDraftKey = ref<string | null>(null)
/** Only footer 关闭 / 确认应用 may dismiss the dialog. */
const allowClose = ref(false)
/** Flash footer 关闭 when user tries mask / Esc dismiss. */
const closeBtnNudge = ref(false)
let closeBtnNudgeTimer: ReturnType<typeof setTimeout> | null = null

const preferReuse = ref(true)

const topic = computed(() => (
  views.manualGoal?.label
  || views.learningPlanSnapshot?.goal.label
  || ''
).trim())

const kbId = computed(() => workspace.currentKbId || '')
const seedPointIds = computed(() => {
  const fromGoal = views.manualGoal?.seedPointIds
    || views.learningPlanSnapshot?.goal.seedPointIds
    || []
  return [...new Set([...fromGoal, ...views.selectedPointIds])]
})

/** Sidebar multi-selection shown above the AI dialog. */
const selectedFocusItems = computed(() => {
  const rows = views.learningPlanSnapshot?.rows ?? []
  const byId = new Map(rows.map((row) => [row.pointId, row]))
  return views.selectedPointIds.map((id) => ({
    pointId: id,
    title: byId.get(id)?.title || id,
  }))
})

const dialogVisible = computed({
  get: () => props.visible,
  set: (value: boolean) => emit('update:visible', value),
})

const hasUserTurn = computed(() => chatMessages.value.some((m) => m.role === 'user'))
const canApply = computed(() => editableItems.value.some((item) => item.title.trim()))
/** Persist current draft without requiring the round to finish; still blocked while applying. */
const canSave = computed(() => Boolean(kbId.value && canApply.value) && !applying.value)
const inputEnabled = computed(() => Boolean(topic.value && kbId.value) && !applying.value)

const currentPlanDraft = computed((): LearningRoutePlan | null => {
  if (!topic.value) return null
  const mapItem = (item: EditableRouteItem): LearningRouteItem => ({
    pointId: item.pointId ?? null,
    title: item.title.trim(),
    summary: item.summary ?? null,
    estimatedHours: item.estimatedHours ?? null,
    children: item.children?.length
      ? item.children.map(mapItem).filter((child) => child.title)
      : undefined,
  })
  const items = editableItems.value
    .map(mapItem)
    .filter((item) => item.title)
  if (!items.length && !plan.value) return null
  return {
    topic: plan.value?.topic || topic.value,
    orderedItems: items,
    warnings: plan.value?.warnings,
  }
})

const draftRows = computed((): LearningPlanViewRow[] => {
  const seedSet = new Set(seedPointIds.value)
  const toRow = (item: EditableRouteItem, order: number): LearningPlanViewRow => {
    const pointId = item.pointId?.trim() || item.key
    return {
      pointId,
      title: item.title || '（未命名）',
      summary: item.summary ?? null,
      estimatedHours: item.estimatedHours ?? null,
      role: item.pointId && seedSet.has(item.pointId) ? 'goal' : 'prerequisite',
      order,
      children: item.children?.map((child, idx) => toRow(child, idx)),
    }
  }
  return editableItems.value.map((item, order) => toRow(item, order))
})

const selectedDraftIndex = computed(() => {
  if (!selectedDraftKey.value) return -1
  return editableItems.value.findIndex((item) => (
    item.key === selectedDraftKey.value
    || item.pointId === selectedDraftKey.value
  ))
})

const selectedDraftItem = computed(() => (
  selectedDraftIndex.value >= 0 ? editableItems.value[selectedDraftIndex.value] : null
))

const selectedDraftRowId = computed(() => {
  const item = selectedDraftItem.value
  if (!item) return null
  return item.pointId?.trim() || item.key
})

const composerPlaceholder = computed(() => {
  if (!topic.value) return '请先选择学习目标'
  if (!hasUserTurn.value) {
    return editableItems.value.length
      ? '基于左侧已有路线继续说，例如：补全缺失前置 / 精简到 6 步'
      : '描述你想要的学习路线，例如：生成一条从基础到目标的知识点路线'
  }
  return '继续修订，例如：再补充离散数学前置；也可点「停止」中断当前回答'
})

const draftEmptyText = computed(() => (
  loading.value
    ? '正在生成路线草稿…'
    : '暂无路线步骤。在右侧描述期望后生成；有链路时打开会自动载入。'
))

function phaseLabel(phase: string): string {
  switch (phase) {
    case 'started': return '开始'
    case 'model_call': return '模型'
    case 'thinking': return '思考'
    case 'tool_call': return '工具'
    case 'tool_done': return '工具完成'
    case 'parsing': return '整理'
    case 'completed': return '完成'
    case 'failed': return '失败'
    case 'cancelled': return '取消'
    default: return phase
  }
}

function newItemKey(): string {
  return `ri-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function mapPlanItem(item: LearningRouteItem): EditableRouteItem {
  return {
    ...item,
    key: newItemKey(),
    children: item.children?.length
      ? item.children.map(mapPlanItem)
      : undefined,
  }
}

function setEditableFromPlan(next: LearningRoutePlan) {
  plan.value = next
  editableItems.value = (next.orderedItems || []).map(mapPlanItem)
  draftListPage.value = 0
  selectedDraftKey.value = editableItems.value[0]?.key ?? null
}

/** Prefill from the learning-plan view’s current prerequisite chain (if any). */
function seedFromExistingRoute(): number {
  const snapshot = views.learningPlanSnapshot
  if (!snapshot?.rows?.length || !topic.value) return 0
  const ordered = [...snapshot.rows].sort((a, b) => a.order - b.order)
  setEditableFromPlan({
    topic: topic.value,
    orderedItems: ordered.map((row) => ({
      pointId: row.pointId,
      title: row.title,
      summary: row.summary ?? null,
      estimatedHours: row.estimatedHours ?? null,
    })),
    warnings: snapshot.warnings?.length ? [...snapshot.warnings] : undefined,
  })
  return ordered.length
}

function resetSession() {
  abortRunning()
  clearCloseBtnNudge()
  loading.value = false
  applying.value = false
  draft.value = ''
  plan.value = null
  editableItems.value = []
  bubbles.value = []
  chatMessages.value = []
  activeThinkingId.value = null
  draftListPage.value = 0
  selectedDraftKey.value = null
  preferReuse.value = true
}

watch(
  () => props.visible,
  (open) => {
    if (!open) {
      abortRunning()
      clearCloseBtnNudge()
      return
    }
    resetSession()
    const seeded = seedFromExistingRoute()
    const base = topic.value
      ? `当前路线会话 · 目标「${topic.value}」。左侧为路线结果（与学习计划视图同表）；右侧对话，推理过程在对话内折叠展示。生成中可点「停止」。`
      : '请先选择学习目标后再打开本窗口。'
    const seedHint = seeded > 0
      ? ` 已载入当前已有路线（${seeded} 步）；AI 会结合此草稿与你的对话修订。`
      : ' 尚无已有链路时，路线结果为空，可直接描述期望路线。'
    bubbles.value.push({
      id: `sys-${Date.now()}`,
      role: 'system',
      content: topic.value ? `${base}${seedHint}` : base,
    })
  },
)

function abortRunning() {
  abortController.value?.abort()
  abortController.value = null
  loading.value = false
}

function requestClose() {
  if (loading.value || applying.value) {
    ElMessage.warning('请先等待当前回答结束，或点「停止」后再关闭')
    nudgeCloseButton()
    return
  }
  allowClose.value = true
  dialogVisible.value = false
}

function clearCloseBtnNudge() {
  if (closeBtnNudgeTimer != null) {
    clearTimeout(closeBtnNudgeTimer)
    closeBtnNudgeTimer = null
  }
  closeBtnNudge.value = false
}

function nudgeCloseButton() {
  clearCloseBtnNudge()
  // Retrigger CSS animation if already flashing.
  void nextTick(() => {
    closeBtnNudge.value = true
    closeBtnNudgeTimer = setTimeout(() => {
      closeBtnNudge.value = false
      closeBtnNudgeTimer = null
    }, 1100)
  })
}

function onBeforeClose(done: (cancel?: boolean) => void) {
  if (allowClose.value) {
    allowClose.value = false
    clearCloseBtnNudge()
    done()
    return
  }
  nudgeCloseButton()
  done(true)
}

async function scrollChatToEnd() {
  await nextTick()
  const wrap = chatScrollRef.value?.$el?.querySelector?.('.el-scrollbar__wrap') as HTMLElement | undefined
  if (wrap) wrap.scrollTop = wrap.scrollHeight
}

function findThinking(id: string | null): ChatBubble | undefined {
  if (!id) return undefined
  return bubbles.value.find((b) => b.id === id && b.role === 'thinking')
}

function thinkingSummary(bubble: ChatBubble): string {
  const n = bubble.traces?.length ?? 0
  const thinkCount = bubble.traces?.filter((t) => t.phase === 'thinking').length ?? 0
  switch (bubble.thinkingStatus) {
    case 'running':
      return thinkCount > 0
        ? `正在推理…（思考 ${thinkCount} / 事件 ${n}）`
        : (n > 0 ? `正在推理…（${n}）` : '正在推理…')
    case 'cancelled':
      return `已停止推理 · ${n} 步`
    case 'failed':
      return `推理失败 · ${n} 步`
    default:
      return thinkCount > 0
        ? `推理过程 · 思考 ${thinkCount} 段 / 共 ${n} 步`
        : `推理过程 · ${n} 步`
  }
}

function toggleThinking(id: string) {
  const bubble = findThinking(id)
  if (!bubble) return
  bubble.thinkingExpanded = !bubble.thinkingExpanded
}

function finishThinking(status: 'done' | 'cancelled' | 'failed') {
  const bubble = findThinking(activeThinkingId.value)
  if (bubble) {
    bubble.thinkingStatus = status
    bubble.thinkingExpanded = false
  }
  activeThinkingId.value = null
}

function appendTrace(event: LearningRouteProgressEvent) {
  const bubble = findThinking(activeThinkingId.value)
  if (!bubble) return
  if (!bubble.traces) bubble.traces = []
  bubble.traces.push({
    id: `t-${Date.now()}-${bubble.traces.length}`,
    phase: event.phase,
    message: event.message || '',
    toolName: event.toolName,
    round: event.round,
    at: Date.now(),
  })
  void scrollChatToEnd()
}

function planAssistantSummary(next: LearningRoutePlan): string {
  const count = next.orderedItems?.length ?? 0
  const warnings = next.warnings?.length
    ? `\n提示：${next.warnings.join('；')}`
    : ''
  return `已更新左侧路线草稿（${count} 步），可继续检视微调或在右侧继续说。${warnings}`
}

function constraintSuffix(): string {
  const reuse = preferReuse.value
    ? '优先复用知识库内已有知识点，缺失再提议新建'
    : '可按学习需要提议新建知识点，不强制复用'
  const draftHint = currentPlanDraft.value?.orderedItems.length
    ? '请结合请求中的上一版学习路线 JSON（即左侧当前路线结果草稿）与本对话修订或补全，保留仍合理的 pointId。'
    : '当前尚无路线草稿，请从头生成。'
  return `（约束：请用简体中文撰写步骤标题与摘要；目标「${topic.value}」；由你根据目标难度与前置完整性自行决定合适步数（通常约 3–12 步），不要机械凑固定数量；${reuse}。${draftHint}）`
}

function onSelectDraftRow(pointId: string) {
  const hit = editableItems.value.find((item) => item.key === pointId || item.pointId === pointId)
  selectedDraftKey.value = hit?.key ?? pointId
}

function moveItem(index: number, delta: number) {
  const target = index + delta
  if (target < 0 || target >= editableItems.value.length) return
  const list = [...editableItems.value]
  const [row] = list.splice(index, 1)
  list.splice(target, 0, row)
  editableItems.value = list
}

function removeSelectedDraft() {
  const index = selectedDraftIndex.value
  if (index < 0) return
  editableItems.value = editableItems.value.filter((_, i) => i !== index)
  selectedDraftKey.value = editableItems.value[Math.min(index, editableItems.value.length - 1)]?.key ?? null
}

async function runRound(userText: string) {
  if (!kbId.value) {
    ElMessage.warning('请先选择知识库')
    return
  }
  if (!topic.value) {
    ElMessage.warning('请先选择学习目标')
    return
  }
  const content = userText.trim()
  if (!content || loading.value) return

  bubbles.value.push({
    id: `u-${Date.now()}`,
    role: 'user',
    content,
  })
  chatMessages.value.push({ role: 'user', content })
  void scrollChatToEnd()

  loading.value = true
  const controller = new AbortController()
  abortController.value = controller

  const thinkingId = `th-${Date.now()}`
  activeThinkingId.value = thinkingId
  bubbles.value.push({
    id: thinkingId,
    role: 'thinking',
    content: '',
    traces: [],
    thinkingStatus: 'running',
    thinkingExpanded: true,
  })
  void scrollChatToEnd()

  const previous = currentPlanDraft.value

  try {
    const nextPlan = await generateLearningRouteStream(
      {
        topic: topic.value,
        kbId: kbId.value,
        seedPointIds: seedPointIds.value,
        messages: [...chatMessages.value],
        previousPlanJson: previous ? JSON.stringify(previous) : null,
      },
      {
        signal: controller.signal,
        onEvent: (event) => {
          appendTrace(event)
          if (event.phase === 'completed' && event.result) {
            setEditableFromPlan(event.result)
          }
        },
      },
    )
    setEditableFromPlan(nextPlan)
    finishThinking('done')
    const assistantText = planAssistantSummary(nextPlan)
    bubbles.value.push({
      id: `a-${Date.now()}`,
      role: 'assistant',
      content: assistantText,
    })
    chatMessages.value.push({ role: 'assistant', content: assistantText })
    void scrollChatToEnd()
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      appendTrace({ phase: 'cancelled', message: '已停止当前回答' })
      finishThinking('cancelled')
      bubbles.value.push({
        id: `s-${Date.now()}`,
        role: 'system',
        content: '已停止当前回答。可继续输入。',
      })
    } else {
      const message = err instanceof Error ? err.message : '分析失败'
      appendTrace({ phase: 'failed', message })
      finishThinking('failed')
      bubbles.value.push({
        id: `e-${Date.now()}`,
        role: 'system',
        content: `失败：${message}`,
      })
    }
  } finally {
    loading.value = false
    abortController.value = null
    if (activeThinkingId.value) finishThinking('cancelled')
    void scrollChatToEnd()
  }
}

async function onSend() {
  let text = draft.value.trim()
  if (!text) return
  if (!inputEnabled.value) return
  if (loading.value) {
    ElMessage.warning('请先停止当前回答，或等待完成后再发送')
    return
  }
  // First turn: attach structured constraints into the same session message
  if (!hasUserTurn.value) {
    text = `${text}\n${constraintSuffix()}`
  }
  draft.value = ''
  await runRound(text)
}

async function persistRoute(options: { closeDialog: boolean }) {
  const draftPlan = currentPlanDraft.value
  if (!draftPlan?.orderedItems.length || !kbId.value) {
    ElMessage.warning('请先生成路线并保留有效步骤')
    return
  }
  applying.value = true
  try {
    const applied = await applyLearningRoutePlan(kbId.value, draftPlan)
    if (!applied.orderedPointIds.length) {
      ElMessage.warning('未能写入任何知识点')
      return
    }
    const goalSeed = applied.orderedPointIds[applied.orderedPointIds.length - 1]
    const existingGoal = views.manualGoal ?? views.learningPlanSnapshot?.goal
    views.manualGoal = {
      source: existingGoal?.source ?? 'manual-point',
      label: (existingGoal?.label || draftPlan.topic || topic.value || '学习目标').trim(),
      locators: existingGoal?.locators ?? [],
      seedPointIds: [goalSeed],
      studyflowGoalId: existingGoal?.studyflowGoalId,
    }
    if (existingGoal?.studyflowGoalId) {
      try {
        await updateLearningGoal(existingGoal.studyflowGoalId, {
          title: views.manualGoal.label,
          kbId: kbId.value,
          sourceKind: 'knowledge_point',
          knowledgePointId: goalSeed,
          setCurrent: true,
        }, auth.user?.id)
      } catch {
        // ignore StudyFlow sync failure
      }
    }
    await views.rebuildLearningPlanView({ preferManual: true })
    views.hydrateLearningPlanFromRoute({
      kbId: kbId.value,
      topic: draftPlan.topic || topic.value,
      orderedItems: draftPlan.orderedItems,
      orderedPointIds: applied.orderedPointIds,
      warnings: draftPlan.warnings,
    })
    views.routeStatus = applied.createdPointIds.length || applied.createdEdgeCount || applied.parentedCount
      ? `已保存路线（新建 ${applied.createdPointIds.length} 点 / ${applied.createdEdgeCount} 边 / 挂接 ${applied.parentedCount} 子点）`
      : '学习路线已保存'
    ElMessage.success(
      applied.parentedCount > 0
        ? '已写入知识点树（含子点挂接）与前置关系'
        : '已写入知识点与前置关系',
    )
    emit('applied')
    if (options.closeDialog) {
      allowClose.value = true
      dialogVisible.value = false
    }
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '保存失败')
  } finally {
    applying.value = false
  }
}

async function onSave() {
  await persistRoute({ closeDialog: false })
}

async function onConfirmApply() {
  await persistRoute({ closeDialog: true })
}
</script>

<template>
  <ElDialog
    v-model="dialogVisible"
    title="AI 学习路线"
    width="1120px"
    class="tu-dialog-viewport learning-route-chat-dialog"
    append-to-body
    :close-on-click-modal="true"
    :close-on-press-escape="true"
    :show-close="false"
    :before-close="onBeforeClose"
    @click.stop
  >
    <div class="route-layout">
      <div class="route-selected-strip">
        <div class="route-selected-strip__label">侧栏已选</div>
        <div class="route-selected-strip__body">
          <template v-if="selectedFocusItems.length">
            <span
              v-for="item in selectedFocusItems"
              :key="item.pointId"
              class="route-selected-chip"
              :title="item.title"
            >
              {{ item.title }}
            </span>
          </template>
          <span
            v-else
            class="route-selected-strip__empty"
          >
            在左侧学习计划列表中多选知识点后，将作为本会话关注点（Ctrl/⌘ 或 Shift）
          </span>
        </div>
      </div>

      <div class="route-shell">
      <aside class="route-shell__sidebar">
        <div class="route-shell__params">
          <div class="params-topic-row">
            <span class="params-label">目标</span>
            <span class="params-topic" :title="topic || undefined">{{ topic || '—' }}</span>
          </div>
          <div class="params-controls">
            <label class="param-field param-field--switch">
              <span>优先复用库内点</span>
              <ElSwitch
                v-model="preferReuse"
                :disabled="loading || applying || hasUserTurn"
              />
            </label>
          </div>
        </div>

        <header class="pane-title">路线结果</header>
        <LearningPlanRouteTable
          class="route-shell__table"
          :rows="draftRows"
          :selected-point-id="selectedDraftRowId"
          :selected-point-ids="selectedDraftRowId ? [selectedDraftRowId] : []"
          :busy="loading"
          :empty-text="draftEmptyText"
          :page="draftListPage"
          :multi-select="false"
          @update:page="draftListPage = $event"
          @select="onSelectDraftRow"
        />

        <div
          v-if="selectedDraftItem"
          class="route-shell__draft-edit"
        >
          <ElInput
            v-model="selectedDraftItem.title"
            size="small"
            placeholder="步骤标题"
            :disabled="loading || applying"
          />
          <div class="draft-edit-actions">
            <ElButton
              size="small"
              text
              :disabled="loading || applying || selectedDraftIndex <= 0"
              @click="moveItem(selectedDraftIndex, -1)"
            >
              上移
            </ElButton>
            <ElButton
              size="small"
              text
              :disabled="loading || applying || selectedDraftIndex < 0 || selectedDraftIndex >= editableItems.length - 1"
              @click="moveItem(selectedDraftIndex, 1)"
            >
              下移
            </ElButton>
            <ElButton
              size="small"
              text
              type="danger"
              :disabled="loading || applying || selectedDraftIndex < 0"
              @click="removeSelectedDraft"
            >
              删除
            </ElButton>
          </div>
        </div>

        <div class="route-shell__save-bar">
          <ElButton
            type="primary"
            size="small"
            plain
            :loading="applying"
            :disabled="!canSave"
            @click="onSave"
          >
            保存
          </ElButton>
          <span class="route-shell__save-hint muted">
            {{ loading ? '生成中也可保存当前草稿' : '写入知识库，不关闭窗口' }}
          </span>
        </div>
      </aside>

      <section class="route-shell__chat">
        <header class="pane-title">对话</header>
        <div class="chat-body">
          <ElScrollbar ref="chatScrollRef" class="chat-scroll">
            <div class="bubble-list">
              <div
                v-for="bubble in bubbles"
                :key="bubble.id"
                class="bubble"
                :class="`bubble--${bubble.role}`"
              >
                <template v-if="bubble.role === 'thinking'">
                  <button
                    type="button"
                    class="thinking-toggle"
                    @click="toggleThinking(bubble.id)"
                  >
                    <span
                      class="thinking-label"
                      :class="{ 'thinking-label--running': bubble.thinkingStatus === 'running' }"
                    >
                      {{ thinkingSummary(bubble) }}
                    </span>
                    <span class="thinking-chevron">
                      {{ bubble.thinkingExpanded ? '收起' : '展开' }}
                    </span>
                  </button>
                  <ul
                    v-show="bubble.thinkingExpanded"
                    class="trace-list"
                  >
                    <li
                      v-for="line in bubble.traces"
                      :key="line.id"
                      class="trace-item"
                      :class="`trace-item--${line.phase}`"
                    >
                      <template v-if="line.phase === 'thinking'">
                        <div class="trace-thinking">
                          <span class="trace-phase">思考</span>
                          <pre class="trace-thinking-text">{{ line.message }}</pre>
                        </div>
                      </template>
                      <template v-else>
                        <span class="trace-phase">{{ phaseLabel(line.phase) }}</span>
                        <span class="trace-msg">
                          {{ line.message }}
                          <template v-if="line.toolName"> · {{ line.toolName }}</template>
                          <template v-if="line.round != null"> · R{{ line.round }}</template>
                        </span>
                      </template>
                    </li>
                    <li
                      v-if="!bubble.traces?.length"
                      class="trace-item trace-item--empty"
                    >
                      <span class="trace-msg muted">等待模型与工具事件…</span>
                    </li>
                  </ul>
                </template>
                <template v-else>
                  <div class="bubble-role">
                    {{ bubble.role === 'user' ? '你' : bubble.role === 'assistant' ? '助手' : '提示' }}
                  </div>
                  <pre class="bubble-text">{{ bubble.content }}</pre>
                </template>
              </div>
            </div>
          </ElScrollbar>
        </div>
        <div class="chat-composer">
          <ElInput
            v-model="draft"
            type="textarea"
            :rows="2"
            resize="none"
            :placeholder="composerPlaceholder"
            :disabled="!inputEnabled || applying"
            @keydown.ctrl.enter.prevent="onSend"
          />
          <div class="chat-composer__actions">
            <ElButton
              v-if="loading"
              size="small"
              @click="abortRunning"
            >
              停止
            </ElButton>
            <ElButton
              size="small"
              :loading="applying"
              :disabled="!canSave"
              @click="onSave"
            >
              保存
            </ElButton>
            <ElButton
              type="primary"
              size="small"
              :disabled="!inputEnabled || loading || applying || !draft.trim()"
              @click="onSend"
            >
              发送
            </ElButton>
          </div>
        </div>
      </section>
    </div>
    </div>

    <template #footer>
      <ElButton
        class="route-close-btn"
        :class="{ 'route-close-btn--nudge': closeBtnNudge }"
        :disabled="applying"
        @click="requestClose"
      >
        关闭
      </ElButton>
      <ElButton
        :loading="applying"
        :disabled="!canSave"
        @click="onSave"
      >
        保存
      </ElButton>
      <ElButton
        type="primary"
        :loading="applying"
        :disabled="!canSave"
        @click="onConfirmApply"
      >
        确认应用并关闭
      </ElButton>
    </template>
  </ElDialog>
</template>

<style scoped>
.route-layout {
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: calc(100dvh - 168px);
  min-height: 480px;
  max-height: 720px;
  box-sizing: border-box;
}

.route-selected-strip {
  flex-shrink: 0;
  display: flex;
  align-items: stretch;
  gap: 8px;
  height: 44px;
  padding: 6px 8px;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  background: #fafafa;
  box-sizing: border-box;
}

.route-selected-strip__label {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  font-size: 12px;
  color: #909399;
  white-space: nowrap;
}

.route-selected-strip__body {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  overflow-x: auto;
  overflow-y: hidden;
}

.route-selected-chip {
  flex-shrink: 0;
  max-width: 160px;
  padding: 2px 8px;
  border-radius: 999px;
  background: #ecf5ff;
  color: #409eff;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.route-selected-strip__empty {
  font-size: 12px;
  color: #c0c4cc;
  white-space: nowrap;
}

.route-shell {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(280px, 34%) minmax(0, 1fr);
  gap: 10px;
  box-sizing: border-box;
}

.route-shell__sidebar,
.route-shell__chat {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  overflow: hidden;
  background: #fff;
}

.route-shell__params {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 10px 8px;
  border-bottom: 1px solid #ebeef5;
  background: #fafafa;
}

.params-topic-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: 12px;
  color: #303133;
}

.params-label {
  flex-shrink: 0;
  color: #909399;
}

.params-topic {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}

.params-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 12px;
}

.param-field {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 12px;
  color: #606266;
}

.muted {
  color: #909399;
}

.pane-title {
  flex-shrink: 0;
  padding: 8px 10px;
  font-size: 12px;
  font-weight: 600;
  color: #606266;
  background: #f5f7fa;
  border-bottom: 1px solid #ebeef5;
}

.route-shell__table {
  flex: 1;
  min-height: 0;
  padding: 0 8px;
}

.route-shell__draft-edit {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 10px 10px;
  border-top: 1px solid #ebeef5;
  background: #fff;
}

.draft-edit-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0;
}

.route-shell__save-bar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px 10px;
  border-top: 1px solid #ebeef5;
  background: #fff;
  min-height: 40px;
  box-sizing: border-box;
}

.route-shell__save-hint {
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.chat-scroll {
  flex: 1;
  min-height: 0;
  height: 100%;
}

.trace-list {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  max-height: 180px;
  overflow-y: auto;
  border-top: 1px dashed #e4e7ed;
}

.trace-item {
  display: flex;
  gap: 8px;
  padding: 4px 0;
  font-size: 12px;
  line-height: 1.4;
  border-bottom: 1px dashed #f0f2f5;
}

.trace-item--empty {
  border-bottom: none;
}

.trace-phase {
  flex-shrink: 0;
  width: 56px;
  color: #909399;
}

.trace-item--failed .trace-phase,
.trace-item--failed .trace-msg {
  color: #f56c6c;
}

.trace-item--completed .trace-phase {
  color: #67c23a;
}

.trace-item--thinking {
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
  padding: 6px 0;
  border-bottom: 1px dashed #e4e7ed;
}

.trace-thinking {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.trace-thinking-text {
  margin: 0;
  padding: 6px 8px;
  border-radius: 6px;
  background: #f5f7fa;
  color: #606266;
  font-family: inherit;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 140px;
  overflow-y: auto;
}

.trace-msg {
  min-width: 0;
  color: #606266;
  word-break: break-word;
}

.bubble-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
  min-height: 100%;
  box-sizing: border-box;
}

.bubble {
  border-radius: 8px;
  padding: 8px 10px;
  background: #f5f7fa;
}

.bubble--user {
  background: #ecf5ff;
}

.bubble--assistant {
  background: #f0f9eb;
}

.bubble--system {
  background: #fafafa;
}

.bubble--thinking {
  background: #fafafa;
  border: 1px solid #ebeef5;
  padding: 6px 8px;
}

.thinking-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  margin: 0;
  padding: 4px 2px;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
  font: inherit;
}

.thinking-label {
  font-size: 12px;
  color: #606266;
  font-weight: 500;
}

.thinking-label--running {
  color: #409eff;
}

.thinking-chevron {
  flex-shrink: 0;
  font-size: 11px;
  color: #909399;
}

.bubble-role {
  font-size: 11px;
  color: #909399;
  margin-bottom: 4px;
}

.bubble-text {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
  font-size: 12px;
  color: #303133;
  line-height: 1.45;
}

.chat-composer {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px 10px;
  border-top: 1px solid #ebeef5;
  background: #fff;
}

.chat-composer :deep(.el-textarea__inner) {
  box-shadow: none;
  border: none;
  padding: 0;
  background: transparent;
  resize: none;
}

.chat-composer :deep(.el-textarea__inner:hover),
.chat-composer :deep(.el-textarea__inner:focus) {
  box-shadow: none;
  border: none;
}

.chat-composer__actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}

.route-close-btn--nudge {
  animation: route-close-nudge 0.55s ease-in-out 2;
  outline: 2px solid var(--el-color-primary);
  outline-offset: 2px;
  color: var(--el-color-primary);
  border-color: var(--el-color-primary-light-5);
  background: var(--el-color-primary-light-9);
}

@keyframes route-close-nudge {
  0%,
  100% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(64, 158, 255, 0);
  }
  50% {
    transform: scale(1.06);
    box-shadow: 0 0 0 6px rgba(64, 158, 255, 0.28);
  }
}
</style>

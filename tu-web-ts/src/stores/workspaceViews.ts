import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { getKnowledgeGraph } from '@/api/knowledgeGraph'
import { listKnowledgePointsByLocator } from '@/api/knowledgePoint'
import {
  getCurrentLearningGoal,
  type LearningGoal,
} from '@/api/learningGoal'
import { useAuthStore } from '@/stores/auth'
import { useWorkspaceStore } from '@/stores/workspace'
import { loadLearningInProgress } from '@/utils/learningInProgress'
import { hasUsableLearningRoute } from '@/utils/hasUsableLearningRoute'
import { WORKSPACE_VIEW_CATALOG, getWorkspaceViewById } from '@/workspaceViews/catalog'
import {
  LEARNING_PLAN_GRAPH_DEPTH,
  LEARNING_PLAN_MAX_NODES,
  assembleLearningPlanSnapshot,
  goalFromLearningInProgress,
  goalFromStudyflowGoal,
} from '@/workspaceViews/learningPlanView'
import type {
  LearningPlanViewGoal,
  LearningPlanViewSnapshot,
  LearningPlanViewRow,
  WorkspaceSidebarSource,
  WorkspaceViewDefinition,
} from '@/workspaceViews/types'

const SIDEBAR_SOURCE_KEY = 'tu:workspace-sidebar-source'
const CURRENT_VIEW_KEY = 'tu:workspace-current-view'

function readStoredSource(): WorkspaceSidebarSource {
  try {
    const raw = localStorage.getItem(SIDEBAR_SOURCE_KEY)
    return raw === 'views' ? 'views' : 'knowledgeBase'
  } catch {
    return 'knowledgeBase'
  }
}

function readStoredViewId(): string | null {
  try {
    const raw = localStorage.getItem(CURRENT_VIEW_KEY)?.trim()
    if (raw && getWorkspaceViewById(raw)) return raw
  } catch {
    // ignore
  }
  return WORKSPACE_VIEW_CATALOG[0]?.id ?? null
}

export const useWorkspaceViewsStore = defineStore('workspaceViews', () => {
  const sidebarSource = ref<WorkspaceSidebarSource>(readStoredSource())
  const currentViewId = ref<string | null>(readStoredViewId())
  const learningPlanSnapshot = ref<LearningPlanViewSnapshot | null>(null)
  const learningPlanLoading = ref(false)
  const learningPlanError = ref('')
  const routeGenerating = ref(false)
  const routeStatus = ref('')
  const routeDialogVisible = ref(false)
  const selectedPointId = ref<string | null>(null)
  const selectedPointIds = ref<string[]>([])
  const listPage = ref(0)
  /** Explicit goal (StudyFlow / manual) overrides auto resolution until cleared. */
  const manualGoal = ref<LearningPlanViewGoal | null>(null)
  const goalPickerVisible = ref(false)

  const viewCatalog = computed(() => WORKSPACE_VIEW_CATALOG)
  const currentView = computed<WorkspaceViewDefinition | null>(() => (
    currentViewId.value ? getWorkspaceViewById(currentViewId.value) : null
  ))
  const isViewsMode = computed(() => sidebarSource.value === 'views')
  const isLearningPlanView = computed(() => currentView.value?.kind === 'learning-plan')
  const isTagContentView = computed(() => currentView.value?.kind === 'tag-content')
  const busy = computed(() => learningPlanLoading.value || routeGenerating.value)

  function persistSource() {
    try {
      localStorage.setItem(SIDEBAR_SOURCE_KEY, sidebarSource.value)
    } catch {
      // ignore
    }
  }

  function persistViewId() {
    try {
      if (currentViewId.value) localStorage.setItem(CURRENT_VIEW_KEY, currentViewId.value)
      else localStorage.removeItem(CURRENT_VIEW_KEY)
    } catch {
      // ignore
    }
  }

  function setSidebarSource(source: WorkspaceSidebarSource) {
    if (sidebarSource.value === source) return
    sidebarSource.value = source
    persistSource()
    if (source === 'knowledgeBase') {
      selectedPointId.value = null
      selectedPointIds.value = []
      return
    }
    if (currentView.value?.kind === 'learning-plan') {
      void rebuildLearningPlanView()
    }
  }

  function selectView(viewId: string) {
    if (!getWorkspaceViewById(viewId)) return
    currentViewId.value = viewId
    persistViewId()
    selectedPointId.value = null
    selectedPointIds.value = []
    listPage.value = 0
    if (getWorkspaceViewById(viewId)?.kind === 'learning-plan') {
      void rebuildLearningPlanView()
    }
  }

  function setListPage(page: number) {
    listPage.value = Math.max(0, page)
  }

  function selectPoint(pointId: string | null) {
    selectedPointId.value = pointId
    selectedPointIds.value = pointId ? [pointId] : []
  }

  function setSelectedPointIds(ids: string[]) {
    const unique = [...new Set(ids.filter(Boolean))]
    selectedPointIds.value = unique
    if (!selectedPointId.value || !unique.includes(selectedPointId.value)) {
      selectedPointId.value = unique.length ? unique[unique.length - 1]! : null
    }
  }

  /** Keep multi-selection; set reading-pane focus. */
  function setPrimarySelectedPoint(pointId: string | null) {
    selectedPointId.value = pointId
    if (pointId && !selectedPointIds.value.includes(pointId)) {
      selectedPointIds.value = [...selectedPointIds.value, pointId]
    }
  }

  function toggleSelectedPoint(pointId: string, mode: 'replace' | 'toggle' | 'add' = 'replace') {
    if (mode === 'replace') {
      setSelectedPointIds([pointId])
      selectedPointId.value = pointId
      return
    }
    const set = new Set(selectedPointIds.value)
    if (mode === 'add') set.add(pointId)
    else if (set.has(pointId)) set.delete(pointId)
    else set.add(pointId)
    setSelectedPointIds([...set])
    selectedPointId.value = pointId
  }

  function openGoalPicker() {
    goalPickerVisible.value = true
  }

  function setGoalPickerVisible(visible: boolean) {
    goalPickerVisible.value = visible
  }

  async function resolveSeedPointIds(
    kbId: string,
    goal: LearningPlanViewGoal,
  ): Promise<string[]> {
    if (goal.seedPointIds.length > 0) {
      return [...new Set(goal.seedPointIds)]
    }
    const found = new Set<string>()
    for (const locator of goal.locators) {
      try {
        const points = await listKnowledgePointsByLocator(kbId, locator)
        for (const point of points) found.add(point.id)
      } catch {
        // continue other locators
      }
    }
    return [...found]
  }

  async function resolveAutoGoal(userId: string | null | undefined): Promise<LearningPlanViewGoal | null> {
    try {
      const sfGoal = await getCurrentLearningGoal(userId)
      if (sfGoal) return goalFromStudyflowGoal(sfGoal)
    } catch {
      // StudyFlow unavailable — fall through to local in-progress
    }
    const inProgress = loadLearningInProgress(userId)
    if (inProgress) return goalFromLearningInProgress(inProgress)
    return null
  }

  async function rebuildLearningPlanView(options?: { preferManual?: boolean }) {
    const workspace = useWorkspaceStore()
    const kbId = workspace.currentKbId
    if (!kbId) {
      learningPlanSnapshot.value = null
      learningPlanError.value = '请先在「知识库」中选择数据源知识库'
      return
    }

    learningPlanLoading.value = true
    learningPlanError.value = ''
    try {
      const auth = useAuthStore()
      let goal = options?.preferManual === false ? null : manualGoal.value
      if (!goal) {
        goal = await resolveAutoGoal(auth.user?.id)
        if (goal) manualGoal.value = null
      }
      if (!goal) {
        learningPlanSnapshot.value = null
        learningPlanError.value = '尚无学习目标：请点「选目标」从 StudyFlow 选用/新建，或标记节选为「进行中」'
        return
      }

      const seedPointIds = await resolveSeedPointIds(kbId, goal)
      if (seedPointIds.length === 0) {
        learningPlanSnapshot.value = {
          kbId,
          goal: { ...goal, seedPointIds: [] },
          rows: [],
          truncated: false,
          warnings: [],
          builtAt: Date.now(),
        }
        learningPlanError.value = '尚无前置链路：将用 AI 分析生成学习路线'
        return
      }

      const graphs = await Promise.all(seedPointIds.map((centerPointId) => (
        getKnowledgeGraph(kbId, {
          mode: 'prerequisite',
          // Edge semantics: from=dependent → to=prerequisite (same as page「编辑前置」).
          // Graph BFS maps direction=in to outAdj, which walks those outgoing prerequisites.
          centerPointId,
          depth: LEARNING_PLAN_GRAPH_DEPTH,
          direction: 'in',
          maxNodes: LEARNING_PLAN_MAX_NODES,
        })
      )))

      learningPlanSnapshot.value = assembleLearningPlanSnapshot({
        kbId,
        goal: { ...goal, seedPointIds },
        seedPointIds,
        graphs,
      })
      learningPlanError.value = ''
      listPage.value = 0
      if (selectedPointIds.value.length) {
        const valid = new Set(learningPlanSnapshot.value.rows.map((row) => row.pointId))
        const kept = selectedPointIds.value.filter((id) => valid.has(id))
        setSelectedPointIds(kept)
      } else if (
        selectedPointId.value
        && !learningPlanSnapshot.value.rows.some((row) => row.pointId === selectedPointId.value)
      ) {
        selectedPointId.value = null
      }
    } catch (err) {
      learningPlanError.value = err instanceof Error ? err.message : '构建学习计划视图失败'
      learningPlanSnapshot.value = null
    } finally {
      learningPlanLoading.value = false
    }
  }

  /**
   * Prefer existing prerequisite chains; otherwise open AI route dialog.
   */
  async function generateAndPersistLearningRoute(options?: { force?: boolean }) {
    const workspace = useWorkspaceStore()
    const kbId = workspace.currentKbId
    if (!kbId) {
      learningPlanError.value = '请先在「知识库」中选择数据源知识库'
      return
    }

    const goal = manualGoal.value ?? learningPlanSnapshot.value?.goal
    if (!goal?.label?.trim() && options?.force) {
      learningPlanError.value = '请先选择学习目标'
      return
    }

    if (!options?.force) {
      routeGenerating.value = true
      routeStatus.value = '检查已有知识点链路…'
      learningPlanError.value = ''
      try {
        await rebuildLearningPlanView({ preferManual: true })
        const rows = learningPlanSnapshot.value?.rows.length ?? 0
        const seeds = learningPlanSnapshot.value?.goal.seedPointIds
          ?? manualGoal.value?.seedPointIds
          ?? []
        if (hasUsableLearningRoute(rows, seeds)) {
          routeStatus.value = '已使用知识库中的前置链路'
          return
        }
      } finally {
        routeGenerating.value = false
      }
    }

    openLearningRouteDialog()
  }

  function openLearningRouteDialog() {
    routeDialogVisible.value = true
  }

  function setRouteDialogVisible(visible: boolean) {
    routeDialogVisible.value = visible
  }

  async function applyStudyflowGoal(goal: LearningGoal) {
    manualGoal.value = goalFromStudyflowGoal(goal)
    await generateAndPersistLearningRoute()
  }

  function hydrateLearningPlanFromRoute(input: {
    kbId: string
    topic: string
    orderedItems: Array<{
      title: string
      summary?: string | null
      estimatedHours?: number | null
      children?: Array<{
        title: string
        summary?: string | null
        estimatedHours?: number | null
        children?: Array<{
          title: string
          summary?: string | null
          estimatedHours?: number | null
        }> | null
      }> | null
    }>
    orderedPointIds: string[]
    warnings?: string[] | null
  }) {
    const goal = manualGoal.value ?? learningPlanSnapshot.value?.goal
    const seedPointIds = input.orderedPointIds.length
      ? [input.orderedPointIds[input.orderedPointIds.length - 1]!]
      : (goal?.seedPointIds ?? [])
    const seedSet = new Set(seedPointIds)
    let idCursor = 0
    const takeId = () => input.orderedPointIds[idCursor++] || `tmp-${idCursor}`

    type NestedItem = (typeof input.orderedItems)[number]
    const walk = (list: NestedItem[], startOrder: number): LearningPlanViewRow[] => {
      return list.map((item, index) => {
        const pointId = takeId()
        const childrenSrc = item.children ?? []
        return {
          pointId,
          title: item.title?.trim() || `知识点 ${startOrder + index + 1}`,
          summary: item.summary ?? null,
          estimatedHours: item.estimatedHours ?? null,
          role: seedSet.has(pointId) ? 'goal' as const : 'prerequisite' as const,
          order: startOrder + index,
          children: childrenSrc.length
            ? walk(childrenSrc as NestedItem[], 0)
            : undefined,
        }
      })
    }

    const rows = walk(input.orderedItems, 0)
    learningPlanSnapshot.value = {
      kbId: input.kbId,
      goal: {
        source: goal?.source ?? 'manual-point',
        label: (goal?.label || input.topic || '学习目标').trim(),
        locators: goal?.locators ?? [],
        seedPointIds,
        studyflowGoalId: goal?.studyflowGoalId,
      },
      rows,
      truncated: false,
      warnings: input.warnings?.filter(Boolean) ?? [],
      builtAt: Date.now(),
    }
    learningPlanError.value = ''
    listPage.value = 0
  }

  function clearManualGoalAndRebuild() {
    manualGoal.value = null
    routeStatus.value = ''
    void rebuildLearningPlanView({ preferManual: false })
  }

  return {
    sidebarSource,
    currentViewId,
    learningPlanSnapshot,
    learningPlanLoading,
    learningPlanError,
    routeGenerating,
    routeStatus,
    routeDialogVisible,
    selectedPointId,
    selectedPointIds,
    listPage,
    manualGoal,
    goalPickerVisible,
    viewCatalog,
    currentView,
    isViewsMode,
    isLearningPlanView,
    isTagContentView,
    busy,
    setSidebarSource,
    selectView,
    setListPage,
    selectPoint,
    setSelectedPointIds,
    setPrimarySelectedPoint,
    toggleSelectedPoint,
    openGoalPicker,
    setGoalPickerVisible,
    rebuildLearningPlanView,
    hydrateLearningPlanFromRoute,
    generateAndPersistLearningRoute,
    openLearningRouteDialog,
    setRouteDialogVisible,
    applyStudyflowGoal,
    clearManualGoalAndRebuild,
  }
})

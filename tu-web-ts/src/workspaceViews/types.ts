/** Sidebar lists either knowledge bases or virtual views. */
export type WorkspaceSidebarSource = 'knowledgeBase' | 'views'

/** Built-in / future view kinds layered on KB + resource evidence. */
export type WorkspaceViewKind = 'learning-plan'

export interface WorkspaceViewDefinition {
  id: string
  kind: WorkspaceViewKind
  name: string
  description: string
  icon: string
}

export type LearningPlanRowRole = 'goal' | 'prerequisite'

/** One row in the learning-plan virtual database. */
export interface LearningPlanViewRow {
  pointId: string
  title: string
  summary?: string | null
  estimatedHours?: number | null
  role: LearningPlanRowRole
  /** 0-based learning order after topological sort. */
  order: number
  /** Optional finer-grained sub-steps under this row. */
  children?: LearningPlanViewRow[]
}

export interface LearningPlanViewGoal {
  source: 'learning-in-progress' | 'manual-point' | 'studyflow-goal'
  label: string
  /** Locators used to resolve seed knowledge points (resource evidence). */
  locators: string[]
  /** Explicit seed point ids (manual pick or resolved from locators). */
  seedPointIds: string[]
  /** StudyFlow learning_goal id when source is studyflow-goal. */
  studyflowGoalId?: string | null
}

export interface LearningPlanViewSnapshot {
  kbId: string
  goal: LearningPlanViewGoal
  rows: LearningPlanViewRow[]
  truncated: boolean
  warnings: string[]
  builtAt: number
}

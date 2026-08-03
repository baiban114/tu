import type { KnowledgeGraphEdge, KnowledgeGraphNode, KnowledgeGraphResponse } from '@/api/types'
import type { LearningInProgress } from '@/utils/learningInProgress'
import { formatLearningInProgressLabel } from '@/utils/learningInProgress'
import type {
  LearningPlanRowRole,
  LearningPlanViewGoal,
  LearningPlanViewRow,
  LearningPlanViewSnapshot,
} from './types'

export const LEARNING_PLAN_GRAPH_DEPTH = 8
export const LEARNING_PLAN_MAX_NODES = 500

export function locatorsFromLearningInProgress(target: LearningInProgress): string[] {
  const locators: string[] = []
  if (target.resourceExcerptId) {
    locators.push(`resource:${target.resourceItemId}:excerpt:${target.resourceExcerptId}`)
  }
  locators.push(`resource:${target.resourceItemId}`)
  return locators
}

export function goalFromLearningInProgress(target: LearningInProgress): LearningPlanViewGoal {
  return {
    source: 'learning-in-progress',
    label: formatLearningInProgressLabel(target),
    locators: locatorsFromLearningInProgress(target),
    seedPointIds: [],
  }
}

export function goalFromManualPoint(pointId: string, title: string): LearningPlanViewGoal {
  return {
    source: 'manual-point',
    label: title.trim() || '选定知识点',
    locators: [],
    seedPointIds: [pointId],
  }
}

export function goalFromStudyflowGoal(goal: {
  id: string
  title: string
  knowledgePointId?: string | null
  resourceItemId?: string | null
  resourceExcerptId?: string | null
}): LearningPlanViewGoal {
  const locators: string[] = []
  if (goal.resourceItemId && goal.resourceExcerptId) {
    locators.push(`resource:${goal.resourceItemId}:excerpt:${goal.resourceExcerptId}`)
  }
  if (goal.resourceItemId) {
    locators.push(`resource:${goal.resourceItemId}`)
  }
  const seedPointIds = goal.knowledgePointId ? [goal.knowledgePointId] : []
  return {
    source: 'studyflow-goal',
    label: goal.title.trim() || 'StudyFlow 目标',
    locators,
    seedPointIds,
    studyflowGoalId: goal.id,
  }
}

/** Merge graph responses; later graphs win on node/edge id collisions. */
export function mergeKnowledgeGraphs(graphs: KnowledgeGraphResponse[]): {
  nodes: KnowledgeGraphNode[]
  edges: KnowledgeGraphEdge[]
  truncated: boolean
  warnings: string[]
} {
  const nodeMap = new Map<string, KnowledgeGraphNode>()
  const edgeMap = new Map<string, KnowledgeGraphEdge>()
  let truncated = false
  const warnings: string[] = []

  for (const graph of graphs) {
    truncated = truncated || Boolean(graph.meta?.truncated)
    for (const warning of graph.meta?.warnings ?? []) {
      if (warning && !warnings.includes(warning)) warnings.push(warning)
    }
    for (const node of graph.nodes ?? []) {
      nodeMap.set(node.id, node)
    }
    for (const edge of graph.edges ?? []) {
      edgeMap.set(edge.id, edge)
    }
  }

  return {
    nodes: [...nodeMap.values()],
    edges: [...edgeMap.values()],
    truncated,
    warnings,
  }
}

/**
 * Learning order: prerequisite `from → to` means from depends on to → to before from.
 * Stable among ties by title.
 */
export function orderPointsForLearning(
  nodes: KnowledgeGraphNode[],
  edges: KnowledgeGraphEdge[],
  seedPointIds: Set<string>,
): LearningPlanViewRow[] {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]))
  const prereqEdges = edges.filter((edge) => edge.relationTypeKey === 'prerequisite'
    && nodeMap.has(edge.fromPointId)
    && nodeMap.has(edge.toPointId))

  const indegree = new Map<string, number>()
  const dependents = new Map<string, Set<string>>()
  for (const id of nodeMap.keys()) {
    indegree.set(id, 0)
    dependents.set(id, new Set())
  }
  for (const edge of prereqEdges) {
    // to must be learned before from
    dependents.get(edge.toPointId)!.add(edge.fromPointId)
    indegree.set(edge.fromPointId, (indegree.get(edge.fromPointId) ?? 0) + 1)
  }

  const ready = [...nodeMap.keys()]
    .filter((id) => (indegree.get(id) ?? 0) === 0)
    .sort((a, b) => compareNodes(nodeMap.get(a)!, nodeMap.get(b)!))

  const ordered: string[] = []
  while (ready.length > 0) {
    const id = ready.shift()!
    ordered.push(id)
    for (const next of dependents.get(id) ?? []) {
      const nextDegree = (indegree.get(next) ?? 0) - 1
      indegree.set(next, nextDegree)
      if (nextDegree === 0) {
        ready.push(next)
        ready.sort((a, b) => compareNodes(nodeMap.get(a)!, nodeMap.get(b)!))
      }
    }
  }

  // Cycles / leftovers: append remaining by title
  if (ordered.length < nodeMap.size) {
    const remaining = [...nodeMap.keys()]
      .filter((id) => !ordered.includes(id))
      .sort((a, b) => compareNodes(nodeMap.get(a)!, nodeMap.get(b)!))
    ordered.push(...remaining)
  }

  return ordered.map((pointId, order) => {
    const node = nodeMap.get(pointId)!
    const role: LearningPlanRowRole = seedPointIds.has(pointId) ? 'goal' : 'prerequisite'
    return {
      pointId,
      title: node.title,
      summary: node.summary ?? null,
      estimatedHours: node.estimatedHours ?? null,
      role,
      order,
    }
  })
}

function compareNodes(a: KnowledgeGraphNode, b: KnowledgeGraphNode): number {
  const sort = (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
  if (sort !== 0) return sort
  return a.title.localeCompare(b.title, 'zh')
}

export function assembleLearningPlanSnapshot(input: {
  kbId: string
  goal: LearningPlanViewGoal
  seedPointIds: string[]
  graphs: KnowledgeGraphResponse[]
  builtAt?: number
}): LearningPlanViewSnapshot {
  const merged = mergeKnowledgeGraphs(input.graphs)
  const seedSet = new Set(input.seedPointIds)
  // Ensure seed nodes exist even if a graph call failed for one of them
  const nodeIds = new Set(merged.nodes.map((n) => n.id))
  for (const id of seedSet) {
    if (!nodeIds.has(id)) {
      merged.nodes.push({
        id,
        title: input.goal.label,
        sortOrder: 0,
      })
    }
  }

  const rows = orderPointsForLearning(merged.nodes, merged.edges, seedSet)
  return {
    kbId: input.kbId,
    goal: {
      ...input.goal,
      seedPointIds: [...seedSet],
    },
    rows,
    truncated: merged.truncated,
    warnings: merged.warnings,
    builtAt: input.builtAt ?? Date.now(),
  }
}

export function paginateLearningPlanRows(
  rows: LearningPlanViewRow[],
  page: number,
  pageSize: number,
): { items: LearningPlanViewRow[]; total: number; page: number; pageSize: number } {
  const safeSize = Math.max(1, pageSize)
  const total = rows.length
  const maxPage = total === 0 ? 0 : Math.floor((total - 1) / safeSize)
  const safePage = Math.min(Math.max(0, page), maxPage)
  const start = safePage * safeSize
  return {
    items: rows.slice(start, start + safeSize),
    total,
    page: safePage,
    pageSize: safeSize,
  }
}

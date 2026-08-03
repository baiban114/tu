import type { LearningRouteItem, LearningRoutePlan } from '@/api/aiLearningRoute'

export interface ApplyLearningRouteResult {
  orderedPointIds: string[]
  createdPointIds: string[]
  createdEdgeCount: number
  skippedEdgeCount: number
  /** How many points were (re)parented under a soft-taxonomy parent. */
  parentedCount: number
}

async function ensureParentId(pointId: string, parentId: string | null | undefined): Promise<boolean> {
  if (!parentId || parentId === pointId) return false
  const { updateKnowledgePoint } = await import('@/api/knowledgePoint')
  try {
    await updateKnowledgePoint(pointId, { parentId })
    return true
  } catch {
    return false
  }
}

async function resolvePointId(
  kbId: string,
  item: LearningRouteItem,
  cache: Map<string, string>,
  parentId: string | null,
): Promise<{ pointId: string; created: boolean; parented: boolean }> {
  const { createKnowledgePoint, listKnowledgePoints } = await import('@/api/knowledgePoint')
  if (item.pointId?.trim()) {
    const id = item.pointId.trim()
    cache.set(item.title.trim().toLowerCase(), id)
    const parented = await ensureParentId(id, parentId)
    return { pointId: id, created: false, parented }
  }
  const title = item.title.trim()
  const key = title.toLowerCase()
  const cached = cache.get(key)
  if (cached) {
    const parented = await ensureParentId(cached, parentId)
    return { pointId: cached, created: false, parented }
  }

  const page = await listKnowledgePoints(kbId, { q: title, page: 0, pageSize: 20 })
  const exact = page.items.find((point) => point.title.trim().toLowerCase() === key)
  if (exact) {
    cache.set(key, exact.id)
    const parented = parentId && exact.parentId !== parentId
      ? await ensureParentId(exact.id, parentId)
      : false
    return { pointId: exact.id, created: false, parented }
  }

  const created = await createKnowledgePoint(kbId, {
    parentId: parentId ?? undefined,
    title,
    summary: item.summary ?? undefined,
    estimatedHours: item.estimatedHours ?? null,
  })
  cache.set(key, created.id)
  return { pointId: created.id, created: true, parented: Boolean(parentId) }
}

async function prerequisiteExists(
  kbId: string,
  fromPointId: string,
  toPointId: string,
): Promise<boolean> {
  try {
    const { listKnowledgeRelationsByPoint } = await import('@/api/knowledgeRelation')
    const relations = await listKnowledgeRelationsByPoint(kbId, fromPointId)
    return relations.outgoing.some((edge) => (
      edge.relationTypeKey === 'prerequisite' && edge.toPointId === toPointId
    ))
  } catch {
    return false
  }
}

/**
 * Flatten nested route items depth-first: parent then children.
 * Used for learning-order edges and hydrate id assignment.
 */
export function flattenLearningRouteItems(items: LearningRouteItem[] | null | undefined): LearningRouteItem[] {
  const out: LearningRouteItem[] = []
  const walk = (list: LearningRouteItem[]) => {
    for (const item of list) {
      if (!item?.title?.trim()) continue
      out.push({
        pointId: item.pointId,
        title: item.title,
        summary: item.summary,
        estimatedHours: item.estimatedHours,
      })
      if (item.children?.length) walk(item.children)
    }
  }
  walk(items ?? [])
  return out
}

/**
 * Persist AI route:
 * - Soft taxonomy: nested `children` → `knowledge_point.parent_id`
 * - Learning order: depth-first flatten → adjacent `prerequisite` edges
 *   (later depends on earlier → from=later, to=earlier)
 */
export async function applyLearningRoutePlan(
  kbId: string,
  plan: LearningRoutePlan,
): Promise<ApplyLearningRouteResult> {
  const { createKnowledgeRelation } = await import('@/api/knowledgeRelation')
  const titleCache = new Map<string, string>()
  const orderedPointIds: string[] = []
  const createdPointIds: string[] = []
  let parentedCount = 0

  async function applyItem(item: LearningRouteItem, parentId: string | null): Promise<void> {
    if (!item?.title?.trim()) return
    const resolved = await resolvePointId(kbId, item, titleCache, parentId)
    orderedPointIds.push(resolved.pointId)
    if (resolved.created) createdPointIds.push(resolved.pointId)
    if (resolved.parented) parentedCount += 1
    for (const child of item.children ?? []) {
      await applyItem(child, resolved.pointId)
    }
  }

  for (const item of plan.orderedItems ?? []) {
    await applyItem(item, null)
  }

  let createdEdgeCount = 0
  let skippedEdgeCount = 0
  for (let i = 0; i < orderedPointIds.length - 1; i += 1) {
    const toPointId = orderedPointIds[i]
    const fromPointId = orderedPointIds[i + 1]
    if (fromPointId === toPointId) {
      skippedEdgeCount += 1
      continue
    }
    if (await prerequisiteExists(kbId, fromPointId, toPointId)) {
      skippedEdgeCount += 1
      continue
    }
    try {
      await createKnowledgeRelation(kbId, {
        relationTypeKey: 'prerequisite',
        fromPointId,
        toPointId,
        note: 'learning-route',
        sourceProvenance: 'ai',
      })
      createdEdgeCount += 1
    } catch {
      skippedEdgeCount += 1
    }
  }

  return {
    orderedPointIds,
    createdPointIds,
    createdEdgeCount,
    skippedEdgeCount,
    parentedCount,
  }
}

export { hasUsableLearningRoute } from './hasUsableLearningRoute'

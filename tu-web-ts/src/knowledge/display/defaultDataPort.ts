import { getKnowledgePointTree, listKnowledgePointAnchors } from '@/api/knowledgePoint'
import { listKnowledgeRelationsByPoint } from '@/api/knowledgeRelation'
import type { KnowledgePoint } from '@/api/types'
import type { KnowledgePointDisplayDataPort } from './types'

function flattenPoints(nodes: KnowledgePoint[]): KnowledgePoint[] {
  const out: KnowledgePoint[] = []
  const walk = (list: KnowledgePoint[]) => {
    for (const node of list) {
      out.push(node)
      if (node.children?.length) walk(node.children)
    }
  }
  walk(nodes)
  return out
}

/**
 * Default adapter: wire display strategies to existing knowledge APIs.
 */
export function createDefaultKnowledgePointDisplayDataPort(
  options: { getPointOverride?: (pointId: string) => Promise<KnowledgePoint | null> } = {},
): KnowledgePointDisplayDataPort {
  const pointCache = new Map<string, KnowledgePoint>()

  async function ensurePoint(pointId: string): Promise<KnowledgePoint> {
    if (pointCache.has(pointId)) return pointCache.get(pointId)!
    if (options.getPointOverride) {
      const custom = await options.getPointOverride(pointId)
      if (custom) {
        pointCache.set(pointId, custom)
        return custom
      }
    }
    throw new Error(`Knowledge point not loaded: ${pointId}`)
  }

  return {
    async getPoint(pointId: string) {
      return ensurePoint(pointId)
    },
    async listRelationsByPoint(kbId, pointId) {
      return listKnowledgeRelationsByPoint(kbId, pointId)
    },
    async listAnchors(pointId) {
      return listKnowledgePointAnchors(pointId)
    },
    async getPointTitle(pointId) {
      try {
        return (await ensurePoint(pointId)).title
      } catch {
        return null
      }
    },
  }
}

/**
 * Prefetch a kb point tree into the data port cache so compose can resolve titles
 * without a per-id GET (backend currently has no get-by-id in some paths).
 */
export async function createKnowledgePointDisplayDataPortForKb(
  kbId: string,
): Promise<KnowledgePointDisplayDataPort> {
  const tree = await getKnowledgePointTree(kbId)
  const flat = flattenPoints(tree)
  const byId = new Map(flat.map((p) => [p.id, p] as const))

  return createDefaultKnowledgePointDisplayDataPort({
    getPointOverride: async (pointId) => byId.get(pointId) ?? null,
  })
}

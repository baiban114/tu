import type { KnowledgeGraphNode, KnowledgeGraphResponse, KnowledgePoint } from '@/api/types';

function flattenKnowledgePoints(tree: KnowledgePoint[]): KnowledgePoint[] {
  const result: KnowledgePoint[] = [];
  const walk = (nodes: KnowledgePoint[]) => {
    for (const node of nodes) {
      result.push(node);
      if (node.children?.length) walk(node.children);
    }
  };
  walk(tree);
  return result;
}

function pointToGraphNode(point: KnowledgePoint): KnowledgeGraphNode {
  return {
    id: point.id,
    title: point.title,
    parentId: point.parentId ?? null,
    estimatedHours: point.estimatedHours ?? null,
    summary: point.summary ?? null,
    sortOrder: point.sortOrder,
  };
}

function buildChildrenByParent(points: KnowledgePoint[]): Map<string, string[]> {
  const childrenByParent = new Map<string, string[]>();
  for (const point of points) {
    const parentId = point.parentId?.trim();
    if (!parentId) continue;
    if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
    childrenByParent.get(parentId)!.push(point.id);
  }
  for (const [parentId, childIds] of childrenByParent.entries()) {
    childrenByParent.set(
      parentId,
      childIds.sort((a, b) => {
        const left = points.find((item) => item.id === a);
        const right = points.find((item) => item.id === b);
        const leftOrder = left?.sortOrder ?? 0;
        const rightOrder = right?.sortOrder ?? 0;
        return leftOrder - rightOrder || (left?.title ?? '').localeCompare(right?.title ?? '');
      }),
    );
  }
  return childrenByParent;
}

/**
 * Merge taxonomy descendants from the same knowledge-point tree used by KnowledgePointPicker,
 * so graph nesting matches picker/manager hierarchy (parent_id).
 */
export function enrichKnowledgeGraphWithTaxonomy(
  response: KnowledgeGraphResponse,
  tree: KnowledgePoint[],
  options: { maxNodes?: number } = {},
): KnowledgeGraphResponse {
  const maxNodes = Math.min(Math.max(options.maxNodes ?? 500, 1), 2000);
  const flatPoints = flattenKnowledgePoints(tree);
  if (!flatPoints.length || !response.nodes.length) return response;

  const pointById = new Map(flatPoints.map((item) => [item.id, item]));
  const childrenByParent = buildChildrenByParent(flatPoints);
  const existingById = new Map(response.nodes.map((item) => [item.id, item]));

  const expandedIds = new Set(response.nodes.map((item) => item.id));
  const queue = [...expandedIds];
  let taxonomyTruncated = false;

  while (queue.length > 0) {
    const parentId = queue.shift()!;
    for (const childId of childrenByParent.get(parentId) ?? []) {
      if (expandedIds.has(childId)) continue;
      if (expandedIds.size >= maxNodes) {
        taxonomyTruncated = true;
        break;
      }
      expandedIds.add(childId);
      queue.push(childId);
    }
    if (taxonomyTruncated) break;
  }

  const nodes: KnowledgeGraphNode[] = [];
  for (const id of expandedIds) {
    const fromResponse = existingById.get(id);
    const fromTree = pointById.get(id);
    if (fromResponse) {
      nodes.push({
        ...fromResponse,
        parentId: fromTree?.parentId ?? fromResponse.parentId ?? null,
      });
      continue;
    }
    if (fromTree) nodes.push(pointToGraphNode(fromTree));
  }

  const warnings = [...response.meta.warnings];
  if (taxonomyTruncated && !warnings.includes('taxonomy children truncated due to maxNodes limit')) {
    warnings.push('taxonomy children truncated due to maxNodes limit');
  }

  return {
    ...response,
    nodes,
    meta: {
      ...response.meta,
      truncated: response.meta.truncated || taxonomyTruncated,
      warnings,
    },
  };
}

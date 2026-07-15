import type {
  GetKnowledgeGraphParams,
} from '@/api/knowledgeGraph';
import type {
  KnowledgeGraphDirection,
  KnowledgeGraphEdge,
  KnowledgeGraphMeta,
  KnowledgeGraphMode,
  KnowledgeGraphNode,
  KnowledgeGraphResponse,
  KnowledgePoint,
  KnowledgeRelation,
} from '@/api/types';
import { getKnowledgePointTreeMock } from '@/mock/knowledgePoint';
import { listKnowledgeRelationsMock, listRelationTypesMock } from '@/mock/knowledgeRelation';

const PREREQUISITE_TYPE = 'prerequisite';
const DEFAULT_MAX_NODES = 500;
const DEFAULT_DEPTH = 2;

interface PointEdge {
  id: string;
  fromPointId: string;
  toPointId: string;
  relationTypeKey: string;
  label: string;
  color?: string | null;
  bidirectional: boolean;
}

function flattenTree(tree: KnowledgePoint[]): KnowledgePoint[] {
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

function toGraphNode(point: KnowledgePoint): KnowledgeGraphNode {
  return {
    id: point.id,
    title: point.title,
    parentId: point.parentId ?? null,
    estimatedHours: point.estimatedHours ?? null,
    summary: point.summary ?? null,
    sortOrder: point.sortOrder,
  };
}

function loadAllRelations(kbId: string): KnowledgeRelation[] {
  const pageSize = 2000;
  let page = 0;
  const all: KnowledgeRelation[] = [];
  while (true) {
    const result = listKnowledgeRelationsMock(kbId, { page, pageSize });
    all.push(...result.items);
    if (all.length >= result.total) break;
    page += 1;
  }
  return all;
}

function toPointEdges(kbId: string, relations: KnowledgeRelation[], validPointIds: Set<string>, typeFilter: Set<string>, mode: KnowledgeGraphMode): PointEdge[] {
  const typeMap = new Map(listRelationTypesMock(kbId).map((item) => [item.typeKey, item]));
  return relations
    .filter((item) => {
      const from = item.fromPointId?.trim();
      const to = item.toPointId?.trim();
      if (!from || !to) return false;
      if (!validPointIds.has(from) || !validPointIds.has(to)) return false;
      if (mode === 'prerequisite') return item.relationTypeKey === PREREQUISITE_TYPE;
      if (typeFilter.size === 0) return true;
      return typeFilter.has(item.relationTypeKey);
    })
    .map((item) => {
      const type = typeMap.get(item.relationTypeKey);
      return {
        id: item.id,
        fromPointId: item.fromPointId!,
        toPointId: item.toPointId!,
        relationTypeKey: item.relationTypeKey,
        label: type?.label ?? item.relationTypeLabel,
        color: type?.color ?? item.relationTypeColor ?? '#1677ff',
        bidirectional: type?.bidirectional ?? item.bidirectional,
      };
    });
}

function bfsCentered(center: string, depth: number, maxNodes: number, edges: PointEdge[]) {
  const neighbors = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (!neighbors.has(edge.fromPointId)) neighbors.set(edge.fromPointId, new Set());
    if (!neighbors.has(edge.toPointId)) neighbors.set(edge.toPointId, new Set());
    neighbors.get(edge.fromPointId)!.add(edge.toPointId);
    neighbors.get(edge.toPointId)!.add(edge.fromPointId);
  }

  const visited = new Set<string>([center]);
  const queue: Array<{ id: string; hop: number }> = [{ id: center, hop: 0 }];
  let truncated = false;

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.hop >= depth) continue;
    for (const next of neighbors.get(current.id) ?? []) {
      if (visited.has(next)) continue;
      if (visited.size >= maxNodes) {
        truncated = true;
        return { pointIds: visited, truncated, cycleDetected: false };
      }
      visited.add(next);
      queue.push({ id: next, hop: current.hop + 1 });
    }
  }
  return { pointIds: visited, truncated, cycleDetected: false };
}

function bfsPrerequisite(center: string, depth: number, maxNodes: number, edges: PointEdge[], direction: KnowledgeGraphDirection) {
  const outAdj = new Map<string, Set<string>>();
  const inAdj = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (!outAdj.has(edge.fromPointId)) outAdj.set(edge.fromPointId, new Set());
    if (!inAdj.has(edge.toPointId)) inAdj.set(edge.toPointId, new Set());
    outAdj.get(edge.fromPointId)!.add(edge.toPointId);
    inAdj.get(edge.toPointId)!.add(edge.fromPointId);
  }

  const visited = new Set<string>([center]);
  const queue: Array<{ id: string; hop: number }> = [{ id: center, hop: 0 }];
  let truncated = false;
  let cycleDetected = false;

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.hop >= depth) continue;
    const nextNodes = new Set<string>();
    if (direction === 'out' || direction === 'both') {
      for (const item of inAdj.get(current.id) ?? []) nextNodes.add(item);
    }
    if (direction === 'in' || direction === 'both') {
      for (const item of outAdj.get(current.id) ?? []) nextNodes.add(item);
    }
    for (const next of nextNodes) {
      if (visited.has(next)) {
        cycleDetected = true;
        continue;
      }
      if (visited.size >= maxNodes) {
        truncated = true;
        return { pointIds: visited, truncated, cycleDetected };
      }
      visited.add(next);
      queue.push({ id: next, hop: current.hop + 1 });
    }
  }
  return { pointIds: visited, truncated, cycleDetected };
}

export function getKnowledgeGraphMock(kbId: string, params: GetKnowledgeGraphParams = {}): KnowledgeGraphResponse {
  const mode: KnowledgeGraphMode = params.mode ?? 'full';
  const maxNodes = Math.min(Math.max(params.maxNodes ?? DEFAULT_MAX_NODES, 1), 2000);
  const depth = Math.min(Math.max(params.depth ?? DEFAULT_DEPTH, 1), 10);
  const direction: KnowledgeGraphDirection = params.direction ?? 'out';
  const typeFilter = new Set(params.relationTypeKeys ?? []);
  const warnings: string[] = [];

  const tree = getKnowledgePointTreeMock(kbId);
  const allPoints = flattenTree(tree);
  const pointMap = new Map(allPoints.map((item) => [item.id, item]));
  const validPointIds = new Set(pointMap.keys());
  const relations = loadAllRelations(kbId);
  const allEdges = toPointEdges(kbId, relations, validPointIds, typeFilter, mode);

  let selectedIds: Set<string>;
  let truncated = false;

  if (mode === 'centered' || mode === 'prerequisite') {
    const center = params.centerPointId?.trim();
    if (!center) {
      throw new Error('centerPointId is required for this graph mode');
    }
    if (!pointMap.has(center)) {
      throw new Error(`center point not found: ${center}`);
    }
    if (mode === 'centered') {
      const bfs = bfsCentered(center, depth, maxNodes, allEdges);
      selectedIds = bfs.pointIds;
      truncated = bfs.truncated;
    } else {
      const prereqEdges = toPointEdges(kbId, relations, validPointIds, new Set(), 'prerequisite');
      const bfs = bfsPrerequisite(center, depth, maxNodes, prereqEdges, direction);
      selectedIds = bfs.pointIds;
      truncated = bfs.truncated;
      if (bfs.cycleDetected) {
        warnings.push('prerequisite chain contains a cycle; traversal stopped at revisits');
      }
    }
  } else {
    selectedIds = new Set<string>();
    const sorted = [...allPoints].sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
    for (const point of sorted) {
      if (selectedIds.size >= maxNodes) {
        truncated = true;
        break;
      }
      selectedIds.add(point.id);
    }
    if (allPoints.length > selectedIds.size) truncated = true;
  }

  const nodes = [...selectedIds]
    .map((id) => pointMap.get(id))
    .filter((item): item is KnowledgePoint => Boolean(item))
    .map(toGraphNode);

  const nodeIdSet = new Set(selectedIds);
  const edges: KnowledgeGraphEdge[] = allEdges
    .filter((edge) => nodeIdSet.has(edge.fromPointId) && nodeIdSet.has(edge.toPointId))
    .map((edge) => ({
      id: edge.id,
      fromPointId: edge.fromPointId,
      toPointId: edge.toPointId,
      relationTypeKey: edge.relationTypeKey,
      label: edge.label,
      color: edge.color,
      bidirectional: edge.bidirectional,
    }));

  const meta: KnowledgeGraphMeta = {
    mode,
    centerPointId: params.centerPointId ?? null,
    totalPoints: allPoints.length,
    totalRelations: allEdges.length,
    truncated,
    warnings,
  };

  return { nodes, edges, meta };
}

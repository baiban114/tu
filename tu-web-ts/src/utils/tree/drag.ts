import type { KnowledgePoint } from '@/api/types';

export type TreeDropType = 'before' | 'after' | 'inner' | 'prev' | 'next';

export function normalizeDropType(dropType: TreeDropType): 'before' | 'after' | 'inner' {
  if (dropType === 'prev') return 'before';
  if (dropType === 'next') return 'after';
  return dropType;
}

export interface TreeDropTarget {
  parentId: string | null;
  sortOrder: number;
}

export interface TreeMovableNode {
  id: string;
  parentId?: string | null;
  sortOrder: number;
}

export function flattenKnowledgePoints(points: KnowledgePoint[]): KnowledgePoint[] {
  const result: KnowledgePoint[] = [];
  const walk = (nodes: KnowledgePoint[], structuralParentId: string | null) => {
    for (const node of nodes) {
      const normalized: KnowledgePoint = {
        ...node,
        parentId: node.parentId ?? structuralParentId,
      };
      result.push(normalized);
      if (node.children?.length) walk(node.children, node.id);
    }
  };
  walk(points, null);
  return result;
}

export function toMovableNode(
  data: KnowledgePoint,
  structuralParentId?: string | null,
): TreeMovableNode {
  return {
    id: data.id,
    parentId: data.parentId ?? structuralParentId ?? null,
    sortOrder: data.sortOrder,
  };
}

export function isDescendant(
  ancestorId: string,
  nodeId: string,
  nodes: TreeMovableNode[],
): boolean {
  const childrenByParent = new Map<string, string[]>();
  for (const node of nodes) {
    if (!node.parentId) continue;
    const list = childrenByParent.get(node.parentId) ?? [];
    list.push(node.id);
    childrenByParent.set(node.parentId, list);
  }
  const stack = [...(childrenByParent.get(ancestorId) ?? [])];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === nodeId) return true;
    stack.push(...(childrenByParent.get(current) ?? []));
  }
  return false;
}

export function computeTreeDropTarget<T extends TreeMovableNode>(
  dragging: T,
  drop: T,
  dropType: TreeDropType,
  allNodes: T[],
): TreeDropTarget {
  const normalized = normalizeDropType(dropType);
  const parentId = normalized === 'inner' ? drop.id : (drop.parentId ?? null);
  const siblings = allNodes
    .filter((node) => node.id !== dragging.id && (node.parentId ?? null) === parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));

  if (normalized === 'inner') {
    return { parentId, sortOrder: siblings.length };
  }

  const dropIndex = siblings.findIndex((node) => node.id === drop.id);
  const targetIndex = normalized === 'before'
    ? Math.max(dropIndex, 0)
    : dropIndex < 0
      ? siblings.length
      : dropIndex + 1;

  return { parentId, sortOrder: targetIndex };
}

export function promoteToSiblingAfterParent<T extends TreeMovableNode>(
  dragging: T,
  parent: T,
  allNodes: T[],
): TreeDropTarget {
  return computeTreeDropTarget(dragging, parent, 'after', allNodes);
}

export function moveToRootEnd<T extends TreeMovableNode>(
  dragging: T,
  allNodes: T[],
): TreeDropTarget {
  const roots = allNodes
    .filter((node) => node.id !== dragging.id && (node.parentId ?? null) === null)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  return { parentId: null, sortOrder: roots.length };
}

export function canDropOnNode(
  draggingId: string,
  dropId: string,
  dropType: TreeDropType,
  allNodes: TreeMovableNode[],
): boolean {
  const normalized = normalizeDropType(dropType);
  if (draggingId === dropId) {
    return normalized !== 'inner';
  }
  if (normalized === 'inner' && isDescendant(draggingId, dropId, allNodes)) {
    return false;
  }
  return true;
}

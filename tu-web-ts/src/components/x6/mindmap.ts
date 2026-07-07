import type { Graph, Node } from '@antv/x6';
import { mindmap as hierarchyMindmap } from '@antv/hierarchy';
import type { GraphData } from '@/api/types';
import { isCellDeleteProtected } from './cellDelete';
import { createId, getCellPosition, getCellSize, type CellData } from './cellUtils';
import {
  createMindmapEdgeMetadata,
  createMindmapNode,
  type MindmapNodeRole,
} from './graphCells';
import {
  applyMindmapEdgeConnector,
  ensureMindmapConnectorRegistered,
  MINDMAP_H_GAP,
  MINDMAP_V_GAP,
} from './mindmapConnector';
import { getMindmapEdgePorts } from './ports';

export { MINDMAP_H_GAP, MINDMAP_V_GAP } from './mindmapConnector';

export type MindmapDirection = 'LR' | 'RL' | 'TB' | 'BT';
export type MindmapDropSide = 'left' | 'right';

export interface MindmapDropTarget {
  nodeId: string;
  side: MindmapDropSide;
}

export const MINDMAP_FREE_TOPIC_ROLE = 'free' as const;

export interface MindmapLayoutPreviewAttach {
  childId: string;
  parentId: string;
  side: MindmapDropSide;
  insertBeforeId?: string | null;
}

let mindmapLayoutPreviewAttach: MindmapLayoutPreviewAttach | null = null;
let mindmapLayoutSkipNodeIds = new Set<string>();
let mindmapDragPreviewActive = false;
let mindmapDragSessionActive = false;
let mindmapStructureChangeDepth = 0;

export function isApplyingMindmapDragPreview(): boolean {
  return mindmapDragPreviewActive || mindmapDragSessionActive || mindmapStructureChangeDepth > 0;
}

export function setMindmapDragPreviewActive(active: boolean) {
  mindmapDragPreviewActive = active;
}

export function setMindmapDragSession(draggedNodeId: string | null, graph?: Graph) {
  mindmapDragSessionActive = draggedNodeId != null;
  if (draggedNodeId && graph) {
    mindmapLayoutSkipNodeIds = new Set(collectMindmapDescendantIds(graph, draggedNodeId));
  } else {
    mindmapLayoutSkipNodeIds = new Set();
  }
  if (!draggedNodeId) {
    mindmapLayoutPreviewAttach = null;
  }
}

export function getMindmapLayoutSkipNodeIds(): ReadonlySet<string> {
  return mindmapLayoutSkipNodeIds;
}

export function setMindmapLayoutPreview(attach: MindmapLayoutPreviewAttach | null) {
  mindmapLayoutPreviewAttach = attach;
}

export function getMindmapLayoutPreview(): MindmapLayoutPreviewAttach | null {
  return mindmapLayoutPreviewAttach;
}

const DEFAULT_NODE_WIDTH = 156;
const DEFAULT_NODE_HEIGHT = 48;
const ROOT_NODE_WIDTH = 180;
const ROOT_NODE_HEIGHT = 56;

interface MindmapHierarchyData {
  id: string;
  width: number;
  height: number;
  side?: MindmapDropSide;
  children?: MindmapHierarchyData[];
}

interface MindmapLayoutNode {
  id: string;
  x: number;
  y: number;
  data: MindmapHierarchyData;
  children: MindmapLayoutNode[];
}

export function getMindmapBranchSide(graph: Graph, nodeId: string): MindmapDropSide {
  if (mindmapLayoutPreviewAttach?.childId === nodeId) {
    return mindmapLayoutPreviewAttach.side;
  }
  const node = graph.getCellById(nodeId);
  if (!node || !graph.isNode(node)) return 'right';

  const data = node.getData<Record<string, unknown>>() ?? {};
  if (data.mindBranchSide === 'left' || data.mindBranchSide === 'right') {
    return data.mindBranchSide;
  }

  const rootId = findMindmapRootId(graph);
  if (!rootId || nodeId === rootId) return 'right';

  const parentByChild = getParentIdMap(graph);
  const parentId = parentByChild.get(nodeId);
  if (parentId) {
    const parent = graph.getCellById(parentId);
    if (parent && graph.isNode(parent)) {
      const nodeCenterX = node.getPosition().x + node.getSize().width / 2;
      const parentCenterX = parent.getPosition().x + parent.getSize().width / 2;
      return nodeCenterX < parentCenterX ? 'left' : 'right';
    }
  }

  const root = graph.getCellById(rootId);
  if (root && graph.isNode(root)) {
    const nodeCenterX = node.getPosition().x + node.getSize().width / 2;
    const rootCenterX = root.getPosition().x + root.getSize().width / 2;
    return nodeCenterX < rootCenterX ? 'left' : 'right';
  }

  return 'right';
}

export function setMindmapBranchSide(graph: Graph, nodeId: string, side: MindmapDropSide) {
  const node = graph.getCellById(nodeId);
  if (!node || !graph.isNode(node)) return;
  node.setData({
    ...node.getData(),
    mindBranchSide: side,
  });
}

function getNodeSize(node: Node) {
  const size = node.getSize();
  const data = node.getData<Record<string, any>>() ?? {};
  const isRoot = data.mindRole === 'root';
  return {
    width: size.width || (isRoot ? ROOT_NODE_WIDTH : DEFAULT_NODE_WIDTH),
    height: size.height || (isRoot ? ROOT_NODE_HEIGHT : DEFAULT_NODE_HEIGHT),
  };
}

function dedupePreserveOrder(ids: string[]): string[] {
  const seen = new Set<string>();
  return ids.filter((id) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function getRawChildIds(graph: Graph, parentId: string): string[] {
  const childIds: string[] = [];
  graph.getEdges().forEach((edge) => {
    if (edge.getSourceCellId() !== parentId) return;
    const target = edge.getTargetCellId();
    if (target) childIds.push(target);
  });
  return dedupePreserveOrder(childIds);
}

export function getOrderedMindmapChildIds(graph: Graph, parentId: string): string[] {
  const parent = graph.getCellById(parentId);
  const raw = getRawChildIds(graph, parentId);
  if (!parent || !graph.isNode(parent)) return raw;

  const order = (parent.getData<Record<string, unknown>>()?.mindChildOrder as string[] | undefined) ?? [];
  const ordered = dedupePreserveOrder(order.filter((id) => raw.includes(id)));
  const orderedSet = new Set(ordered);
  const rest = raw.filter((id) => !orderedSet.has(id));
  return dedupePreserveOrder([...ordered, ...rest]);
}

export function setMindmapChildOrder(graph: Graph, parentId: string, childIds: string[]) {
  const parent = graph.getCellById(parentId);
  if (!parent || !graph.isNode(parent)) return;
  // Shallow merge: default setData deep-merges arrays and keeps stale mindChildOrder slots.
  parent.updateData({
    mindChildOrder: dedupePreserveOrder(childIds),
  });
}

export function insertMindmapChildOrder(
  graph: Graph,
  parentId: string,
  childId: string,
  side: MindmapDropSide,
  insertBeforeId?: string | null,
) {
  setMindmapBranchSide(graph, childId, side);

  const currentOrder = getOrderedMindmapChildIds(graph, parentId).filter((id) => id !== childId);
  let leftIds = currentOrder.filter((id) => getMindmapBranchSide(graph, id) === 'left');
  let rightIds = currentOrder.filter((id) => getMindmapBranchSide(graph, id) !== 'left');

  const targetBranch = side === 'left' ? leftIds : rightIds;
  if (insertBeforeId && targetBranch.includes(insertBeforeId)) {
    targetBranch.splice(targetBranch.indexOf(insertBeforeId), 0, childId);
  } else {
    targetBranch.push(childId);
  }

  if (side === 'left') {
    leftIds = targetBranch;
  } else {
    rightIds = targetBranch;
  }

  setMindmapChildOrder(graph, parentId, [...dedupePreserveOrder(leftIds), ...dedupePreserveOrder(rightIds)]);
}

export function removeMindmapChildFromOrder(graph: Graph, parentId: string, childId: string) {
  const order = getOrderedMindmapChildIds(graph, parentId).filter((id) => id !== childId);
  setMindmapChildOrder(graph, parentId, order);
}

export function getMindmapParentIdMap(graph: Graph): Map<string, string> {
  return getParentIdMap(graph);
}

function countMindmapChildOrderGhosts(graph: Graph, parentId: string): number {
  const parent = graph.getCellById(parentId);
  if (!parent || !graph.isNode(parent)) return 0;
  const raw = new Set(getRawChildIds(graph, parentId));
  const stored = (parent.getData<Record<string, unknown>>()?.mindChildOrder as string[] | undefined) ?? [];
  return stored.filter((id) => !raw.has(id)).length;
}

/** Persist mindChildOrder without IDs removed from the graph (deleted-node ghosts). */
export function pruneMindmapChildOrder(graph: Graph, parentId: string): number {
  const ghostCount = countMindmapChildOrderGhosts(graph, parentId);
  const pruned = getOrderedMindmapChildIds(graph, parentId);
  const parent = graph.getCellById(parentId);
  if (!parent || !graph.isNode(parent)) return 0;
  const stored = (parent.getData<Record<string, unknown>>()?.mindChildOrder as string[] | undefined) ?? [];
  const raw = new Set(getRawChildIds(graph, parentId));
  const storedLive = stored.filter((id) => raw.has(id));
  const hasDuplicateIds = storedLive.length !== new Set(storedLive).size;
  const unchanged = ghostCount === 0
    && !hasDuplicateIds
    && stored.length === pruned.length
    && stored.every((id, index) => id === pruned[index]);
  if (unchanged) return 0;
  setMindmapChildOrder(graph, parentId, pruned);
  return ghostCount + (hasDuplicateIds ? storedLive.length - new Set(storedLive).size : 0);
}

export function sanitizeMindmapChildOrders(graph: Graph): number {
  let totalGhosts = 0;
  graph.getNodes().forEach((node) => {
    const stored = (node.getData<Record<string, unknown>>()?.mindChildOrder as string[] | undefined) ?? [];
    const hasChildren = getRawChildIds(graph, node.id).length > 0;
    if (!stored.length && !hasChildren) return;
    totalGhosts += pruneMindmapChildOrder(graph, node.id);
  });
  return totalGhosts;
}

function getParentIdMap(graph: Graph): Map<string, string> {
  const parentByChild = new Map<string, string>();
  graph.getEdges().forEach((edge) => {
    if (edge.id === MINDMAP_DRAG_PREVIEW_EDGE_ID) return;
    const source = edge.getSourceCellId();
    const target = edge.getTargetCellId();
    if (!source || !target || !graph.isNode(graph.getCellById(source))) return;
    if (!graph.isNode(graph.getCellById(target))) return;
    parentByChild.set(target, source);
  });
  return parentByChild;
}

function buildChildrenByParent(graph: Graph): Map<string, string[]> {
  const childrenByParent = new Map<string, string[]>();
  graph.getEdges().forEach((edge) => {
    if (edge.id === MINDMAP_DRAG_PREVIEW_EDGE_ID) return;
    const source = edge.getSourceCellId();
    const target = edge.getTargetCellId();
    if (!source || !target) return;
    if (!childrenByParent.has(source)) childrenByParent.set(source, []);
    childrenByParent.get(source)!.push(target);
  });

  for (const [parentId, childIds] of childrenByParent.entries()) {
    const childIdSet = new Set(childIds);
    const ordered = getOrderedMindmapChildIds(graph, parentId);
    childrenByParent.set(parentId, ordered.filter((id) => childIdSet.has(id)));
  }

  const preview = mindmapLayoutPreviewAttach;
  if (preview) {
    for (const [parentId, childIds] of childrenByParent.entries()) {
      childrenByParent.set(parentId, childIds.filter((id) => id !== preview.childId));
    }
    const previewChildren = (childrenByParent.get(preview.parentId) ?? []).filter(
      (id) => id !== preview.childId,
    );
    const leftIds = previewChildren.filter((id) => getMindmapBranchSide(graph, id) === 'left');
    const rightIds = previewChildren.filter((id) => getMindmapBranchSide(graph, id) !== 'left');
    const branchIds = preview.side === 'left' ? leftIds : rightIds;
    if (preview.insertBeforeId && branchIds.includes(preview.insertBeforeId)) {
      branchIds.splice(branchIds.indexOf(preview.insertBeforeId), 0, preview.childId);
    } else {
      branchIds.push(preview.childId);
    }
    if (preview.side === 'left') {
      childrenByParent.set(preview.parentId, [...leftIds, ...rightIds]);
    } else {
      childrenByParent.set(preview.parentId, [...leftIds, ...rightIds]);
    }
  }

  return childrenByParent;
}

export function isMindmapFreeTopic(node: Node): boolean {
  const data = node.getData<Record<string, unknown>>() ?? {};
  return data.mindRole === MINDMAP_FREE_TOPIC_ROLE || data.mindFree === true;
}

export function applyMindmapTopicStyle(node: Node) {
  const data = node.getData<Record<string, unknown>>() ?? {};
  const isRoot = data.mindRole === 'root';
  const isFree = isMindmapFreeTopic(node);
  node.attr({
    body: {
      fill: isRoot ? '#e6f4ff' : (isFree ? '#fffbe6' : '#f6ffed'),
      stroke: isRoot ? '#1677ff' : (isFree ? '#d48806' : '#52c41a'),
      strokeWidth: isRoot ? 2 : 1.6,
      strokeDasharray: isFree ? '5 4' : '',
      rx: isRoot ? 20 : 14,
      ry: isRoot ? 20 : 14,
    },
    label: {
      fill: isRoot ? '#003a8c' : (isFree ? '#874d00' : '#135200'),
      fontSize: isRoot ? 15 : 14,
      fontWeight: isRoot ? 700 : 600,
    },
  });
}

export function findMindmapRootId(graph: Graph): string | null {
  const nodes = graph.getNodes();
  if (!nodes.length) return null;

  const explicitRoot = nodes.find((node) => node.getData<Record<string, any>>()?.mindRole === 'root');
  if (explicitRoot) return explicitRoot.id;

  const parentByChild = getParentIdMap(graph);
  const roots = nodes.filter((node) => !parentByChild.has(node.id));
  if (roots.length === 1) return roots[0].id;

  return nodes[0]?.id ?? null;
}

function buildHierarchyData(
  graph: Graph,
  nodeId: string,
  childrenByParent: Map<string, string[]>,
): MindmapHierarchyData {
  const node = graph.getCellById(nodeId);
  const { width, height } = node && graph.isNode(node)
    ? getNodeSize(node)
    : { width: DEFAULT_NODE_WIDTH, height: DEFAULT_NODE_HEIGHT };

  const childIds = (childrenByParent.get(nodeId) ?? []).filter((childId) => {
    const childNode = graph.getCellById(childId);
    return childNode?.isVisible() !== false;
  });

  const children = childIds.map((childId) => buildHierarchyData(graph, childId, childrenByParent));

  return {
    id: nodeId,
    width,
    height,
    side: getMindmapBranchSide(graph, nodeId),
    children: children.length ? children : undefined,
  };
}

function collectHierarchyPositions(
  node: MindmapLayoutNode,
  positions: Map<string, { x: number; y: number }>,
) {
  positions.set(node.id, { x: node.x, y: node.y });
  node.children.forEach((child) => collectHierarchyPositions(child, positions));
}

export function computeMindmapLayoutPositions(graph: Graph): Map<string, { x: number; y: number }> {
  const rootId = findMindmapRootId(graph);
  if (!rootId) return new Map();

  const rootNode = graph.getCellById(rootId);
  const rootPosition = rootNode && graph.isNode(rootNode)
    ? rootNode.getPosition()
    : { x: 360, y: 220 };

  const data = buildHierarchyData(graph, rootId, buildChildrenByParent(graph));
  const layoutRoot = hierarchyMindmap(data, {
    direction: 'H',
    getWidth(d: MindmapHierarchyData) {
      return d.width;
    },
    getHeight(d: MindmapHierarchyData) {
      return d.height;
    },
    getHGap() {
      return MINDMAP_H_GAP;
    },
    getVGap() {
      return MINDMAP_V_GAP;
    },
    getSide(child) {
      const side = (child.data as MindmapHierarchyData).side;
      return side === 'left' ? 'left' : 'right';
    },
  });

  const positions = new Map<string, { x: number; y: number }>();
  collectHierarchyPositions(layoutRoot as MindmapLayoutNode, positions);

  const layoutRootPos = positions.get(rootId);
  if (layoutRootPos) {
    const dx = rootPosition.x - layoutRootPos.x;
    const dy = rootPosition.y - layoutRootPos.y;
    positions.forEach((pos, id) => {
      positions.set(id, { x: pos.x + dx, y: pos.y + dy });
    });
  }

  return positions;
}

function isMindmapEdgeCell(cell: CellData): boolean {
  return cell.shape === 'edge' || Boolean(cell.source || cell.target);
}

function getMindmapGraphDataCells(data: GraphData): CellData[] {
  if (Array.isArray(data.cells) && data.cells.length > 0) {
    return data.cells as CellData[];
  }
  const nodes = (data.nodes ?? []) as CellData[];
  const edges = (data.edges ?? []) as CellData[];
  return [...nodes, ...edges];
}

function getMindmapParentIdMapFromCells(cells: CellData[]): Map<string, string> {
  const parentByChild = new Map<string, string>();
  cells.filter(isMindmapEdgeCell).forEach((edge) => {
    const source = typeof edge.source === 'object' ? edge.source?.cell : edge.source;
    const target = typeof edge.target === 'object' ? edge.target?.cell : edge.target;
    if (typeof source === 'string' && typeof target === 'string') {
      parentByChild.set(target, source);
    }
  });
  return parentByChild;
}

function getRawMindmapChildIdsFromCells(cells: CellData[], parentId: string): string[] {
  const childIds: string[] = [];
  cells.filter(isMindmapEdgeCell).forEach((edge) => {
    const source = typeof edge.source === 'object' ? edge.source?.cell : edge.source;
    const target = typeof edge.target === 'object' ? edge.target?.cell : edge.target;
    if (source === parentId && typeof target === 'string') {
      childIds.push(target);
    }
  });
  return dedupePreserveOrder(childIds);
}

function getOrderedMindmapChildIdsFromCells(
  cells: CellData[],
  cellById: Map<string, CellData>,
  parentId: string,
): string[] {
  const raw = getRawMindmapChildIdsFromCells(cells, parentId);
  const parent = cellById.get(parentId);
  const order = (parent?.data?.mindChildOrder as string[] | undefined) ?? [];
  const ordered = dedupePreserveOrder(order.filter((id) => raw.includes(id)));
  const orderedSet = new Set(ordered);
  const rest = raw.filter((id) => !orderedSet.has(id));
  return dedupePreserveOrder([...ordered, ...rest]);
}

function getMindmapBranchSideFromCell(cell: CellData | undefined): MindmapDropSide {
  const side = cell?.data?.mindBranchSide;
  return side === 'left' ? 'left' : 'right';
}

function getMindmapNodeSizeFromCell(cell: CellData): { width: number; height: number } {
  const isRoot = cell.data?.mindRole === 'root';
  const size = getCellSize(cell);
  return {
    width: size.width ?? (isRoot ? ROOT_NODE_WIDTH : DEFAULT_NODE_WIDTH),
    height: size.height ?? (isRoot ? ROOT_NODE_HEIGHT : DEFAULT_NODE_HEIGHT),
  };
}

function findMindmapRootIdFromCells(cells: CellData[]): string | null {
  const nodes = cells.filter((cell) => !isMindmapEdgeCell(cell));
  const explicitRoot = nodes.find((node) => node.data?.mindRole === 'root');
  if (explicitRoot?.id) return explicitRoot.id;

  const parentByChild = getMindmapParentIdMapFromCells(cells);
  const roots = nodes.filter((node) => node.id && !parentByChild.has(node.id));
  if (roots.length === 1) return roots[0].id!;

  return nodes[0]?.id ?? null;
}

function buildMindmapChildrenByParentFromCells(
  cells: CellData[],
  cellById: Map<string, CellData>,
): Map<string, string[]> {
  const childrenByParent = new Map<string, string[]>();
  cells.filter(isMindmapEdgeCell).forEach((edge) => {
    const source = typeof edge.source === 'object' ? edge.source?.cell : edge.source;
    const target = typeof edge.target === 'object' ? edge.target?.cell : edge.target;
    if (typeof source !== 'string' || typeof target !== 'string') return;
    if (!childrenByParent.has(source)) childrenByParent.set(source, []);
    childrenByParent.get(source)!.push(target);
  });

  for (const parentId of childrenByParent.keys()) {
    childrenByParent.set(parentId, getOrderedMindmapChildIdsFromCells(cells, cellById, parentId));
  }

  return childrenByParent;
}

function buildMindmapHierarchyDataFromCells(
  cellById: Map<string, CellData>,
  nodeId: string,
  childrenByParent: Map<string, string[]>,
): MindmapHierarchyData {
  const cell = cellById.get(nodeId);
  const { width, height } = cell
    ? getMindmapNodeSizeFromCell(cell)
    : { width: DEFAULT_NODE_WIDTH, height: DEFAULT_NODE_HEIGHT };
  const childIds = childrenByParent.get(nodeId) ?? [];
  const children = childIds.map((childId) => buildMindmapHierarchyDataFromCells(cellById, childId, childrenByParent));

  return {
    id: nodeId,
    width,
    height,
    side: getMindmapBranchSideFromCell(cell),
    children: children.length ? children : undefined,
  };
}

function pruneMindmapChildOrderInCells(cells: CellData[]): CellData[] {
  const cellById = new Map<string, CellData>();
  cells.forEach((cell) => {
    if (cell.id) cellById.set(cell.id, cell);
  });

  return cells.map((cell) => {
    if (!cell.id || isMindmapEdgeCell(cell)) return cell;
    const stored = (cell.data?.mindChildOrder as string[] | undefined) ?? [];
    if (!stored.length) return cell;
    const pruned = getOrderedMindmapChildIdsFromCells(cells, cellById, cell.id);
    if (stored.length === pruned.length && stored.every((id, index) => id === pruned[index])) {
      return cell;
    }
    return {
      ...cell,
      data: {
        ...(cell.data ?? {}),
        mindChildOrder: pruned,
      },
    };
  });
}

/** Apply hierarchy layout to persisted GraphData (no live Graph required). */
export function layoutMindmapGraphData(data: GraphData): GraphData {
  const cells = pruneMindmapChildOrderInCells(getMindmapGraphDataCells(data));
  if (!cells.length) return data;

  const cellById = new Map<string, CellData>();
  cells.forEach((cell) => {
    if (cell.id) cellById.set(cell.id, cell);
  });

  const rootId = findMindmapRootIdFromCells(cells);
  if (!rootId) return data;

  const rootCell = cellById.get(rootId);
  const rootPosition = rootCell ? getCellPosition(rootCell) : { x: 360, y: 220 };
  const childrenByParent = buildMindmapChildrenByParentFromCells(cells, cellById);
  const hierarchyData = buildMindmapHierarchyDataFromCells(cellById, rootId, childrenByParent);

  const layoutRoot = hierarchyMindmap(hierarchyData, {
    direction: 'H',
    getWidth(d: MindmapHierarchyData) {
      return d.width;
    },
    getHeight(d: MindmapHierarchyData) {
      return d.height;
    },
    getHGap() {
      return MINDMAP_H_GAP;
    },
    getVGap() {
      return MINDMAP_V_GAP;
    },
    getSide(child) {
      const side = (child.data as MindmapHierarchyData).side;
      return side === 'left' ? 'left' : 'right';
    },
  });

  const positions = new Map<string, { x: number; y: number }>();
  collectHierarchyPositions(layoutRoot as MindmapLayoutNode, positions);

  const layoutRootPos = positions.get(rootId);
  if (layoutRootPos) {
    const dx = rootPosition.x - layoutRootPos.x;
    const dy = rootPosition.y - layoutRootPos.y;
    positions.forEach((pos, id) => {
      positions.set(id, { x: pos.x + dx, y: pos.y + dy });
    });
  }

  const updatedCells = cells.map((cell) => {
    if (isMindmapEdgeCell(cell) || !cell.id) return cell;
    if (cell.data?.mindRole === MINDMAP_FREE_TOPIC_ROLE || cell.data?.mindFree) return cell;
    const pos = positions.get(cell.id);
    if (!pos) return cell;
    return { ...cell, x: pos.x, y: pos.y };
  });

  const nodes = updatedCells.filter((cell) => !isMindmapEdgeCell(cell));
  const edges = updatedCells.filter((cell) => isMindmapEdgeCell(cell));

  return {
    ...data,
    cells: updatedCells,
    nodes,
    edges,
  } as GraphData;
}

/** Insert new sibling immediately after anchor in branch order (Enter / explicit sibling add). */
export function resolveMindmapSiblingInsertBeforeId(
  graph: Graph,
  parentId: string,
  anchorNodeId: string,
  newNodeId: string,
): string | null {
  const side = getMindmapBranchSide(graph, anchorNodeId);
  const siblings = getOrderedMindmapChildIds(graph, parentId)
    .filter((id) => id !== newNodeId && getMindmapBranchSide(graph, id) === side);
  const anchorIndex = siblings.indexOf(anchorNodeId);
  if (anchorIndex < 0) return null;
  const nextIndex = anchorIndex + 1;
  return nextIndex < siblings.length ? siblings[nextIndex]! : null;
}

export function resolveMindmapInsertBeforeId(
  graph: Graph,
  parentId: string,
  draggedNodeId: string,
  branchSide: MindmapDropSide,
  compareY: number,
  layoutPositions: Map<string, { x: number; y: number }>,
): string | null {
  const siblings = getOrderedMindmapChildIds(graph, parentId)
    .filter((id) => id !== draggedNodeId && getMindmapBranchSide(graph, id) === branchSide);

  for (const siblingId of siblings) {
    const pos = layoutPositions.get(siblingId);
    if (!pos) continue;
    const sibling = graph.getCellById(siblingId);
    if (!sibling || !graph.isNode(sibling)) continue;
    const { height } = getNodeSize(sibling);
    if (pos.y + height / 2 > compareY) {
      return siblingId;
    }
  }
  return null;
}

export function computeMindmapInsertBeforeId(
  graph: Graph,
  parentId: string,
  draggedNodeId: string,
  branchSide: MindmapDropSide,
  compareY: number,
): string | null {
  const savedPreview = mindmapLayoutPreviewAttach;
  setMindmapLayoutPreview({
    childId: draggedNodeId,
    parentId,
    side: branchSide,
    insertBeforeId: null,
  });
  const layoutPositions = computeMindmapLayoutPositions(graph);
  const insertBeforeId = resolveMindmapInsertBeforeId(
    graph,
    parentId,
    draggedNodeId,
    branchSide,
    compareY,
    layoutPositions,
  );
  setMindmapLayoutPreview(savedPreview);
  return insertBeforeId;
}

export function syncMindmapEdgePorts(graph: Graph, silent = false) {
  ensureMindmapConnectorRegistered();
  const cellOptions = silent ? { silent: true } : undefined;
  graph.getEdges().forEach((edge) => {
    if (edge.id === MINDMAP_DRAG_PREVIEW_EDGE_ID) return;
    const targetId = edge.getTargetCellId();
    const sourceId = edge.getSourceCellId();
    if (!targetId || !sourceId) return;
    const targetNode = graph.getCellById(targetId);
    if (!targetNode || !graph.isNode(targetNode)) return;
    const branchSide = getMindmapBranchSide(graph, targetId);
    const ports = getMindmapEdgePorts(branchSide);
    edge.setSource({ cell: sourceId, port: ports.sourcePort }, cellOptions);
    edge.setTarget({ cell: targetId, port: ports.targetPort }, cellOptions);
    applyMindmapEdgeConnector(edge);
  });
}

export const MINDMAP_DRAG_PREVIEW_EDGE_ID = '__mindmap-drag-preview-edge__';
export const MINDMAP_DRAG_PREVIEW_OPTION = '__mindmapDragPreview';

export function layoutMindmapGraph(graph: Graph, direction: MindmapDirection = 'LR') {
  void direction;
  ensureMindmapConnectorRegistered();
  if (mindmapStructureChangeDepth > 0) {
    setMindmapDragSession(null);
  }
  const rootId = findMindmapRootId(graph);
  if (!rootId) return;

  sanitizeMindmapChildOrders(graph);
  compactAllMindmapChildOrders(graph);

  const positions = computeMindmapLayoutPositions(graph);
  if (!positions.size) return;

  graph.batchUpdate(() => {
    positions.forEach((pos, id) => {
      if (mindmapLayoutSkipNodeIds.has(id)) return;
      const node = graph.getCellById(id);
      if (node && graph.isNode(node)) {
        if (isMindmapFreeTopic(node)) return;
        node.position(pos.x, pos.y);
      }
    });

    graph.getNodes().forEach((node) => {
      if (isMindmapFreeTopic(node)) {
        applyMindmapTopicStyle(node);
      }
    });

    syncMindmapEdgePorts(graph, true);
  });
}

export function readGraphMindmapDirection(graph: Graph): MindmapDirection {
  const direction = (graph as { __mindmapDirection?: MindmapDirection }).__mindmapDirection;
  return direction ?? 'LR';
}

export function captureMindmapStableNodePositions(
  graph: Graph,
  excludedNodeIds: ReadonlySet<string>,
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  graph.getNodes().forEach((node) => {
    if (excludedNodeIds.has(node.id)) return;
    positions.set(node.id, node.getPosition());
  });
  return positions;
}

export function restoreMindmapStableNodePositions(
  graph: Graph,
  positions: Map<string, { x: number; y: number }>,
) {
  positions.forEach((position, nodeId) => {
    const node = graph.getCellById(nodeId);
    if (node && graph.isNode(node)) {
      node.position(position.x, position.y);
    }
  });
}

/** Drag-drop reparent finale: restore pre-change coords for stable nodes, then hierarchy layout. */
export function relayoutMindmapGraphAfterStructureChange(
  graph: Graph,
  stablePositions: Map<string, { x: number; y: number }>,
  direction?: MindmapDirection,
) {
  sanitizeMindmapChildOrders(graph);
  graph.batchUpdate(() => {
    restoreMindmapStableNodePositions(graph, stablePositions);
  });
  layoutMindmapGraph(graph, direction ?? readGraphMindmapDirection(graph));
}

function compactMindmapChildOrderForParent(graph: Graph, parentId: string): boolean {
  const compact = getOrderedMindmapChildIds(graph, parentId);
  const parent = graph.getCellById(parentId);
  if (!parent || !graph.isNode(parent)) return false;
  const stored = (parent.getData<Record<string, unknown>>()?.mindChildOrder as string[] | undefined) ?? [];
  const unchanged = stored.length === compact.length && stored.every((id, index) => id === compact[index]);
  if (unchanged) return false;
  setMindmapChildOrder(graph, parentId, compact);
  return true;
}

function compactAllMindmapChildOrders(graph: Graph): number {
  let compacted = 0;
  graph.getNodes().forEach((node) => {
    if (getRawChildIds(graph, node.id).length === 0) return;
    if (compactMindmapChildOrderForParent(graph, node.id)) {
      compacted += 1;
    }
  });
  return compacted;
}

/** Delete finale: prune child order then hierarchy layout (no stable-position restore). */
export function relayoutMindmapGraphAfterDelete(
  graph: Graph,
  direction?: MindmapDirection,
) {
  sanitizeMindmapChildOrders(graph);
  compactAllMindmapChildOrders(graph);
  layoutMindmapGraph(graph, direction ?? readGraphMindmapDirection(graph));
}

function attachMindmapNodeToParent(
  graph: Graph,
  parentId: string,
  node: Node,
  side: MindmapDropSide,
  insertBeforeId: string | null,
  direction: MindmapDirection,
) {
  pruneMindmapChildOrder(graph, parentId);
  graph.batchUpdate(() => {
    insertMindmapChildOrder(graph, parentId, node.id, side, insertBeforeId);
    node.setData({
      ...node.getData(),
      mindRole: 'topic',
      mindFree: false,
    });
    applyMindmapTopicStyle(node);
  });
  layoutMindmapGraph(graph, direction);
}

function runMindmapStructureChange<T>(run: () => T): T {
  mindmapStructureChangeDepth += 1;
  try {
    return run();
  } finally {
    mindmapStructureChangeDepth -= 1;
  }
}

export function syncMindmapEdgeStyles(graph: Graph) {
  ensureMindmapConnectorRegistered();
  graph.getEdges().forEach((edge) => {
    if (edge.id === MINDMAP_DRAG_PREVIEW_EDGE_ID) return;
    applyMindmapEdgeConnector(edge);
  });
  syncMindmapEdgePorts(graph);
}

function getSelectedMindmapNode(graph: Graph): Node | null {
  const selected = graph.getSelectedCells().filter((cell) => graph.isNode(cell)) as Node[];
  return selected.length === 1 ? selected[0] : null;
}

export function addMindmapChild(graph: Graph, parent?: Node | null): Node | null {
  return runMindmapStructureChange(() => {
    const parentNode = parent ?? getSelectedMindmapNode(graph) ?? (() => {
      const rootId = findMindmapRootId(graph);
      return rootId ? graph.getCellById(rootId) as Node : null;
    })();

    if (!parentNode || !graph.isNode(parentNode)) return null;

    const direction = readGraphMindmapDirection(graph);

    const child = graph.addNode(createMindmapNode({
      id: createId('mindmap-topic'),
      label: '新分支',
      mindRole: 'topic' as MindmapNodeRole,
    }));

    graph.addEdge(createMindmapEdgeMetadata(parentNode.id, child.id));

    const side = getMindmapBranchSide(graph, parentNode.id);
    attachMindmapNodeToParent(
      graph,
      parentNode.id,
      child,
      side,
      null,
      direction,
    );

    graph.cleanSelection();
    graph.select(child);
    return child;
  });
}

export function addMindmapSibling(graph: Graph, node?: Node | null): Node | null {
  return runMindmapStructureChange(() => {
    const current = node ?? getSelectedMindmapNode(graph);
    if (!current) return addMindmapChild(graph);

    const parentByChild = getParentIdMap(graph);
    const parentId = parentByChild.get(current.id);
    if (!parentId) {
      return addMindmapChild(graph, current);
    }

    const parentNode = graph.getCellById(parentId);
    if (!parentNode || !graph.isNode(parentNode)) return null;

    const direction = readGraphMindmapDirection(graph);

    const sibling = graph.addNode(createMindmapNode({
      id: createId('mindmap-topic'),
      label: '同级分支',
      mindRole: 'topic',
    }));

    graph.addEdge(createMindmapEdgeMetadata(parentNode.id, sibling.id));

    const side = getMindmapBranchSide(graph, current.id);
    const insertBeforeId = resolveMindmapSiblingInsertBeforeId(
      graph,
      parentId,
      current.id,
      sibling.id,
    );

    attachMindmapNodeToParent(
      graph,
      parentId,
      sibling,
      side,
      insertBeforeId,
      direction,
    );

    graph.cleanSelection();
    graph.select(sibling);
    return sibling;
  });
}

export function collectMindmapDescendantIds(graph: Graph, rootId: string): string[] {
  const result: string[] = [];
  const childrenByParent = new Map<string, string[]>();
  graph.getEdges().forEach((edge) => {
    const source = edge.getSourceCellId();
    const target = edge.getTargetCellId();
    if (!source || !target) return;
    if (!childrenByParent.has(source)) childrenByParent.set(source, []);
    childrenByParent.get(source)!.push(target);
  });

  const walk = (id: string) => {
    result.push(id);
    (childrenByParent.get(id) ?? []).forEach(walk);
  };

  walk(rootId);
  return result;
}

export function expandMindmapDeleteTargets(graph: Graph, nodes: Node[]): Node[] {
  if (!nodes.length) return [];

  const ids = new Set<string>();
  nodes.forEach((node) => {
    if (isCellDeleteProtected(node)) return;
    collectMindmapDescendantIds(graph, node.id).forEach((id) => ids.add(id));
  });

  return graph.getNodes().filter((node) => {
    if (!ids.has(node.id)) return false;
    return !isCellDeleteProtected(node);
  });
}

export function readMindmapDirection(data?: GraphData | null): MindmapDirection {
  const direction = data?.blueprintMeta?.direction;
  if (direction === 'LR' || direction === 'RL' || direction === 'TB' || direction === 'BT') {
    return direction;
  }
  return 'LR';
}

export function attachMindmapDirection(graph: Graph, data?: GraphData | null) {
  (graph as any).__mindmapDirection = readMindmapDirection(data);
}

export function canConnectMindmapEdge(
  graph: Graph,
  sourceCell: Node,
  targetCell: Node,
  excludeEdgeId?: string | null,
): boolean {
  if (sourceCell.id === targetCell.id) return false;

  const parentByChild = getParentIdMap(graph);
  if (parentByChild.has(targetCell.id)) return false;

  const incoming = (graph.getIncomingEdges(targetCell) ?? []).filter(
    (edge) => edge.id !== excludeEdgeId,
  );
  if (incoming.some((edge) => edge.getSourceCellId() === sourceCell.id)) return false;

  let cursor: string | undefined = sourceCell.id;
  while (cursor) {
    if (cursor === targetCell.id) return false;
    cursor = parentByChild.get(cursor);
  }

  return true;
}

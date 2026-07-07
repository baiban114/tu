import type { Graph, Node } from '@antv/x6';
import { createMindmapEdgeMetadata } from './graphCells';
import { applyMindmapEdgeConnector } from './mindmapConnector';
import {
  MINDMAP_DRAG_PREVIEW_EDGE_ID,
  MINDMAP_DRAG_PREVIEW_OPTION,
  applyMindmapTopicStyle,
  captureMindmapStableNodePositions,
  collectMindmapDescendantIds,
  computeMindmapInsertBeforeId,
  findMindmapRootId,
  insertMindmapChildOrder,
  layoutMindmapGraph,
  readGraphMindmapDirection,
  removeMindmapChildFromOrder,
  restoreMindmapStableNodePositions,
  setMindmapDragPreviewActive,
  setMindmapDragSession,
  setMindmapLayoutPreview,
  syncMindmapEdgeStyles,
  type MindmapDirection,
  type MindmapDropSide,
  type MindmapDropTarget,
  type MindmapLayoutPreviewAttach,
} from './mindmap';
import { getMindmapEdgePorts } from './ports';

export type { MindmapDropSide, MindmapDropTarget };

interface NodeBBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

let activeDropTarget: MindmapDropTarget | null = null;
let lastDragPointer: { x: number; y: number } | null = null;
let dragStartNodePositions = new Map<string, { x: number; y: number }>();

const DROP_TARGET_HIT_PADDING = 6;

function pointInBBox(x: number, y: number, bbox: NodeBBox, padding = 0): boolean {
  return (
    x >= bbox.x - padding
    && x <= bbox.x + bbox.width + padding
    && y >= bbox.y - padding
    && y <= bbox.y + bbox.height + padding
  );
}

function computeDropSide(pointer: { x: number; y: number }, targetNode: Node): MindmapDropSide {
  const targetCenter = getNodeCenter(targetNode);
  return pointer.x < targetCenter.x ? 'left' : 'right';
}

function isPointerOverTargetNode(
  pointer: { x: number; y: number },
  targetNode: Node,
  draggedNode: Node,
): boolean {
  const targetBBox = getNodeBBox(targetNode);
  if (pointInBBox(pointer.x, pointer.y, targetBBox, DROP_TARGET_HIT_PADDING)) {
    return true;
  }
  const dragged = getNodeCenter(draggedNode);
  if (bboxIntersects(dragged.bbox, targetBBox)) {
    return true;
  }
  return false;
}

export function resetMindmapDragDropState() {
  activeDropTarget = null;
  lastDragPointer = null;
}

export function getLastMindmapDragPointer(): { x: number; y: number } | null {
  return lastDragPointer;
}

function getNodeBBox(node: Node): NodeBBox {
  const pos = node.getPosition();
  const size = node.getSize();
  return {
    x: pos.x,
    y: pos.y,
    width: size.width,
    height: size.height,
  };
}

function getNodeCenter(node: Node) {
  const bbox = getNodeBBox(node);
  return {
    x: bbox.x + bbox.width / 2,
    y: bbox.y + bbox.height / 2,
    bbox,
  };
}

function bboxIntersects(a: NodeBBox, b: NodeBBox): boolean {
  return !(
    a.x + a.width < b.x
    || b.x + b.width < a.x
    || a.y + a.height < b.y
    || b.y + b.height < a.y
  );
}

function bboxOverlapArea(a: NodeBBox, b: NodeBBox): number {
  const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  if (overlapX <= 0 || overlapY <= 0) return 0;
  return overlapX * overlapY;
}

export function findMindmapDropTarget(
  graph: Graph,
  pointer: { x: number; y: number },
  draggedNode: Node,
  excludedNodeIds: ReadonlySet<string>,
): MindmapDropTarget | null {
  if (activeDropTarget) {
    const stickyNode = graph.getCellById(activeDropTarget.nodeId);
    if (
      stickyNode
      && graph.isNode(stickyNode)
      && !excludedNodeIds.has(stickyNode.id)
      && stickyNode.isVisible() !== false
      && isPointerOverTargetNode(pointer, stickyNode, draggedNode)
    ) {
      activeDropTarget = {
        nodeId: stickyNode.id,
        side: computeDropSide(pointer, stickyNode),
      };
      return activeDropTarget;
    }
  }

  let bestTarget: MindmapDropTarget | null = null;
  let bestScore = 0;

  for (const node of graph.getNodes()) {
    if (node.id === draggedNode.id) continue;
    if (excludedNodeIds.has(node.id)) continue;
    if (node.isVisible() === false) continue;
    if (!isPointerOverTargetNode(pointer, node, draggedNode)) continue;

    const targetBBox = getNodeBBox(node);
    const pointerInside = pointInBBox(pointer.x, pointer.y, targetBBox, DROP_TARGET_HIT_PADDING) ? 1 : 0;
    const overlap = bboxOverlapArea(getNodeCenter(draggedNode).bbox, targetBBox);
    const score = overlap + pointerInside * 100000;
    if (!bestTarget || score > bestScore) {
      bestTarget = {
        nodeId: node.id,
        side: computeDropSide(pointer, node),
      };
      bestScore = score;
    }
  }

  activeDropTarget = bestTarget;
  return bestTarget;
}

function buildPreviewAttach(
  graph: Graph,
  draggedNode: Node,
  target: MindmapDropTarget,
): MindmapLayoutPreviewAttach | null {
  const targetNode = graph.getCellById(target.nodeId);
  if (!targetNode || !graph.isNode(targetNode)) return null;
  if (!canReparentMindmapNode(graph, targetNode, draggedNode)) return null;

  return {
    childId: draggedNode.id,
    parentId: target.nodeId,
    side: target.side,
    insertBeforeId: null,
  };
}

function upsertMindmapDragPreviewEdge(
  graph: Graph,
  preview: MindmapLayoutPreviewAttach,
) {
  const ports = getMindmapEdgePorts(preview.side);
  const edgeOptions = { [MINDMAP_DRAG_PREVIEW_OPTION]: true };

  const previewLineAttrs = {
    'data-source-port': ports.sourcePort,
  };

  const existing = graph.getCellById(MINDMAP_DRAG_PREVIEW_EDGE_ID);
  if (existing && graph.isEdge(existing)) {
    existing.setSource({ cell: preview.parentId, port: ports.sourcePort }, edgeOptions);
    existing.setTarget({ cell: preview.childId, port: ports.targetPort }, edgeOptions);
    applyMindmapEdgeConnector(existing, { preview: true, branchSide: preview.side });
    existing.attr({ line: previewLineAttrs }, edgeOptions);
    existing.setZIndex(10, edgeOptions);
    return;
  }

  graph.addEdge({
    id: MINDMAP_DRAG_PREVIEW_EDGE_ID,
    shape: 'edge',
    source: { cell: preview.parentId, port: ports.sourcePort },
    target: { cell: preview.childId, port: ports.targetPort },
    attrs: {
      line: previewLineAttrs,
    },
    zIndex: 10,
  }, edgeOptions);

  const previewEdge = graph.getCellById(MINDMAP_DRAG_PREVIEW_EDGE_ID);
  if (previewEdge && graph.isEdge(previewEdge)) {
    applyMindmapEdgeConnector(previewEdge, { preview: true, branchSide: preview.side });
    previewEdge.attr({ line: previewLineAttrs }, edgeOptions);
  }
}

function clearMindmapDragPreviewVisuals(graph: Graph) {
  const previewEdge = graph.getCellById(MINDMAP_DRAG_PREVIEW_EDGE_ID);
  if (previewEdge) {
    graph.removeCell(previewEdge, { [MINDMAP_DRAG_PREVIEW_OPTION]: true });
  }
}

function getExcludedDropTargetIds(graph: Graph, draggedNode: Node): Set<string> {
  return new Set(collectMindmapDescendantIds(graph, draggedNode.id));
}

function captureStableNodePositions(
  graph: Graph,
  excludedNodeIds: ReadonlySet<string>,
): Map<string, { x: number; y: number }> {
  return captureMindmapStableNodePositions(graph, excludedNodeIds);
}

function captureAllNodePositions(graph: Graph): Map<string, { x: number; y: number }> {
  return captureMindmapStableNodePositions(graph, new Set());
}

function restoreStableNodePositions(graph: Graph, positions: Map<string, { x: number; y: number }>) {
  restoreMindmapStableNodePositions(graph, positions);
}

function removeIncomingMindmapEdges(graph: Graph, nodeId: string) {
  const node = graph.getCellById(nodeId);
  if (!node || !graph.isNode(node)) return;

  (graph.getIncomingEdges(node) ?? []).forEach((edge) => {
    const parentId = edge.getSourceCellId();
    if (parentId) {
      removeMindmapChildFromOrder(graph, parentId, nodeId);
    }
    graph.removeEdge(edge.id);
  });
}

function canReparentMindmapNode(graph: Graph, newParent: Node, draggedNode: Node): boolean {
  if (newParent.id === draggedNode.id) return false;

  const parentByChild = getParentIdMapForReparent(graph);
  let cursor: string | undefined = newParent.id;
  while (cursor) {
    if (cursor === draggedNode.id) return false;
    cursor = parentByChild.get(cursor);
  }
  return true;
}

function getParentIdMapForReparent(graph: Graph): Map<string, string> {
  const parentByChild = new Map<string, string>();
  graph.getEdges().forEach((edge) => {
    const source = edge.getSourceCellId();
    const target = edge.getTargetCellId();
    if (!source || !target) return;
    if (edge.id === MINDMAP_DRAG_PREVIEW_EDGE_ID) return;
    parentByChild.set(target, source);
  });
  return parentByChild;
}

export function updateMindmapDragPreview(
  graph: Graph,
  draggedNode: Node,
  pointer: { x: number; y: number },
): MindmapDropTarget | null {
  lastDragPointer = pointer;
  const excluded = getExcludedDropTargetIds(graph, draggedNode);
  const target = findMindmapDropTarget(graph, pointer, draggedNode, excluded);

  if (!target) {
    activeDropTarget = null;
    setMindmapDragPreviewActive(false);
    setMindmapLayoutPreview(null);
    clearMindmapDragPreviewVisuals(graph);
    return null;
  }

  const preview = buildPreviewAttach(graph, draggedNode, target);
  if (!preview) {
    activeDropTarget = null;
    setMindmapDragPreviewActive(false);
    setMindmapLayoutPreview(null);
    clearMindmapDragPreviewVisuals(graph);
    return null;
  }

  setMindmapDragPreviewActive(true);
  upsertMindmapDragPreviewEdge(graph, preview);
  return target;
}

export function clearMindmapDragPreview(graph: Graph, direction: MindmapDirection) {
  resetMindmapDragDropState();
  clearMindmapDragPreviewVisuals(graph);
  setMindmapDragPreviewActive(false);
  setMindmapLayoutPreview(null);
  setMindmapDragSession(null);
  dragStartNodePositions = new Map();
  layoutMindmapGraph(graph, direction);
}

export function beginMindmapNodeDrag(graph: Graph, nodeId: string) {
  resetMindmapDragDropState();
  dragStartNodePositions = captureAllNodePositions(graph);
  setMindmapDragSession(nodeId, graph);
}

export function endMindmapNodeDrag(
  graph: Graph,
  direction: MindmapDirection,
  options: { layout?: boolean } = {},
) {
  resetMindmapDragDropState();
  clearMindmapDragPreviewVisuals(graph);
  setMindmapDragPreviewActive(false);
  setMindmapLayoutPreview(null);
  setMindmapDragSession(null);
  dragStartNodePositions = new Map();
  if (options.layout === false) {
    syncMindmapEdgeStyles(graph);
  } else {
    layoutMindmapGraph(graph, direction);
  }
}

export function reparentMindmapNode(
  graph: Graph,
  draggedNode: Node,
  target: MindmapDropTarget,
  pointer?: { x: number; y: number } | null,
): boolean {
  const targetNode = graph.getCellById(target.nodeId);
  if (!targetNode || !graph.isNode(targetNode)) return false;
  if (!canReparentMindmapNode(graph, targetNode, draggedNode)) return false;

  const rootId = findMindmapRootId(graph);
  if (!rootId || draggedNode.id === rootId) return false;
  const draggedSubtreeIds = new Set(collectMindmapDescendantIds(graph, draggedNode.id));
  const stablePositions = dragStartNodePositions.size
    ? new Map(
      Array.from(dragStartNodePositions.entries()).filter(([nodeId]) => !draggedSubtreeIds.has(nodeId)),
    )
    : captureStableNodePositions(graph, draggedSubtreeIds);

  graph.batchUpdate(() => {
    removeIncomingMindmapEdges(graph, draggedNode.id);
    graph.addEdge(createMindmapEdgeMetadata(target.nodeId, draggedNode.id, undefined, target.side));
    const compareY = pointer?.y ?? getNodeCenter(draggedNode).y;
    const insertBeforeId = computeMindmapInsertBeforeId(
      graph,
      target.nodeId,
      draggedNode.id,
      target.side,
      compareY,
    );
    insertMindmapChildOrder(
      graph,
      target.nodeId,
      draggedNode.id,
      target.side,
      insertBeforeId,
    );
    draggedNode.setData({
      ...draggedNode.getData(),
      mindRole: 'topic',
      mindFree: false,
    });
    applyMindmapTopicStyle(draggedNode);
    restoreStableNodePositions(graph, stablePositions);
  });

  layoutMindmapGraph(graph, readGraphMindmapDirection(graph));
  return true;
}

export function commitMindmapDragDrop(
  graph: Graph,
  draggedNode: Node,
  dropTarget: MindmapDropTarget | null,
  pointer?: { x: number; y: number } | null,
): 'reparent' | 'unchanged' {
  const rootId = findMindmapRootId(graph);
  if (!rootId || draggedNode.id === rootId) {
    return 'unchanged';
  }

  if (dropTarget) {
    const targetNode = graph.getCellById(dropTarget.nodeId);
    if (targetNode && graph.isNode(targetNode) && canReparentMindmapNode(graph, targetNode, draggedNode)) {
      if (reparentMindmapNode(graph, draggedNode, dropTarget, pointer)) {
        return 'reparent';
      }
    }
  }

  if (dragStartNodePositions.size > 0) {
    restoreStableNodePositions(graph, dragStartNodePositions);
  }

  return 'unchanged';
}

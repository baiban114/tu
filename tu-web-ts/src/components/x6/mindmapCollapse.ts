import type { Graph, Node } from '@antv/x6';
import type { Block } from '@/api/types';
import type { ContentTreeNode } from '@/api/outline';
import type { MindmapRefStructureSource } from '@/utils/toc/mindmapRefToc';
import { formatHours } from '@/utils/tree/hours';
import { buildHeadingTree, type FlatTocEntry, type TocTreeItem } from '@/utils/toc/headings';
import {
  getMindmapRefBlockFlatToc,
  refBlockHasExpandableStructure,
  refTocEntryHasExpandableDescendants,
  setRefTocSectionCollapsed,
  isRefTocEntryDirectoryLevel,
  type MindmapRefTocContext,
} from '@/utils/toc/mindmapRefToc';
import {
  createMindmapEdgeMetadata,
  createMindmapNode,
} from './graphCells';
import { findMindmapRootId, layoutMindmapGraph, type MindmapDirection } from './mindmap';

export type { MindmapRefTocContext } from '@/utils/toc/mindmapRefToc';

export function isMindmapRefBlockNode(node: Node): boolean {
  const data = node.getData<Record<string, any>>() ?? {};
  return data.refKind === 'block-ref' || Boolean(data.refBlockId);
}

export function isMindmapRefTocGeneratedNode(node: Node): boolean {
  const data = node.getData<Record<string, any>>() ?? {};
  return Boolean(data.refTocEntryId && data.refTocParentRefId);
}

export function readMindmapChildrenCollapsed(node: Node, defaultValue = false): boolean {
  const data = node.getData<Record<string, any>>() ?? {};
  if (typeof data.childrenCollapsed === 'boolean') return data.childrenCollapsed;
  if (isMindmapRefBlockNode(node)) return true;
  return defaultValue;
}

export function isMindmapRefTocEntryCollapsed(refNode: Node, entryId: string): boolean {
  const data = refNode.getData<Record<string, any>>() ?? {};
  const collapsedMap = (data.refTocCollapsed ?? {}) as Record<string, boolean>;
  return collapsedMap[entryId] === true;
}

export function getMindmapDirectChildIds(graph: Graph, nodeId: string): string[] {
  const node = graph.getCellById(nodeId);
  if (!node || !graph.isNode(node)) return [];
  return (graph.getSuccessors(node, { distance: 1 }) ?? [])
    .filter((cell) => graph.isNode(cell))
    .map((cell) => cell.id);
}

function ensureMindmapEdge(graph: Graph, sourceId: string, targetId: string) {
  const exists = (graph.getEdges() ?? []).some((edge) => (
    edge.getSourceCellId() === sourceId && edge.getTargetCellId() === targetId
  ));
  if (!exists) {
    graph.addEdge(createMindmapEdgeMetadata(sourceId, targetId));
  }
}

function formatRefTocNodeLabel(entry: TocTreeItem | FlatTocEntry): string {
  const flat = entry as FlatTocEntry;
  if (flat.totalEstimatedHours != null && flat.totalEstimatedHours > 0) {
    return `${entry.text} (${formatHours(flat.totalEstimatedHours)})`;
  }
  return entry.text;
}

function upsertRefTocNode(
  graph: Graph,
  refNode: Node,
  entry: TocTreeItem,
  parentNodeId: string,
  existingByEntryId: Map<string, Node>,
): Node {
  let childNode = existingByEntryId.get(entry.id);
  const flatEntry = entry as FlatTocEntry;
  const label = formatRefTocNodeLabel(entry);
  if (!childNode) {
    childNode = graph.addNode(createMindmapNode({
      label,
      data: {
        mindRole: 'topic',
        refTocEntryId: entry.id,
        refTocParentRefId: refNode.id,
        refTocSourceType: entry.sourceType,
        contentTreeNodeId: flatEntry.contentTreeNodeId,
        refTocPreviewText: flatEntry.previewText,
        refTocEstimatedHours: flatEntry.estimatedHours,
        refTocTotalHours: flatEntry.totalEstimatedHours,
      },
    })) as Node;
    existingByEntryId.set(entry.id, childNode);
  } else {
    childNode.attr('label/text', label);
    childNode.updateData({
      contentTreeNodeId: flatEntry.contentTreeNodeId,
      refTocPreviewText: flatEntry.previewText,
      refTocEstimatedHours: flatEntry.estimatedHours,
      refTocTotalHours: flatEntry.totalEstimatedHours,
    });
  }

  ensureMindmapEdge(graph, parentNodeId, childNode.id);
  return childNode;
}

function syncRefTocSubtree(
  graph: Graph,
  refNode: Node,
  entries: TocTreeItem[],
  parentNodeId: string,
  validEntryIds: Set<string>,
  existingByEntryId: Map<string, Node>,
) {
  entries.forEach((entry) => {
    validEntryIds.add(entry.id);
    const childNode = upsertRefTocNode(graph, refNode, entry, parentNodeId, existingByEntryId);
    if (entry.children?.length) {
      syncRefTocSubtree(graph, refNode, entry.children, childNode.id, validEntryIds, existingByEntryId);
    }
  });
}

function syncRefDocBlockNodes(
  graph: Graph,
  refNode: Node,
  flat: FlatTocEntry[],
  validEntryIds: Set<string>,
  existingByEntryId: Map<string, Node>,
) {
  flat
    .filter((entry) => entry.sourceType === 'ref-doc-block')
    .forEach((entry) => {
      validEntryIds.add(entry.id);
      upsertRefTocNode(
        graph,
        refNode,
        {
          id: entry.id,
          blockId: entry.blockId,
          level: entry.level,
          text: entry.text,
          pos: entry.pos,
          sourceType: entry.sourceType,
          refId: entry.refId,
        },
        refNode.id,
        existingByEntryId,
      );
    });
}

/** Whether this ref block already has TOC-generated child nodes on the graph. */
export function refBlockHasMaterializedTocChildren(graph: Graph, refNode: Node): boolean {
  return graph.getNodes().some((node) => {
    const data = node.getData<Record<string, any>>() ?? {};
    return data.refTocParentRefId === refNode.id && typeof data.refTocEntryId === 'string';
  });
}

/** First-time materialization only; does not reconcile an existing subtree. */
export function materializeRefBlockTocChildrenIfNeeded(
  graph: Graph,
  refNode: Node,
  ctx: MindmapRefTocContext,
): boolean {
  if (refBlockHasMaterializedTocChildren(graph, refNode)) return false;
  syncRefBlockTocChildren(graph, refNode, ctx);
  return true;
}

/** Reconcile ref subtree with current outline (explicit user action). */
export function syncMindmapRefBlockTocFromSource(
  graph: Graph,
  refNode: Node,
  ctx: MindmapRefTocContext,
): void {
  syncRefBlockTocChildren(graph, refNode, ctx);
}

export function syncRefBlockTocChildren(
  graph: Graph,
  refNode: Node,
  ctx: MindmapRefTocContext,
): void {
  const flat = getMindmapRefBlockFlatToc(refNode, ctx);
  if (!flat.length) return;

  const headingFlat = flat.filter((entry) => entry.sourceType === 'ref-child');
  const tree = buildHeadingTree(headingFlat);
  const validEntryIds = new Set<string>();
  const existing = graph.getNodes().filter((node) => node.getData()?.refTocParentRefId === refNode.id);
  const existingByEntryId = new Map<string, Node>();
  existing.forEach((node) => {
    const entryId = node.getData()?.refTocEntryId;
    if (typeof entryId === 'string') existingByEntryId.set(entryId, node);
  });

  syncRefTocSubtree(graph, refNode, tree, refNode.id, validEntryIds, existingByEntryId);
  syncRefDocBlockNodes(graph, refNode, flat, validEntryIds, existingByEntryId);

  existing.forEach((node) => {
    const entryId = node.getData()?.refTocEntryId;
    if (typeof entryId === 'string' && !validEntryIds.has(entryId)) {
      graph.removeNode(node.id);
    }
  });
}

function resolveNodeCollapsed(graph: Graph, node: Node, inheritedCollapsed: boolean): boolean {
  if (inheritedCollapsed) return true;

  if (isMindmapRefBlockNode(node)) {
    return readMindmapChildrenCollapsed(node, true);
  }

  const data = node.getData<Record<string, any>>() ?? {};
  if (data.refTocEntryId && data.refTocParentRefId) {
    const refParent = graph.getCellById(data.refTocParentRefId);
    if (refParent && graph.isNode(refParent)) {
      return isMindmapRefTocEntryCollapsed(refParent, data.refTocEntryId);
    }
    return true;
  }

  return readMindmapChildrenCollapsed(node, false);
}

/** 收起后移除不可见 cell 的选中态，避免 X6 选中虚框残留在画布上。 */
export function settleMindmapCollapseSelection(graph: Graph): void {
  const selected = graph.getSelectedCells();
  if (!selected.length) return;

  const visibleSelected = selected.filter((cell) => {
    if (!cell.isVisible()) return false;
    if (graph.isEdge(cell)) {
      const source = cell.getSourceCell();
      const target = cell.getTargetCell();
      if ((source && !source.isVisible()) || (target && !target.isVisible())) return false;
    }
    return true;
  });

  if (visibleSelected.length === selected.length) return;

  if (visibleSelected.length === 0) {
    graph.cleanSelection();
    return;
  }

  graph.resetSelection(visibleSelected);
}

function applySuccessorVisibility(graph: Graph, node: Node, hideChildren: boolean) {
  const successors = graph.getSuccessors(node, { distance: 1 }) ?? [];
  successors.forEach((cell) => {
    if (!graph.isNode(cell)) return;
    const child = cell as Node;
    child.toggleVisible(!hideChildren);

    if (hideChildren) {
      applySuccessorVisibility(graph, child, true);
      return;
    }

    const childHideChildren = resolveNodeCollapsed(graph, child, false);
    applySuccessorVisibility(graph, child, childHideChildren);
  });
}

let applyingMindmapCollapseState = false;

export function isApplyingMindmapCollapseState(): boolean {
  return applyingMindmapCollapseState;
}

export function nodeHasMindmapExpandableChildren(
  graph: Graph,
  node: Node,
  ctx: MindmapRefTocContext,
): boolean {
  if (getMindmapDirectChildIds(graph, node.id).length > 0) {
    return true;
  }

  if (isMindmapRefBlockNode(node)) {
    const data = node.getData<Record<string, any>>() ?? {};
    const refBlockId = typeof data.refBlockId === 'string' ? data.refBlockId : '';
    const refType: 'block' | 'page' = data.refType === 'page' ? 'page' : 'block';
    return refBlockHasExpandableStructure(node.id, refBlockId, refType, ctx);
  }

  const data = node.getData<Record<string, any>>() ?? {};
  if (data.refTocEntryId && data.refTocParentRefId) {
    const refParent = graph.getCellById(data.refTocParentRefId);
    if (!refParent || !graph.isNode(refParent)) return false;
    const flat = getMindmapRefBlockFlatToc(refParent, ctx);
    return refTocEntryHasExpandableDescendants(flat, data.refTocEntryId);
  }

  return false;
}

export function readMindmapNodeCollapsedForDisplay(graph: Graph, node: Node): boolean {
  if (isMindmapRefBlockNode(node)) {
    return readMindmapChildrenCollapsed(node, true);
  }

  const data = node.getData<Record<string, any>>() ?? {};
  if (data.refTocEntryId && data.refTocParentRefId) {
    const refParent = graph.getCellById(data.refTocParentRefId);
    if (refParent && graph.isNode(refParent)) {
      return isMindmapRefTocEntryCollapsed(refParent, data.refTocEntryId);
    }
    return true;
  }

  return readMindmapChildrenCollapsed(node, false);
}

export function getMindmapCollapseButtonStyle(
  node: Node,
  graph: Graph,
  direction: MindmapDirection,
): Record<string, string> {
  const bbox = node.getBBox();
  const zoom = graph.zoom();
  const { tx, ty } = graph.translate();
  const nodeLeft = bbox.x * zoom + tx;
  const nodeTop = bbox.y * zoom + ty;
  const nodeWidth = bbox.width * zoom;
  const nodeHeight = bbox.height * zoom;
  const btnSize = 22;
  const gap = 8;

  let left = nodeLeft + nodeWidth + gap;
  let top = nodeTop + nodeHeight * 0.28 - btnSize / 2;

  if (direction === 'RL') {
    left = nodeLeft - gap - btnSize;
    top = nodeTop + nodeHeight * 0.28 - btnSize / 2;
  } else if (direction === 'TB') {
    left = nodeLeft + nodeWidth * 0.72 - btnSize / 2;
    top = nodeTop + nodeHeight + gap;
  } else if (direction === 'BT') {
    left = nodeLeft + nodeWidth * 0.72 - btnSize / 2;
    top = nodeTop - gap - btnSize;
  }

  return {
    position: 'absolute',
    left: `${left}px`,
    top: `${top}px`,
    width: `${btnSize}px`,
    height: `${btnSize}px`,
    zIndex: '1100',
  };
}

export function applyMindmapCollapseState(
  graph: Graph,
  direction: MindmapDirection,
  ctx: MindmapRefTocContext,
) {
  if (applyingMindmapCollapseState) return;
  applyingMindmapCollapseState = true;

  try {
    graph.batchUpdate(() => {
      graph.getNodes().forEach((node) => node.show());
      graph.getEdges().forEach((edge) => edge.show());

      const rootId = findMindmapRootId(graph);
      if (!rootId) return;

      const root = graph.getCellById(rootId);
      if (!root || !graph.isNode(root)) return;

      const hideRootChildren = resolveNodeCollapsed(graph, root, false);
      applySuccessorVisibility(graph, root, hideRootChildren);

      graph.getEdges().forEach((edge) => {
        const source = edge.getSourceCell();
        const target = edge.getTargetCell();
        if ((source && !source.isVisible()) || (target && !target.isVisible())) {
          edge.hide();
        }
      });
    });

    layoutMindmapGraph(graph, direction);
    settleMindmapCollapseSelection(graph);
    ctx.onCollapseSettled?.(graph);
  } finally {
    applyingMindmapCollapseState = false;
  }
}

export function toggleMindmapNodeCollapse(
  graph: Graph,
  node: Node,
  direction: MindmapDirection,
  ctx: MindmapRefTocContext,
) {
  const data = node.getData<Record<string, any>>() ?? {};

  if (data.refTocEntryId && data.refTocParentRefId) {
    const refParent = graph.getCellById(data.refTocParentRefId);
    if (!refParent || !graph.isNode(refParent)) return;
    const flat = getMindmapRefBlockFlatToc(refParent, ctx);
    const entry = flat.find((item) => item.id === data.refTocEntryId);
    const refData = refParent.getData<Record<string, any>>() ?? {};
    const collapsedMap = { ...(refData.refTocCollapsed ?? {}) } as Record<string, boolean>;
    const entryId = data.refTocEntryId as string;
    const currentlyCollapsed = isMindmapRefTocEntryCollapsed(refParent, entryId);

    if (entry && isRefTocEntryDirectoryLevel(entry)) {
      setRefTocSectionCollapsed(collapsedMap, flat, entryId, !currentlyCollapsed);
    } else {
      collapsedMap[entryId] = currentlyCollapsed ? false : true;
    }

    refParent.updateData({ refTocCollapsed: collapsedMap });
  } else if (isMindmapRefBlockNode(node)) {
    const currentlyCollapsed = readMindmapChildrenCollapsed(node, true);
    node.updateData({ childrenCollapsed: !currentlyCollapsed });
    if (currentlyCollapsed) {
      materializeRefBlockTocChildrenIfNeeded(graph, node, ctx);
    }
  } else {
    const currentlyCollapsed = readMindmapChildrenCollapsed(node, false);
    node.updateData({ childrenCollapsed: !currentlyCollapsed });
  }

  applyMindmapCollapseState(graph, direction, ctx);
}

export function createMindmapRefTocContext(
  options: {
    getPageOutline?: (pageId: string) => ContentTreeNode[] | undefined
    getBlockOutline?: (blockId: string) => ContentTreeNode[] | undefined
    getPageTitle?: (pageId: string) => string
    getBlockMeta?: (id: string) => { pageTitle?: string } | undefined
    getPageBlocks?: (pageId: string) => Block[]
    getBlock?: (id: string) => Block | undefined
    structureSource?: MindmapRefStructureSource
    onCollapseSettled?: (graph: Graph) => void
  } | ((pageId: string) => Block[]),
  getBlock?: (id: string) => Block | undefined,
  getPageTitle?: (pageId: string) => string,
  getBlockMeta?: (id: string) => { pageTitle?: string } | undefined,
  getPageOutline?: (pageId: string) => ContentTreeNode[] | undefined,
  getBlockOutline?: (blockId: string) => ContentTreeNode[] | undefined,
): MindmapRefTocContext {
  if (typeof options === 'function') {
    return {
      getPageBlocks: options,
      getBlock,
      getPageTitle,
      getBlockMeta,
      getPageOutline,
      getBlockOutline,
      structureSource: 'blocks',
    }
  }
  return {
    getPageOutline: options.getPageOutline,
    getBlockOutline: options.getBlockOutline,
    getPageTitle: options.getPageTitle,
    getBlockMeta: options.getBlockMeta,
    getPageBlocks: options.getPageBlocks,
    getBlock: options.getBlock,
    structureSource: options.structureSource ?? (options.getPageOutline || options.getBlockOutline ? 'outline' : 'blocks'),
    onCollapseSettled: options.onCollapseSettled,
  }
}

import type { GraphData, KnowledgeGraphEdge, KnowledgeGraphNode, KnowledgeGraphResponse } from '@/api/types';
import { createEdgeMetadata } from '@/components/x6/graphCells';
import { createNodePorts } from '@/components/x6/ports';

export const KNOWLEDGE_GRAPH_KIND = 'knowledge-graph' as const;

const NODE_WIDTH = 168;
const NODE_HEIGHT = 56;
const LEAF_WIDTH = 148;
const LEAF_HEIGHT = 40;
const PAD = 12;
const HEADER_H = 36;
const CHILD_GAP = 8;
const Y_GAP = 96;
const START_X = 80;
const START_Y = 80;

export interface KnowledgeGraphNodeBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface NodeSize {
  width: number;
  height: number;
}

interface ProjectedNodeRecord {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex?: number;
}

interface TaxonomyTree {
  childrenMap: Map<string, KnowledgeGraphNode[]>;
  roots: KnowledgeGraphNode[];
}

/** Pick source/target ports from relative node centers to minimize orth routing bends. */
export function resolveKnowledgeGraphEdgePorts(
  source: KnowledgeGraphNodeBounds,
  target: KnowledgeGraphNodeBounds,
): { sourcePort: string; targetPort: string } {
  const sourceCx = source.x + source.width / 2;
  const sourceCy = source.y + source.height / 2;
  const targetCx = target.x + target.width / 2;
  const targetCy = target.y + target.height / 2;
  const dx = targetCx - sourceCx;
  const dy = targetCy - sourceCy;

  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx >= 0) {
      return { sourcePort: 'port-right', targetPort: 'port-left' };
    }
    return { sourcePort: 'port-left', targetPort: 'port-right' };
  }

  if (dy >= 0) {
    return { sourcePort: 'port-bottom', targetPort: 'port-top' };
  }
  return { sourcePort: 'port-top', targetPort: 'port-bottom' };
}

export function knowledgePointNodeId(pointId: string): string {
  return `kp-${pointId}`;
}

export function parseKnowledgePointNodeId(nodeId: string): string | null {
  if (!nodeId.startsWith('kp-')) return null;
  return nodeId.slice(3);
}

function sortNodes(list: KnowledgeGraphNode[]): KnowledgeGraphNode[] {
  return [...list].sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
}

function buildTaxonomyTree(nodes: KnowledgeGraphNode[]): TaxonomyTree {
  const nodeMap = new Map(nodes.map((item) => [item.id, item]));
  const childrenMap = new Map<string, KnowledgeGraphNode[]>();
  const roots: KnowledgeGraphNode[] = [];

  for (const node of nodes) {
    const parentId = node.parentId?.trim();
    if (parentId && nodeMap.has(parentId)) {
      if (!childrenMap.has(parentId)) childrenMap.set(parentId, []);
      childrenMap.get(parentId)!.push(node);
    } else {
      roots.push(node);
    }
  }

  return { childrenMap, roots: sortNodes(roots) };
}

function countTaxonomyChildren(pointId: string, childrenMap: Map<string, KnowledgeGraphNode[]>): number {
  return (childrenMap.get(pointId) ?? []).length;
}

function hasTaxonomyChildren(
  pointId: string,
  childrenMap: Map<string, KnowledgeGraphNode[]>,
  collapsedPointIds?: Set<string>,
): boolean {
  if (collapsedPointIds?.has(pointId)) return false;
  return countTaxonomyChildren(pointId, childrenMap) > 0;
}

function computeContainerSize(
  pointId: string,
  childrenMap: Map<string, KnowledgeGraphNode[]>,
  collapsedPointIds?: Set<string>,
): NodeSize {
  if (collapsedPointIds?.has(pointId)) {
    return { width: NODE_WIDTH, height: NODE_HEIGHT };
  }
  const children = sortNodes(childrenMap.get(pointId) ?? []);
  const childSizes = children.map((child) => {
    if (hasTaxonomyChildren(child.id, childrenMap, collapsedPointIds)) {
      return computeContainerSize(child.id, childrenMap, collapsedPointIds);
    }
    return { width: LEAF_WIDTH, height: LEAF_HEIGHT };
  });
  const maxChildW = childSizes.length ? Math.max(...childSizes.map((item) => item.width)) : LEAF_WIDTH;
  const width = Math.max(NODE_WIDTH, maxChildW + PAD * 2);
  const totalChildH = childSizes.reduce((sum, item, index) => sum + item.height + (index > 0 ? CHILD_GAP : 0), 0);
  const height = HEADER_H + totalChildH + PAD;
  return { width, height };
}

function resolveNodeSize(
  pointId: string,
  childrenMap: Map<string, KnowledgeGraphNode[]>,
  isRoot: boolean,
  collapsedPointIds?: Set<string>,
): NodeSize {
  if (!hasTaxonomyChildren(pointId, childrenMap, collapsedPointIds)) {
    return isRoot
      ? { width: NODE_WIDTH, height: NODE_HEIGHT }
      : { width: LEAF_WIDTH, height: LEAF_HEIGHT };
  }
  return computeContainerSize(pointId, childrenMap, collapsedPointIds);
}

export interface KnowledgeGraphProjectionOptions {
  highlightPointId?: string | null;
  highlightPointIds?: string[];
  collapsedPointIds?: Iterable<string>;
}

function toCollapsedSet(collapsedPointIds?: Iterable<string>): Set<string> {
  if (!collapsedPointIds) return new Set();
  return collapsedPointIds instanceof Set ? collapsedPointIds : new Set(collapsedPointIds);
}

function createKnowledgeGraphNodeCell(
  node: KnowledgeGraphNode,
  layout: {
    x: number;
    y: number;
    width: number;
    height: number;
    isContainer: boolean;
    isRoot: boolean;
    zIndex: number;
    childrenCollapsed?: boolean;
  },
  options: KnowledgeGraphProjectionOptions = {},
): GraphData['nodes'][number] {
  const highlightIds = new Set(
    [
      options.highlightPointId,
      ...(options.highlightPointIds ?? []),
    ].filter((item): item is string => Boolean(item)),
  );
  const isHighlight = highlightIds.has(node.id);
  const cellId = knowledgePointNodeId(node.id);
  const labelWidth = layout.width - 20;
  const labelHeight = layout.isContainer ? HEADER_H - 8 : layout.height - 12;
  const displayLabel = layout.childrenCollapsed ? `▸ ${node.title}` : node.title;

  const bodyFill = isHighlight
    ? '#e6f4ff'
    : layout.isContainer
      ? '#f8fafc'
      : '#ffffff';
  const bodyStroke = isHighlight ? '#1677ff' : layout.isContainer ? '#b8c4d9' : '#91caff';
  const fontSize = layout.isRoot || layout.isContainer ? 13 : 12;

  const cell: GraphData['nodes'][number] = {
    id: cellId,
    x: layout.x,
    y: layout.y,
    width: layout.width,
    height: layout.height,
    zIndex: layout.zIndex,
    shape: 'rect',
    label: displayLabel,
    ports: createNodePorts(),
    data: {
      preset: 'round',
      label: displayLabel,
      knowledgePointId: node.id,
      estimatedHours: node.estimatedHours ?? null,
      summary: node.summary ?? null,
      graphRole: layout.isContainer ? 'knowledge-point-container' : 'knowledge-point',
      childrenCollapsed: layout.childrenCollapsed ?? false,
      hasTaxonomyChildren: layout.isContainer,
    },
    attrs: {
      body: {
        fill: bodyFill,
        stroke: bodyStroke,
        strokeWidth: isHighlight ? 2 : layout.isContainer ? 1.6 : 1.4,
        rx: layout.isContainer ? 12 : 10,
        ry: layout.isContainer ? 12 : 10,
      },
      label: {
        text: displayLabel,
        refX: layout.isContainer ? PAD : '50%',
        refY: layout.isContainer ? HEADER_H / 2 : '50%',
        textAnchor: layout.isContainer ? 'start' : 'middle',
        textVerticalAnchor: 'middle',
        fill: '#10239e',
        fontSize,
        fontWeight: layout.isContainer || layout.isRoot ? 600 : 500,
        textWrap: {
          width: labelWidth,
          height: labelHeight,
          ellipsis: true,
        },
      },
    },
  };

  return cell;
}

function layoutEmbeddedSubtree(
  node: KnowledgeGraphNode,
  childrenMap: Map<string, KnowledgeGraphNode[]>,
  layout: {
    absX: number;
    absY: number;
    isRoot: boolean;
    depth: number;
  },
  options: KnowledgeGraphProjectionOptions,
  output: GraphData['nodes'],
): void {
  const collapsedPointIds = toCollapsedSet(options.collapsedPointIds);
  const childrenCollapsed = collapsedPointIds.has(node.id);
  const taxonomyChildCount = countTaxonomyChildren(node.id, childrenMap);
  const isContainer = hasTaxonomyChildren(node.id, childrenMap, collapsedPointIds);
  const displayAsContainer = taxonomyChildCount > 0;
  const size = resolveNodeSize(node.id, childrenMap, layout.isRoot, collapsedPointIds);
  output.push(
    createKnowledgeGraphNodeCell(
      node,
      {
        x: layout.absX,
        y: layout.absY,
        width: size.width,
        height: size.height,
        isContainer: displayAsContainer,
        isRoot: layout.isRoot,
        zIndex: layout.depth + 1,
        childrenCollapsed,
      },
      options,
    ),
  );

  if (!isContainer || childrenCollapsed) return;

  const children = sortNodes(childrenMap.get(node.id) ?? []);
  let childY = layout.absY + HEADER_H;
  for (const child of children) {
    layoutEmbeddedSubtree(
      child,
      childrenMap,
      {
        absX: layout.absX + PAD,
        absY: childY,
        isRoot: false,
        depth: layout.depth + 1,
      },
      options,
      output,
    );
    const childSize = resolveNodeSize(child.id, childrenMap, false, collapsedPointIds);
    childY += childSize.height + CHILD_GAP;
  }
}

export function computeAbsoluteBounds(
  nodeId: string,
  nodeById: Map<string, ProjectedNodeRecord>,
  cache = new Map<string, KnowledgeGraphNodeBounds>(),
): KnowledgeGraphNodeBounds | null {
  if (cache.has(nodeId)) return cache.get(nodeId)!;
  const node = nodeById.get(nodeId);
  if (!node) return null;

  const bounds: KnowledgeGraphNodeBounds = {
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
  };
  cache.set(nodeId, bounds);
  return bounds;
}

function buildProjectedNodes(
  nodes: KnowledgeGraphNode[],
  options: KnowledgeGraphProjectionOptions = {},
): GraphData['nodes'] {
  const { childrenMap, roots } = buildTaxonomyTree(nodes);
  const output: GraphData['nodes'] = [];

  roots.forEach((root, index) => {
    layoutEmbeddedSubtree(
      root,
      childrenMap,
      {
        absX: START_X,
        absY: START_Y + index * Y_GAP,
        isRoot: true,
        depth: 0,
      },
      options,
      output,
    );
  });

  return output;
}

function buildParentByChild(nodes: KnowledgeGraphNode[]): Map<string, string> {
  const parentByChild = new Map<string, string>();
  for (const node of nodes) {
    const parentId = node.parentId?.trim();
    if (parentId) parentByChild.set(node.id, parentId);
  }
  return parentByChild;
}

function resolveVisiblePointId(
  pointId: string,
  visiblePointIds: Set<string>,
  parentByChild: Map<string, string>,
): string | null {
  let current: string | undefined = pointId;
  while (current) {
    if (visiblePointIds.has(current)) return current;
    current = parentByChild.get(current);
  }
  return null;
}

function createKnowledgeGraphEdge(
  edge: KnowledgeGraphEdge,
  boundsByNodeId: Map<string, KnowledgeGraphNodeBounds>,
): GraphData['edges'][number] {
  const color = edge.color || '#52616b';
  const sourceId = knowledgePointNodeId(edge.fromPointId);
  const targetId = knowledgePointNodeId(edge.toPointId);
  const sourceBounds = boundsByNodeId.get(sourceId);
  const targetBounds = boundsByNodeId.get(targetId);

  let source: string | { cell: string; port: string } = sourceId;
  let target: string | { cell: string; port: string } = targetId;
  if (sourceBounds && targetBounds) {
    const ports = resolveKnowledgeGraphEdgePorts(sourceBounds, targetBounds);
    source = { cell: sourceId, port: ports.sourcePort };
    target = { cell: targetId, port: ports.targetPort };
  }

  return createEdgeMetadata(
    {
      id: `kg-edge-${edge.id}`,
      source,
      target,
      labels: [
        {
          attrs: {
            label: {
              text: edge.label,
              fill: color,
              fontSize: 11,
            },
            rect: {
              fill: '#ffffff',
              stroke: color,
              strokeWidth: 0.8,
              rx: 4,
              ry: 4,
            },
          },
        },
      ],
      attrs: {
        line: {
          stroke: color,
          strokeWidth: 1.6,
          targetMarker: edge.bidirectional
            ? ''
            : {
                name: 'block',
                width: 8,
                height: 6,
              },
          sourceMarker: edge.bidirectional
            ? {
                name: 'block',
                width: 8,
                height: 6,
              }
            : '',
        },
      },
      data: {
        relationTypeKey: edge.relationTypeKey,
        bidirectional: edge.bidirectional,
      },
    },
  ) as GraphData['edges'][number];
}

export function projectKnowledgeGraphToGraphData(
  graph: KnowledgeGraphResponse,
  options: KnowledgeGraphProjectionOptions = {},
): GraphData {
  const nodes = buildProjectedNodes(graph.nodes, options);
  const visiblePointIds = new Set(
    nodes
      .map((node) => parseKnowledgePointNodeId(node.id))
      .filter((item): item is string => Boolean(item)),
  );
  const parentByChild = buildParentByChild(graph.nodes);
  const nodeById = new Map<string, ProjectedNodeRecord>(
    nodes.map((node) => [
      node.id,
      {
        id: node.id,
        x: node.x ?? START_X,
        y: node.y ?? START_Y,
        width: node.width ?? NODE_WIDTH,
        height: node.height ?? NODE_HEIGHT,
        zIndex: typeof node.zIndex === 'number' ? node.zIndex : undefined,
      },
    ]),
  );
  const boundsByNodeId = new Map<string, KnowledgeGraphNodeBounds>();
  for (const node of nodes) {
    const bounds = computeAbsoluteBounds(node.id, nodeById);
    if (bounds) boundsByNodeId.set(node.id, bounds);
  }

  const edges = graph.edges
    .map((edge) => {
      const visibleFrom = resolveVisiblePointId(edge.fromPointId, visiblePointIds, parentByChild);
      const visibleTo = resolveVisiblePointId(edge.toPointId, visiblePointIds, parentByChild);
      if (!visibleFrom || !visibleTo || visibleFrom === visibleTo) return null;
      return createKnowledgeGraphEdge(
        {
          ...edge,
          fromPointId: visibleFrom,
          toPointId: visibleTo,
        },
        boundsByNodeId,
      );
    })
    .filter((edge): edge is GraphData['edges'][number] => edge != null);
  const rootNode = nodes.find((node) => (node.zIndex ?? 1) === 1);
  const anchor = rootNode
    ? { x: rootNode.x ?? START_X, y: rootNode.y ?? START_Y }
    : { x: START_X, y: START_Y };

  return {
    nodes,
    edges,
    blueprintMeta: {
      kind: KNOWLEDGE_GRAPH_KIND,
      anchor,
      direction: 'LR',
    },
  };
}

export function collectKnowledgeGraphContainerPointIds(nodes: KnowledgeGraphNode[]): string[] {
  const ids = new Set<string>();
  for (const node of nodes) {
    const parentId = node.parentId?.trim();
    if (parentId) ids.add(parentId);
  }
  return [...ids].sort();
}

export function getKnowledgeGraphBounds(graphData: GraphData): { x: number; y: number; width: number; height: number } | null {
  if (!graphData.nodes.length) return null;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const node of graphData.nodes) {
    const x = node.x ?? 0;
    const y = node.y ?? 0;
    const width = node.width ?? NODE_WIDTH;
    const height = node.height ?? NODE_HEIGHT;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + height);
  }

  return {
    x: minX,
    y: minY,
    width: Math.max(maxX - minX, NODE_WIDTH),
    height: Math.max(maxY - minY, NODE_HEIGHT),
  };
}

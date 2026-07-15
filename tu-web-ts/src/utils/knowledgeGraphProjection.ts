import type { GraphData, KnowledgeGraphEdge, KnowledgeGraphNode, KnowledgeGraphResponse } from '@/api/types';
import { createEdgeMetadata } from '@/components/x6/graphCells';
import { createNodePorts } from '@/components/x6/ports';

export const KNOWLEDGE_GRAPH_KIND = 'knowledge-graph' as const;

const NODE_WIDTH = 168;
const NODE_HEIGHT = 56;
const X_GAP = 240;
const Y_GAP = 96;
const START_X = 80;
const START_Y = 80;
const ORPHAN_COLUMN = -1;

export interface KnowledgeGraphNodeBounds {
  x: number;
  y: number;
  width: number;
  height: number;
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

interface LayoutPosition {
  node: KnowledgeGraphNode;
  depth: number;
  order: number;
}

function buildLayoutPositions(nodes: KnowledgeGraphNode[]): LayoutPosition[] {
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

  const sortNodes = (list: KnowledgeGraphNode[]) =>
    [...list].sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));

  const result: LayoutPosition[] = [];
  let order = 0;

  const visit = (list: KnowledgeGraphNode[], depth: number) => {
    for (const node of sortNodes(list)) {
      result.push({ node, depth, order });
      order += 1;
      const children = childrenMap.get(node.id);
      if (children?.length) visit(children, depth + 1);
    }
  };

  visit(sortNodes(roots), 0);

  const placed = new Set(result.map((item) => item.node.id));
  const orphans = sortNodes(nodes.filter((item) => !placed.has(item.id)));
  for (const node of orphans) {
    result.push({ node, depth: ORPHAN_COLUMN, order });
    order += 1;
  }

  return result;
}

function createKnowledgeGraphNode(item: LayoutPosition, highlightedPointId?: string | null): GraphData['nodes'][number] {
  const isHighlight = highlightedPointId && item.node.id === highlightedPointId;
  const depthX = item.depth === ORPHAN_COLUMN ? 0 : item.depth;
  return {
    id: knowledgePointNodeId(item.node.id),
    x: START_X + depthX * X_GAP,
    y: START_Y + item.order * Y_GAP,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    shape: 'rect',
    label: item.node.title,
    ports: createNodePorts(),
    data: {
      preset: 'round',
      label: item.node.title,
      knowledgePointId: item.node.id,
      estimatedHours: item.node.estimatedHours ?? null,
      summary: item.node.summary ?? null,
      graphRole: 'knowledge-point',
    },
    attrs: {
      body: {
        fill: isHighlight ? '#e6f4ff' : '#ffffff',
        stroke: isHighlight ? '#1677ff' : '#91caff',
        strokeWidth: isHighlight ? 2 : 1.4,
        rx: 10,
        ry: 10,
      },
      label: {
        text: item.node.title,
        fill: '#10239e',
        fontSize: 13,
        fontWeight: 600,
        textWrap: {
          width: NODE_WIDTH - 20,
          height: NODE_HEIGHT - 12,
          ellipsis: true,
        },
      },
    },
  };
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
  options: { highlightPointId?: string | null } = {},
): GraphData {
  const positions = buildLayoutPositions(graph.nodes);
  const nodes = positions.map((item) => createKnowledgeGraphNode(item, options.highlightPointId));
  const boundsByNodeId = new Map(
    nodes.map((node) => [
      node.id,
      {
        x: node.x ?? START_X,
        y: node.y ?? START_Y,
        width: node.width ?? NODE_WIDTH,
        height: node.height ?? NODE_HEIGHT,
      },
    ]),
  );
  const edges = graph.edges.map((edge) => createKnowledgeGraphEdge(edge, boundsByNodeId));
  const anchor = nodes[0]
    ? { x: nodes[0].x ?? START_X, y: nodes[0].y ?? START_Y }
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

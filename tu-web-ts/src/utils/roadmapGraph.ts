import type { GraphData, PageItem } from '@/api/types';

interface RoadmapNodePosition {
  page: PageItem;
  depth: number;
  order: number;
}

const NODE_WIDTH = 196;
const NODE_HEIGHT = 72;
const X_GAP = 260;
const Y_GAP = 118;
const START_X = 120;
const START_Y = 100;

export interface RoadmapGraphNodePatch {
  nodeId: string;
  pageId: string | null;
  title: string;
  parentNodeId: string | null;
  parentPageId: string | null;
  order: number;
}

export interface RoadmapGraphParseResult {
  nodes: RoadmapGraphNodePatch[];
  warnings: string[];
}

function flattenPageTree(pages: PageItem[]): RoadmapNodePosition[] {
  const result: RoadmapNodePosition[] = [];
  let order = 0;

  const visit = (nodes: PageItem[], depth: number) => {
    nodes.forEach((page) => {
      result.push({ page, depth, order });
      order += 1;
      if (page.children?.length) {
        visit(page.children, depth + 1);
      }
    });
  };

  visit(pages, 0);
  return result;
}

function createRoadmapNode(item: RoadmapNodePosition): GraphData['nodes'][number] {
  const isRoot = item.depth === 0;
  return {
    id: `roadmap-page-${item.page.id}`,
    x: START_X + item.depth * X_GAP,
    y: START_Y + item.order * Y_GAP,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    shape: 'rect',
    label: item.page.title,
    data: {
      preset: isRoot ? 'round' : 'rect',
      label: item.page.title,
      pageId: item.page.id,
      roadmapRole: isRoot ? 'root' : 'page',
    },
    attrs: {
      body: {
        fill: isRoot ? '#e6f4ff' : '#fff7e6',
        stroke: isRoot ? '#1677ff' : '#d48806',
        strokeWidth: 1.8,
        rx: isRoot ? 16 : 8,
        ry: isRoot ? 16 : 8,
      },
      label: {
        text: item.page.title,
        fill: isRoot ? '#003a8c' : '#593103',
        fontSize: 14,
        fontWeight: 700,
        textWrap: {
          width: NODE_WIDTH - 24,
          height: NODE_HEIGHT - 16,
          ellipsis: true,
        },
      },
    },
  };
}

function createRoadmapEdges(pages: PageItem[]): GraphData['edges'] {
  const edges: GraphData['edges'] = [];

  const visit = (nodes: PageItem[]) => {
    nodes.forEach((page) => {
      page.children?.forEach((child) => {
        edges.push({
          id: `roadmap-edge-${page.id}-${child.id}`,
          source: `roadmap-page-${page.id}`,
          target: `roadmap-page-${child.id}`,
          router: { name: 'orth' },
          connector: { name: 'rounded' },
          attrs: {
            line: {
              stroke: '#52616b',
              strokeWidth: 2,
              targetMarker: {
                name: 'block',
                width: 10,
                height: 8,
              },
            },
          },
        });
      });
      if (page.children?.length) {
        visit(page.children);
      }
    });
  };

  visit(pages);
  return edges;
}

export function createKnowledgeRoadmapGraphData(pages: PageItem[]): GraphData {
  const nodes = flattenPageTree(pages).map(createRoadmapNode);
  const edges = createRoadmapEdges(pages);
  return {
    nodes,
    edges,
    cells: [...nodes, ...edges],
    blueprintMeta: {
      anchor: { x: START_X, y: START_Y },
      extractedCount: nodes.length,
      kind: 'knowledge-roadmap',
    },
  };
}

function readNodeLabel(node: GraphData['nodes'][number]): string {
  const attrsLabel = node.attrs?.label;
  const attrsText = attrsLabel && typeof attrsLabel === 'object' && 'text' in attrsLabel
    ? (attrsLabel as { text?: unknown }).text
    : undefined;
  const label = node.label ?? node.data?.label ?? attrsText;
  return String(label ?? '').trim();
}

function readNodePageId(node: GraphData['nodes'][number]): string | null {
  const pageId = node.data?.pageId;
  return typeof pageId === 'string' && pageId.trim() ? pageId.trim() : null;
}

function readEndpointId(value: GraphData['edges'][number]['source']): string | null {
  if (typeof value === 'string') return value;
  const cell = value?.cell;
  return typeof cell === 'string' ? cell : null;
}

function createsCycle(nodeId: string, parentId: string, parentByNodeId: Map<string, string>): boolean {
  let cursor: string | undefined = parentId;
  while (cursor) {
    if (cursor === nodeId) return true;
    cursor = parentByNodeId.get(cursor);
  }
  return false;
}

export function parseKnowledgeRoadmapGraphData(graphData: GraphData): RoadmapGraphParseResult {
  const graphNodes = (graphData.nodes ?? [])
    .filter((node) => readNodeLabel(node));
  const nodeById = new Map(graphNodes.map((node) => [node.id, node]));
  const childrenByParentId = new Map<string | null, string[]>();
  const parentByNodeId = new Map<string, string>();
  const warnings: string[] = [];

  graphNodes.forEach((node) => {
    childrenByParentId.set(node.id, []);
  });
  childrenByParentId.set(null, []);

  for (const edge of graphData.edges ?? []) {
    const sourceId = readEndpointId(edge.source);
    const targetId = readEndpointId(edge.target);
    if (!sourceId || !targetId || !nodeById.has(sourceId) || !nodeById.has(targetId)) {
      warnings.push('忽略了连接到非路线图节点的边。');
      continue;
    }
    if (sourceId === targetId || parentByNodeId.has(targetId) || createsCycle(targetId, sourceId, parentByNodeId)) {
      throw new Error('路线图必须是树或森林：不能有环，且每个节点最多一个父节点。');
    }
    parentByNodeId.set(targetId, sourceId);
    childrenByParentId.get(sourceId)?.push(targetId);
  }

  graphNodes
    .filter((node) => !parentByNodeId.has(node.id))
    .sort((a, b) => (a.y ?? 0) - (b.y ?? 0) || (a.x ?? 0) - (b.x ?? 0))
    .forEach((node) => childrenByParentId.get(null)?.push(node.id));

  childrenByParentId.forEach((children) => {
    children.sort((a, b) => {
      const nodeA = nodeById.get(a);
      const nodeB = nodeById.get(b);
      return ((nodeA?.y ?? 0) - (nodeB?.y ?? 0)) || ((nodeA?.x ?? 0) - (nodeB?.x ?? 0));
    });
  });

  const result: RoadmapGraphNodePatch[] = [];
  const visit = (nodeIds: string[], parentNodeId: string | null, parentPageId: string | null) => {
    nodeIds.forEach((nodeId, order) => {
      const node = nodeById.get(nodeId);
      if (!node) return;
      const pageId = readNodePageId(node);
      result.push({
        nodeId,
        pageId,
        title: readNodeLabel(node),
        parentNodeId,
        parentPageId,
        order,
      });
      visit(childrenByParentId.get(nodeId) ?? [], nodeId, pageId);
    });
  };

  visit(childrenByParentId.get(null) ?? [], null, null);

  return {
    nodes: result,
    warnings: [...new Set(warnings)],
  };
}

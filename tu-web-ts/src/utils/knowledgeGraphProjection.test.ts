import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/x6/graphCells', () => ({
  createEdgeMetadata: (edge: Record<string, unknown>) => edge,
}));

import type { KnowledgeGraphNode, KnowledgeGraphResponse } from '@/api/types';
import {
  computeAbsoluteBounds,
  knowledgePointNodeId,
  projectKnowledgeGraphToGraphData,
  resolveKnowledgeGraphEdgePorts,
} from '@/utils/knowledgeGraphProjection';

function graphNode(id: string, title: string, parentId?: string | null, sortOrder = 0): KnowledgeGraphNode {
  return {
    id,
    title,
    parentId: parentId ?? null,
    sortOrder,
    estimatedHours: null,
    summary: null,
  };
}

function emptyResponse(nodes: KnowledgeGraphNode[]): KnowledgeGraphResponse {
  return {
    nodes,
    edges: [],
    meta: {
      mode: 'centered',
      centerPointId: nodes[0]?.id ?? null,
      totalPoints: nodes.length,
      totalRelations: 0,
      truncated: false,
      warnings: [],
    },
  };
}

function findProjectedNode(graphData: ReturnType<typeof projectKnowledgeGraphToGraphData>, pointId: string) {
  return graphData.nodes.find((item) => item.id === knowledgePointNodeId(pointId));
}

function isInsideParent(
  child: NonNullable<ReturnType<typeof findProjectedNode>>,
  parent: NonNullable<ReturnType<typeof findProjectedNode>>,
): boolean {
  const cx = child.x ?? 0;
  const cy = child.y ?? 0;
  const cw = child.width ?? 0;
  const ch = child.height ?? 0;
  const px = parent.x ?? 0;
  const py = parent.y ?? 0;
  const pw = parent.width ?? 0;
  const ph = parent.height ?? 0;
  return cx >= px && cy >= py && cx + cw <= px + pw + 1 && cy + ch <= py + ph + 1;
}

describe('knowledgeGraphProjection', () => {
  it('embeds direct child inside parent container bounds', () => {
    const graphData = projectKnowledgeGraphToGraphData(
      emptyResponse([
        graphNode('kp-1', 'Parent'),
        graphNode('kp-2', 'Child', 'kp-1', 1),
      ]),
    );

    const parent = findProjectedNode(graphData, 'kp-1');
    const child = findProjectedNode(graphData, 'kp-2');
    expect(parent).toBeDefined();
    expect(child).toBeDefined();
    expect(parent?.data?.graphRole).toBe('knowledge-point-container');
    expect(child?.data?.graphRole).toBe('knowledge-point');
    expect(isInsideParent(child!, parent!)).toBe(true);
    expect((child?.zIndex ?? 0) > (parent?.zIndex ?? 0)).toBe(true);
  });

  it('recursively nests three taxonomy levels', () => {
    const graphData = projectKnowledgeGraphToGraphData(
      emptyResponse([
        graphNode('a', 'A'),
        graphNode('b', 'B', 'a', 1),
        graphNode('c', 'C', 'b', 2),
      ]),
    );

    const a = findProjectedNode(graphData, 'a');
    const b = findProjectedNode(graphData, 'b');
    const c = findProjectedNode(graphData, 'c');
    expect(isInsideParent(b!, a!)).toBe(true);
    expect(isInsideParent(c!, b!)).toBe(true);
    expect((b?.zIndex ?? 0) > (a?.zIndex ?? 0)).toBe(true);
    expect((c?.zIndex ?? 0) > (b?.zIndex ?? 0)).toBe(true);
  });

  it('keeps orphan child as standalone root when parent is absent from subgraph', () => {
    const graphData = projectKnowledgeGraphToGraphData(
      emptyResponse([graphNode('kp-orphan', 'Orphan', 'kp-missing', 0)]),
    );

    const orphan = findProjectedNode(graphData, 'kp-orphan');
    expect(orphan).toBeDefined();
    expect(orphan?.data?.graphRole).toBe('knowledge-point');
    expect(orphan?.zIndex).toBe(1);
    expect(graphData.nodes).toHaveLength(1);
  });

  it('builds semantic edge ports from absolute nested node bounds', () => {
    const graphData = projectKnowledgeGraphToGraphData({
      nodes: [
        graphNode('kp-1', 'Parent'),
        graphNode('kp-2', 'Child', 'kp-1', 1),
        graphNode('kp-3', 'External', null, 2),
      ],
      edges: [
        {
          id: 'kr-1',
          fromPointId: 'kp-2',
          toPointId: 'kp-3',
          relationTypeKey: 'prerequisite',
          label: '前置',
          color: '#fa8c16',
          bidirectional: false,
        },
      ],
      meta: {
        mode: 'centered',
        centerPointId: 'kp-1',
        totalPoints: 3,
        totalRelations: 1,
        truncated: false,
        warnings: [],
      },
    });

    expect(graphData.edges).toHaveLength(1);
    const edge = graphData.edges[0];
    expect(edge.source).toMatchObject({ cell: knowledgePointNodeId('kp-2') });
    expect(edge.target).toMatchObject({ cell: knowledgePointNodeId('kp-3') });

    const nodeById = new Map(
      graphData.nodes.map((node) => [
        node.id,
        {
          id: node.id,
          x: node.x ?? 0,
          y: node.y ?? 0,
          width: node.width ?? 0,
          height: node.height ?? 0,
        },
      ]),
    );
    const childBounds = computeAbsoluteBounds(knowledgePointNodeId('kp-2'), nodeById);
    const externalBounds = computeAbsoluteBounds(knowledgePointNodeId('kp-3'), nodeById);
    expect(childBounds).not.toBeNull();
    expect(externalBounds).not.toBeNull();
    const ports = resolveKnowledgeGraphEdgePorts(childBounds!, externalBounds!);
    expect(ports.sourcePort).toBeTruthy();
    expect(ports.targetPort).toBeTruthy();
  });

  it('hides embedded children when parent container is collapsed', () => {
    const graphData = projectKnowledgeGraphToGraphData(
      emptyResponse([
        graphNode('kp-1', 'Parent'),
        graphNode('kp-2', 'Child', 'kp-1', 1),
      ]),
      { collapsedPointIds: ['kp-1'] },
    );

    expect(graphData.nodes).toHaveLength(1);
    const parent = findProjectedNode(graphData, 'kp-1');
    expect(parent?.data?.childrenCollapsed).toBe(true);
    expect(parent?.data?.graphRole).toBe('knowledge-point-container');
    expect(parent?.label).toContain('▸');
    expect(findProjectedNode(graphData, 'kp-2')).toBeUndefined();
  });

  it('remaps semantic edges to collapsed parent when child is hidden', () => {
    const graphData = projectKnowledgeGraphToGraphData(
      {
        nodes: [
          graphNode('kp-1', 'Parent'),
          graphNode('kp-2', 'Child', 'kp-1', 1),
          graphNode('kp-3', 'External', null, 2),
        ],
        edges: [
          {
            id: 'kr-1',
            fromPointId: 'kp-2',
            toPointId: 'kp-3',
            relationTypeKey: 'prerequisite',
            label: '前置',
            color: '#fa8c16',
            bidirectional: false,
          },
        ],
        meta: {
          mode: 'centered',
          centerPointId: 'kp-1',
          totalPoints: 3,
          totalRelations: 1,
          truncated: false,
          warnings: [],
        },
      },
      { collapsedPointIds: ['kp-1'] },
    );

    expect(graphData.nodes).toHaveLength(2);
    expect(graphData.edges).toHaveLength(1);
    expect(graphData.edges[0].source).toMatchObject({ cell: knowledgePointNodeId('kp-1') });
    expect(graphData.edges[0].target).toMatchObject({ cell: knowledgePointNodeId('kp-3') });
  });
});

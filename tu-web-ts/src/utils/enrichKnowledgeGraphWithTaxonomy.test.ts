import { describe, expect, it } from 'vitest';
import type { KnowledgeGraphResponse, KnowledgePoint } from '@/api/types';
import { enrichKnowledgeGraphWithTaxonomy } from '@/utils/enrichKnowledgeGraphWithTaxonomy';

function point(
  id: string,
  title: string,
  parentId: string | null = null,
  sortOrder = 0,
): KnowledgePoint {
  return {
    id,
    kbId: 'kb-1',
    parentId,
    title,
    summary: null,
    status: 'active',
    estimatedHours: null,
    sortOrder,
    children: [],
  };
}

function tree(points: KnowledgePoint[]): KnowledgePoint[] {
  const map = new Map(points.map((item) => [item.id, { ...item, children: [] as KnowledgePoint[] }]));
  const roots: KnowledgePoint[] = [];
  for (const node of map.values()) {
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId)!.children!.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

function responseWithNodes(ids: string[]): KnowledgeGraphResponse {
  return {
    nodes: ids.map((id, index) => ({
      id,
      title: id,
      parentId: null,
      estimatedHours: null,
      summary: null,
      sortOrder: index,
    })),
    edges: [],
    meta: {
      mode: 'centered',
      centerPointId: ids[0] ?? null,
      totalPoints: ids.length,
      totalRelations: 0,
      truncated: false,
      warnings: [],
    },
  };
}

describe('enrichKnowledgeGraphWithTaxonomy', () => {
  it('adds taxonomy children from picker tree when absent from graph API', () => {
    const taxonomyTree = tree([
      point('parent', 'Parent'),
      point('child', 'Child', 'parent', 1),
      point('grand', 'Grand', 'child', 2),
    ]);
    const enriched = enrichKnowledgeGraphWithTaxonomy(
      responseWithNodes(['parent']),
      taxonomyTree,
    );

    expect(enriched.nodes.map((item) => item.id)).toEqual(['parent', 'child', 'grand']);
    expect(enriched.nodes.find((item) => item.id === 'child')?.parentId).toBe('parent');
    expect(enriched.nodes.find((item) => item.id === 'grand')?.parentId).toBe('child');
  });

  it('fills parentId from tree for nodes already returned by graph API', () => {
    const taxonomyTree = tree([
      point('parent', 'Parent'),
      point('child', 'Child', 'parent'),
    ]);
    const enriched = enrichKnowledgeGraphWithTaxonomy(
      {
        ...responseWithNodes(['parent', 'child']),
        nodes: [
          { id: 'parent', title: 'Parent', parentId: null, estimatedHours: null, summary: null, sortOrder: 0 },
          { id: 'child', title: 'Child', parentId: null, estimatedHours: null, summary: null, sortOrder: 1 },
        ],
      },
      taxonomyTree,
    );

    expect(enriched.nodes.find((item) => item.id === 'child')?.parentId).toBe('parent');
  });
});

import { describe, expect, it } from 'vitest';
import type { KnowledgePoint } from '@/api/types';
import { computeTreeDropTarget, flattenKnowledgePoints, isDescendant, moveToRootEnd, promoteToSiblingAfterParent } from './drag';

const nodes = [
  { id: 'a', parentId: null, sortOrder: 0 },
  { id: 'b', parentId: 'a', sortOrder: 0 },
  { id: 'c', parentId: 'a', sortOrder: 1 },
  { id: 'd', parentId: null, sortOrder: 1 },
];

describe('computeTreeDropTarget', () => {
  it('moves node inside parent at end', () => {
    expect(computeTreeDropTarget(nodes[3], nodes[0], 'inner', nodes)).toEqual({
      parentId: 'a',
      sortOrder: 2,
    });
  });

  it('inserts before sibling', () => {
    expect(computeTreeDropTarget(nodes[3], nodes[2], 'before', nodes)).toEqual({
      parentId: 'a',
      sortOrder: 1,
    });
  });

  it('detects descendants', () => {
    expect(isDescendant('a', 'b', nodes)).toBe(true);
    expect(isDescendant('a', 'd', nodes)).toBe(false);
  });

  it('moves child to root level before sibling root', () => {
    expect(computeTreeDropTarget(
      { id: 'b', parentId: 'a', sortOrder: 0 },
      { id: 'd', parentId: null, sortOrder: 1 },
      'before',
      nodes,
    )).toEqual({ parentId: null, sortOrder: 1 });
  });

  it('promotes child to sibling after root parent', () => {
    expect(promoteToSiblingAfterParent(
      { id: 'b', parentId: 'a', sortOrder: 0 },
      { id: 'a', parentId: null, sortOrder: 0 },
      nodes,
    )).toEqual({ parentId: null, sortOrder: 1 });
  });

  it('moves node to root end', () => {
    expect(moveToRootEnd({ id: 'b', parentId: 'a', sortOrder: 0 }, nodes)).toEqual({
      parentId: null,
      sortOrder: 2,
    });
  });

  it('infers parentId from tree structure when flattening', () => {
    const nested = [{
      id: 'a',
      kbId: 'kb-1',
      title: 'Root',
      status: 'active',
      sortOrder: 0,
      parentId: null,
      children: [{
        id: 'b',
        kbId: 'kb-1',
        title: 'Child',
        status: 'active',
        sortOrder: 0,
        children: [],
      }],
    }] as KnowledgePoint[];
    const flat = flattenKnowledgePoints(nested);
    expect(flat.find((item) => item.id === 'b')?.parentId).toBe('a');
  });
});

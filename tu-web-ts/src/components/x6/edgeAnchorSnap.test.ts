import { describe, expect, it } from 'vitest';
import {
  FREE_POINT_SNAP_DISTANCE,
  isFreePointTerminal,
  nearestNodeToPoint,
  snapFreeEdgeTerminals,
  toNodeRect,
  type SnapNodeRect,
} from './edgeAnchorSnap';

describe('isFreePointTerminal', () => {
  it('recognizes a bare {x,y} terminal as a free point', () => {
    expect(isFreePointTerminal({ x: 10, y: 20 })).toBe(true);
  });

  it('rejects terminals bound to a cell', () => {
    expect(isFreePointTerminal({ cell: 'a', x: 10, y: 20 })).toBe(false);
    expect(isFreePointTerminal({ cell: 'a', port: 'port-right' })).toBe(false);
  });

  it('rejects non-object and incomplete values', () => {
    expect(isFreePointTerminal('a')).toBe(false);
    expect(isFreePointTerminal(null)).toBe(false);
    expect(isFreePointTerminal({ x: 10 })).toBe(false);
    expect(isFreePointTerminal({ y: 20, z: 1 })).toBe(false);
  });
});

describe('toNodeRect', () => {
  it('parses flat x/y/width/height', () => {
    expect(toNodeRect({ id: 'n1', x: 10, y: 20, width: 100, height: 50 })).toEqual({
      id: 'n1',
      x: 10,
      y: 20,
      width: 100,
      height: 50,
    });
  });

  it('parses position/size objects', () => {
    expect(toNodeRect({
      id: 'n1',
      position: { x: 5, y: 6 },
      size: { width: 30, height: 40 },
    })).toEqual({ id: 'n1', x: 5, y: 6, width: 30, height: 40 });
  });

  it('returns null when coordinates cannot be resolved', () => {
    expect(toNodeRect({ id: 'n1', width: 10, height: 10 })).toBeNull();
    expect(toNodeRect({ x: 1, y: 1 })).toBeNull();
  });
});

describe('nearestNodeToPoint', () => {
  const nodes: SnapNodeRect[] = [
    { id: 'a', x: 0, y: 0, width: 100, height: 100 },
    { id: 'b', x: 300, y: 300, width: 100, height: 100 },
  ];

  it('finds the nearest node within the distance limit', () => {
    // Point just right of node a's boundary.
    expect(nearestNodeToPoint(nodes, 120, 50)?.id).toBe('a');
    // Point inside node b.
    expect(nearestNodeToPoint(nodes, 350, 350)?.id).toBe('b');
  });

  it('returns null when the point is beyond the limit', () => {
    expect(nearestNodeToPoint(nodes, 200, 200)).toBeNull();
    expect(nearestNodeToPoint(nodes, 5000, 5000)).toBeNull();
  });

  it('honors a custom max distance', () => {
    expect(nearestNodeToPoint(nodes, 120, 50, 10)).toBeNull();
  });
});

describe('snapFreeEdgeTerminals', () => {
  const graphData = {
    nodes: [
      { id: 'a', x: 0, y: 0, width: 100, height: 100 },
      { id: 'b', x: 300, y: 300, width: 100, height: 100 },
    ],
    edges: [
      // Free point hovering at node a's right boundary.
      { id: 'e1', source: { cell: 'b' }, target: { x: 120, y: 50 } },
      // Free point far from any node — left untouched.
      { id: 'e2', source: { cell: 'a' }, target: { x: 5000, y: 5000 } },
      // Port terminal — untouched.
      { id: 'e3', source: { cell: 'a', port: 'port-right' }, target: { cell: 'b' } },
      // String terminal — untouched.
      { id: 'e4', source: 'a', target: 'b' },
    ],
  };

  it('snaps nearby free-point terminals to the nearest node boundary', () => {
    const result = snapFreeEdgeTerminals({ ...graphData }) as {
      edges: Array<Record<string, unknown>>;
    };
    expect(result.edges[0].target).toEqual({ cell: 'a' });
    expect(result.edges[1].target).toEqual({ x: 5000, y: 5000 });
    expect(result.edges[2].source).toEqual({ cell: 'a', port: 'port-right' });
    expect(result.edges[3].source).toBe('a');
  });

  it('rebuilds the cells array consistently with the snapped edges', () => {
    const withCells = {
      ...graphData,
      cells: [...graphData.nodes, ...graphData.edges],
    };
    const result = snapFreeEdgeTerminals(withCells) as {
      nodes: Array<Record<string, unknown>>;
      edges: Array<Record<string, unknown>>;
      cells: Array<Record<string, unknown>>;
    };
    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(4);
    const edge0Cell = result.cells.find((c) => c.id === 'e1');
    expect(edge0Cell?.target).toEqual({ cell: 'a' });
  });

  it('does not mutate the input data', () => {
    const clone = JSON.parse(JSON.stringify(graphData));
    snapFreeEdgeTerminals(graphData);
    expect(graphData).toEqual(clone);
  });

  it('does not snap to board-group container nodes', () => {
    const result = snapFreeEdgeTerminals({
      nodes: [
        { id: 'group', x: 0, y: 0, width: 200, height: 200, data: { boardGroup: true } },
        { id: 'member', x: 10, y: 10, width: 50, height: 50 },
      ],
      edges: [
        { id: 'e1', source: { cell: 'member' }, target: { x: 30, y: 30 } },
      ],
    }) as { edges: Array<Record<string, unknown>> };
    // Target is near both the group container and the member; only the member is eligible.
    expect(result.edges[0].target).toEqual({ cell: 'member' });
  });

  it('defaults to FREE_POINT_SNAP_DISTANCE for the detection radius', () => {
    expect(FREE_POINT_SNAP_DISTANCE).toBeGreaterThan(0);
  });

  it('does not snap free-point terminals on straight-router edges', () => {
    const result = snapFreeEdgeTerminals({
      nodes: [
        { id: 'a', x: 0, y: 0, width: 100, height: 100 },
      ],
      edges: [
        // straight router: free point near node should be preserved as-is.
        {
          id: 'e1',
          source: { cell: 'a' },
          target: { x: 50, y: 50 },
          router: { name: 'straight' },
        },
      ],
    }) as { edges: Array<Record<string, unknown>> };
    expect(result.edges[0].target).toEqual({ x: 50, y: 50 });
  });

  it('does not snap extracted-board interface terminals', () => {
    const result = snapFreeEdgeTerminals({
      nodes: [{ id: 'a', x: 0, y: 0, width: 100, height: 100 }],
      edges: [{
        id: 'interface-edge',
        source: { cell: 'a' },
        target: { x: 120, y: 50 },
        data: { boardInterface: { direction: 'out' } },
      }],
    }) as { edges: Array<Record<string, unknown>> };
    expect(result.edges[0].target).toEqual({ x: 120, y: 50 });
  });
});

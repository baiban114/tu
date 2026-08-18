import { describe, expect, it } from 'vitest';
import {
  computeExternalInterfacePoint,
  containsSelfBoardReference,
  getBoardNodeLabelFromData,
  normalizeExtractedInterfaces,
  offsetExtractedTerminal,
  resolveBoardInterfaceDock,
  terminalCellId,
} from './boardReference';

describe('resolveBoardInterfaceDock', () => {
  const bounds = { minX: 0, minY: 0, maxX: 100, maxY: 100 };

  it('docks on the left side when the point is left of the bounds', () => {
    expect(resolveBoardInterfaceDock({ x: -20, y: 50 }, bounds)).toEqual({ side: 'left', ratio: 0.5 });
  });

  it('docks on the right side when the point is right of the bounds', () => {
    expect(resolveBoardInterfaceDock({ x: 200, y: 50 }, bounds)).toEqual({ side: 'right', ratio: 0.5 });
  });

  it('docks on the top side when the point is above the bounds', () => {
    expect(resolveBoardInterfaceDock({ x: 50, y: -30 }, bounds)).toEqual({ side: 'top', ratio: 0.5 });
  });

  it('docks on the bottom side when the point is below the bounds', () => {
    expect(resolveBoardInterfaceDock({ x: 50, y: 300 }, bounds)).toEqual({ side: 'bottom', ratio: 0.5 });
  });

  it('clamps the ratio into [0.08, 0.92]', () => {
    // Near the top edge of a tall bounds.
    expect(resolveBoardInterfaceDock({ x: 200, y: 0 }, { minX: 0, minY: 0, maxX: 10, maxY: 1000 })).toEqual({
      side: 'right',
      ratio: 0.08,
    });
    // Far beyond the bottom edge.
    expect(resolveBoardInterfaceDock({ x: 200, y: 100000 }, { minX: 0, minY: 0, maxX: 10, maxY: 100 })).toEqual({
      side: 'bottom',
      ratio: 0.92,
    });
  });

  it('picks the closest side when the point is inside the bounds', () => {
    // Closer to the left edge.
    expect(resolveBoardInterfaceDock({ x: 5, y: 50 }, bounds).side).toBe('left');
    // Closer to the bottom edge.
    expect(resolveBoardInterfaceDock({ x: 50, y: 95 }, bounds).side).toBe('bottom');
  });
});

describe('computeExternalInterfacePoint', () => {
  const internal = { x: 0, y: 0, width: 100, height: 100 };
  const external = { x: 300, y: 0, width: 100, height: 100 };
  const bounds = { minX: 0, minY: 0, maxX: 100, maxY: 100 };

  it('returns the ray intersection on the expanded bounds', () => {
    const point = computeExternalInterfacePoint(internal, external, bounds);
    // Internal center (50,50) to external center (350,50): horizontal ray to the right.
    expect(point.x).toBe(bounds.maxX + 56);
    expect(point.y).toBe(50);
  });

  it('honors a custom margin', () => {
    const point = computeExternalInterfacePoint(internal, external, bounds, 120);
    expect(point.x).toBe(bounds.maxX + 120);
  });

  it('treats coincident centers as a rightward ray', () => {
    const point = computeExternalInterfacePoint(internal, internal, bounds);
    expect(point.x).toBe(bounds.maxX + 56);
    expect(point.y).toBe(50);
  });

  it('keeps the result inside the expanded bounds when fully outside', () => {
    const below = { x: 0, y: 500, width: 100, height: 100 };
    const point = computeExternalInterfacePoint(internal, below, bounds);
    expect(point.y).toBe(bounds.maxY + 56);
  });
});

describe('offsetExtractedTerminal', () => {
  it('shifts a bare {x,y} terminal', () => {
    expect(offsetExtractedTerminal({ x: 10, y: 20 }, 5, -3)).toEqual({ x: 15, y: 17 });
  });

  it('leaves cell-bound terminals unchanged', () => {
    const terminal = { cell: 'n1', port: 'port-right' };
    expect(offsetExtractedTerminal(terminal, 5, 5)).toBe(terminal);
  });

  it('leaves string terminals unchanged', () => {
    expect(offsetExtractedTerminal('n1', 5, 5)).toBe('n1');
  });

  it('leaves non-object and partial values unchanged', () => {
    expect(offsetExtractedTerminal(null, 5, 5)).toBeNull();
    expect(offsetExtractedTerminal(undefined, 5, 5)).toBeUndefined();
    const partial = { x: 1 };
    expect(offsetExtractedTerminal(partial, 5, 5)).toBe(partial);
  });
});

describe('getBoardNodeLabelFromData', () => {
  it('prefers the attrs label text', () => {
    expect(getBoardNodeLabelFromData({
      id: 'n1',
      attrsLabelText: ' 标题 ',
      data: { label: 'data-label' },
    })).toBe('标题');
  });

  it('falls back to data label, then title, then name', () => {
    expect(getBoardNodeLabelFromData({ id: 'n1', data: { title: 'T' } })).toBe('T');
    expect(getBoardNodeLabelFromData({ id: 'n1', data: { name: 'N' } })).toBe('N');
  });

  it('ignores empty attrs label and empty data strings', () => {
    expect(getBoardNodeLabelFromData({ id: 'n1', attrsLabelText: '  ', data: { label: '' } })).toBe('n1');
  });

  it('falls back to the node id', () => {
    expect(getBoardNodeLabelFromData({ id: 'n1', data: {} })).toBe('n1');
  });
});

describe('normalizeExtractedInterfaces', () => {
  it('drops items without an edgeId', () => {
    expect(normalizeExtractedInterfaces([{ foo: 1 }, { edgeId: 'e1' }])).toHaveLength(1);
  });

  it('merges top-level fields and fills stable portId/side/ratio', () => {
    const items = normalizeExtractedInterfaces([{ edgeId: 'e1', direction: 'out' }]);
    expect(items).toEqual([
      expect.objectContaining({
        edgeId: 'e1',
        direction: 'out',
        portId: 'board-interface-e1',
        side: 'right',
        ratio: 0.5,
      }),
    ]);
  });

  it('defaults the side from the direction when missing', () => {
    const items = normalizeExtractedInterfaces([{ edgeId: 'e1', direction: 'in' }]);
    expect(items[0]).toMatchObject({ direction: 'in', side: 'left' });
  });

  it('flattens nested boardInterface fields with precedence to top-level', () => {
    const items = normalizeExtractedInterfaces([
      { edgeId: 'e1', direction: 'in', boardInterface: { ratio: 0.2, portId: 'p1' } },
    ]);
    expect(items[0]).toMatchObject({ direction: 'in', ratio: 0.2, portId: 'p1' });
  });

  it('clamps the ratio into [0.08, 0.92]', () => {
    const items = normalizeExtractedInterfaces([
      { edgeId: 'e1', ratio: -5 },
      { edgeId: 'e2', ratio: 99 },
    ]);
    expect(items[0]).toMatchObject({ ratio: 0.08 });
    expect(items[1]).toMatchObject({ ratio: 0.92 });
  });
});

describe('terminalCellId', () => {
  it('returns a string terminal as-is', () => {
    expect(terminalCellId('n1')).toBe('n1');
  });

  it('extracts the cell id from an object terminal', () => {
    expect(terminalCellId({ cell: 'n1', port: 'port-right' })).toBe('n1');
  });

  it('returns an empty string for non-object or cell-less terminals', () => {
    expect(terminalCellId(null)).toBe('');
    expect(terminalCellId(undefined)).toBe('');
    expect(terminalCellId({ x: 1, y: 2 })).toBe('');
  });
});

describe('containsSelfBoardReference', () => {
  it('rejects a host reference node from being persisted as its own source board', () => {
    expect(containsSelfBoardReference({
      cells: [{
        id: 'ref-1',
        data: {
          extractedBoardReference: true,
          refBlockId: 'source-page',
        },
      }],
      nodes: [],
      edges: [],
    }, 'source-page')).toBe(true);
  });

  it('allows normal source nodes and references to other pages', () => {
    expect(containsSelfBoardReference({
      cells: [
        { id: 'node-1', data: { label: '正常节点' } },
        {
          id: 'ref-2',
          data: { extractedBoardReference: true, refBlockId: 'other-page' },
        },
      ],
      nodes: [],
      edges: [],
    }, 'source-page')).toBe(false);
  });
});

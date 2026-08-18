import { describe, expect, it } from 'vitest';
import {
  createBoardReferencePorts,
  createMindmapPorts,
  createNodePorts,
  getBoardInterfacePortArgs,
  getMindmapEdgePorts,
} from './ports';

describe('getBoardInterfacePortArgs', () => {
  it('maps left/right sides to a vertical percentage', () => {
    expect(getBoardInterfacePortArgs({ side: 'left', ratio: 0.3 })).toEqual({ x: '0%', y: '30%' });
    expect(getBoardInterfacePortArgs({ side: 'right', ratio: 0.3 })).toEqual({ x: '100%', y: '30%' });
  });

  it('maps top/bottom sides to a horizontal percentage', () => {
    expect(getBoardInterfacePortArgs({ side: 'top', ratio: 0.4 })).toEqual({ x: '40%', y: '0%' });
    expect(getBoardInterfacePortArgs({ side: 'bottom', ratio: 0.4 })).toEqual({ x: '40%', y: '100%' });
  });

  it('clamps the ratio into [0.08, 0.92]', () => {
    expect(getBoardInterfacePortArgs({ side: 'left', ratio: -1 })).toEqual({ x: '0%', y: '8%' });
    expect(getBoardInterfacePortArgs({ side: 'left', ratio: 5 })).toEqual({ x: '0%', y: '92%' });
  });
});

describe('createBoardReferencePorts', () => {
  it('keeps the four default ports', () => {
    const ports = createBoardReferencePorts([]);
    expect(ports.items.map((item) => item.id)).toEqual(['port-top', 'port-right', 'port-bottom', 'port-left']);
  });

  it('adds a stable boardInterface port per interface', () => {
    const ports = createBoardReferencePorts([
      { portId: 'if-in', side: 'left', ratio: 0.2 },
      { portId: 'if-out', side: 'right', ratio: 0.8 },
    ]);
    const interfaceItems = ports.items.filter((item) => item.group === 'boardInterface');
    expect(interfaceItems).toHaveLength(2);
    expect(interfaceItems[0]).toEqual({
      id: 'if-in',
      group: 'boardInterface',
      args: { x: '0%', y: '20%' },
    });
    expect(interfaceItems[1]).toEqual({
      id: 'if-out',
      group: 'boardInterface',
      args: { x: '100%', y: '80%' },
    });
  });

  it('registers the boardInterface group as absolute-positioned and visible', () => {
    const ports = createBoardReferencePorts([]);
    expect(ports.groups.boardInterface.position).toEqual({ name: 'absolute' });
    expect(ports.groups.boardInterface.attrs.circle.visibility).toBe('visible');
  });
});

describe('createNodePorts', () => {
  it('creates four ports with the standard groups', () => {
    const ports = createNodePorts();
    expect(ports.items.map((item) => item.group)).toEqual(['top', 'right', 'bottom', 'left']);
    expect(ports.groups).toHaveProperty('top');
    expect(ports.groups).toHaveProperty('right');
    expect(ports.groups).toHaveProperty('bottom');
    expect(ports.groups).toHaveProperty('left');
  });
});

describe('getMindmapEdgePorts', () => {
  it('uses left/right port pairs per branch side', () => {
    expect(getMindmapEdgePorts('left')).toEqual({ sourcePort: 'port-left', targetPort: 'port-right' });
    expect(getMindmapEdgePorts('right')).toEqual({ sourcePort: 'port-right', targetPort: 'port-left' });
  });
});

describe('createMindmapPorts', () => {
  it('creates only the right/left ports', () => {
    const ports = createMindmapPorts();
    expect(ports.items.map((item) => item.id)).toEqual(['port-right', 'port-left']);
    expect(Object.keys(ports.groups)).toEqual(['right', 'left']);
  });
});

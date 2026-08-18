export const PORT_GROUPS = {
  top: {
    position: 'top',
    attrs: {
      circle: {
        r: 4,
        magnet: true,
        stroke: '#1677ff',
        strokeWidth: 2,
        fill: '#ffffff',
        visibility: 'hidden',
      },
    },
  },
  right: {
    position: 'right',
    attrs: {
      circle: {
        r: 4,
        magnet: true,
        stroke: '#1677ff',
        strokeWidth: 2,
        fill: '#ffffff',
        visibility: 'hidden',
      },
    },
  },
  bottom: {
    position: 'bottom',
    attrs: {
      circle: {
        r: 4,
        magnet: true,
        stroke: '#1677ff',
        strokeWidth: 2,
        fill: '#ffffff',
        visibility: 'hidden',
      },
    },
  },
  left: {
    position: 'left',
    attrs: {
      circle: {
        r: 4,
        magnet: true,
        stroke: '#1677ff',
        strokeWidth: 2,
        fill: '#ffffff',
        visibility: 'hidden',
      },
    },
  },
} as const;

export const MINDMAP_PORT_GROUPS = {
  right: PORT_GROUPS.right,
  left: PORT_GROUPS.left,
} as const;

export function createNodePorts() {
  return {
    groups: PORT_GROUPS,
    items: [
      { id: 'port-top', group: 'top' },
      { id: 'port-right', group: 'right' },
      { id: 'port-bottom', group: 'bottom' },
      { id: 'port-left', group: 'left' },
    ],
  };
}

export type BoardInterfaceSide = 'top' | 'right' | 'bottom' | 'left';

export interface BoardInterfacePort {
  portId: string;
  side: BoardInterfaceSide;
  ratio: number;
}

export function getBoardInterfacePortArgs(item: Pick<BoardInterfacePort, 'side' | 'ratio'>) {
  const ratio = Math.min(0.92, Math.max(0.08, item.ratio));
  return item.side === 'left'
    ? { x: '0%', y: `${ratio * 100}%` }
    : item.side === 'right'
      ? { x: '100%', y: `${ratio * 100}%` }
      : item.side === 'top'
        ? { x: `${ratio * 100}%`, y: '0%' }
        : { x: `${ratio * 100}%`, y: '100%' };
}

/**
 * Reference nodes keep one stable port per extracted interface. Percentage
 * coordinates make the docking point follow the wrapper when content preview
 * mode enlarges or resizes it.
 */
export function createBoardReferencePorts(interfaces: BoardInterfacePort[]) {
  return {
    groups: {
      ...PORT_GROUPS,
      boardInterface: {
        position: { name: 'absolute' },
        attrs: {
          circle: {
            r: 5,
            magnet: true,
            stroke: '#7c3aed',
            strokeWidth: 2,
            fill: '#ffffff',
            visibility: 'visible',
          },
        },
      },
    },
    items: [
      { id: 'port-top', group: 'top' },
      { id: 'port-right', group: 'right' },
      { id: 'port-bottom', group: 'bottom' },
      { id: 'port-left', group: 'left' },
      ...interfaces.map((item) => {
        return { id: item.portId, group: 'boardInterface', args: getBoardInterfacePortArgs(item) };
      }),
    ],
  };
}

export function getMindmapEdgePorts(branchSide: 'left' | 'right') {
  if (branchSide === 'left') {
    return { sourcePort: 'port-left', targetPort: 'port-right' } as const;
  }
  return { sourcePort: 'port-right', targetPort: 'port-left' } as const;
}

/** 思维导图：左右子树各用对应侧连接桩 */
export function createMindmapPorts() {
  return {
    groups: MINDMAP_PORT_GROUPS,
    items: [
      { id: 'port-right', group: 'right' },
      { id: 'port-left', group: 'left' },
    ],
  };
}

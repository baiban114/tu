import { Graph, Path, type ConnectorDefinition, type Edge, type PointLike } from '@antv/x6';

export const MINDMAP_CONNECTOR_NAME = 'mindmap';

/** Align with X6 official mindmap practice demo gaps. */
export const MINDMAP_H_GAP = 40;
export const MINDMAP_V_GAP = 20;

let mindmapConnectorRegistered = false;

/**
 * Quadratic mindmap connector — based on AntV X6 mindmap showcase demo,
 * with horizontal stub direction mirrored for left-branch nodes.
 * @see https://x6.antv.antgroup.com/examples/showcase/practices/#mindmap
 */
const createMindmapConnectorPath: ConnectorDefinition = (
  sourcePoint,
  targetPoint,
  _routePoints,
  options,
) => {
  const goingLeft = targetPoint.x < sourcePoint.x;
  const stub = goingLeft ? -10 : 10;
  const midX = sourcePoint.x + stub;
  const midY = sourcePoint.y;
  const ctrX = (targetPoint.x - midX) / 5 + midX;
  const ctrY = targetPoint.y;
  const pathData = `
 M ${sourcePoint.x} ${sourcePoint.y}
 L ${midX} ${midY}
 Q ${ctrX} ${ctrY} ${targetPoint.x} ${targetPoint.y}
 `.trim();

  return options.raw ? Path.parse(pathData) : pathData;
};

export function ensureMindmapConnectorRegistered(): void {
  if (mindmapConnectorRegistered) return;
  Graph.registerConnector(MINDMAP_CONNECTOR_NAME, createMindmapConnectorPath, true);
  mindmapConnectorRegistered = true;
}

export interface MindmapEdgeStyleOptions {
  preview?: boolean;
  branchSide?: 'left' | 'right';
}

export function applyMindmapEdgeConnector(
  edge: Edge,
  options: MindmapEdgeStyleOptions = {},
): void {
  ensureMindmapConnectorRegistered();
  edge.removeRouter();
  edge.setConnector({ name: MINDMAP_CONNECTOR_NAME });

  if (options.preview) {
    const lineColor = options.branchSide === 'left' ? '#1677ff' : '#722ed1';
    edge.attr({
      line: {
        stroke: lineColor,
        strokeWidth: 2.6,
        strokeDasharray: '6 4',
        targetMarker: {
          name: 'classic',
          size: 8,
        },
      },
    });
    return;
  }

  edge.attr({
    line: {
      stroke: '#A2B1C3',
      strokeWidth: 2,
      strokeDasharray: '',
      targetMarker: '',
    },
  });
}

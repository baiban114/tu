import { edgeToolRegistry } from '@antv/x6';
import type { GraphData } from '@/api/types';

/**
 * 连线端点锚定吸附。
 *
 * X6 内置的 arrowhead 拖拽在端点落到节点本体（非连接桩）或超出 snap 半径时会退化为
 * 自由点 `{ x, y }`，导致连线端点「悬空」在节点一侧、与直接接触节点的连线样式不统一。
 * 这里提供：
 *  - 纯函数：把自由点端点吸附回最近的节点边界（用于加载/持久化时修正历史悬空连线）；
 *  - 自定义 arrowhead 工具：拖拽端点时持续吸附到节点边界，落到空白处则回退到原端子，
 *    避免产生新的悬空自由点。
 */

/** 吸附判定距离（画布坐标系）。自由点端点与节点在此距离内即吸附到该节点边界。 */
export const FREE_POINT_SNAP_DISTANCE = 80;

export interface SnapNodeRect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TerminalObject {
  cell?: string;
  port?: string;
  x?: number;
  y?: number;
  [key: string]: unknown;
}

/**
 * 判断端子是否为「自由点」——即 `{ x, y }` 而非绑定到某个节点 cell 的端子。
 * 自由点端子是导致连线悬空、与节点边界不接触的根因。
 */
export function isFreePointTerminal(terminal: unknown): terminal is { x: number; y: number } {
  if (!terminal || typeof terminal !== 'object') return false;
  const t = terminal as Record<string, unknown>;
  return !('cell' in t) && typeof t.x === 'number' && typeof t.y === 'number';
}

function numberEntry(
  obj: unknown,
  key: string,
): number | undefined {
  if (obj && typeof obj === 'object') {
    const v = (obj as Record<string, unknown>)[key];
    return typeof v === 'number' ? v : undefined;
  }
  return undefined;
}

/** 从节点数据中提取参与距离计算的矩形区域；无法解析时返回 null。 */
export function toNodeRect(node: Record<string, unknown>): SnapNodeRect | null {
  const id = typeof node.id === 'string' ? node.id : '';
  if (!id) return null;
  const x = typeof node.x === 'number' ? node.x : numberEntry(node.position, 'x');
  const y = typeof node.y === 'number' ? node.y : numberEntry(node.position, 'y');
  const width = typeof node.width === 'number' ? node.width : numberEntry(node.size, 'width');
  const height = typeof node.height === 'number' ? node.height : numberEntry(node.size, 'height');
  if (x == null || y == null || width == null || height == null) return null;
  return { id, x, y, width, height };
}

function distanceToRect(node: SnapNodeRect, x: number, y: number): number {
  const nx = Math.min(Math.max(x, node.x), node.x + node.width);
  const ny = Math.min(Math.max(y, node.y), node.y + node.height);
  return Math.hypot(x - nx, y - ny);
}

/** 在给定节点集合中查找距离点 (x, y) 最近、且不超过 maxDist 的节点。 */
export function nearestNodeToPoint(
  nodes: SnapNodeRect[],
  x: number,
  y: number,
  maxDist: number = FREE_POINT_SNAP_DISTANCE,
): SnapNodeRect | null {
  let best: SnapNodeRect | null = null;
  let bestDist = Infinity;
  for (const node of nodes) {
    const d = distanceToRect(node, x, y);
    if (d <= maxDist && d < bestDist) {
      bestDist = d;
      best = node;
    }
  }
  return best;
}

function isEdgeCell(cell: Record<string, unknown>): boolean {
  return cell.shape === 'edge' || Boolean(cell.source || cell.target);
}

/** 画板组合容器不允许作为连线端点（与 validateConnection 的约束保持一致）。 */
export function isBoardGroupNodeData(node: Record<string, unknown>): boolean {
  const data = node.data;
  return Boolean(data && typeof data === 'object' && (data as Record<string, unknown>).boardGroup === true);
}

function snapTerm(
  term: TermialLike,
  rects: SnapNodeRect[],
): unknown {
  if (!isFreePointTerminal(term)) return term;
  const nearest = nearestNodeToPoint(rects, term.x, term.y);
  return nearest ? { cell: nearest.id } : term;
}

type TermialLike = string | TerminalObject | null | undefined;

/**
 * 将 graphData 中所有「自由点」端子吸附回最近的节点边界（转换成 `{ cell }`）。
 * 仅处理节点附近（FREE_POINT_SNAP_DISTANCE 内）的自由点；远离所有节点的自由点保持不变。
 * 返回新的 GraphData，不修改入参。
 */
export function snapFreeEdgeTerminals(data: GraphData): GraphData {
  const cells = Array.isArray(data.cells) ? data.cells : [];
  const nodes: GraphData['nodes'] = Array.isArray(data.nodes)
    ? data.nodes
    : cells.filter((cell) => !isEdgeCell(cell as Record<string, unknown>)) as GraphData['nodes'];
  const edges: GraphData['edges'] = Array.isArray(data.edges)
    ? data.edges
    : cells.filter((cell) => isEdgeCell(cell as Record<string, unknown>)) as GraphData['edges'];

  const rects = (nodes as Array<Record<string, unknown>>)
    .filter((node) => !isBoardGroupNodeData(node))
    .map(toNodeRect)
    .filter((r): r is SnapNodeRect => r != null);

  const snappedEdges = edges.map((edge) => {
    const source = snapTerm(edge.source as TermialLike, rects);
    const target = snapTerm(edge.target as TermialLike, rects);
    if (source === edge.source && target === edge.target) return edge;
    return { ...edge, source, target };
  }) as GraphData['edges'];

  if (cells.length) {
    const snappedById = new Map(
      snappedEdges.map((edge) => [edge.id, edge] as [string, Record<string, unknown>]),
    );
    const nextCells = cells.map((cell) =>
      isEdgeCell(cell) ? snappedById.get(cell.id as string) ?? cell : cell);
    return { ...data, cells: nextCells, nodes, edges: snappedEdges };
  }

  return { ...data, nodes, edges: snappedEdges };
}

// ---------------------------------------------------------------------------
// 自定义 arrowhead 工具：拖拽端点时吸附到节点边界，不产生悬空自由点。
// ---------------------------------------------------------------------------

let sourceToolRegistered = false;
let targetToolRegistered = false;

/**
 * 基于 X6 内置 arrowhead 扩展的吸附工具。
 *  - 拖拽过程中若端点退化为自由点，则吸附回最近节点边界（动态预览）。
 *  - 松开时若端点仍是自由点：命中节点则吸附到其边界，否则回退到拖拽前的端子。
 */
function buildSnappingArrowhead(type: 'source' | 'target'): any {
  const baseName = type === 'source' ? 'source-arrowhead' : 'target-arrowhead';
  const Base = edgeToolRegistry.get(baseName) as any;

  return class SnappingArrowhead extends Base {
    private initialTerminal: unknown = null;

    onMouseDown(evt: unknown): void {
      const cell = this.cell;
      const current = cell?.[type];
      this.initialTerminal =
        current && typeof current === 'object' ? { ...current } : current;
      super.onMouseDown(evt);
    }

    onMouseMove(evt: unknown): void {
      super.onMouseMove(evt);
      this.snapFreePointDuringDrag();
      this.update();
    }

    onMouseUp(evt: unknown): void {
      super.onMouseUp(evt);
      this.snapFreePointOnDrop();
    }

    private snapFreePointDuringDrag(): void {
      const terminal = this.cell?.[type];
      if (!isFreePointTerminal(terminal)) return;
      const node = this.findNearestNode(terminal.x, terminal.y);
      if (node) this.cell.setTerminal(type, { cell: node.id }, { ui: true });
    }

    private snapFreePointOnDrop(): void {
      const terminal = this.cell?.[type];
      if (!isFreePointTerminal(terminal)) return;
      const node = this.findNearestNode(terminal.x, terminal.y);
      if (node) {
        this.cell.setTerminal(type, { cell: node.id }, { ui: true });
      } else if (this.initialTerminal != null) {
        this.cell.setTerminal(type, this.initialTerminal, { ui: true });
      }
    }

    private findNearestNode(x: number, y: number): any {
      const graph = this.graph;
      const r = FREE_POINT_SNAP_DISTANCE;
      const views = graph.renderer.findViewsInArea(
        { x: x - r, y: y - r, width: 2 * r, height: 2 * r },
        { nodeOnly: true },
      );
      const opposite = type === 'source' ? 'target' : 'source';
      const oppositeCellId = this.cell?.[opposite]?.cell;
      let best: any = null;
      let bestDist = Infinity;
      for (const view of views) {
        const node = view.cell;
        if (oppositeCellId && node.id === oppositeCellId) continue;
        if (isBoardGroupNodeData(node.getData() ?? {})) continue;
        const bbox = node.getBBox();
        const d = Math.hypot(
          x - Math.min(Math.max(x, bbox.x), bbox.x + bbox.width),
          y - Math.min(Math.max(y, bbox.y), bbox.y + bbox.height),
        );
        if (d <= r && d < bestDist) {
          bestDist = d;
          best = node;
        }
      }
      return best;
    }
  };
}

export const BOARD_SOURCE_ARROWHEAD_TOOL = 'board-source-arrowhead';
export const BOARD_TARGET_ARROWHEAD_TOOL = 'board-target-arrowhead';

/** 注册画板吸附箭头工具（幂等）。 */
export function ensureSnappingArrowheadToolsRegistered(): void {
  if (!sourceToolRegistered) {
    edgeToolRegistry.register(
      BOARD_SOURCE_ARROWHEAD_TOOL,
      buildSnappingArrowhead('source'),
    );
    sourceToolRegistered = true;
  }
  if (!targetToolRegistered) {
    edgeToolRegistry.register(
      BOARD_TARGET_ARROWHEAD_TOOL,
      buildSnappingArrowhead('target'),
    );
    targetToolRegistered = true;
  }
}
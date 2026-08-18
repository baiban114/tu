import type { BoardInterfaceSide } from './ports';
import type { GraphData } from '@/api/types';

/**
 * 引用画板（board reference）纯逻辑。
 *
 * 从 X6Component.vue 中提取的与「提取为画板页 / 画板引用」相关的无副作用函数，
 * 便于独立进行细粒度单测（见 boardReference.test.ts），避免画板整体改动时
 * 需要运行全部画板测试。
 */

export type ExtractedBoardInterfaceDirection = 'in' | 'out';

export interface ExtractedBoardInterfaceData {
  direction: ExtractedBoardInterfaceDirection;
  externalCellId: string;
  externalLabel: string;
  originalTerminal: unknown;
  side: BoardInterfaceSide;
  ratio: number;
  portId: string;
}

export interface NormalizedExtractedInterface extends Record<string, unknown> {
  edgeId: string;
  portId: string;
  direction: ExtractedBoardInterfaceDirection;
  side: BoardInterfaceSide;
  ratio: number;
}

export interface RectBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 根据外部接口点相对选区包围盒的位置，解析接口应停靠的边与比例。
 * 比例被夹在 [0.08, 0.92]，保证接口端口不会贴死在节点边角。
 */
export function resolveBoardInterfaceDock(
  point: { x: number; y: number },
  bounds: RectBounds,
): { side: BoardInterfaceSide; ratio: number } {
  const overflows: Array<{ side: BoardInterfaceSide; distance: number }> = [
    { side: 'left', distance: bounds.minX - point.x },
    { side: 'right', distance: point.x - bounds.maxX },
    { side: 'top', distance: bounds.minY - point.y },
    { side: 'bottom', distance: point.y - bounds.maxY },
  ];
  const side = overflows.sort((left, right) => right.distance - left.distance)[0]?.side ?? 'right';
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  const rawRatio = side === 'left' || side === 'right'
    ? (point.y - bounds.minY) / height
    : (point.x - bounds.minX) / width;
  return { side, ratio: Math.min(0.92, Math.max(0.08, rawRatio)) };
}

/**
 * 计算从内部节点中心指向外部节点中心的射线与「选区包围盒 + margin」外扩框的
 * 交点。该交点作为接口在提取后的新画板中的落点。
 */
export function computeExternalInterfacePoint(
  internalRect: BBox,
  externalRect: BBox,
  bounds: RectBounds,
  margin = 56,
): { x: number; y: number } {
  const start = {
    x: internalRect.x + internalRect.width / 2,
    y: internalRect.y + internalRect.height / 2,
  };
  const end = {
    x: externalRect.x + externalRect.width / 2,
    y: externalRect.y + externalRect.height / 2,
  };
  let dx = end.x - start.x;
  let dy = end.y - start.y;
  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) dx = 1;

  const candidates: number[] = [];
  if (dx > 0) candidates.push((bounds.maxX + margin - start.x) / dx);
  if (dx < 0) candidates.push((bounds.minX - margin - start.x) / dx);
  if (dy > 0) candidates.push((bounds.maxY + margin - start.y) / dy);
  if (dy < 0) candidates.push((bounds.minY - margin - start.y) / dy);
  const positive = candidates.filter((value) => Number.isFinite(value) && value > 0);
  const scale = positive.length ? Math.min(...positive) : 1;
  return {
    x: start.x + dx * scale,
    y: start.y + dy * scale,
  };
}

/**
 * 平移自由点端子 { x, y }；绑定到 cell 的端子或字符串端子原样返回。
 * 用于提取后把新画板内容归一化到左上角附近时同步平移接口落点。
 */
export function offsetExtractedTerminal(terminal: unknown, dx: number, dy: number): unknown {
  if (!terminal || typeof terminal !== 'object') return terminal;
  const value = terminal as Record<string, unknown>;
  if (typeof value.cell === 'string') return terminal;
  if (typeof value.x === 'number' && typeof value.y === 'number') {
    return { ...value, x: value.x + dx, y: value.y + dy };
  }
  return terminal;
}

/**
 * 从节点数据中解析展示标签：优先 attrs.label.text，其次 data 中的
 * label/title/name，最后回退到节点 id。
 */
export function getBoardNodeLabelFromData(node: {
  id: string;
  attrsLabelText?: unknown;
  data?: Record<string, unknown>;
}): string {
  if (typeof node.attrsLabelText === 'string' && node.attrsLabelText.trim()) {
    return node.attrsLabelText.trim();
  }
  const data = node.data ?? {};
  for (const key of ['label', 'title', 'name']) {
    const value = data[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return node.id;
}

/**
 * 归一化 extractedInterfaces 项（兼容旧结构与内嵌 boardInterface 字段）。
 * 每项产出一个稳定的 portId、direction、side、ratio；无效项（缺 edgeId）被丢弃。
 */
export function normalizeExtractedInterfaces(
  rawItems: Array<Record<string, unknown>>,
): NormalizedExtractedInterface[] {
  return rawItems.flatMap((item, index) => {
    const nested = item.boardInterface && typeof item.boardInterface === 'object'
      ? item.boardInterface as Record<string, unknown>
      : {};
    const edgeId = typeof item.edgeId === 'string' ? item.edgeId : '';
    if (!edgeId) return [];

    const direction: ExtractedBoardInterfaceDirection =
      item.direction === 'in' || nested.direction === 'in' ? 'in' : 'out';
    const rawSide = item.side ?? nested.side;
    const side: BoardInterfaceSide = ['top', 'right', 'bottom', 'left'].includes(String(rawSide))
      ? rawSide as BoardInterfaceSide
      : direction === 'in' ? 'left' : 'right';
    const rawRatio = typeof item.ratio === 'number'
      ? item.ratio
      : typeof nested.ratio === 'number'
        ? nested.ratio
        : (index + 1) / (rawItems.length + 1);
    const ratio = Math.min(0.92, Math.max(0.08, rawRatio));
    const portId = typeof item.portId === 'string'
      ? item.portId
      : typeof nested.portId === 'string'
        ? nested.portId
        : `board-interface-${edgeId}`;
    return [{ ...item, edgeId, portId, direction, side, ratio }];
  });
}

/**
 * 判定一个端子是否绑定到指定 cell。用于判断接口外部端点是否悬空。
 */
export function terminalCellId(terminal: unknown): string {
  if (typeof terminal === 'string') return terminal;
  if (!terminal || typeof terminal !== 'object') return '';
  const cell = (terminal as Record<string, unknown>).cell;
  return typeof cell === 'string' ? cell : '';
}

/**
 * A standalone board must never persist the extracted reference node that
 * points back to that same board. Such a node belongs to the host board and is
 * a reliable signal that a reused preview/page instance emitted the wrong
 * graph during navigation.
 */
export function containsSelfBoardReference(data: GraphData, pageId: string): boolean {
  if (!pageId) return false;
  const cells = [
    ...(Array.isArray(data.cells) ? data.cells : []),
    ...(Array.isArray(data.nodes) ? data.nodes : []),
  ];
  return cells.some((cell) => {
    const value = cell as Record<string, unknown>;
    const nodeData = value.data && typeof value.data === 'object'
      ? value.data as Record<string, unknown>
      : {};
    return nodeData.extractedBoardReference === true && nodeData.refBlockId === pageId;
  });
}

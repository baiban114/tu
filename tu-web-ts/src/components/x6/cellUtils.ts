export type CellData = Record<string, any>;

export function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function isPlainObject(value: unknown): value is Record<string, any> {
  return Object.prototype.toString.call(value) === '[object Object]';
}

export function mergeDeep<T extends Record<string, any>>(base: T, extra: Record<string, any>): T {
  const result: Record<string, any> = { ...base };
  Object.entries(extra).forEach(([key, value]) => {
    const baseValue = result[key];
    if (isPlainObject(baseValue) && isPlainObject(value)) {
      result[key] = mergeDeep(baseValue, value);
      return;
    }
    result[key] = value;
  });
  return result as T;
}

export function getCellPosition(cell: CellData, fallback = { x: 120, y: 120 }) {
  const position = isPlainObject(cell.position) ? cell.position : undefined;
  const style = isPlainObject(cell.style) ? cell.style : undefined;
  return {
    x: typeof position?.x === 'number'
      ? position.x
      : typeof cell.x === 'number'
        ? cell.x
        : typeof style?.x === 'number'
          ? style.x
          : fallback.x,
    y: typeof position?.y === 'number'
      ? position.y
      : typeof cell.y === 'number'
        ? cell.y
        : typeof style?.y === 'number'
          ? style.y
          : fallback.y,
  };
}

export function getCellSize(cell: CellData) {
  const size = isPlainObject(cell.size) ? cell.size : undefined;
  return {
    width: typeof size?.width === 'number'
      ? size.width
      : typeof cell.width === 'number'
        ? cell.width
        : undefined,
    height: typeof size?.height === 'number'
      ? size.height
      : typeof cell.height === 'number'
        ? cell.height
        : undefined,
  };
}

export function extractNodeLabel(node: CellData) {
  return node.label ?? node.data?.label ?? node.attrs?.label?.text ?? '节点';
}

export interface TreeHoursNode {
  id: string;
  parentId?: string | null;
  estimatedHours?: number | null;
}

export function toFiniteHours(value: unknown): number {
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : 0;
}

export function formatHours(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? `${rounded}h` : `${rounded.toFixed(1)}h`;
}

export function nodeTotalHours<T extends TreeHoursNode>(
  node: T,
  nodes: T[],
  memo = new Map<string, number>(),
): number {
  if (memo.has(node.id)) {
    return memo.get(node.id)!;
  }
  const children = nodes.filter((item) => item.parentId === node.id);
  const total = toFiniteHours(node.estimatedHours)
    + children.reduce((sum, child) => sum + nodeTotalHours(child, nodes, memo), 0);
  memo.set(node.id, total);
  return total;
}

export function withTotalEstimatedHours<T extends TreeHoursNode>(
  nodes: T[],
): Array<T & { totalEstimatedHours: number }> {
  const memo = new Map<string, number>();
  return nodes.map((node) => ({
    ...node,
    totalEstimatedHours: nodeTotalHours(node, nodes, memo),
  }));
}

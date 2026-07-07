import { flattenTree } from './flatten';
import type { FlatTreeNodeWithPath, TreeDocument, TreeNode } from './types';

export function toTreeDocument<TMeta>(
  nodes: TreeNode<TMeta>[],
  options: { title?: string } = {},
): TreeDocument<TMeta> {
  return {
    title: options.title,
    nodes,
  };
}

export function toFlatWithPath<TMeta>(nodes: TreeNode<TMeta>[]): FlatTreeNodeWithPath<TMeta>[] {
  return flattenTree(nodes).map(({ node, depth, pathLabels }) => ({
    id: node.id,
    label: node.label,
    path: pathLabels,
    depth,
    meta: node.meta,
  }));
}

export function toMarkdownOutline<TMeta>(
  nodes: TreeNode<TMeta>[],
  getLevel?: (node: TreeNode<TMeta>, depth: number) => number,
): string {
  const lines: string[] = [];
  flattenTree(nodes).forEach(({ node, depth }) => {
    const level = getLevel?.(node, depth) ?? Math.min(6, depth + 1);
    const hashes = '#'.repeat(Math.max(1, level));
    lines.push(`${hashes} ${node.label}`);
  });
  return lines.join('\n');
}

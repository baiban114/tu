import type { TreeNode } from './types';

/**
 * Build a tree from ordered items with numeric levels (e.g. TOC headings).
 * Uses a stack: each item becomes a child of the nearest preceding lower level.
 */
export function buildTreeFromLevels<TItem, TMeta>(
  items: TItem[],
  getLevel: (item: TItem) => number,
  getId: (item: TItem) => string,
  getLabel: (item: TItem) => string,
  getMeta?: (item: TItem) => TMeta,
): TreeNode<TMeta>[] {
  const roots: TreeNode<TMeta>[] = [];
  const stack: Array<{ level: number; node: TreeNode<TMeta> }> = [];

  for (const item of items) {
    const level = getLevel(item);
    const node: TreeNode<TMeta> = {
      id: getId(item),
      label: getLabel(item),
      ...(getMeta ? { meta: getMeta(item) } : {}),
    };

    while (stack.length > 0 && stack[stack.length - 1].level >= level) {
      stack.pop();
    }

    if (stack.length === 0) {
      roots.push(node);
    } else {
      const parent = stack[stack.length - 1].node;
      if (!parent.children) parent.children = [];
      parent.children.push(node);
    }

    stack.push({ level, node });
  }

  return roots;
}

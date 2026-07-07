import type { TreeNode } from './types';

export function walkTree<TMeta>(
  nodes: TreeNode<TMeta>[],
  visitor: (node: TreeNode<TMeta>, depth: number, path: TreeNode<TMeta>[]) => void | boolean,
  depth = 0,
  path: TreeNode<TMeta>[] = [],
): void {
  for (const node of nodes) {
    const nextPath = [...path, node];
    const stop = visitor(node, depth, nextPath);
    if (stop === true) return;
    if (node.children?.length) {
      walkTree(node.children, visitor, depth + 1, nextPath);
    }
  }
}

export function findTreeNode<TMeta>(
  nodes: TreeNode<TMeta>[],
  id: string,
): TreeNode<TMeta> | undefined {
  let found: TreeNode<TMeta> | undefined;
  walkTree(nodes, (node) => {
    if (node.id === id) {
      found = node;
      return true;
    }
    return false;
  });
  return found;
}

export function findTreePath<TMeta>(
  nodes: TreeNode<TMeta>[],
  id: string,
): TreeNode<TMeta>[] {
  let result: TreeNode<TMeta>[] = [];
  walkTree(nodes, (node, _depth, path) => {
    if (node.id === id) {
      result = path;
      return true;
    }
    return false;
  });
  return result;
}

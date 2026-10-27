/** Nested tree node for display, export, and interchange. */
export interface TreeNode<TMeta = unknown> {
  id: string;
  label: string;
  children?: TreeNode<TMeta>[];
  meta?: TMeta;
}

/** Flat node for building trees from parentId lists. */
export interface FlatTreeNode<TMeta = unknown> {
  id: string;
  parentId: string | null;
  label: string;
  order?: number;
  meta?: TMeta;
}

export interface FlatTreeNodeWithPath<TMeta = unknown> {
  id: string;
  label: string;
  path: string[];
  depth: number;
  meta?: TMeta;
}

export interface TreeDocument<TMeta = unknown> {
  title?: string;
  nodes: TreeNode<TMeta>[];
}

/** Presentation-neutral item for a tree row's context menu. */
export interface TreeContextMenuItem {
  id: string
  label: string
  disabled?: boolean
  danger?: boolean
}

export interface FlattenTreeOptions {
  includePathLabels?: boolean;
}

export interface FlatTreeEntry<TMeta = unknown> {
  node: TreeNode<TMeta>;
  depth: number;
  pathLabels: string[];
}

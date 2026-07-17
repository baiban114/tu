export type {
  FlatTreeEntry,
  FlatTreeNode,
  FlatTreeNodeWithPath,
  FlattenTreeOptions,
  TreeDocument,
  TreeNode,
} from './types';

export { buildTreeFromFlat } from './build';
export { flattenTree } from './flatten';
export { buildTreeFromLevels } from './levels';
export { walkTree, findTreeNode, findTreePath } from './walk';
export { toTreeDocument, toFlatWithPath, toMarkdownOutline } from './serialize';
export {
  canDropOnNode,
  computeTreeDropTarget,
  flattenKnowledgePoints,
  isDescendant,
  collectSubtreePointIds,
  moveToRootEnd,
  normalizeDropType,
  promoteToSiblingAfterParent,
  toMovableNode,
  type TreeDropTarget,
  type TreeDropType,
  type TreeMovableNode,
} from './drag';

export {
  resourcesToTreeNodes,
  resourceWorksToTreeNodes,
  isResourceTreeNodeId,
  type ResourceTreeInput,
  type ResourceTreeLayer,
  type ResourceTreeMeta,
} from './adapters/resources';

export { pagesToTreeNodes, flatPagesToTreeNodes, type PageTreeMeta } from './adapters/pages';
export { tocToTreeNodes, type TocTreeItem, type TocTreeMeta } from './adapters/toc';
export {
  contentOutlineToTreeNodes,
  isDocumentPage,
  isOutlinePlaceholderNode,
  isOutlineTreeNode,
  isVirtualPageTreeExtra,
  mergeDocumentOutlinesIntoPageTree,
  outlineNodeTreeId,
  type OutlineTreeMeta,
  type PageTreeDisplayItem,
  type PageTreeNodeKind,
} from './adapters/outline';

import type { TreeNode } from '../types';

export interface TocTreeItem {
  id: string;
  blockId: string;
  level: number;
  text: string;
  pos: number;
  sourceType: string;
  children?: TocTreeItem[];
  refId?: string;
  targetText?: string;
}

export interface TocTreeMeta {
  sourceType: string;
  level: number;
  blockId: string;
  pos: number;
  refId?: string;
  targetText?: string;
}

export function tocToTreeNodes(items: TocTreeItem[]): TreeNode<TocTreeMeta>[] {
  const visit = (nodes: TocTreeItem[]): TreeNode<TocTreeMeta>[] => nodes.map((item) => ({
    id: item.id,
    label: item.text,
    ...(item.children?.length ? { children: visit(item.children) } : {}),
    meta: {
      sourceType: item.sourceType,
      level: item.level,
      blockId: item.blockId,
      pos: item.pos,
      refId: item.refId,
      targetText: item.targetText,
    },
  }));

  return visit(items);
}

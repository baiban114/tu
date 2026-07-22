import type {
  ResourceChapter,
  ResourceExcerpt,
  ResourceItem,
  ResourceType,
  ResourceWork,
} from '@/api/externalResource';
import { supportsBookChapters, supportsResourceExcerpts } from '@/api/externalResource';
import type { TreeNode } from '../types';

export type ResourceTreeLayer =
  | 'root'
  | 'type'
  | 'work'
  | 'unassigned'
  | 'item'
  | 'chapter'
  | 'unassigned_excerpts'
  | 'excerpt';

export interface ResourceTreeMeta {
  layer: ResourceTreeLayer;
  entityId: string;
  typeId?: string;
  typeCode?: string;
  workId?: string | null;
  itemId?: string;
  chapterId?: string;
  clusterKey?: string | null;
}

export interface ResourceTreeInput {
  types: ResourceType[];
  works: ResourceWork[];
  items: ResourceItem[];
  /** resourceItemId → excerpts (optional; omit for lighter trees) */
  excerptsByItemId?: Record<string, ResourceExcerpt[]>;
  /** resourceItemId → flat chapter list (book only) */
  chaptersByItemId?: Record<string, ResourceChapter[]>;
  /** When set, only include this resource type branch */
  filterTypeId?: string;
}

const ROOT_ID = 'rt-root';
const UNASSIGNED_PREFIX = 'rw-unassigned:';
const UNASSIGNED_EXCERPTS_PREFIX = 're-unassigned:';

function truncateClusterKey(value: string | null | undefined, max = 24): string {
  const text = value?.trim();
  if (!text) return '';
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

function buildExcerptNode(
  excerpt: ResourceExcerpt,
  typeId: string,
  workId: string | null,
  itemId: string,
  chapterId: string | undefined,
  children?: TreeNode<ResourceTreeMeta>[],
): TreeNode<ResourceTreeMeta> {
  return {
    id: `re:${excerpt.id}`,
    label: excerpt.title,
    ...(children && children.length > 0 ? { children } : {}),
    meta: {
      layer: 'excerpt',
      entityId: excerpt.id,
      typeId,
      typeCode: undefined,
      workId,
      itemId,
      chapterId: excerpt.chapterId ?? chapterId,
    },
  };
}

function buildNestedExcerptNodes(
  excerpts: ResourceExcerpt[],
  typeId: string,
  workId: string | null,
  itemId: string,
  parentId: string | null,
  chapterId?: string,
): TreeNode<ResourceTreeMeta>[] {
  return excerpts
    .filter((excerpt) => (excerpt.parentId ?? null) === parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, 'zh-CN'))
    .map((excerpt) => {
      const children = buildNestedExcerptNodes(
        excerpts,
        typeId,
        workId,
        itemId,
        excerpt.id,
        chapterId,
      );
      return buildExcerptNode(excerpt, typeId, workId, itemId, chapterId, children);
    });
}

function buildChapterNodes(
  item: ResourceItem,
  type: ResourceType,
  workId: string | null,
  chapters: ResourceChapter[],
  excerptsByChapterId: Map<string, ResourceExcerpt[]>,
  parentId: string | null,
): TreeNode<ResourceTreeMeta>[] {
  return chapters
    .filter((chapter) => (chapter.parentId ?? null) === parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, 'zh-CN'))
    .map((chapter) => {
      const childChapters = buildChapterNodes(
        item,
        type,
        workId,
        chapters,
        excerptsByChapterId,
        chapter.id,
      );
      const chapterExcerpts = buildNestedExcerptNodes(
        excerptsByChapterId.get(chapter.id) ?? [],
        type.id,
        workId,
        item.id,
        null,
        chapter.id,
      );
      const children = [...childChapters, ...chapterExcerpts];
      const label = chapter.locator ? `${chapter.title} · ${chapter.locator}` : chapter.title;
      return {
        id: `rc:${chapter.id}`,
        label,
        ...(children.length > 0 ? { children } : {}),
        meta: {
          layer: 'chapter',
          entityId: chapter.id,
          typeId: type.id,
          typeCode: type.code,
          workId,
          itemId: item.id,
          chapterId: chapter.id,
        },
      };
    });
}

function buildBookItemChildren(
  item: ResourceItem,
  type: ResourceType,
  workId: string | null,
  excerpts: ResourceExcerpt[],
  chapters: ResourceChapter[],
): TreeNode<ResourceTreeMeta>[] {
  if (chapters.length === 0) {
    return buildNestedExcerptNodes(excerpts, type.id, workId, item.id, null);
  }

  const excerptsByChapterId = new Map<string, ResourceExcerpt[]>();
  const unassigned: ResourceExcerpt[] = [];
  for (const excerpt of excerpts) {
    if (excerpt.chapterId) {
      const bucket = excerptsByChapterId.get(excerpt.chapterId) ?? [];
      bucket.push(excerpt);
      excerptsByChapterId.set(excerpt.chapterId, bucket);
    } else {
      unassigned.push(excerpt);
    }
  }

  const children = buildChapterNodes(item, type, workId, chapters, excerptsByChapterId, null);
  if (unassigned.length > 0) {
    children.push({
      id: `${UNASSIGNED_EXCERPTS_PREFIX}${item.id}`,
      label: '未归类节选',
      children: buildNestedExcerptNodes(unassigned, type.id, workId, item.id, null),
      meta: {
        layer: 'unassigned_excerpts',
        entityId: item.id,
        typeId: type.id,
        typeCode: type.code,
        workId,
        itemId: item.id,
      },
    });
  }
  return children;
}

function buildItemChildren(
  item: ResourceItem,
  type: ResourceType,
  workId: string | null,
  excerptsByItemId: Record<string, ResourceExcerpt[]>,
  chaptersByItemId: Record<string, ResourceChapter[]>,
  includeExcerpts: boolean,
): TreeNode<ResourceTreeMeta>[] | undefined {
  if (!includeExcerpts || !supportsResourceExcerpts(type.code)) return undefined;

  const excerpts = excerptsByItemId[item.id] ?? [];
  if (supportsBookChapters(type.code)) {
    const chapters = chaptersByItemId[item.id] ?? [];
    const children = buildBookItemChildren(item, type, workId, excerpts, chapters);
    return children.length > 0 ? children : undefined;
  }

  const excerptNodes = buildNestedExcerptNodes(excerpts, type.id, workId, item.id, null);
  return excerptNodes.length > 0 ? excerptNodes : undefined;
}

function buildItemNodes(
  type: ResourceType,
  workId: string | null,
  items: ResourceItem[],
  excerptsByItemId: Record<string, ResourceExcerpt[]>,
  chaptersByItemId: Record<string, ResourceChapter[]>,
  includeExcerpts: boolean,
): TreeNode<ResourceTreeMeta>[] {
  return items.map((item) => {
    const children = buildItemChildren(
      item,
      type,
      workId,
      excerptsByItemId,
      chaptersByItemId,
      includeExcerpts,
    );
    return {
      id: `ri:${item.id}`,
      label: item.title,
      ...(children && children.length > 0 ? { children } : {}),
      meta: {
        layer: 'item',
        entityId: item.id,
        typeId: type.id,
        typeCode: type.code,
        workId,
        itemId: item.id,
      },
    };
  });
}

function buildWorkBranch(
  type: ResourceType,
  work: ResourceWork,
  items: ResourceItem[],
  excerptsByItemId: Record<string, ResourceExcerpt[]>,
  chaptersByItemId: Record<string, ResourceChapter[]>,
  includeExcerpts: boolean,
): TreeNode<ResourceTreeMeta> {
  const workItems = items.filter((item) => item.workId === work.id);
  const clusterHint = truncateClusterKey(work.clusterKey);
  const label = clusterHint ? `${work.title} · ${clusterHint}` : work.title;
  const children = buildItemNodes(
    type,
    work.id,
    workItems,
    excerptsByItemId,
    chaptersByItemId,
    includeExcerpts,
  );

  return {
    id: `rw:${work.id}`,
    label,
    ...(children.length > 0 ? { children } : {}),
    meta: {
      layer: 'work',
      entityId: work.id,
      typeId: type.id,
      typeCode: type.code,
      workId: work.id,
      clusterKey: work.clusterKey ?? null,
    },
  };
}

function buildTypeBranch(
  type: ResourceType,
  works: ResourceWork[],
  items: ResourceItem[],
  excerptsByItemId: Record<string, ResourceExcerpt[]>,
  chaptersByItemId: Record<string, ResourceChapter[]>,
  includeExcerpts: boolean,
): TreeNode<ResourceTreeMeta> {
  const typeWorks = works.filter((work) => work.typeId === type.id);
  const unassignedItems = items.filter((item) => item.typeId === type.id && !item.workId);

  const children: TreeNode<ResourceTreeMeta>[] = typeWorks.map((work) => (
    buildWorkBranch(type, work, items, excerptsByItemId, chaptersByItemId, includeExcerpts)
  ));

  if (unassignedItems.length > 0) {
    const unassignedChildren = buildItemNodes(
      type,
      null,
      unassignedItems,
      excerptsByItemId,
      chaptersByItemId,
      includeExcerpts,
    );
    children.push({
      id: `${UNASSIGNED_PREFIX}${type.id}`,
      label: '未归类',
      children: unassignedChildren,
      meta: {
        layer: 'unassigned',
        entityId: `${UNASSIGNED_PREFIX}${type.id}`,
        typeId: type.id,
        typeCode: type.code,
        workId: null,
      },
    });
  }

  return {
    id: `rt:${type.id}`,
    label: `${type.icon ? `${type.icon} ` : ''}${type.name}`.trim(),
    ...(children.length > 0 ? { children } : {}),
    meta: {
      layer: 'type',
      entityId: type.id,
      typeId: type.id,
      typeCode: type.code,
    },
  };
}

/**
 * ResourceType → ResourceWork → ResourceItem → (book: Chapter → nested Excerpt | 未归类节选; document/web-link: nested Excerpt)
 */
export function resourcesToTreeNodes(input: ResourceTreeInput): TreeNode<ResourceTreeMeta>[] {
  const {
    types,
    works,
    items,
    excerptsByItemId = {},
    chaptersByItemId = {},
    filterTypeId,
  } = input;
  const includeExcerpts = Object.keys(excerptsByItemId).length > 0;
  const filteredTypes = filterTypeId
    ? types.filter((type) => type.id === filterTypeId)
    : types;

  const typeBranches = filteredTypes.map((type) => (
    buildTypeBranch(type, works, items, excerptsByItemId, chaptersByItemId, includeExcerpts)
  ));

  if (filterTypeId) {
    return typeBranches;
  }

  return [{
    id: ROOT_ID,
    label: '外部资源',
    children: typeBranches,
    meta: {
      layer: 'root',
      entityId: ROOT_ID,
    },
  }];
}

/** Work nodes only (for merge-work target picker). */
export function resourceWorksToTreeNodes(
  type: ResourceType,
  works: ResourceWork[],
  items: ResourceItem[],
): TreeNode<ResourceTreeMeta>[] {
  return works
    .filter((work) => work.typeId === type.id)
    .map((work) => {
      const count = items.filter((item) => item.workId === work.id).length;
      const clusterHint = truncateClusterKey(work.clusterKey);
      const suffix = clusterHint ? ` · ${clusterHint}` : '';
      return {
        id: `rw:${work.id}`,
        label: `${work.title}${suffix}（${count} 个实体）`,
        meta: {
          layer: 'work',
          entityId: work.id,
          typeId: type.id,
          typeCode: type.code,
          workId: work.id,
          clusterKey: work.clusterKey ?? null,
        },
      };
    });
}

export function isResourceTreeNodeId(id: string): boolean {
  return id.startsWith('rt:')
    || id.startsWith('rw:')
    || id.startsWith('ri:')
    || id.startsWith('re:')
    || id.startsWith('rc:');
}

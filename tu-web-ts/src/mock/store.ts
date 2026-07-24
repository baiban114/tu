import type {
  Block,
  BlockTag,
  BlockWithMeta,
  EmbeddedObject,
  ImportRoadmapPayload,
  ImportRoadmapResult,
  KnowledgeBase,
  PageContent,
  PageItem,
  RoadmapNode,
} from '@/api/types';
import { tipTapToBlocks } from '@/editor/converters';
import { resolvePageDocument } from '@/editor/pageDocument';
import { collectBlockTags } from '@/utils/blockMetadata';
import { getPageTags, mergeTagPools } from '@/utils/pageMetadata';
import { collectSectionTagsFromMetadata } from '@/utils/sectionMetadata';
import { collectTextTagSpanTags } from '@/utils/textTagSpanMetadata';
import type { ReferenceItem, ListReferencesParams, ListReferencesResult } from '@/api/reference';
import type {
  BlockOutlineResponse,
  ContentTreeNode,
  OutlineBatchRequest,
  OutlineBatchResponse,
  PageOutlineResponse,
} from '@/api/outline';
import {
  buildMockBatchResponse,
  buildMockBlockOutline,
  buildMockPageOutline,
  pageContentToBlocks,
} from '@/mock/contentTree';
import {
  buildExcerptTitle,
  formatExcerptLocator,
  parseExternalUrl,
} from '@/utils/externalUrlResource';
import { normalizeResourcePositionLocator, normalizeResourcePositionLocatorKey } from '@/utils/resourcePositionLocator';
import { BUILTIN_URL_CLUSTER_RULES, findWorkByClusterKey, matchUrlCluster } from '@/utils/urlCluster';
import { HEADING_SOURCE_COMMENT_RE, parseHeadingSourceComment } from '@/utils/headingSource';
import { createInitialPageContent } from '@/utils/boardPageContent';
import type {
  CreateResourceExcerptPayload,
  CreateResourcePdfRegionNotePayload,
  CreateResourceChapterPayload,
  CreateResourceItemPayload,
  CreateResourceTypePayload,
  CreateResourceWorkPayload,
  CreateUrlClusterRulePayload,
  RegisterExternalUrlResult,
  ResourceExcerpt,
  ResourcePdfRegionNote,
  ResourceChapter,
  ResourceItem,
  ResourceItemRelation,
  ResourceType,
  ResourceWork,
  UpdateResourceExcerptPayload,
  UpdateResourcePdfRegionNotePayload,
  UpdateResourceChapterPayload,
  UpdateResourceItemPayload,
  UpdateResourceTypePayload,
  UpdateResourceWorkPayload,
  UpdateUrlClusterRulePayload,
  UrlClusterRule,
} from '@/api/externalResource';
import type { CreateKbResourceLinkPayload, KbResourceLink } from '@/api/kbResourceLink';
import type {
  ContentComment,
  CreateContentCommentPayload,
  ListContentCommentRepliesParams,
  ListContentCommentsParams,
} from '@/api/comment';
import type { PageResponse } from '@/api/aiRuns';
import { DEFAULT_PAGE_SIZE } from '@/constants/pagination';

interface MockState {
  knowledgeBases: KnowledgeBase[];
  pages: Array<Omit<PageItem, 'children'>>;
  contents: Record<string, PageContent>;
  resourceTypes: ResourceType[];
  resourceWorks: ResourceWork[];
  resourceItems: ResourceItem[];
  resourceChapters: ResourceChapter[];
  resourceExcerpts: ResourceExcerpt[];
  resourcePdfRegionNotes: ResourcePdfRegionNote[];
  urlClusterRules: UrlClusterRule[];
  resourceItemRelations: ResourceItemRelation[];
  kbResourceLinks: KbResourceLink[];
  contentComments: ContentComment[];
  contentTreeHours: Record<string, number | null>;
}

const STORAGE_KEY = 'tu:mock-state';

function blocksToPageContent(blocks: Block[]): PageContent {
  const parts: string[] = []
  const embeds: EmbeddedObject[] = []
  const referencedEmbedIds = collectEmbedIdsFromBlocks(blocks)
  const seenEmbedIds = new Set<string>()

  for (const block of blocks) {
    if (block.type === 'richtext' || block.type === 'richText') {
      if (block.content) parts.push(block.content)
      continue
    }
    if (seenEmbedIds.has(block.id)) continue
    seenEmbedIds.add(block.id)

    const embedId = block.id
    const embed: EmbeddedObject = {
      id: embedId,
      type: block.type as EmbeddedObject['type'],
      title: block.title,
      graphData: block.graphData,
      tableData: block.tableData,
      multiTableData: block.multiTableData,
      timelineData: block.timelineData,
      refId: block.refId,
      refType: block.refType,
      externalResource: block.externalResource,
      spacerHeight: block.spacerHeight,
      width: block.width,
      height: block.height,
      metadata: block.metadata,
    }
    embeds.push(embed)
    if (!referencedEmbedIds.has(embedId)) {
      parts.push(`\n\n<!--tu:embed id="${embedId}" type="${embed.type}"-->\n\n`)
    }
  }

  return {
    content: parts.join('\n\n').replace(/\n{3,}/g, '\n\n').trim(),
    embeds,
    annotations: [],
  }
}

function collectEmbedIdsFromBlocks(blocks: Block[]): Set<string> {
  const ids = new Set<string>()
  for (const block of blocks) {
    if (block.type !== 'richtext' && block.type !== 'richText') continue
    for (const id of collectEmbedIdsFromContent(block.content || '')) {
      ids.add(id)
    }
  }
  return ids
}

function collectEmbedIdsFromContent(content: string): Set<string> {
  const ids = new Set<string>()
  const embedRe = /<!--tu:embed\s+id="([^"]+)"\s+type="([^"]+)"\s*-->/g
  let match: RegExpExecArray | null

  while ((match = embedRe.exec(content)) !== null) {
    ids.add(match[1])
  }

  return ids
}

const initialState: MockState = {
  knowledgeBases: [
    {
      id: 'kb-demo-1',
      name: '个人笔记',
      icon: '📌',
      description: '用于离线演示和本地调试的 mock 知识库',
    },
    {
      id: 'kb-demo-2',
      name: '技术文档',
      icon: '📋',
      description: '配合开发者模式验证页面树和块同步',
    },
  ],
  pages: [
    { id: 'p-demo-1', kbId: 'kb-demo-1', parentId: null, title: '快速入门', order: 0 },
    { id: 'p-demo-2', kbId: 'kb-demo-1', parentId: null, title: '基础概念', order: 1 },
    { id: 'p-demo-3', kbId: 'kb-demo-1', parentId: 'p-demo-2', title: '数据结构', order: 0 },
    { id: 'p-demo-4', kbId: 'kb-demo-2', parentId: null, title: 'API 文档', order: 0 },
  ],
  contents: {
    'p-demo-1': blocksToPageContent([
      {
        id: 'b-demo-1',
        type: 'richtext',
        content: '# 快速入门\n\n当前正在使用前端本地 mock 数据源，可以随时切回后端。',
      },
      {
        id: 'b-demo-x6-1',
        type: 'x6',
        title: '示例画板',
        graphData: {
          nodes: [
            { id: 'demo-node-1', x: 120, y: 100, width: 120, height: 56, label: '开始' },
            { id: 'demo-node-2', x: 340, y: 100, width: 140, height: 56, label: '切换到 mock' },
          ],
          edges: [
            { id: 'demo-edge-1', source: 'demo-node-1', target: 'demo-node-2' },
          ],
        },
      },
    ]),
    'p-demo-2': blocksToPageContent([
      {
        id: 'b-demo-2',
        type: 'richtext',
        content: '# 基础概念\n\n页面、块内容和引用块都可以在 mock 模式下独立运行。',
      },
      {
        id: 'b-demo-ref-1',
        type: 'ref',
        refId: 'b-demo-1',
      },
    ]),
    'p-demo-3': blocksToPageContent([
      {
        id: 'b-demo-3',
        type: 'richtext',
        content: '这里可以继续补充子页面内容。',
      },
    ]),
    'p-demo-4': blocksToPageContent([
      {
        id: 'b-demo-4',
        type: 'richtext',
        content: '# API 文档\n\n开发者模式允许在 mock 和后端之间切换，而不改业务代码。',
      },
    ]),
  },
  resourceTypes: [
    {
      id: 'rt-book',
      code: 'book',
      name: '图书',
      icon: 'book',
      description: '图书资源，支持节选片段管理',
      identityFieldKey: 'isbn',
      identityFieldLabel: 'ISBN',
    },
    {
      id: 'rt-document',
      code: 'document',
      name: '文档',
      icon: 'document',
      description: '文档资源，支持节选片段管理',
      identityFieldKey: 'sourceUrl',
      identityFieldLabel: '源 URL / 文件标识',
    },
  ],
  resourceWorks: [
    {
      id: 'rw-book-demo',
      typeId: 'rt-book',
      typeName: '图书',
      title: '示例之书',
      subtitle: 'Mock 外部资源',
      description: '用于验证外部资源插入和图书节选。',
      clusterKey: '978-7-0000-0000-1',
      titleSource: 'manual',
    },
  ],
  resourceItems: [
    {
      id: 'ri-book-demo',
      typeId: 'rt-book',
      typeName: '图书',
      identityFieldKey: 'isbn',
      identityFieldLabel: 'ISBN',
      workId: 'rw-book-demo',
      workTitle: '示例之书',
      title: '示例之书',
      identityValue: '978-7-0000-0000-1',
      sourceUrl: 'https://example.com/books/demo',
      edition: '第一版',
      note: 'Mock 图书资源',
      titleSource: 'manual',
      workIdSource: 'manual',
      variantKind: 'edition',
    },
    {
      id: 'ri-doc-demo',
      typeId: 'rt-document',
      typeName: '文档',
      identityFieldKey: 'sourceUrl',
      identityFieldLabel: '源 URL / 文件标识',
      workId: null,
      workTitle: null,
      title: '示例文档资源',
      identityValue: 'https://example.com/docs/demo',
      sourceUrl: 'https://example.com/docs/demo',
      note: 'Mock 文档资源，可挂接到知识库',
      titleSource: 'manual',
      workIdSource: 'auto',
      variantKind: null,
    },
  ],
  urlClusterRules: [...BUILTIN_URL_CLUSTER_RULES],
  resourceItemRelations: [],
  kbResourceLinks: [],
  contentComments: [],
  resourceChapters: [
    {
      id: 'rc-book-demo-1',
      resourceItemId: 'ri-book-demo',
      resourceItemTitle: '示例之书',
      parentId: null,
      title: '第 1 章',
      locator: 'page:1-20',
      note: 'Mock 章节',
      sortOrder: 0,
    },
  ],
  resourceExcerpts: [
    {
      id: 're-book-demo-1',
      resourceItemId: 'ri-book-demo',
      resourceItemTitle: '示例之书',
      title: '关于结构化笔记',
      chapterId: 'rc-book-demo-1',
      chapterTitle: '第 1 章',
      locator: 'page:12',
      excerptText: '好的笔记系统应当让来源、节选和自己的思考保持清晰关系。',
      note: 'Mock 默认节选',
      sortOrder: 0,
    },
    {
      id: 're-doc-demo-1',
      resourceItemId: 'ri-doc-demo',
      resourceItemTitle: '示例文档资源',
      title: '开篇',
      chapterId: null,
      chapterTitle: null,
      excerptText: '这是挂接到知识库后只读展示的文档节选正文。',
      sortOrder: 0,
    },
    {
      id: 're-doc-demo-2',
      resourceItemId: 'ri-doc-demo',
      resourceItemTitle: '示例文档资源',
      title: '第二节',
      chapterId: null,
      chapterTitle: null,
      excerptText: '第二节内容：节选会按顺序拼接成一篇只读文档。',
      sortOrder: 1,
    },
  ],
  resourcePdfRegionNotes: [],
  contentTreeHours: {},
};

function cloneState<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function loadState(): MockState {
  if (typeof window === 'undefined') {
    return cloneState(initialState);
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return cloneState(initialState);
  }

  try {
    const parsed = JSON.parse(raw) as MockState;
    if (!parsed || !Array.isArray(parsed.knowledgeBases) || !Array.isArray(parsed.pages) || !parsed.contents) {
      return cloneState(initialState);
    }
    return {
      ...parsed,
      resourceTypes: Array.isArray(parsed.resourceTypes) ? parsed.resourceTypes : cloneState(initialState.resourceTypes),
      resourceWorks: Array.isArray(parsed.resourceWorks) ? parsed.resourceWorks : cloneState(initialState.resourceWorks),
      resourceItems: Array.isArray(parsed.resourceItems) ? parsed.resourceItems : cloneState(initialState.resourceItems),
      resourceChapters: Array.isArray(parsed.resourceChapters) ? parsed.resourceChapters : cloneState(initialState.resourceChapters),
      resourceExcerpts: Array.isArray(parsed.resourceExcerpts) ? parsed.resourceExcerpts : cloneState(initialState.resourceExcerpts),
      resourcePdfRegionNotes: Array.isArray(parsed.resourcePdfRegionNotes)
        ? parsed.resourcePdfRegionNotes
        : cloneState(initialState.resourcePdfRegionNotes),
      urlClusterRules: Array.isArray(parsed.urlClusterRules) ? parsed.urlClusterRules : cloneState(initialState.urlClusterRules),
      resourceItemRelations: Array.isArray(parsed.resourceItemRelations) ? parsed.resourceItemRelations : cloneState(initialState.resourceItemRelations),
      kbResourceLinks: Array.isArray(parsed.kbResourceLinks) ? parsed.kbResourceLinks : cloneState(initialState.kbResourceLinks),
      contentComments: Array.isArray(parsed.contentComments) ? parsed.contentComments : cloneState(initialState.contentComments),
      contentTreeHours: parsed.contentTreeHours && typeof parsed.contentTreeHours === 'object'
        ? parsed.contentTreeHours
        : cloneState(initialState.contentTreeHours),
    };
  } catch {
    return cloneState(initialState);
  }
}

let state: MockState = loadState();

function persistState(): void {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
}

function nextId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getResourceTypeOrThrow(typeId: string): ResourceType {
  const type = state.resourceTypes.find((item) => item.id === typeId);
  if (!type) throw new Error(`Resource type not found: ${typeId}`);
  return type;
}

function getResourceWorkOrThrow(workId: string): ResourceWork {
  const work = state.resourceWorks.find((item) => item.id === workId);
  if (!work) throw new Error(`Resource work not found: ${workId}`);
  return work;
}

function getResourceItemOrThrow(itemId: string): ResourceItem {
  const item = state.resourceItems.find((entry) => entry.id === itemId);
  if (!item) throw new Error(`Resource item not found: ${itemId}`);
  return item;
}

function getResourceExcerptOrThrow(excerptId: string): ResourceExcerpt {
  const excerpt = state.resourceExcerpts.find((entry) => entry.id === excerptId);
  if (!excerpt) throw new Error(`Resource excerpt not found: ${excerptId}`);
  return excerpt;
}

function ensureExcerptSupportedResourceItem(item: ResourceItem): void {
  const type = getResourceTypeOrThrow(item.typeId);
  if (type.code !== 'book' && type.code !== 'web-link' && type.code !== 'document') {
    throw new Error('resource excerpts are only supported for book, document, or web-link resources');
  }
}

function ensureBookResourceItem(item: ResourceItem): void {
  const type = getResourceTypeOrThrow(item.typeId);
  if (type.code !== 'book') {
    throw new Error('resource chapters are only supported for book resources');
  }
}

function getResourceChapterOrThrow(chapterId: string): ResourceChapter {
  const chapter = state.resourceChapters.find((entry) => entry.id === chapterId);
  if (!chapter) throw new Error(`Resource chapter not found: ${chapterId}`);
  return chapter;
}

function collectChapterDescendantIds(resourceItemId: string, rootId: string): string[] {
  const chapters = state.resourceChapters.filter((entry) => entry.resourceItemId === resourceItemId);
  const byParent = new Map<string | null, ResourceChapter[]>();
  for (const chapter of chapters) {
    const parentId = chapter.parentId ?? null;
    const bucket = byParent.get(parentId) ?? [];
    bucket.push(chapter);
    byParent.set(parentId, bucket);
  }
  const result: string[] = [];
  const walk = (chapterId: string) => {
    result.push(chapterId);
    for (const child of byParent.get(chapterId) ?? []) {
      walk(child.id);
    }
  };
  walk(rootId);
  return result;
}

function validateChapterParent(
  resourceItemId: string,
  parentId: string | null | undefined,
  selfId?: string,
): void {
  if (!parentId) return;
  if (selfId && selfId === parentId) {
    throw new Error('resource chapter cannot be its own parent');
  }
  const parent = getResourceChapterOrThrow(parentId);
  if (parent.resourceItemId !== resourceItemId) {
    throw new Error('resource chapter parent must belong to the same resource item');
  }
  if (selfId) {
    const descendants = collectChapterDescendantIds(resourceItemId, selfId);
    if (descendants.includes(parentId)) {
      throw new Error('resource chapter parent cannot be a descendant');
    }
  }
}

function collectExcerptDescendantIds(resourceItemId: string, rootId: string): string[] {
  const excerpts = state.resourceExcerpts.filter((entry) => entry.resourceItemId === resourceItemId);
  const byParent = new Map<string | null, ResourceExcerpt[]>();
  for (const excerpt of excerpts) {
    const parentId = excerpt.parentId ?? null;
    const bucket = byParent.get(parentId) ?? [];
    bucket.push(excerpt);
    byParent.set(parentId, bucket);
  }
  const result: string[] = [];
  const walk = (excerptId: string) => {
    result.push(excerptId);
    for (const child of byParent.get(excerptId) ?? []) {
      walk(child.id);
    }
  };
  walk(rootId);
  return result;
}

function validateExcerptParent(
  resourceItemId: string,
  parentId: string | null | undefined,
  selfId?: string,
): void {
  if (!parentId) return;
  if (selfId && selfId === parentId) {
    throw new Error('resource excerpt cannot be its own parent');
  }
  const parent = getResourceExcerptOrThrow(parentId);
  if (parent.resourceItemId !== resourceItemId) {
    throw new Error('resource excerpt parent must belong to the same resource item');
  }
  if (selfId) {
    const descendants = collectExcerptDescendantIds(resourceItemId, selfId);
    if (descendants.includes(parentId)) {
      throw new Error('resource excerpt parent cannot be a descendant');
    }
  }
}

function resolveChapterForExcerpt(resourceItemId: string, chapterId?: string | null): string | undefined {
  const normalized = chapterId?.trim();
  if (!normalized) return undefined;
  const chapter = getResourceChapterOrThrow(normalized);
  if (chapter.resourceItemId !== resourceItemId) {
    throw new Error('resource chapter does not belong to resource item');
  }
  return chapter.id;
}

function hydrateResourceChapter(chapter: ResourceChapter): ResourceChapter {
  const item = state.resourceItems.find((entry) => entry.id === chapter.resourceItemId);
  return {
    ...chapter,
    resourceItemTitle: item?.title || chapter.resourceItemTitle || '',
  };
}

function hydrateResourceWork(work: ResourceWork): ResourceWork {
  const type = state.resourceTypes.find((item) => item.id === work.typeId);
  return {
    ...work,
    typeName: type?.name || work.typeName || '',
  };
}

function hydrateResourceItem(item: ResourceItem): ResourceItem {
  const type = state.resourceTypes.find((entry) => entry.id === item.typeId);
  const work = state.resourceWorks.find((entry) => entry.id === item.workId);
  return {
    ...item,
    typeName: type?.name || item.typeName || '',
    identityFieldKey: type?.identityFieldKey || item.identityFieldKey || '',
    identityFieldLabel: type?.identityFieldLabel || item.identityFieldLabel || '',
    workId: work?.id || item.workId || '',
    workTitle: work?.title || item.workTitle || '',
    accessUrls: normalizeAccessUrls(item.accessUrls),
  };
}

function normalizeAccessUrls(urls: string[] | undefined | null): string[] {
  if (!urls?.length) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of urls) {
    const url = raw?.trim();
    if (!url || url.length > 1024 || seen.has(url)) continue;
    seen.add(url);
    result.push(url);
    if (result.length >= 50) break;
  }
  return result;
}

function hydrateResourceExcerpt(excerpt: ResourceExcerpt): ResourceExcerpt {
  const item = state.resourceItems.find((entry) => entry.id === excerpt.resourceItemId);
  const chapter = excerpt.chapterId
    ? state.resourceChapters.find((entry) => entry.id === excerpt.chapterId)
    : undefined;
  return {
    ...excerpt,
    resourceItemTitle: item?.title || excerpt.resourceItemTitle || '',
    chapterTitle: chapter?.title || excerpt.chapterTitle || undefined,
  };
}

export function listResourceTypesMock(page = 0, pageSize = 10): {
  items: ResourceType[];
  total: number;
  page: number;
  pageSize: number;
} {
  const all = cloneState(state.resourceTypes);
  const from = page * pageSize;
  const items = from >= all.length ? [] : all.slice(from, from + pageSize);
  return { items, total: all.length, page, pageSize };
}

export function createResourceTypeMock(payload: CreateResourceTypePayload): ResourceType {
  const code = payload.code.trim().toLowerCase();
  if (state.resourceTypes.some((item) => item.code === code)) throw new Error('resource type code already exists');
  if (state.resourceTypes.some((item) => item.name === payload.name.trim())) throw new Error('resource type name already exists');
  const type: ResourceType = {
    id: nextId('rt'),
    code,
    name: payload.name.trim(),
    icon: payload.icon || '',
    description: payload.description || '',
    identityFieldKey: payload.identityFieldKey.trim(),
    identityFieldLabel: payload.identityFieldLabel.trim(),
  };
  state.resourceTypes.push(type);
  persistState();
  return cloneState(type);
}

export function updateResourceTypeMock(id: string, payload: UpdateResourceTypePayload): ResourceType {
  const type = getResourceTypeOrThrow(id);
  Object.assign(type, {
    name: payload.name.trim(),
    icon: payload.icon || '',
    description: payload.description || '',
    identityFieldKey: payload.identityFieldKey.trim(),
    identityFieldLabel: payload.identityFieldLabel.trim(),
  });
  persistState();
  return cloneState(type);
}

export function deleteResourceTypeMock(id: string): void {
  if (state.resourceWorks.some((work) => work.typeId === id) || state.resourceItems.some((item) => item.typeId === id)) {
    throw new Error('resource type is in use');
  }
  state.resourceTypes = state.resourceTypes.filter((item) => item.id !== id);
  persistState();
}

export function listResourceWorksMock(typeId?: string, page = 0, pageSize = 10): {
  items: ResourceWork[];
  total: number;
  page: number;
  pageSize: number;
} {
  const all = cloneState(state.resourceWorks
    .filter((work) => !typeId || work.typeId === typeId)
    .map(hydrateResourceWork));
  const from = page * pageSize;
  const items = from >= all.length ? [] : all.slice(from, from + pageSize);
  return { items, total: all.length, page, pageSize };
}

export function createResourceWorkMock(payload: CreateResourceWorkPayload): ResourceWork {
  const type = getResourceTypeOrThrow(payload.typeId);
  const work: ResourceWork = {
    id: nextId('rw'),
    typeId: type.id,
    typeName: type.name,
    title: payload.title.trim(),
    subtitle: payload.subtitle || '',
    description: payload.description || '',
    clusterKey: payload.clusterKey || null,
    titleSource: payload.titleSource || 'auto',
  };
  state.resourceWorks.push(work);
  persistState();
  return cloneState(work);
}

export function updateResourceWorkMock(id: string, payload: UpdateResourceWorkPayload): ResourceWork {
  const type = getResourceTypeOrThrow(payload.typeId);
  const work = getResourceWorkOrThrow(id);
  Object.assign(work, {
    typeId: type.id,
    typeName: type.name,
    title: payload.title.trim(),
    subtitle: payload.subtitle || '',
    description: payload.description || '',
    clusterKey: payload.clusterKey ?? work.clusterKey ?? null,
    titleSource: payload.titleSource || work.titleSource || 'auto',
  });
  persistState();
  return cloneState(hydrateResourceWork(work));
}

export function deleteResourceWorkMock(id: string): void {
  if (state.resourceItems.some((item) => item.workId === id)) throw new Error('resource work is in use');
  state.resourceWorks = state.resourceWorks.filter((item) => item.id !== id);
  persistState();
}

export function listResourceItemsMock(
  params: { typeId?: string; workId?: string; identityValue?: string } = {},
  page = 0,
  pageSize = 10,
): { items: ResourceItem[]; total: number; page: number; pageSize: number } {
  const filtered = state.resourceItems.filter((item) => (
    (!params.typeId || item.typeId === params.typeId)
    && (!params.workId || item.workId === params.workId)
    && (!params.identityValue || item.identityValue === params.identityValue)
  ));
  const all = cloneState(filtered.map(hydrateResourceItem));
  const from = page * pageSize;
  const items = from >= all.length ? [] : all.slice(from, from + pageSize);
  return { items, total: all.length, page, pageSize };
}

export function getResourceItemMock(id: string): ResourceItem {
  return cloneState(hydrateResourceItem(getResourceItemOrThrow(id)));
}

export function listKbResourceLinksMock(kbId: string): KbResourceLink[] {
  const links = state.kbResourceLinks
    .filter((link) => link.kbId === kbId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
  return cloneState(links.map((link) => hydrateKbResourceLink(link)));
}

export function createKbResourceLinkMock(
  kbId: string,
  payload: CreateKbResourceLinkPayload,
): KbResourceLink {
  const resourceItemId = payload.resourceItemId?.trim() || '';
  if (!resourceItemId) throw new Error('resourceItemId is required');
  if (!state.knowledgeBases.some((kb) => kb.id === kbId)) {
    throw new Error('knowledge base not found');
  }
  const parentPageId = payload.parentPageId?.trim() || null;
  if (parentPageId) {
    const page = state.pages.find((entry) => entry.id === parentPageId);
    if (!page || page.kbId !== kbId) {
      throw new Error('page not found in this knowledge base');
    }
  }
  const item = hydrateResourceItem(getResourceItemOrThrow(resourceItemId));
  const type = getResourceTypeOrThrow(item.typeId);
  if (type.code !== 'document') {
    throw new Error('only document resources can be linked to a knowledge base');
  }
  const existing = state.kbResourceLinks.find(
    (link) => link.kbId === kbId && link.resourceItemId === resourceItemId,
  );
  if (existing) {
    existing.parentPageId = parentPageId;
    persistState();
    return cloneState(hydrateKbResourceLink(existing));
  }
  const maxOrder = Math.max(
    -1,
    ...state.kbResourceLinks.filter((link) => link.kbId === kbId).map((link) => link.sortOrder),
  );
  const link: KbResourceLink = {
    id: nextId('krl'),
    kbId,
    resourceItemId,
    parentPageId,
    sortOrder: maxOrder + 1,
    title: item.title,
    typeId: item.typeId,
    typeCode: type.code,
    typeName: type.name,
    sourceUrl: item.sourceUrl ?? null,
    note: item.note ?? null,
  };
  state.kbResourceLinks.push(link);
  persistState();
  return cloneState(link);
}

export function deleteKbResourceLinkMock(kbId: string, resourceItemId: string): void {
  const before = state.kbResourceLinks.length;
  state.kbResourceLinks = state.kbResourceLinks.filter(
    (link) => !(link.kbId === kbId && link.resourceItemId === resourceItemId),
  );
  if (state.kbResourceLinks.length === before) {
    throw new Error('resource link not found');
  }
  persistState();
}

function normalizeCommentScopeId(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function sameCommentScope(a?: string | null, b?: string | null): boolean {
  return normalizeCommentScopeId(a) === normalizeCommentScopeId(b);
}

function resolveMockCommentAuthor(): { userId: string; displayName: string } {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem('tu.auth.user') : null;
    if (raw) {
      const user = JSON.parse(raw) as { id?: string; displayName?: string | null; username?: string; email?: string };
      if (user?.id) {
        const displayName = user.displayName || user.username || user.email || '用户';
        return { userId: user.id, displayName };
      }
    }
  } catch {
    // fall through
  }
  return {
    userId: 'anonymous',
    displayName: '匿名用户',
  };
}

function recountCommentReplies(commentId: string): number {
  return state.contentComments.filter((item) => item.parentId === commentId).length;
}

function hydrateContentComment(comment: ContentComment): ContentComment {
  return {
    ...comment,
    replyCount: recountCommentReplies(comment.id),
  };
}

function requireMockPage(pageId: string): void {
  if (!state.pages.some((page) => page.id === pageId)) {
    throw new Error('page not found');
  }
}

export function listContentCommentsMock(
  pageId: string,
  params: ListContentCommentsParams = {},
): PageResponse<ContentComment> {
  requireMockPage(pageId);
  const annotationId = normalizeCommentScopeId(params.annotationId);
  const page = Math.max(0, params.page ?? 0);
  const pageSize = Math.max(1, Math.min(params.pageSize ?? DEFAULT_PAGE_SIZE, 200));
  const roots = state.contentComments
    .filter(
      (item) =>
        item.pageId === pageId &&
        !item.parentId &&
        sameCommentScope(item.annotationId, annotationId),
    )
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const from = page * pageSize;
  const items = from >= roots.length ? [] : roots.slice(from, from + pageSize).map(hydrateContentComment);
  return { items: cloneState(items), total: roots.length, page, pageSize };
}

export function listContentCommentRepliesMock(
  pageId: string,
  commentId: string,
  params: ListContentCommentRepliesParams = {},
): PageResponse<ContentComment> {
  requireMockPage(pageId);
  const parent = state.contentComments.find((item) => item.id === commentId);
  if (!parent || parent.pageId !== pageId) {
    throw new Error('comment not found');
  }
  const page = Math.max(0, params.page ?? 0);
  const pageSize = Math.max(1, Math.min(params.pageSize ?? DEFAULT_PAGE_SIZE, 200));
  const replies = state.contentComments
    .filter((item) => item.parentId === commentId)
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  const from = page * pageSize;
  const items = from >= replies.length ? [] : replies.slice(from, from + pageSize).map(hydrateContentComment);
  return { items: cloneState(items), total: replies.length, page, pageSize };
}

export function createContentCommentMock(
  pageId: string,
  payload: CreateContentCommentPayload,
): ContentComment {
  requireMockPage(pageId);
  const body = payload.body?.trim() || '';
  if (!body) throw new Error('body is required');
  const annotationId = normalizeCommentScopeId(payload.annotationId);
  const parentId = normalizeCommentScopeId(payload.parentId);
  if (parentId) {
    const parent = state.contentComments.find((item) => item.id === parentId);
    if (!parent || parent.pageId !== pageId) {
      throw new Error('parent comment not found');
    }
    if (!sameCommentScope(parent.annotationId, annotationId)) {
      throw new Error('parent comment annotation scope mismatch');
    }
  }
  const author = resolveMockCommentAuthor();
  const now = new Date().toISOString();
  const comment: ContentComment = {
    id: nextId('cmt'),
    pageId,
    annotationId,
    parentId,
    authorUserId: author.userId,
    authorDisplayName: author.displayName,
    body,
    createdAt: now,
    updatedAt: now,
    replyCount: 0,
  };
  state.contentComments.push(comment);
  persistState();
  return cloneState(hydrateContentComment(comment));
}

export function deleteContentCommentMock(pageId: string, commentId: string): void {
  requireMockPage(pageId);
  const target = state.contentComments.find((item) => item.id === commentId);
  if (!target || target.pageId !== pageId) {
    throw new Error('comment not found');
  }
  const author = resolveMockCommentAuthor();
  if (target.authorUserId !== author.userId) {
    throw new Error('only the author can delete this comment');
  }
  const toDelete = new Set<string>();
  const queue = [commentId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    toDelete.add(id);
    for (const child of state.contentComments) {
      if (child.parentId === id && !toDelete.has(child.id)) {
        queue.push(child.id);
      }
    }
  }
  state.contentComments = state.contentComments.filter((item) => !toDelete.has(item.id));
  persistState();
}


function hydrateKbResourceLink(link: KbResourceLink): KbResourceLink {
  const item = state.resourceItems.find((entry) => entry.id === link.resourceItemId);
  if (!item) return link;
  const type = state.resourceTypes.find((entry) => entry.id === item.typeId);
  return {
    ...link,
    title: item.title,
    typeId: item.typeId,
    typeCode: type?.code ?? link.typeCode,
    typeName: type?.name ?? link.typeName,
    sourceUrl: item.sourceUrl ?? null,
    note: item.note ?? null,
  };
}

export function createResourceItemMock(payload: CreateResourceItemPayload): ResourceItem {
  const type = getResourceTypeOrThrow(payload.typeId);
  const work = payload.workId ? getResourceWorkOrThrow(payload.workId) : null;
  if (work && work.typeId !== type.id) throw new Error('resource work does not belong to resource type');
  const identityValue = payload.identityValue?.trim() || '';
  if (identityValue && state.resourceItems.some((item) => item.typeId === type.id && item.identityValue === identityValue)) {
    throw new Error('resource item identity already exists');
  }
  const item: ResourceItem = {
    id: nextId('ri'),
    typeId: type.id,
    typeName: type.name,
    identityFieldKey: type.identityFieldKey,
    identityFieldLabel: type.identityFieldLabel,
    workId: work?.id || '',
    workTitle: work?.title || '',
    title: payload.title.trim(),
    identityValue,
    sourceUrl: payload.sourceUrl || '',
    accessUrls: normalizeAccessUrls(payload.accessUrls),
    edition: payload.edition || '',
    note: payload.note || '',
    titleSource: payload.titleSource || 'auto',
    workIdSource: payload.workIdSource || 'auto',
    variantKind: payload.variantKind,
  };
  state.resourceItems.push(item);
  persistState();
  return cloneState(item);
}

export function updateResourceItemMock(id: string, payload: UpdateResourceItemPayload): ResourceItem {
  const type = getResourceTypeOrThrow(payload.typeId);
  const work = payload.workId ? getResourceWorkOrThrow(payload.workId) : null;
  if (work && work.typeId !== type.id) throw new Error('resource work does not belong to resource type');
  const identityValue = payload.identityValue?.trim() || '';
  const item = getResourceItemOrThrow(id);
  Object.assign(item, {
    typeId: type.id,
    typeName: type.name,
    identityFieldKey: type.identityFieldKey,
    identityFieldLabel: type.identityFieldLabel,
    workId: work?.id || '',
    workTitle: work?.title || '',
    title: payload.title.trim(),
    identityValue,
    sourceUrl: payload.sourceUrl || '',
    accessUrls: normalizeAccessUrls(payload.accessUrls),
    edition: payload.edition || '',
    note: payload.note || '',
    titleSource: payload.titleSource || item.titleSource || 'auto',
    workIdSource: payload.workIdSource || item.workIdSource || 'auto',
    variantKind: payload.variantKind ?? item.variantKind,
  });
  state.resourceExcerpts
    .filter((excerpt) => excerpt.resourceItemId === id)
    .forEach((excerpt) => { excerpt.resourceItemTitle = item.title; });
  persistState();
  return cloneState(hydrateResourceItem(item));
}

export function removeResourceItemMock(id: string): void {
  state.resourceItems = state.resourceItems.filter((item) => item.id !== id);
  state.resourceChapters = state.resourceChapters.filter((chapter) => chapter.resourceItemId !== id);
  state.resourceExcerpts = state.resourceExcerpts.filter((excerpt) => excerpt.resourceItemId !== id);
  state.resourcePdfRegionNotes = state.resourcePdfRegionNotes.filter((note) => note.resourceItemId !== id);
  state.resourceItemRelations = state.resourceItemRelations.filter(
    (relation) => relation.fromItemId !== id && relation.toItemId !== id,
  );
  persistState();
}

function normalizeExcerptLocatorKey(locator?: string | null): string {
  return normalizeResourcePositionLocatorKey(locator);
}

function getLinkTitle(label: string, url: string): string {
  const title = label.trim();
  if (title) return title.slice(0, 255);
  try {
    return new URL(url).hostname.slice(0, 255) || url.slice(0, 255);
  } catch {
    return url.slice(0, 255);
  }
}

function resolveWebLinkWork(typeId: string, pageUrl: string, title: string): ResourceWork {
  const cluster = matchUrlCluster(pageUrl, state.urlClusterRules);
  if (cluster) {
    const existing = findWorkByClusterKey(state.resourceWorks, typeId, cluster.clusterKey);
    if (existing) {
      const work = getResourceWorkOrThrow(existing.id);
      if (work.titleSource !== 'manual' && title && title !== work.title) {
        work.title = title;
      }
      return work;
    }
    const work: ResourceWork = {
      id: nextId('rw'),
      typeId,
      typeName: getResourceTypeOrThrow(typeId).name,
      title,
      subtitle: '',
      description: `URL 聚类：${cluster.clusterKey}`,
      clusterKey: cluster.clusterKey,
      titleSource: 'auto',
    };
    state.resourceWorks.push(work);
    return work;
  }

  const work: ResourceWork = {
    id: nextId('rw'),
    typeId,
    typeName: getResourceTypeOrThrow(typeId).name,
    title,
    subtitle: '',
    description: `待归并：${pageUrl}`,
    clusterKey: `single|${pageUrl}`,
    titleSource: 'auto',
  };
  state.resourceWorks.push(work);
  return work;
}

function ensureWebLinkResourceTypeMock(): ResourceType {
  let type = state.resourceTypes.find((entry) => entry.code === 'web-link');
  if (type) return type;

  type = {
    id: 'rt-web-link',
    code: 'web-link',
    name: '网络链接',
    icon: 'link',
    description: '由插入链接功能自动登记的外部网络链接',
    identityFieldKey: 'sourceUrl',
    identityFieldLabel: '源 URL',
  };
  state.resourceTypes.push(type);
  return type;
}

export function registerResourceUrlFromPasteMock(
  url: string,
  options: { label?: string; excerptText?: string } = {},
): RegisterExternalUrlResult {
  const parsed = parseExternalUrl(url);
  if (!parsed) throw new Error('invalid resource URL');

  const linkType = ensureWebLinkResourceTypeMock();

  let item = state.resourceItems.find(
    (entry) => entry.typeId === linkType.id && (entry.identityValue === parsed.baseUrl || entry.identityValue === parsed.href),
  );
  let createdItem = false;

  if (!item) {
    const title = getLinkTitle(options.label ?? '', parsed.baseUrl);
    const work = resolveWebLinkWork(linkType.id, parsed.baseUrl, title);
    const cluster = matchUrlCluster(parsed.baseUrl, state.urlClusterRules);
    item = {
      id: nextId('ri'),
      typeId: linkType.id,
      typeName: linkType.name,
      identityFieldKey: linkType.identityFieldKey,
      identityFieldLabel: linkType.identityFieldLabel,
      workId: work.id,
      workTitle: work.title,
      title,
      identityValue: parsed.baseUrl,
      sourceUrl: parsed.baseUrl,
      edition: cluster?.variantHint || '',
      note: '由粘贴/插入链接自动登记',
      titleSource: 'auto',
      workIdSource: 'auto',
      variantKind: cluster?.variantHint ? 'other' : undefined,
    };
    state.resourceItems.push(item);
    createdItem = true;
  } else if (item.titleSource !== 'manual') {
    item.title = getLinkTitle(options.label ?? '', parsed.baseUrl);
    if (item.identityValue !== parsed.baseUrl) {
      item.identityValue = parsed.baseUrl;
      item.sourceUrl = parsed.baseUrl;
    }
  }

  if (parsed.mode === 'resource') {
    persistState();
    return {
      mode: 'resource',
      item: cloneState(hydrateResourceItem(item)),
      createdItem,
      createdExcerpt: false,
    };
  }

  const anchorKey = parsed.anchor!.trim();
  const locator = formatExcerptLocator(anchorKey);
  let excerpt = state.resourceExcerpts.find(
    (entry) => entry.resourceItemId === item!.id && normalizeExcerptLocatorKey(entry.locator) === anchorKey,
  );
  let createdExcerpt = false;
  const excerptBody = options.excerptText?.trim() || undefined;

  if (!excerpt) {
    excerpt = {
      id: nextId('re'),
      resourceItemId: item!.id,
      resourceItemTitle: item!.title,
      title: buildExcerptTitle(anchorKey, options.label),
      locator,
      excerptText: excerptBody,
      note: '由粘贴/插入带锚点的链接自动创建',
      sortOrder: state.resourceExcerpts.filter((entry) => entry.resourceItemId === item!.id).length,
    };
    state.resourceExcerpts.push(excerpt);
    createdExcerpt = true;
  } else if (excerptBody) {
    excerpt.excerptText = excerptBody;
  }

  persistState();
  return {
    mode: 'excerpt',
    item: cloneState(hydrateResourceItem(item!)),
    excerpt: excerpt ? cloneState(hydrateResourceExcerpt(excerpt)) : undefined,
    createdItem,
    createdExcerpt,
  };
}

export function mergeResourceWorksMock(sourceWorkId: string, targetWorkId: string): ResourceWork {
  if (sourceWorkId === targetWorkId) throw new Error('cannot merge a work into itself');
  const source = getResourceWorkOrThrow(sourceWorkId);
  const target = getResourceWorkOrThrow(targetWorkId);
  if (source.typeId !== target.typeId) throw new Error('resource works must share the same type');
  state.resourceItems
    .filter((item) => item.workId === sourceWorkId)
    .forEach((item) => {
      item.workId = targetWorkId;
      item.workTitle = target.title;
      item.workIdSource = 'manual';
    });
  state.resourceWorks = state.resourceWorks.filter((work) => work.id !== sourceWorkId);
  persistState();
  return cloneState(hydrateResourceWork(target));
}

export function splitResourceItemWorkMock(itemId: string): ResourceItem {
  const item = getResourceItemOrThrow(itemId);
  const type = getResourceTypeOrThrow(item.typeId);
  const work: ResourceWork = {
    id: nextId('rw'),
    typeId: type.id,
    typeName: type.name,
    title: item.title,
    subtitle: '',
    description: '由资源实体拆分创建',
    clusterKey: `single|${item.identityValue || item.id}`,
    titleSource: 'manual',
  };
  state.resourceWorks.push(work);
  item.workId = work.id;
  item.workTitle = work.title;
  item.workIdSource = 'manual';
  persistState();
  return cloneState(hydrateResourceItem(item));
}

export function resetResourceItemAutoMock(itemId: string): ResourceItem {
  const item = getResourceItemOrThrow(itemId);
  item.titleSource = 'auto';
  item.workIdSource = 'auto';
  if (item.identityValue) {
    const work = resolveWebLinkWork(item.typeId, item.identityValue, item.title);
    item.workId = work.id;
    item.workTitle = work.title;
    const cluster = matchUrlCluster(item.identityValue, state.urlClusterRules);
    if (cluster?.variantHint) {
      item.edition = cluster.variantHint;
      item.variantKind = 'other';
    }
  }
  persistState();
  return cloneState(hydrateResourceItem(item));
}

export function listUrlClusterRulesMock(page = 0, pageSize = 10): {
  items: UrlClusterRule[];
  total: number;
  page: number;
  pageSize: number;
} {
  const all = cloneState(state.urlClusterRules);
  const from = page * pageSize;
  const items = from >= all.length ? [] : all.slice(from, from + pageSize);
  return { items, total: all.length, page, pageSize };
}

export function createUrlClusterRuleMock(payload: CreateUrlClusterRulePayload): UrlClusterRule {
  const rule: UrlClusterRule = {
    id: nextId('ucr'),
    domain: payload.domain.trim().toLowerCase(),
    pathRegex: payload.pathRegex.trim(),
    clusterKeyFormat: payload.clusterKeyFormat.trim(),
    variantGroup: payload.variantGroup ?? null,
    priority: payload.priority,
    enabled: payload.enabled ?? true,
    builtIn: false,
    description: payload.description || '',
  };
  state.urlClusterRules.push(rule);
  persistState();
  return cloneState(rule);
}

export function updateUrlClusterRuleMock(id: string, payload: UpdateUrlClusterRulePayload): UrlClusterRule {
  const rule = state.urlClusterRules.find((entry) => entry.id === id);
  if (!rule) throw new Error('url cluster rule not found');
  Object.assign(rule, {
    domain: payload.domain.trim().toLowerCase(),
    pathRegex: payload.pathRegex.trim(),
    clusterKeyFormat: payload.clusterKeyFormat.trim(),
    variantGroup: payload.variantGroup ?? null,
    priority: payload.priority,
    enabled: payload.enabled,
    description: payload.description || '',
  });
  persistState();
  return cloneState(rule);
}

export function deleteUrlClusterRuleMock(id: string): void {
  const rule = state.urlClusterRules.find((entry) => entry.id === id);
  if (!rule) throw new Error('url cluster rule not found');
  if (rule.builtIn) throw new Error('built-in url cluster rule cannot be deleted');
  state.urlClusterRules = state.urlClusterRules.filter((entry) => entry.id !== id);
  persistState();
}

export function listResourceItemRelationsMock(itemId: string): ResourceItemRelation[] {
  getResourceItemOrThrow(itemId);
  return cloneState(
    state.resourceItemRelations
      .filter((relation) => relation.fromItemId === itemId || relation.toItemId === itemId)
      .map((relation) => hydrateResourceItemRelation(relation)),
  );
}

export function createResourceItemRelationMock(payload: {
  fromItemId: string;
  toItemId: string;
  relationType: string;
  note?: string;
}): ResourceItemRelation {
  if (payload.fromItemId === payload.toItemId) throw new Error('cannot relate an item to itself');
  const from = getResourceItemOrThrow(payload.fromItemId);
  const to = getResourceItemOrThrow(payload.toItemId);
  if (from.typeId !== to.typeId) throw new Error('related items must share the same resource type');
  const relation: ResourceItemRelation = {
    id: nextId('rir'),
    fromItemId: from.id,
    fromItemTitle: from.title,
    toItemId: to.id,
    toItemTitle: to.title,
    relationType: payload.relationType.trim().toLowerCase(),
    note: payload.note || '',
  };
  state.resourceItemRelations.push(relation);
  persistState();
  return cloneState(relation);
}

export function deleteResourceItemRelationMock(id: string): void {
  state.resourceItemRelations = state.resourceItemRelations.filter((relation) => relation.id !== id);
  persistState();
}

function hydrateResourceItemRelation(relation: ResourceItemRelation): ResourceItemRelation {
  const from = state.resourceItems.find((item) => item.id === relation.fromItemId);
  const to = state.resourceItems.find((item) => item.id === relation.toItemId);
  return {
    ...relation,
    fromItemTitle: from?.title || relation.fromItemTitle,
    toItemTitle: to?.title || relation.toItemTitle,
  };
}

export function listResourceChaptersMock(resourceItemId: string): ResourceChapter[] {
  const item = getResourceItemOrThrow(resourceItemId);
  ensureBookResourceItem(item);
  return cloneState(state.resourceChapters
    .filter((chapter) => chapter.resourceItemId === resourceItemId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title))
    .map(hydrateResourceChapter));
}

export function createResourceChapterMock(
  resourceItemId: string,
  payload: CreateResourceChapterPayload,
): ResourceChapter {
  const item = getResourceItemOrThrow(resourceItemId);
  ensureBookResourceItem(item);
  const parentId = payload.parentId?.trim() || null;
  validateChapterParent(resourceItemId, parentId);
  const siblings = state.resourceChapters.filter(
    (chapter) => chapter.resourceItemId === resourceItemId && (chapter.parentId ?? null) === parentId,
  );
  const maxOrder = Math.max(-1, ...siblings.map((chapter) => chapter.sortOrder));
  const chapter: ResourceChapter = {
    id: nextId('rc'),
    resourceItemId,
    resourceItemTitle: item.title,
    parentId,
    title: payload.title.trim(),
    locator: payload.locator?.trim() || undefined,
    note: payload.note?.trim() || undefined,
    sortOrder: payload.sortOrder ?? maxOrder + 1,
  };
  state.resourceChapters.push(chapter);
  persistState();
  return cloneState(hydrateResourceChapter(chapter));
}

export function updateResourceChapterMock(id: string, payload: UpdateResourceChapterPayload): ResourceChapter {
  const chapter = getResourceChapterOrThrow(id);
  const item = getResourceItemOrThrow(chapter.resourceItemId);
  ensureBookResourceItem(item);
  const parentId = payload.parentId?.trim() || null;
  validateChapterParent(chapter.resourceItemId, parentId, chapter.id);
  Object.assign(chapter, {
    parentId,
    title: payload.title.trim(),
    locator: payload.locator?.trim() || undefined,
    note: payload.note?.trim() || undefined,
    sortOrder: payload.sortOrder ?? chapter.sortOrder,
    resourceItemTitle: item.title,
  });
  state.resourceExcerpts
    .filter((excerpt) => excerpt.chapterId === chapter.id)
    .forEach((excerpt) => { excerpt.chapterTitle = chapter.title; });
  persistState();
  return cloneState(hydrateResourceChapter(chapter));
}

export function deleteResourceChapterMock(id: string): void {
  const chapter = getResourceChapterOrThrow(id);
  const item = getResourceItemOrThrow(chapter.resourceItemId);
  ensureBookResourceItem(item);
  const chapterIds = new Set(collectChapterDescendantIds(chapter.resourceItemId, chapter.id));
  state.resourceExcerpts.forEach((excerpt) => {
    if (excerpt.chapterId && chapterIds.has(excerpt.chapterId)) {
      excerpt.chapterId = undefined;
      excerpt.chapterTitle = undefined;
    }
  });
  state.resourceChapters = state.resourceChapters.filter((entry) => !chapterIds.has(entry.id));
  persistState();
}

export function listResourceExcerptsMock(
  resourceItemId: string,
  page = 0,
  pageSize = 10,
): { items: ResourceExcerpt[]; total: number; page: number; pageSize: number } {
  const item = getResourceItemOrThrow(resourceItemId);
  ensureExcerptSupportedResourceItem(item);
  const all = cloneState(state.resourceExcerpts
    .filter((excerpt) => excerpt.resourceItemId === resourceItemId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title))
    .map(hydrateResourceExcerpt));
  const from = page * pageSize;
  const items = from >= all.length ? [] : all.slice(from, from + pageSize);
  return { items, total: all.length, page, pageSize };
}

export function createResourceExcerptMock(resourceItemId: string, payload: CreateResourceExcerptPayload): ResourceExcerpt {
  const item = getResourceItemOrThrow(resourceItemId);
  ensureExcerptSupportedResourceItem(item);
  const parentId = payload.parentId?.trim() || null;
  validateExcerptParent(resourceItemId, parentId);
  const maxOrder = Math.max(-1, ...state.resourceExcerpts
    .filter((excerpt) => excerpt.resourceItemId === resourceItemId)
    .map((excerpt) => excerpt.sortOrder));
  const chapterId = resolveChapterForExcerpt(resourceItemId, payload.chapterId);
  const chapter = chapterId ? getResourceChapterOrThrow(chapterId) : undefined;
  const excerpt: ResourceExcerpt = {
    id: nextId('re'),
    resourceItemId,
    resourceItemTitle: item.title,
    title: payload.title.trim(),
    chapterId,
    chapterTitle: chapter?.title,
    parentId,
    locator: normalizeResourcePositionLocator(payload.locator) || undefined,
    excerptText: payload.excerptText?.trim() || undefined,
    note: payload.note || '',
    sortOrder: payload.sortOrder ?? maxOrder + 1,
    metadata: payload.metadata,
  };
  state.resourceExcerpts.push(excerpt);
  persistState();
  return cloneState(excerpt);
}

export function getResourceExcerptMock(id: string): ResourceExcerpt {
  return cloneState(hydrateResourceExcerpt(getResourceExcerptOrThrow(id)));
}

export function updateResourceExcerptMock(id: string, payload: UpdateResourceExcerptPayload): ResourceExcerpt {
  const excerpt = getResourceExcerptOrThrow(id);
  const item = getResourceItemOrThrow(excerpt.resourceItemId);
  ensureExcerptSupportedResourceItem(item);
  const parentId = payload.parentId?.trim() || null;
  validateExcerptParent(excerpt.resourceItemId, parentId, excerpt.id);
  const chapterId = resolveChapterForExcerpt(excerpt.resourceItemId, payload.chapterId);
  const chapter = chapterId ? getResourceChapterOrThrow(chapterId) : undefined;
  Object.assign(excerpt, {
    title: payload.title.trim(),
    chapterId,
    chapterTitle: chapter?.title,
    parentId,
    locator: normalizeResourcePositionLocator(payload.locator) || undefined,
    excerptText: payload.excerptText?.trim() || undefined,
    note: payload.note || '',
    sortOrder: payload.sortOrder ?? excerpt.sortOrder,
  });
  persistState();
  return cloneState(hydrateResourceExcerpt(excerpt));
}

export function deleteResourceExcerptMock(id: string): void {
  const excerpt = getResourceExcerptOrThrow(id);
  const parentId = excerpt.parentId ?? null;
  state.resourceExcerpts.forEach((child) => {
    if (child.parentId === id) {
      child.parentId = parentId;
    }
  });
  state.resourceExcerpts = state.resourceExcerpts.filter((entry) => entry.id !== id);
  persistState();
}

function clampClipRatio(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function listResourcePdfRegionNotesMock(resourceItemId: string): ResourcePdfRegionNote[] {
  getResourceItemOrThrow(resourceItemId);
  return cloneState(
    state.resourcePdfRegionNotes
      .filter((note) => note.resourceItemId === resourceItemId)
      .sort((a, b) => a.startPage - b.startPage || String(a.createdAt).localeCompare(String(b.createdAt))),
  );
}

export function createResourcePdfRegionNoteMock(
  resourceItemId: string,
  payload: CreateResourcePdfRegionNotePayload,
): ResourcePdfRegionNote {
  getResourceItemOrThrow(resourceItemId);
  const startPage = Math.max(1, Math.floor(payload.startPage) || 1);
  const endPage = Math.max(startPage, Math.floor(payload.endPage) || startPage);
  const clipTop = clampClipRatio(payload.clipTop);
  const clipBottom = clampClipRatio(payload.clipBottom);
  if (startPage === endPage && clipBottom < clipTop) {
    throw new Error('clipBottom must be >= clipTop on the same page');
  }
  const now = new Date().toISOString();
  const note: ResourcePdfRegionNote = {
    id: nextId('rpn'),
    resourceItemId,
    fileId: payload.fileId?.trim() || null,
    startPage,
    endPage,
    clipTop,
    clipBottom,
    note: payload.note.trim(),
    color: payload.color?.trim() || null,
    createdAt: now,
    updatedAt: now,
  };
  state.resourcePdfRegionNotes.push(note);
  persistState();
  return cloneState(note);
}

export function updateResourcePdfRegionNoteMock(
  noteId: string,
  payload: UpdateResourcePdfRegionNotePayload,
): ResourcePdfRegionNote {
  const note = state.resourcePdfRegionNotes.find((entry) => entry.id === noteId);
  if (!note) throw new Error(`resource pdf region note not found: ${noteId}`);
  if (payload.startPage != null) note.startPage = Math.max(1, Math.floor(payload.startPage) || 1);
  if (payload.endPage != null) note.endPage = Math.max(note.startPage, Math.floor(payload.endPage) || note.startPage);
  note.endPage = Math.max(note.startPage, note.endPage);
  if (payload.clipTop != null) note.clipTop = clampClipRatio(payload.clipTop);
  if (payload.clipBottom != null) note.clipBottom = clampClipRatio(payload.clipBottom);
  if (note.startPage === note.endPage && note.clipBottom < note.clipTop) {
    throw new Error('clipBottom must be >= clipTop on the same page');
  }
  if (payload.note != null) {
    const text = payload.note.trim();
    if (!text) throw new Error('note must not be blank');
    note.note = text;
  }
  if (payload.fileId !== undefined) note.fileId = payload.fileId?.trim() || null;
  if (payload.color !== undefined) note.color = payload.color?.trim() || null;
  note.updatedAt = new Date().toISOString();
  persistState();
  return cloneState(note);
}

export function deleteResourcePdfRegionNoteMock(noteId: string): void {
  const before = state.resourcePdfRegionNotes.length;
  state.resourcePdfRegionNotes = state.resourcePdfRegionNotes.filter((entry) => entry.id !== noteId);
  if (state.resourcePdfRegionNotes.length === before) {
    throw new Error(`resource pdf region note not found: ${noteId}`);
  }
  persistState();
}

function firstText(...values: Array<string | undefined>): string | null {
  for (const value of values) {
    if (value && value.trim()) return value.trim();
  }
  return null;
}

function sortPages(pages: Array<Omit<PageItem, 'children'>>): Array<Omit<PageItem, 'children'>> {
  return [...pages].sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}

function buildPageTree(kbId: string): PageItem[] {
  const pages = sortPages(state.pages.filter((page) => page.kbId === kbId));
  const byParent = new Map<string | null, Array<Omit<PageItem, 'children'>>>();

  for (const page of pages) {
    const siblings = byParent.get(page.parentId) ?? [];
    siblings.push(page);
    byParent.set(page.parentId, siblings);
  }

  const build = (parentId: string | null): PageItem[] => {
    const siblings = byParent.get(parentId) ?? [];
    return siblings.map((page) => ({
      ...page,
      children: build(page.id),
    }));
  };

  return build(null);
}

function collectPageIds(pageId: string): string[] {
  const result = [pageId];
  const children = state.pages.filter((page) => page.parentId === pageId);
  for (const child of children) {
    result.push(...collectPageIds(child.id));
  }
  return result;
}

function getPageOrThrow(pageId: string): Omit<PageItem, 'children'> {
  const page = state.pages.find((item) => item.id === pageId);
  if (!page) {
    throw new Error(`Page not found: ${pageId}`);
  }
  return page;
}

function updateEmbedInPage(
  pageId: string,
  blockId: string,
  updater: (embed: EmbeddedObject) => void,
): boolean {
  const pageContent = state.contents[pageId];
  if (!pageContent) return false;
  let updated = false;

  for (const embed of pageContent.embeds) {
    if (embed.id === blockId) {
      updater(embed);
      updated = true;
      break
    }
  }

  if (updated) {
    state.contents[pageId] = cloneState(pageContent);
    persistState();
  }

  return updated;
}

export function resetMockState(): void {
  state = cloneState(initialState);
  persistState();
}

export function listKnowledgeBasesMock(): KnowledgeBase[] {
  return cloneState(state.knowledgeBases);
}

export function createKnowledgeBaseMock(name: string): KnowledgeBase {
  const kb: KnowledgeBase = {
    id: nextId('kb'),
    name,
    icon: '🧪',
    description: '本地 mock 新建知识库',
  };
  state.knowledgeBases.push(kb);
  persistState();
  return cloneState(kb);
}

function convertUnknownRoadmapNode(value: unknown): RoadmapNode {
  if (!value || typeof value !== 'object') {
    throw new Error('Roadmap node must be an object.');
  }
  return value as RoadmapNode;
}

function resolveRoadmapRoots(payload: ImportRoadmapPayload): RoadmapNode[] {
  if (payload.root) return [payload.root];
  if (payload.pages?.length) return payload.pages;
  if (Array.isArray(payload.roadmap)) return payload.roadmap.map(convertUnknownRoadmapNode);
  if (payload.roadmap) return [convertUnknownRoadmapNode(payload.roadmap)];
  throw new Error('Roadmap JSON is required.');
}

function countRoadmapNodes(nodes: RoadmapNode[]): number {
  return nodes.reduce((total, node) => total + 1 + countRoadmapNodes(node.children ?? []), 0);
}

function createRoadmapPageMock(kbId: string, parentId: string | null, node: RoadmapNode, order: number): PageItem {
  const title = firstText(node.title, node.name);
  if (!title) {
    throw new Error('Roadmap node title is required.');
  }

  const page: Omit<PageItem, 'children'> = {
    id: nextId('p'),
    kbId,
    parentId,
    title: title.slice(0, 128),
    order,
  };
  state.pages.push(page);

  const body = firstText(node.content, node.description);
  state.contents[page.id] = {
    content: `# ${page.title}${body ? `\n\n${body}` : ''}`,
    embeds: [],
    annotations: [],
  };

  (node.children ?? []).forEach((child, index) => createRoadmapPageMock(kbId, page.id, child, index));
  return { ...cloneState(page), children: [] };
}

export function importRoadmapMock(payload: ImportRoadmapPayload): ImportRoadmapResult {
  const roots = resolveRoadmapRoots(payload);
  const pageCount = countRoadmapNodes(roots);
  if (pageCount === 0) {
    throw new Error('Roadmap contains no pages.');
  }
  if (pageCount > 500) {
    throw new Error('Roadmap page count exceeds 500.');
  }

  const kbName = firstText(payload.name, roots.length === 1 ? firstText(roots[0].title, roots[0].name) ?? undefined : undefined)
    ?? `Roadmap ${Date.now()}`;
  const kb: KnowledgeBase = {
    id: nextId('kb'),
    name: kbName,
    icon: payload.icon || '📚',
    description: payload.description,
  };
  state.knowledgeBases.push(kb);

  roots.forEach((root, index) => createRoadmapPageMock(kb.id, null, root, index));
  persistState();

  return {
    knowledgeBase: cloneState(kb),
    pages: cloneState(buildPageTree(kb.id)),
    pageCount,
  };
}

export function deleteKnowledgeBaseMock(id: string): void {
  const pageIds = state.pages.filter((page) => page.kbId === id).map((page) => page.id);
  state.knowledgeBases = state.knowledgeBases.filter((kb) => kb.id !== id);
  state.pages = state.pages.filter((page) => page.kbId !== id);
  for (const pageId of pageIds) {
    delete state.contents[pageId];
  }
  persistState();
}

export function renameKnowledgeBaseMock(id: string, name: string): KnowledgeBase {
  const kb = state.knowledgeBases.find((item) => item.id === id);
  if (!kb) {
    throw new Error(`Knowledge base not found: ${id}`);
  }
  kb.name = name;
  persistState();
  return cloneState(kb);
}

export function getPageTreeMock(kbId: string): PageItem[] {
  return cloneState(buildPageTree(kbId));
}

export function getPageContentMock(pageId: string): PageContent {
  getPageOrThrow(pageId);
  return cloneState(state.contents[pageId] ?? { content: '', embeds: [], annotations: [] });
}

export function savePageContentMock(pageId: string, content: PageContent): void {
  getPageOrThrow(pageId);
  state.contents[pageId] = cloneState(content);
  persistState();
}

export function createPageMock(
  kbId: string,
  parentId: string | null,
  title: string,
  pageType?: PageItem['pageType'],
): PageItem {
  const siblings = state.pages.filter((page) => page.kbId === kbId && page.parentId === parentId);
  const normalizedPageType = pageType === 'mindmap'
    ? 'mindmap'
    : pageType === 'x6board'
      ? 'x6board'
      : 'document';
  const page: Omit<PageItem, 'children'> = {
    id: nextId('p'),
    kbId,
    parentId,
    title,
    order: siblings.length,
    pageType: normalizedPageType,
  };
  state.pages.push(page);
  const initialContent = createInitialPageContent(normalizedPageType, title);
  state.contents[page.id] = initialContent
    ? cloneState(initialContent)
    : { content: '', embeds: [], annotations: [] };
  persistState();
  return { ...cloneState(page), children: [] };
}

export function deletePageMock(id: string): void {
  const pageIds = collectPageIds(id);
  state.pages = state.pages.filter((page) => !pageIds.includes(page.id));
  for (const pageId of pageIds) {
    delete state.contents[pageId];
  }
  persistState();
}

export function movePageMock(
  id: string,
  newParentId: string | null,
  newOrder: number,
): void {
  const page = getPageOrThrow(id);
  page.parentId = newParentId;
  page.order = Math.max(0, newOrder);
  persistState();
}

export function renamePageMock(id: string, title: string): void {
  const page = getPageOrThrow(id);
  page.title = title;
  persistState();
}

export function listAllBlocksMock(): BlockWithMeta[] {
  const items: BlockWithMeta[] = [];

  for (const page of state.pages) {
    const pc = state.contents[page.id];
    if (!pc) continue;
    for (const embed of pc.embeds) {
      if (embed.type === 'ref' || embed.type === 'spacer') continue;
      const block: Block = {
        id: embed.id,
        type: embed.type,
        title: embed.title,
        graphData: embed.graphData,
        tableData: embed.tableData,
        multiTableData: embed.multiTableData,
        timelineData: embed.timelineData,
        refId: embed.refId,
        refType: embed.refType,
        externalResource: embed.externalResource,
        spacerHeight: embed.spacerHeight,
        width: embed.width,
        height: embed.height,
        metadata: embed.metadata,
      }
      items.push({ block, pageId: page.id, pageTitle: page.title });
    }
  }

  return items;
}

export function updateBlockContentMock(pageId: string, blockId: string, _content: string): void {
  const updated = updateEmbedInPage(pageId, blockId, (embed) => {
    if (embed.type === 'x6') embed.graphData = undefined
  });

  if (!updated) {
    throw new Error(`Block not found: ${blockId}`);
  }
}

export function updateBlockGraphDataMock(pageId: string, blockId: string, graphData: Block['graphData']): void {
  const updated = updateEmbedInPage(pageId, blockId, (embed) => {
    if (embed.type === 'x6') embed.graphData = cloneState(graphData) as EmbeddedObject['graphData'];
  });

  if (!updated) {
    throw new Error(`Block not found: ${blockId}`);
  }
}

export function updateBlockMock(pageId: string, blockId: string, nextBlock: Block): void {
  const updated = updateEmbedInPage(pageId, blockId, (embed) => {
    if (nextBlock.graphData) embed.graphData = cloneState(nextBlock.graphData) as EmbeddedObject['graphData'];
    if (nextBlock.tableData) embed.tableData = cloneState(nextBlock.tableData);
    if (nextBlock.multiTableData) embed.multiTableData = cloneState(nextBlock.multiTableData) as EmbeddedObject['multiTableData'];
    if (nextBlock.content) embed.type = 'x6';
  });

  if (!updated) {
    throw new Error(`Block not found: ${blockId}`);
  }
}

/** @deprecated Use savePageContentMock directly */
export function syncBlocksMock(pageId: string, _blocks: Block[]): void {
  const pc = getPageContentMock(pageId);
  savePageContentMock(pageId, pc);
}

export function deleteAnnotationReferenceMock(pageId: string, _blockId: string, annotationId: string): void {
  const pc = state.contents[pageId];
  if (!pc) throw new Error(`Page not found: ${pageId}`);
  const filtered = pc.annotations.filter((a) => a.id !== annotationId);
  if (filtered.length === pc.annotations.length) throw new Error(`Annotation not found: ${annotationId}`);
  pc.annotations = filtered;
  persistState();
}

function findPageTitle(pageId: string): string {
  const page = state.pages.find((p) => p.id === pageId);
  return page?.title || pageId;
}

export function listReferencesMock(params: ListReferencesParams = {}): ListReferencesResult {
  const results: ReferenceItem[] = [];

  const targetPages = params.pageId
    ? [params.pageId]
    : Object.keys(state.contents);

  for (const pageId of targetPages) {
    const pc = state.contents[pageId];
    if (!pc) continue;
    const pageTitle = findPageTitle(pageId);

    for (const embed of (pc.embeds || [])) {
      if (embed.type !== 'externalResource' || !embed.externalResource?.resourceItemId) continue;
      const data = embed.externalResource;
      const item = state.resourceItems.find((entry) => entry.id === data.resourceItemId);
      const excerpt = data.resourceExcerptId
        ? state.resourceExcerpts.find((entry) => entry.id === data.resourceExcerptId)
        : undefined;
      const snapshot = data.snapshot || { resourceTitle: '' };
      const status = item && (!data.resourceExcerptId || excerpt) ? 'bound' : 'broken';
      const haystack = [
        item?.title,
        excerpt?.title,
        excerpt?.excerptText,
        snapshot.resourceTitle,
        snapshot.excerptTitle,
        snapshot.excerptText,
      ].filter(Boolean).join(' ').toLowerCase();
      if (params.q && !haystack.includes(params.q.toLowerCase())) continue;
      if (params.resourceItemId && params.resourceItemId !== data.resourceItemId) continue;

      results.push({
        id: `mock-extres-${pageId}-${embed.id}`,
        category: 'external',
        editable: false,
        source: {
          pageId,
          pageTitle,
          blockId: embed.id,
          blockType: 'externalResource',
          sourceKind: 'externalResource',
          sourceLocator: `embeds.${embed.id}.externalResource`,
        },
        target: {
          kind: data.mode === 'excerpt' ? 'resource_excerpt' : 'resource',
          resourceItemId: data.resourceItemId,
          resourceItemTitle: item?.title || snapshot.resourceTitle,
          resourceTypeName: item?.typeName || snapshot.resourceTypeName,
          resourceExcerptId: data.resourceExcerptId || null,
          resourceExcerptTitle: excerpt?.title || snapshot.excerptTitle,
          resourceExcerptLocator: excerpt?.locator || snapshot.excerptLocator,
          url: item?.sourceUrl || snapshot.sourceUrl,
        },
        status,
        citation: {
          displayText: excerpt?.title || snapshot.excerptTitle || item?.title || snapshot.resourceTitle,
          locator: excerpt?.locator || snapshot.excerptLocator,
          note: excerpt?.note || snapshot.excerptNote,
        },
      });
    }

    if (pc.content) {
      HEADING_SOURCE_COMMENT_RE.lastIndex = 0;
      let headingMatch: RegExpExecArray | null;
      while ((headingMatch = HEADING_SOURCE_COMMENT_RE.exec(pc.content)) !== null) {
        const parsed = parseHeadingSourceComment(headingMatch[1]);
        if (!parsed) continue;
        const { blockId, binding } = parsed;
        const item = state.resourceItems.find((entry) => entry.id === binding.resourceItemId);
        const excerpt = state.resourceExcerpts.find((entry) => entry.id === binding.resourceExcerptId);
        const snapshot = binding.snapshot;
        const status = item && excerpt ? 'bound' : 'broken';
        const haystack = [
          pageTitle,
          'headingSource',
          item?.title,
          excerpt?.title,
          snapshot.resourceTitle,
          snapshot.excerptTitle,
          snapshot.excerptLocator,
        ].filter(Boolean).join(' ').toLowerCase();
        if (params.q && !haystack.includes(params.q.toLowerCase())) continue;
        if (params.resourceItemId && params.resourceItemId !== binding.resourceItemId) continue;

        results.push({
          id: `mock-heading-source-${pageId}-${blockId}`,
          category: 'external',
          editable: false,
          source: {
            pageId,
            pageTitle,
            blockId: 'page-content',
            blockType: 'heading',
            sourceKind: 'headingSource',
            sourceLocator: `content:heading:${blockId}`,
          },
          target: {
            kind: 'resource_excerpt',
            resourceItemId: binding.resourceItemId,
            resourceItemTitle: item?.title || snapshot.resourceTitle,
            resourceTypeName: item?.typeName || snapshot.resourceTypeName,
            resourceExcerptId: binding.resourceExcerptId,
            resourceExcerptTitle: excerpt?.title || snapshot.excerptTitle,
            resourceExcerptLocator: excerpt?.locator || snapshot.excerptLocator,
            url: item?.sourceUrl,
          },
          status,
          citation: {
            displayText: excerpt?.title || snapshot.excerptTitle || item?.title || snapshot.resourceTitle,
            locator: excerpt?.locator || snapshot.excerptLocator,
            note: excerpt?.note,
          },
        });
      }
    }

    for (const ann of (pc.annotations || [])) {
      if (params.q) {
        const q = params.q.toLowerCase();
        const text = `${ann.selectedText} ${ann.note} ${ann.contextBefore} ${ann.contextAfter}`.toLowerCase();
        if (!text.includes(q)) continue;
      }

      results.push({
        id: ann.id,
        category: 'annotation',
        editable: true,
        source: {
          pageId,
          pageTitle,
          blockId: '',
          blockType: 'richtext',
          sourceKind: 'annotation',
          sourceLocator: ann.id,
        },
        target: {
          kind: 'annotation',
          blockPreview: ann.selectedText,
          resourceItemTitle: ann.note || '(无备注)',
        },
        status: 'ok',
        citation: {
          displayText: ann.selectedText,
          note: ann.note,
        },
      });
    }
  }

  let filtered = results;
  if (params.category && params.category !== 'all' && params.category !== 'annotation') {
    filtered = results.filter((r) => r.category === params.category);
  }
  if (params.category === 'annotation') {
    filtered = results;
  }

  const total = filtered.length;
  const page = params.page ?? 0;
  const pageSize = params.pageSize ?? 10;
  const from = page * pageSize;
  const items = from >= total ? [] : filtered.slice(from, from + pageSize);

  return { items, total, page, pageSize };
}

function collectPageSearchText(pageId: string): string {
  const pc = state.contents[pageId];
  if (!pc) return '';
  const parts = [pc.content || ''];
  for (const embed of pc.embeds || []) {
    if (embed.title) parts.push(embed.title);
  }
  return parts.join('\n');
}

function buildSearchSnippet(text: string, query: string, maxLen = 120): string {
  const normalized = text.replace(/\n/g, ' ').trim();
  if (!normalized) return '';
  const lower = normalized.toLowerCase();
  const needle = query.toLowerCase();
  const idx = lower.indexOf(needle);
  if (idx < 0) {
    return normalized.length <= maxLen ? normalized : `${normalized.slice(0, maxLen)}…`;
  }
  const start = Math.max(0, idx - 40);
  const end = Math.min(normalized.length, idx + query.length + 40);
  let snippet = normalized.slice(start, end);
  if (start > 0) snippet = `…${snippet}`;
  if (end < normalized.length) snippet = `${snippet}…`;
  return snippet;
}

export function searchPagesMock(
  q: string,
  limit = 20,
): {
  hits: Array<{
    kbId: string;
    kbName: string;
    pageId: string;
    pageTitle: string;
    title: string;
    snippet: string;
  }>;
  enabled: boolean;
  message: string | null;
} {
  const trimmed = q.trim();
  if (trimmed.length < 2) {
    return { hits: [], enabled: true, message: null };
  }

  const needle = trimmed.toLowerCase();
  const hits: Array<{
    kbId: string;
    kbName: string;
    pageId: string;
    pageTitle: string;
    title: string;
    snippet: string;
  }> = [];

  for (const kb of state.knowledgeBases) {
    for (const page of state.pages.filter((item) => item.kbId === kb.id)) {
      const body = collectPageSearchText(page.id);
      const titleMatch = page.title.toLowerCase().includes(needle);
      const bodyMatch = body.toLowerCase().includes(needle);
      if (!titleMatch && !bodyMatch) continue;

      hits.push({
        kbId: kb.id,
        kbName: kb.name,
        pageId: page.id,
        pageTitle: page.title,
        title: page.title,
        snippet: buildSearchSnippet(bodyMatch ? body : page.title, trimmed),
      });
    }
  }

  return {
    hits: hits.slice(0, limit),
    enabled: true,
    message: null,
  };
}

export function searchHeadingsMock(
  q: string,
  kbId?: string,
  limit = 20,
): {
  items: Array<{
    nodeId: string;
    pageId: string;
    pageTitle: string;
    kbId: string;
    sourceBlockId: string | null;
    level: number | null;
    text: string;
    highlight: string | null;
    previewText: string | null;
    estimatedHours: number | null;
    totalEstimatedHours: number | null;
  }>;
} {
  const trimmed = q.trim().toLowerCase();
  if (!trimmed) return { items: [] };

  const items: Array<{
    nodeId: string;
    pageId: string;
    pageTitle: string;
    kbId: string;
    sourceBlockId: string | null;
    level: number | null;
    text: string;
    highlight: string | null;
    previewText: string | null;
    estimatedHours: number | null;
    totalEstimatedHours: number | null;
  }> = [];

  for (const page of state.pages) {
    if (kbId && page.kbId !== kbId) continue;
    const outline = resolveMockPageOutline(page.id);
    if (!outline) continue;
    for (const node of outline.nodes) {
      const text = (node.title || '').trim();
      if (!text || !text.toLowerCase().includes(trimmed)) continue;
      items.push({
        nodeId: node.id,
        pageId: page.id,
        pageTitle: page.title,
        kbId: page.kbId,
        sourceBlockId: node.sourceBlockId ?? null,
        level: node.level ?? null,
        text,
        highlight: null,
        previewText: node.previewText ?? null,
        estimatedHours: node.estimatedHours,
        totalEstimatedHours: node.totalEstimatedHours,
      });
      if (items.length >= limit) return { items };
    }
  }

  return { items };
}

function getPageBlocksForOutline(pageId: string): Block[] {
  const content = state.contents[pageId];
  if (!content) return [];
  return pageContentToBlocks(content);
}

function resolveMockPageOutline(pageId: string): PageOutlineResponse | null {
  const page = state.pages.find((entry) => entry.id === pageId);
  if (!page) return null;
  return buildMockPageOutline(
    pageId,
    page.kbId,
    page.title,
    getPageBlocksForOutline(pageId),
    state.contentTreeHours,
  );
}

function resolveMockBlockOutline(blockId: string): BlockOutlineResponse | null {
  for (const page of state.pages) {
    const blocks = getPageBlocksForOutline(page.id);
    if (findBlockById(blocks, blockId)) {
      return buildMockBlockOutline(blockId, page.id, blocks, state.contentTreeHours);
    }
  }
  return null;
}

function findBlockById(blocks: Block[], blockId: string): Block | null {
  for (const block of blocks) {
    if (block.id === blockId) return block;
    if (block.children) {
      const nested = findBlockById(block.children, blockId);
      if (nested) return nested;
    }
  }
  return null;
}

export function getPageOutlineMock(pageId: string): PageOutlineResponse {
  const outline = resolveMockPageOutline(pageId);
  if (!outline) throw new Error('page not found');
  return cloneState(outline);
}

export function getBlockOutlineMock(blockId: string): BlockOutlineResponse {
  const outline = resolveMockBlockOutline(blockId);
  if (!outline) throw new Error('block not found');
  return cloneState(outline);
}

export function batchOutlinesMock(request: OutlineBatchRequest): OutlineBatchResponse {
  return cloneState(buildMockBatchResponse(
    request,
    (pageId) => resolveMockPageOutline(pageId),
    (blockId) => resolveMockBlockOutline(blockId),
  ));
}

export function patchContentTreeNodeHoursMock(
  nodeId: string,
  estimatedHours: number | null,
): ContentTreeNode {
  state.contentTreeHours[nodeId] = estimatedHours;
  persistState();
  for (const page of state.pages) {
    const outline = resolveMockPageOutline(page.id);
    const node = outline?.nodes.find((entry) => entry.id === nodeId);
    if (node) {
      return cloneState({ ...node, estimatedHours, totalEstimatedHours: node.totalEstimatedHours });
    }
  }
  throw new Error('content tree node not found');
}

export function collectKbTagsMock(kbId: string): BlockTag[] {
  const pools: BlockTag[] = [];
  for (const page of state.pages) {
    if (page.kbId !== kbId) continue;
    const pc = state.contents[page.id];
    if (!pc) continue;
    pools.push(...getPageTags(pc));
    pools.push(...collectSectionTagsFromMetadata(pc.metadata));
    pools.push(...collectTextTagSpanTags(pc.metadata));
    if (pc.document) {
      pools.push(...collectBlockTags(tipTapToBlocks(resolvePageDocument(pc), [])));
    } else {
      pools.push(...collectBlockTags(pageContentToBlocks(pc)));
    }
  }
  return mergeTagPools(pools);
}

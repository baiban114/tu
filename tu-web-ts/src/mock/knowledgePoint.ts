import type {
  KnowledgeAnchor,
  KnowledgePoint,
  KnowledgePointAlias,
  KnowledgePointAnchor,
  KnowledgePointGenerationPreview,
  KnowledgePointGenerationResult,
  PageKnowledgeContext,
  PageItem,
} from '@/api/types';
import { DEFAULT_PAGE_SIZE } from '@/constants/pagination';
import type { PageResult } from '@/constants/pagination';
import { tipTapToBlocks } from '@/editor/converters';
import { resolvePageDocument } from '@/editor/pageDocument';
import { getPageContentMock, getPageTreeMock } from '@/mock/store';
import { mergeKnowledgePointRelationsMock } from '@/mock/knowledgeRelation';
import { paginateSlice } from '@/utils/clientPagination';
import { normalizeKnowledgePointTitleFromContent } from '@/utils/knowledgePointTitle';
import { extractRichTextHeadingsFromBlocks } from '@/utils/toc/headings';

const POINTS_KEY = 'tu-mock-knowledge-points';
const ANCHORS_KEY = 'tu-mock-knowledge-point-anchors';
const ALIASES_KEY = 'tu-mock-knowledge-point-aliases';

function loadPoints(): KnowledgePoint[] {
  try {
    const raw = localStorage.getItem(POINTS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as KnowledgePoint[];
  } catch {
    return [];
  }
}

function savePoints(points: KnowledgePoint[]) {
  localStorage.setItem(POINTS_KEY, JSON.stringify(points));
}

function loadAnchors(): KnowledgePointAnchor[] {
  try {
    const raw = localStorage.getItem(ANCHORS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as KnowledgePointAnchor[];
  } catch {
    return [];
  }
}

function saveAnchors(anchors: KnowledgePointAnchor[]) {
  localStorage.setItem(ANCHORS_KEY, JSON.stringify(anchors));
}

function loadAliases(): KnowledgePointAlias[] {
  try {
    const raw = localStorage.getItem(ALIASES_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as KnowledgePointAlias[];
  } catch {
    return [];
  }
}

function saveAliases(aliases: KnowledgePointAlias[]) {
  localStorage.setItem(ALIASES_KEY, JSON.stringify(aliases));
}

function aliasesForPoint(pointId: string): string[] {
  return loadAliases()
    .filter((item) => item.knowledgePointId === pointId)
    .map((item) => item.alias)
    .sort((a, b) => a.localeCompare(b));
}

function withAliases(point: KnowledgePoint): KnowledgePoint {
  const aliases = aliasesForPoint(point.id);
  return aliases.length ? { ...point, aliases } : point;
}

function ensureDemoKnowledgePointsSeed(): void {
  if (loadPoints().length > 0) return;
  savePoints([
    {
      id: 'kp-demo-1',
      kbId: 'kb-demo-1',
      parentId: null,
      title: '基础概念',
      summary: '演示知识点：基础概念',
      status: 'active',
      estimatedHours: null,
      sortOrder: 0,
    },
    {
      id: 'kp-demo-2',
      kbId: 'kb-demo-1',
      parentId: 'kp-demo-1',
      title: '数据结构',
      summary: null,
      status: 'active',
      estimatedHours: 2,
      sortOrder: 0,
    },
  ]);
}

function newPointId(): string {
  return `kp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function newAnchorId(): string {
  return `kpa-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function newAliasId(): string {
  return `kpal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildTree(points: KnowledgePoint[]): KnowledgePoint[] {
  const map = new Map(points.map((point) => [point.id, { ...withAliases(point), children: [] as KnowledgePoint[] }]));
  const roots: KnowledgePoint[] = [];
  for (const point of map.values()) {
    if (point.parentId && map.has(point.parentId)) {
      map.get(point.parentId)!.children!.push(point);
    } else {
      roots.push(point);
    }
  }
  const sortNodes = (nodes: KnowledgePoint[]) => {
    nodes.sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
    nodes.forEach((node) => sortNodes(node.children ?? []));
  };
  sortNodes(roots);
  return roots;
}

function flattenPages(nodes: PageItem[]): PageItem[] {
  const result: PageItem[] = [];
  const walk = (list: PageItem[]) => {
    for (const node of list) {
      result.push(node);
      if (node.children?.length) walk(node.children);
    }
  };
  walk(nodes);
  return result;
}

function extractHeadingsFromPage(pageId: string) {
  const content = getPageContentMock(pageId);
  const blocks = tipTapToBlocks(resolvePageDocument(content));
  return extractRichTextHeadingsFromBlocks(blocks);
}

export function getKnowledgePointTreeMock(kbId: string): KnowledgePoint[] {
  ensureDemoKnowledgePointsSeed();
  return buildTree(loadPoints().filter((item) => item.kbId === kbId));
}

export function listKnowledgePointsMock(
  kbId: string,
  params: { q?: string; page?: number; pageSize?: number },
): PageResult<KnowledgePoint> {
  ensureDemoKnowledgePointsSeed();
  const q = params.q?.trim().toLowerCase() ?? '';
  const filtered = loadPoints()
    .filter((item) => item.kbId === kbId)
    .map(withAliases)
    .filter((item) => {
      if (!q) return true;
      const haystack = `${item.title} ${item.summary ?? ''} ${(item.aliases ?? []).join(' ')}`.toLowerCase();
      return haystack.includes(q);
    });
  return paginateSlice(filtered, params.page ?? 0, params.pageSize ?? DEFAULT_PAGE_SIZE);
}

export function listKnowledgePointsByLocatorMock(kbId: string, locator: string): KnowledgePoint[] {
  const pointIds = new Set(
    loadAnchors()
      .filter((anchor) => anchor.locator === locator)
      .map((anchor) => anchor.knowledgePointId),
  );
  return loadPoints()
    .filter((point) => point.kbId === kbId && pointIds.has(point.id))
    .map(withAliases);
}

const PREREQUISITE_TYPE = 'prerequisite';

function locatorBelongsToPage(locator: string, pageId: string): boolean {
  const pageLocator = `page:${pageId}`;
  return locator === pageLocator || locator.startsWith(`${pageLocator}:`);
}

function locatorIsPageLevel(locator: string, pageId: string): boolean {
  return locator === `page:${pageId}`;
}

function loadMockRelationsForPoint(kbId: string, pointId: string) {
  try {
    const raw = localStorage.getItem('tu-mock-knowledge-relations');
    if (!raw) return { outgoing: [], incoming: [] };
    const all = JSON.parse(raw) as Array<{
      kbId: string;
      relationTypeKey: string;
      fromPointId?: string | null;
      toPointId?: string | null;
    }>;
    const scoped = all.filter((item) => item.kbId === kbId);
    return {
      outgoing: scoped.filter((item) => item.fromPointId === pointId),
      incoming: scoped.filter((item) => item.toPointId === pointId),
    };
  } catch {
    return { outgoing: [], incoming: [] };
  }
}

export function getPageKnowledgeContextMock(kbId: string, pageId: string): PageKnowledgeContext {
  ensureDemoKnowledgePointsSeed();
  const trimmedPageId = pageId.trim();
  const pageLevelPointMap = new Map<string, KnowledgePoint>();
  const pageRelatedPointIds = new Set<string>();
  for (const anchor of loadAnchors()) {
    if (!locatorBelongsToPage(anchor.locator, trimmedPageId)) continue;
    const point = loadPoints().find((item) => item.id === anchor.knowledgePointId && item.kbId === kbId);
    if (!point) continue;
    pageRelatedPointIds.add(point.id);
    if (locatorIsPageLevel(anchor.locator, trimmedPageId)) {
      pageLevelPointMap.set(point.id, withAliases(point));
    }
  }

  const pagePoints = [...pageLevelPointMap.values()];
  const prerequisiteMap = new Map<string, KnowledgePoint>();
  const successorMap = new Map<string, KnowledgePoint>();

  for (const pageRelatedPointId of pageRelatedPointIds) {
    const relations = loadMockRelationsForPoint(kbId, pageRelatedPointId);
    for (const relation of relations.outgoing) {
      if (relation.relationTypeKey !== PREREQUISITE_TYPE) continue;
      const targetId = relation.toPointId?.trim();
      if (!targetId || pageRelatedPointIds.has(targetId)) continue;
      const target = findPointById(targetId);
      if (target && target.kbId === kbId) prerequisiteMap.set(targetId, target);
    }
    for (const relation of relations.incoming) {
      if (relation.relationTypeKey !== PREREQUISITE_TYPE) continue;
      const sourceId = relation.fromPointId?.trim();
      if (!sourceId || pageRelatedPointIds.has(sourceId)) continue;
      const source = findPointById(sourceId);
      if (source && source.kbId === kbId) successorMap.set(sourceId, source);
    }
  }

  return {
    pageId: trimmedPageId,
    pagePoints,
    prerequisites: [...prerequisiteMap.values()],
    successors: [...successorMap.values()],
  };
}

export function findPointById(pointId: string): KnowledgePoint | undefined {
  const point = loadPoints().find((item) => item.id === pointId);
  return point ? withAliases(point) : undefined;
}

export function createKnowledgePointMock(
  kbId: string,
  payload: {
    parentId?: string | null;
    title: string;
    summary?: string;
    estimatedHours?: number | null;
    sourceAnchor?: KnowledgeAnchor;
  },
): KnowledgePoint {
  const points = loadPoints();
  const siblings = points.filter((item) => item.kbId === kbId && item.parentId === (payload.parentId ?? null));
  const title = payload.sourceAnchor
    ? normalizeKnowledgePointTitleFromContent(payload.title)
    : payload.title.trim();
  const point: KnowledgePoint = {
    id: newPointId(),
    kbId,
    parentId: payload.parentId ?? null,
    title,
    summary: payload.summary ?? null,
    status: 'active',
    estimatedHours: payload.estimatedHours ?? null,
    sortOrder: siblings.length,
  };
  points.push(point);
  savePoints(points);
  if (payload.sourceAnchor) {
    addKnowledgePointAnchorMock(point.id, { anchor: payload.sourceAnchor, primary: true });
  }
  return withAliases(point);
}

export function updateKnowledgePointMock(
  id: string,
  payload: {
    parentId?: string | null;
    title?: string;
    summary?: string | null;
    status?: string;
    estimatedHours?: number | null;
    sortOrder?: number;
  },
): KnowledgePoint {
  const points = loadPoints();
  const index = points.findIndex((item) => item.id === id);
  if (index < 0) throw new Error(`Knowledge point not found: ${id}`);
  const current = points[index];
  const sourceParentId = current.parentId ?? null;
  const targetParentId = payload.parentId !== undefined ? (payload.parentId ?? null) : sourceParentId;
  const shouldReorder = payload.parentId !== undefined || payload.sortOrder !== undefined;

  if (shouldReorder) {
    if (targetParentId === id) {
      throw new Error('knowledge point cannot be moved under itself');
    }
    const descendantIds = collectDescendantIds(points, id);
    if (targetParentId && descendantIds.has(targetParentId)) {
      throw new Error('knowledge point cannot be moved under its descendant');
    }

    const requestedOrder = payload.sortOrder ?? 0;
    const siblings = points
      .filter((item) => item.kbId === current.kbId && item.id !== id && (item.parentId ?? null) === targetParentId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
    const targetIndex = Math.min(Math.max(requestedOrder, 0), siblings.length);
    siblings.splice(targetIndex, 0, { ...current, parentId: targetParentId });

    siblings.forEach((item, sortOrder) => {
      const itemIndex = points.findIndex((point) => point.id === item.id);
      if (itemIndex >= 0) {
        points[itemIndex] = {
          ...points[itemIndex],
          parentId: item.id === id ? targetParentId : points[itemIndex].parentId,
          sortOrder,
        };
      }
    });

    if (sourceParentId !== targetParentId) {
      normalizeSiblingSortOrders(points, current.kbId, sourceParentId);
    }
    savePoints(points);
    const updated = points.find((item) => item.id === id);
    if (!updated) throw new Error(`Knowledge point not found: ${id}`);
    return withAliases(updated);
  }

  const next: KnowledgePoint = {
    ...current,
    title: payload.title !== undefined ? payload.title.trim() : current.title,
    summary: payload.summary !== undefined ? payload.summary : current.summary,
    status: payload.status !== undefined ? payload.status : current.status,
    estimatedHours: payload.estimatedHours !== undefined ? payload.estimatedHours : current.estimatedHours,
  };
  points[index] = next;
  savePoints(points);
  return withAliases(next);
}

function collectDescendantIds(points: KnowledgePoint[], rootId: string): Set<string> {
  const childrenByParent = new Map<string, string[]>();
  for (const point of points) {
    if (!point.parentId) continue;
    const list = childrenByParent.get(point.parentId) ?? [];
    list.push(point.id);
    childrenByParent.set(point.parentId, list);
  }
  const result = new Set<string>();
  const stack = [...(childrenByParent.get(rootId) ?? [])];
  while (stack.length > 0) {
    const current = stack.pop()!;
    result.add(current);
    stack.push(...(childrenByParent.get(current) ?? []));
  }
  return result;
}

function normalizeSiblingSortOrders(points: KnowledgePoint[], kbId: string, parentId: string | null) {
  const siblings = points
    .filter((item) => item.kbId === kbId && (item.parentId ?? null) === parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
  siblings.forEach((item, sortOrder) => {
    const itemIndex = points.findIndex((point) => point.id === item.id);
    if (itemIndex >= 0) {
      points[itemIndex] = { ...points[itemIndex], sortOrder };
    }
  });
}

export function deleteKnowledgePointMock(id: string): void {
  const points = loadPoints();
  const hasChildren = points.some((item) => item.parentId === id);
  if (hasChildren) {
    throw new Error('knowledge point has children and cannot be deleted');
  }
  savePoints(points.filter((item) => item.id !== id));
  saveAnchors(loadAnchors().filter((item) => item.knowledgePointId !== id));
  saveAliases(loadAliases().filter((item) => item.knowledgePointId !== id));
}

export function mergeKnowledgePointsMock(sourcePointId: string, targetPointId: string): KnowledgePoint {
  if (sourcePointId === targetPointId) {
    throw new Error('cannot merge a knowledge point into itself');
  }
  const points = loadPoints();
  const sourceIndex = points.findIndex((item) => item.id === sourcePointId);
  const targetIndex = points.findIndex((item) => item.id === targetPointId);
  if (sourceIndex < 0) throw new Error('knowledge point not found');
  if (targetIndex < 0) throw new Error('knowledge point not found');
  const source = points[sourceIndex];
  const target = points[targetIndex];
  if (source.kbId !== target.kbId) {
    throw new Error('knowledge points must belong to the same knowledge base');
  }
  const descendants = collectDescendantIds(points, sourcePointId);
  if (descendants.has(targetPointId)) {
    throw new Error('knowledge point cannot be moved under its descendant');
  }

  let nextChildOrder = points
    .filter((item) => item.kbId === source.kbId && item.parentId === targetPointId)
    .reduce((max, item) => Math.max(max, item.sortOrder), -1) + 1;
  for (let i = 0; i < points.length; i++) {
    if (points[i].parentId === sourcePointId) {
      points[i] = { ...points[i], parentId: targetPointId, sortOrder: nextChildOrder++ };
    }
  }

  const targetSummary = target.summary?.trim() ?? '';
  const sourceSummary = source.summary?.trim() ?? '';
  let mergedSummary = targetSummary;
  if (!mergedSummary && sourceSummary) {
    mergedSummary = sourceSummary;
  } else if (mergedSummary && sourceSummary) {
    mergedSummary = `${mergedSummary}\n\n${sourceSummary}`;
  }

  points[targetIndex] = {
    ...target,
    summary: mergedSummary || undefined,
    estimatedHours: target.estimatedHours ?? source.estimatedHours,
  };

  const anchors = loadAnchors();
  const targetLocators = new Set(
    anchors.filter((item) => item.knowledgePointId === targetPointId).map((item) => item.locator),
  );
  let assignPrimary = !anchors.some(
    (item) => item.knowledgePointId === targetPointId && item.primary,
  );
  const migratedAnchors = anchors.flatMap((item) => {
    if (item.knowledgePointId !== sourcePointId) return [item];
    if (targetLocators.has(item.locator)) return [];
    const moved: KnowledgePointAnchor = {
      ...item,
      knowledgePointId: targetPointId,
      primary: item.primary && assignPrimary,
    };
    if (moved.primary) assignPrimary = false;
    else if (item.primary) moved.primary = false;
    targetLocators.add(moved.locator);
    return [moved];
  });
  let primaryKept = false;
  const normalizedAnchors = migratedAnchors.map((item) => {
    if (item.knowledgePointId !== targetPointId || !item.primary) return item;
    if (!primaryKept) {
      primaryKept = true;
      return item;
    }
    return { ...item, primary: false };
  });
  saveAnchors(normalizedAnchors);

  const aliases = loadAliases();
  const existingAliasKeys = new Set(
    aliases
      .filter((item) => item.knowledgePointId === targetPointId)
      .map((item) => item.alias.toLowerCase()),
  );
  existingAliasKeys.add(points[targetIndex].title.toLowerCase());
  const aliasCandidates = [
    source.title,
    ...aliases.filter((item) => item.knowledgePointId === sourcePointId).map((item) => item.alias),
  ];
  for (const candidate of aliasCandidates) {
    const trimmed = candidate.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (existingAliasKeys.has(key)) continue;
    aliases.push({
      id: newAliasId(),
      knowledgePointId: targetPointId,
      alias: trimmed,
    });
    existingAliasKeys.add(key);
  }
  saveAliases(aliases.filter((item) => item.knowledgePointId !== sourcePointId));

  mergeKnowledgePointRelationsMock(source.kbId, sourcePointId, targetPointId);

  savePoints(points.filter((item) => item.id !== sourcePointId));
  return withAliases(points.find((item) => item.id === targetPointId)!);
}

export function listKnowledgePointAnchorsMock(pointId: string): KnowledgePointAnchor[] {
  return loadAnchors().filter((item) => item.knowledgePointId === pointId);
}

export function addKnowledgePointAnchorMock(
  pointId: string,
  payload: { anchor: KnowledgeAnchor; role?: string; primary?: boolean },
): KnowledgePointAnchor {
  const anchors = loadAnchors();
  if (payload.primary) {
    anchors.forEach((item) => {
      if (item.knowledgePointId === pointId) item.primary = false;
    });
  }
  const anchor: KnowledgePointAnchor = {
    id: newAnchorId(),
    knowledgePointId: pointId,
    kind: payload.anchor.kind,
    locator: payload.anchor.locator,
    snapshot: payload.anchor.snapshot,
    role: payload.role ?? 'primary',
    primary: payload.primary ?? false,
  };
  anchors.push(anchor);
  saveAnchors(anchors);
  return anchor;
}

export function listKnowledgePointAliasesMock(pointId: string): KnowledgePointAlias[] {
  return loadAliases().filter((item) => item.knowledgePointId === pointId);
}

export function addKnowledgePointAliasMock(pointId: string, alias: string): KnowledgePointAlias {
  const trimmed = alias.trim();
  if (!trimmed) throw new Error('alias is required');
  const aliases = loadAliases();
  const exists = aliases.some(
    (item) => item.knowledgePointId === pointId && item.alias.toLowerCase() === trimmed.toLowerCase(),
  );
  if (exists) throw new Error('alias already exists');
  const entity: KnowledgePointAlias = {
    id: newAliasId(),
    knowledgePointId: pointId,
    alias: trimmed,
  };
  aliases.push(entity);
  saveAliases(aliases);
  return entity;
}

export function deleteKnowledgePointAliasMock(aliasId: string): void {
  saveAliases(loadAliases().filter((item) => item.id !== aliasId));
}

export function ensurePointForAnchorMock(
  kbId: string,
  anchor: KnowledgeAnchor,
  title?: string,
): KnowledgePoint {
  const existing = listKnowledgePointsByLocatorMock(kbId, anchor.locator)[0];
  if (existing) return existing;
  const resolvedTitle = normalizeKnowledgePointTitleFromContent(
    title?.trim()
      || (typeof anchor.snapshot?.title === 'string' ? anchor.snapshot.title : '')
      || '',
  );
  return createKnowledgePointMock(kbId, { title: resolvedTitle, sourceAnchor: anchor });
}

function normalizeGenerationSources(sources: string[]): Set<string> {
  const normalized = new Set<string>()
  for (const source of sources) {
    if (!source) continue
    if (source === 'pageTree') normalized.add('page')
    else if (source === 'documentHeadings') normalized.add('heading')
    else normalized.add(source)
  }
  return normalized
}

interface MockGenerationCandidate {
  locator: string
  kind: string
  title: string
  pageId: string
  pageTitle: string
  anchor: KnowledgeAnchor
}

function blockPreviewTitle(block: { type?: string; title?: string }): string {
  if (block.title?.trim()) return block.title.trim()
  if (block.type === 'x6') return '画板'
  if (block.type === 'table') return '表格'
  if (block.type === 'line') return '时间轴'
  if (block.type === 'ref') return '引用块'
  return block.type || '内容块'
}

function collectMockCandidates(
  kbId: string,
  sources: Set<string>,
  pageFilter: Set<string>,
): MockGenerationCandidate[] {
  const pages = flattenPages(getPageTreeMock(kbId)).filter(
    (page) => pageFilter.size === 0 || pageFilter.has(page.id),
  )
  const deduped = new Map<string, MockGenerationCandidate>()

  const put = (candidate: MockGenerationCandidate) => {
    if (!candidate.locator) return
    deduped.set(candidate.locator, candidate)
  }

  for (const page of pages) {
    const pageTitle = normalizeKnowledgePointTitleFromContent(page.title || '', '未命名页面')
    if (sources.has('page')) {
      put({
        locator: `page:${page.id}`,
        kind: 'page',
        title: pageTitle,
        pageId: page.id,
        pageTitle,
        anchor: { kind: 'page', locator: `page:${page.id}`, snapshot: { title: pageTitle, pageId: page.id } },
      })
    }

    if (page.pageType && page.pageType !== 'document') continue

    if (sources.has('heading') || sources.has('section')) {
      for (const heading of extractHeadingsFromPage(page.id)) {
        const rawTitle = heading.text?.trim() ?? ''
        const title = normalizeKnowledgePointTitleFromContent(rawTitle, '')
        const blockId = heading.blockId?.trim() ?? ''
        if (!title || !blockId) continue
        if (sources.has('heading')) {
          put({
            locator: `page:${page.id}:heading:${blockId}`,
            kind: 'heading',
            title,
            pageId: page.id,
            pageTitle,
            anchor: { kind: 'heading', locator: `page:${page.id}:heading:${blockId}`, snapshot: { title, pageId: page.id } },
          })
        }
        if (sources.has('section')) {
          put({
            locator: `page:${page.id}:section:local:${blockId}`,
            kind: 'section',
            title,
            pageId: page.id,
            pageTitle,
            anchor: { kind: 'section', locator: `page:${page.id}:section:local:${blockId}`, snapshot: { title, pageId: page.id } },
          })
        }
      }
    }

    if (sources.has('block')) {
      const content = getPageContentMock(page.id)
      const blocks = tipTapToBlocks(resolvePageDocument(content))
      for (const block of blocks) {
        const type = String(block.type || '')
        if (type === 'richtext' || type === 'richText') continue
        const blockId = String(block.id || '').trim()
        if (!blockId) continue
        const title = normalizeKnowledgePointTitleFromContent(blockPreviewTitle(block), type || '内容块')
        put({
          locator: `page:${page.id}:block:${blockId}`,
          kind: 'block',
          title,
          pageId: page.id,
          pageTitle,
          anchor: { kind: 'block', locator: `page:${page.id}:block:${blockId}`, snapshot: { title, blockId, pageId: page.id } },
        })
      }
    }
  }

  return [...deduped.values()]
}

export function previewKnowledgePointsMock(
  kbId: string,
  payload: { sources: string[]; pageIds?: string[] },
): KnowledgePointGenerationPreview {
  const sources = normalizeGenerationSources(payload.sources)
  const pageFilter = new Set((payload.pageIds ?? []).filter(Boolean))
  const items = collectMockCandidates(kbId, sources, pageFilter).map((candidate) => {
    const existed = listKnowledgePointsByLocatorMock(kbId, candidate.locator).length > 0
    return {
      locator: candidate.locator,
      kind: candidate.kind,
      title: candidate.title,
      pageId: candidate.pageId,
      pageTitle: candidate.pageTitle,
      status: existed ? 'would_skip' as const : 'would_create' as const,
    }
  })
  return { items, total: items.length }
}

export function generateKnowledgePointsMock(
  kbId: string,
  payload: { sources?: string[]; pageIds?: string[]; locators?: string[] },
): KnowledgePointGenerationResult {
  const locators = (payload.locators ?? []).map((item) => item.trim()).filter(Boolean)
  const pageFilter = new Set((payload.pageIds ?? []).filter(Boolean))

  let candidates: MockGenerationCandidate[]
  if (locators.length > 0) {
    const pageIds = new Set<string>()
    for (const locator of locators) {
      if (!locator.startsWith('page:')) continue
      const rest = locator.slice('page:'.length)
      const colon = rest.indexOf(':')
      pageIds.add(colon < 0 ? rest : rest.slice(0, colon))
    }
    candidates = collectMockCandidates(
      kbId,
      new Set(['page', 'heading', 'section', 'block']),
      pageIds,
    ).filter((candidate) => locators.includes(candidate.locator))
    const known = new Set(candidates.map((item) => item.locator))
    const missing = locators.filter((locator) => !known.has(locator))
    const items: KnowledgePointGenerationResult['items'] = []
    let created = 0
    let skipped = 0
    let failed = missing.length
    for (const locator of missing) {
      items.push({ locator, pointId: null, title: locator, status: 'failed' })
    }
    for (const candidate of candidates) {
      const existed = listKnowledgePointsByLocatorMock(kbId, candidate.locator).length > 0
      try {
        const point = ensurePointForAnchorMock(kbId, candidate.anchor, candidate.title)
        const status = existed ? 'skipped' : 'created'
        items.push({ locator: candidate.locator, pointId: point.id, title: candidate.title, status })
        if (status === 'created') created += 1
        else skipped += 1
      } catch {
        items.push({ locator: candidate.locator, pointId: null, title: candidate.title, status: 'failed' })
        failed += 1
      }
    }
    return { created, skipped, failed, items }
  }

  const sources = normalizeGenerationSources(payload.sources ?? [])
  candidates = collectMockCandidates(kbId, sources, pageFilter)

  const items: KnowledgePointGenerationResult['items'] = []
  let created = 0
  let skipped = 0
  let failed = 0

  for (const candidate of candidates) {
    try {
      const existed = listKnowledgePointsByLocatorMock(kbId, candidate.locator).length > 0
      const point = ensurePointForAnchorMock(kbId, candidate.anchor, candidate.title)
      const status = existed ? 'skipped' : 'created'
      items.push({ locator: candidate.locator, pointId: point.id, title: candidate.title, status })
      if (status === 'created') created += 1
      else skipped += 1
    } catch {
      items.push({ locator: candidate.locator, pointId: null, title: candidate.title, status: 'failed' })
      failed += 1
    }
  }

  return { created, skipped, failed, items };
}

export function clearKnowledgePointsMock(): void {
  localStorage.removeItem(POINTS_KEY);
  localStorage.removeItem(ANCHORS_KEY);
  localStorage.removeItem(ALIASES_KEY);
}

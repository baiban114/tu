import type {
  KnowledgeAnchor,
  KnowledgePoint,
  KnowledgePointAlias,
  KnowledgePointAnchor,
  KnowledgePointGenerationResult,
  PageItem,
} from '@/api/types';
import { DEFAULT_PAGE_SIZE } from '@/constants/pagination';
import type { PageResult } from '@/constants/pagination';
import { tipTapToBlocks } from '@/editor/converters';
import { resolvePageDocument } from '@/editor/pageDocument';
import { getPageContentMock, getPageTreeMock } from '@/mock/store';
import { paginateSlice } from '@/utils/clientPagination';
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
  const point: KnowledgePoint = {
    id: newPointId(),
    kbId,
    parentId: payload.parentId ?? null,
    title: payload.title.trim(),
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
  const resolvedTitle = title?.trim()
    || (typeof anchor.snapshot?.title === 'string' ? anchor.snapshot.title : '')
    || '未命名知识点';
  return createKnowledgePointMock(kbId, { title: resolvedTitle, sourceAnchor: anchor });
}

export function generateKnowledgePointsMock(
  kbId: string,
  payload: { sources: string[]; pageIds?: string[] },
): KnowledgePointGenerationResult {
  const sources = new Set(payload.sources);
  const pageFilter = new Set((payload.pageIds ?? []).filter(Boolean));
  const pages = flattenPages(getPageTreeMock(kbId)).filter(
    (page) => pageFilter.size === 0 || pageFilter.has(page.id),
  );

  const items: KnowledgePointGenerationResult['items'] = [];
  let created = 0;
  let skipped = 0;
  let failed = 0;

  const record = (locator: string, pointId: string | null, title: string, status: string) => {
    items.push({ locator, pointId, title, status });
    if (status === 'created') created += 1;
    else if (status === 'skipped') skipped += 1;
    else failed += 1;
  };

  if (sources.has('pageTree')) {
    for (const page of pages) {
      const locator = `page:${page.id}`;
      try {
        const existed = listKnowledgePointsByLocatorMock(kbId, locator).length > 0;
        const anchor: KnowledgeAnchor = {
          kind: 'page',
          locator,
          snapshot: { title: page.title, pageId: page.id },
        };
        const point = ensurePointForAnchorMock(kbId, anchor, page.title);
        record(locator, point.id, page.title, existed ? 'skipped' : 'created');
      } catch {
        record(locator, null, page.title, 'failed');
      }
    }
  }

  if (sources.has('documentHeadings')) {
    for (const page of pages) {
      if (page.pageType && page.pageType !== 'document') continue;
      for (const heading of extractHeadingsFromPage(page.id)) {
        const title = heading.text?.trim() ?? '';
        const blockId = heading.blockId?.trim() ?? '';
        if (!title || !blockId) continue;
        const locator = `page:${page.id}:heading:${blockId}`;
        try {
          const existed = listKnowledgePointsByLocatorMock(kbId, locator).length > 0;
          const anchor: KnowledgeAnchor = {
            kind: 'heading',
            locator,
            snapshot: { title, pageId: page.id },
          };
          const point = ensurePointForAnchorMock(kbId, anchor, title);
          record(locator, point.id, title, existed ? 'skipped' : 'created');
        } catch {
          record(locator, null, title, 'failed');
        }
      }
    }
  }

  return { created, skipped, failed, items };
}

export function clearKnowledgePointsMock(): void {
  localStorage.removeItem(POINTS_KEY);
  localStorage.removeItem(ANCHORS_KEY);
  localStorage.removeItem(ALIASES_KEY);
}

import { request } from './http';
import { isMockDataSource } from '@/dev/dataSource';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, type PageResult } from '@/constants/pagination';
import {
  buildExcerptTitle,
  formatExcerptLocator,
  parseExternalUrl,
  type ExternalUrlRegistrationMode,
} from '@/utils/externalUrlResource';
import { normalizeResourcePositionLocatorKey } from '@/utils/resourcePositionLocator';
import {
  createResourceExcerptMock,
  createResourcePdfRegionNoteMock,
  createResourceItemMock,
  createResourceTypeMock,
  createResourceWorkMock,
  deleteResourceExcerptMock,
  deleteResourcePdfRegionNoteMock,
  listResourcePdfRegionNotesMock,
  removeResourceItemMock,
  mergeResourceWorksMock,
  splitResourceItemWorkMock,
  resetResourceItemAutoMock,
  listUrlClusterRulesMock,
  createUrlClusterRuleMock,
  updateUrlClusterRuleMock,
  deleteUrlClusterRuleMock,
  listResourceItemRelationsMock,
  createResourceItemRelationMock,
  deleteResourceItemRelationMock,
  registerResourceUrlFromPasteMock,
  deleteResourceTypeMock,
  deleteResourceWorkMock,
  getResourceExcerptMock,
  getResourceItemMock,
  listResourceExcerptsMock,
  listResourceChaptersMock,
  createResourceChapterMock,
  updateResourceChapterMock,
  deleteResourceChapterMock,
  listResourceItemsMock,
  listResourceTypesMock,
  listResourceWorksMock,
  updateResourceExcerptMock,
  updateResourcePdfRegionNoteMock,
  updateResourceItemMock,
  updateResourceTypeMock,
  updateResourceWorkMock,
} from '@/mock/store';

export interface ResourceType {
  id: string;
  code: string;
  name: string;
  icon?: string;
  description?: string;
  identityFieldKey: string;
  identityFieldLabel: string;
}

export type FieldSource = 'auto' | 'manual';

export type VariantKind = 'translation' | 'format' | 'edition' | 'mirror' | 'other';

export interface ResourceWork {
  id: string;
  typeId: string;
  typeName: string;
  title: string;
  subtitle?: string;
  description?: string;
  clusterKey?: string | null;
  titleSource?: FieldSource;
}

export interface ResourceItem {
  id: string;
  typeId: string;
  typeName: string;
  identityFieldKey: string;
  identityFieldLabel: string;
  workId?: string | null;
  workTitle?: string | null;
  title: string;
  identityValue?: string | null;
  sourceUrl?: string;
  /** In-site access URLs (uploaded files or platform-reachable resources). Distinct from sourceUrl (origin). */
  accessUrls?: string[];
  edition?: string;
  note?: string;
  titleSource?: FieldSource;
  workIdSource?: FieldSource;
  variantKind?: VariantKind | null;
}

export interface UrlClusterRule {
  id: string;
  domain: string;
  pathRegex: string;
  clusterKeyFormat: string;
  variantGroup?: number | null;
  priority: number;
  enabled: boolean;
  builtIn: boolean;
  description?: string;
}

export interface ResourceItemRelation {
  id: string;
  fromItemId: string;
  fromItemTitle: string;
  toItemId: string;
  toItemTitle: string;
  relationType: string;
  note?: string;
}

export interface ResourceExcerpt {
  id: string;
  resourceItemId: string;
  resourceItemTitle: string;
  title: string;
  chapterId?: string | null;
  chapterTitle?: string | null;
  /** Parent excerpt within the same resource item (nestable). */
  parentId?: string | null;
  locator?: string;
  excerptText?: string;
  note?: string;
  sortOrder: number;
  metadata?: Record<string, unknown>;
}

export interface ResourceChapter {
  id: string;
  resourceItemId: string;
  resourceItemTitle: string;
  parentId?: string | null;
  title: string;
  locator?: string;
  note?: string;
  sortOrder: number;
}

export type CreateResourceChapterPayload = Omit<ResourceChapter, 'id' | 'resourceItemId' | 'resourceItemTitle'>;
export type UpdateResourceChapterPayload = CreateResourceChapterPayload;

export type CreateResourceTypePayload = Omit<ResourceType, 'id'>;
export type UpdateResourceTypePayload = Omit<ResourceType, 'id' | 'code'>;
export type CreateResourceWorkPayload = Omit<ResourceWork, 'id' | 'typeName'>;
export type UpdateResourceWorkPayload = CreateResourceWorkPayload;
export type CreateResourceItemPayload = Omit<ResourceItem, 'id' | 'typeName' | 'identityFieldKey' | 'identityFieldLabel' | 'workTitle'>;
export type UpdateResourceItemPayload = CreateResourceItemPayload;
export type CreateResourceExcerptPayload = Omit<ResourceExcerpt, 'id' | 'resourceItemId' | 'resourceItemTitle'>;
export type UpdateResourceExcerptPayload = Omit<ResourceExcerpt, 'id' | 'resourceItemId' | 'resourceItemTitle'>;

function query(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  const value = search.toString();
  return value ? `?${value}` : '';
}

export interface ListResourcePageParams {
  page?: number;
  pageSize?: number;
}

export function listResourceTypes(params: ListResourcePageParams = {}): Promise<PageResult<ResourceType>> {
  const page = params.page ?? 0;
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE;
  if (isMockDataSource()) return Promise.resolve(listResourceTypesMock(page, pageSize));
  return request<PageResult<ResourceType>>(`/api/resource-types?page=${page}&pageSize=${pageSize}`);
}

export function createResourceType(payload: CreateResourceTypePayload): Promise<ResourceType> {
  if (isMockDataSource()) return Promise.resolve(createResourceTypeMock(payload));
  return request<ResourceType>('/api/resource-types', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateResourceType(id: string, payload: UpdateResourceTypePayload): Promise<ResourceType> {
  if (isMockDataSource()) return Promise.resolve(updateResourceTypeMock(id, payload));
  return request<ResourceType>(`/api/resource-types/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function deleteResourceType(id: string): Promise<void> {
  if (isMockDataSource()) {
    deleteResourceTypeMock(id);
    return Promise.resolve();
  }
  return request<void>(`/api/resource-types/${id}`, { method: 'DELETE' });
}

export function listResourceWorks(
  params: { typeId?: string; page?: number; pageSize?: number } = {},
): Promise<PageResult<ResourceWork>> {
  const page = params.page ?? 0;
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE;
  if (isMockDataSource()) return Promise.resolve(listResourceWorksMock(params.typeId, page, pageSize));
  return request<PageResult<ResourceWork>>(`/api/resource-works${query({
    typeId: params.typeId,
    page: String(page),
    pageSize: String(pageSize),
  })}`);
}

export function createResourceWork(payload: CreateResourceWorkPayload): Promise<ResourceWork> {
  if (isMockDataSource()) return Promise.resolve(createResourceWorkMock(payload));
  return request<ResourceWork>('/api/resource-works', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateResourceWork(id: string, payload: UpdateResourceWorkPayload): Promise<ResourceWork> {
  if (isMockDataSource()) return Promise.resolve(updateResourceWorkMock(id, payload));
  return request<ResourceWork>(`/api/resource-works/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function deleteResourceWork(id: string): Promise<void> {
  if (isMockDataSource()) {
    deleteResourceWorkMock(id);
    return Promise.resolve();
  }
  return request<void>(`/api/resource-works/${id}`, { method: 'DELETE' });
}

export function mergeResourceWorks(sourceWorkId: string, targetWorkId: string): Promise<ResourceWork> {
  if (isMockDataSource()) return Promise.resolve(mergeResourceWorksMock(sourceWorkId, targetWorkId));
  return request<ResourceWork>('/api/resource-works/merge', {
    method: 'POST',
    body: JSON.stringify({ sourceWorkId, targetWorkId }),
  });
}

export function splitResourceItemToNewWork(itemId: string): Promise<ResourceItem> {
  if (isMockDataSource()) return Promise.resolve(splitResourceItemWorkMock(itemId));
  return request<ResourceItem>(`/api/resource-items/${encodeURIComponent(itemId)}/split-work`, { method: 'POST' });
}

export function resetResourceItemAuto(itemId: string): Promise<ResourceItem> {
  if (isMockDataSource()) return Promise.resolve(resetResourceItemAutoMock(itemId));
  return request<ResourceItem>(`/api/resource-items/${encodeURIComponent(itemId)}/reset-auto`, { method: 'POST' });
}

export function listUrlClusterRules(params: ListResourcePageParams = {}): Promise<PageResult<UrlClusterRule>> {
  const page = params.page ?? 0;
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE;
  if (isMockDataSource()) return Promise.resolve(listUrlClusterRulesMock(page, pageSize));
  return request<PageResult<UrlClusterRule>>(`/api/url-cluster-rules?page=${page}&pageSize=${pageSize}`);
}

export type CreateUrlClusterRulePayload = Omit<UrlClusterRule, 'id' | 'builtIn'>;
export type UpdateUrlClusterRulePayload = Omit<UrlClusterRule, 'id' | 'builtIn'>;

export function createUrlClusterRule(payload: CreateUrlClusterRulePayload): Promise<UrlClusterRule> {
  if (isMockDataSource()) return Promise.resolve(createUrlClusterRuleMock(payload));
  return request<UrlClusterRule>('/api/url-cluster-rules', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateUrlClusterRule(id: string, payload: UpdateUrlClusterRulePayload): Promise<UrlClusterRule> {
  if (isMockDataSource()) return Promise.resolve(updateUrlClusterRuleMock(id, payload));
  return request<UrlClusterRule>(`/api/url-cluster-rules/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function deleteUrlClusterRule(id: string): Promise<void> {
  if (isMockDataSource()) {
    deleteUrlClusterRuleMock(id);
    return Promise.resolve();
  }
  return request<void>(`/api/url-cluster-rules/${id}`, { method: 'DELETE' });
}

export function listResourceItemRelations(itemId: string): Promise<ResourceItemRelation[]> {
  if (isMockDataSource()) return Promise.resolve(listResourceItemRelationsMock(itemId));
  return request<ResourceItemRelation[]>(`/api/resource-item-relations/by-item/${encodeURIComponent(itemId)}`);
}

export function createResourceItemRelation(payload: {
  fromItemId: string;
  toItemId: string;
  relationType: string;
  note?: string;
}): Promise<ResourceItemRelation> {
  if (isMockDataSource()) return Promise.resolve(createResourceItemRelationMock(payload));
  return request<ResourceItemRelation>('/api/resource-item-relations', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function deleteResourceItemRelation(id: string): Promise<void> {
  if (isMockDataSource()) {
    deleteResourceItemRelationMock(id);
    return Promise.resolve();
  }
  return request<void>(`/api/resource-item-relations/${id}`, { method: 'DELETE' });
}

export function fetchResourcePageTitle(url: string): Promise<string | null> {
  if (isMockDataSource()) return Promise.resolve(null);
  return request<string | null>(`/api/resource-items/fetch-page-title?url=${encodeURIComponent(url)}`);
}

export function listResourceItems(params: {
  typeId?: string;
  workId?: string;
  identityValue?: string;
  page?: number;
  pageSize?: number;
} = {}): Promise<PageResult<ResourceItem>> {
  const page = params.page ?? 0;
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE;
  if (isMockDataSource()) return Promise.resolve(listResourceItemsMock(params, page, pageSize));
  return request<PageResult<ResourceItem>>(`/api/resource-items${query({
    typeId: params.typeId,
    workId: params.workId,
    identityValue: params.identityValue,
    page: String(page),
    pageSize: String(pageSize),
  })}`);
}

export function getResourceItem(id: string): Promise<ResourceItem> {
  if (isMockDataSource()) return Promise.resolve(getResourceItemMock(id));
  return request<ResourceItem>(`/api/resource-items/${encodeURIComponent(id)}`);
}

export function createResourceItem(payload: CreateResourceItemPayload): Promise<ResourceItem> {
  if (isMockDataSource()) return Promise.resolve(createResourceItemMock(payload));
  return request<ResourceItem>('/api/resource-items', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateResourceItem(id: string, payload: UpdateResourceItemPayload): Promise<ResourceItem> {
  if (isMockDataSource()) return Promise.resolve(updateResourceItemMock(id, payload));
  return request<ResourceItem>(`/api/resource-items/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function removeResourceItem(id: string): Promise<void> {
  if (isMockDataSource()) {
    removeResourceItemMock(id);
    return Promise.resolve();
  }
  return request<void>(`/api/resource-items/${id}`, { method: 'DELETE' });
}

export type { PageResult } from '@/constants/pagination';

export interface ListResourceExcerptsParams {
  page?: number;
  pageSize?: number;
}

export function listResourceExcerpts(
  resourceItemId: string,
  params: ListResourceExcerptsParams = {},
): Promise<PageResult<ResourceExcerpt>> {
  const page = params.page ?? 0;
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE;
  if (isMockDataSource()) {
    return Promise.resolve(listResourceExcerptsMock(resourceItemId, page, pageSize));
  }
  return request<PageResult<ResourceExcerpt>>(
    `/api/resource-items/${encodeURIComponent(resourceItemId)}/excerpts?page=${page}&pageSize=${pageSize}`,
  );
}

export function createResourceExcerpt(resourceItemId: string, payload: CreateResourceExcerptPayload): Promise<ResourceExcerpt> {
  if (isMockDataSource()) return Promise.resolve(createResourceExcerptMock(resourceItemId, payload));
  return request<ResourceExcerpt>(`/api/resource-items/${encodeURIComponent(resourceItemId)}/excerpts`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export interface ResourcePdfRegionNote {
  id: string;
  resourceItemId: string;
  fileId?: string | null;
  startPage: number;
  endPage: number;
  clipTop: number;
  clipBottom: number;
  note: string;
  color?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export type CreateResourcePdfRegionNotePayload = {
  startPage: number;
  endPage: number;
  clipTop: number;
  clipBottom: number;
  note: string;
  fileId?: string;
  color?: string;
};

export type UpdateResourcePdfRegionNotePayload = Partial<CreateResourcePdfRegionNotePayload>;

export function listResourcePdfRegionNotes(resourceItemId: string): Promise<ResourcePdfRegionNote[]> {
  if (isMockDataSource()) {
    return Promise.resolve(listResourcePdfRegionNotesMock(resourceItemId));
  }
  return request<ResourcePdfRegionNote[]>(
    `/api/resource-items/${encodeURIComponent(resourceItemId)}/pdf-region-notes`,
  );
}

export function createResourcePdfRegionNote(
  resourceItemId: string,
  payload: CreateResourcePdfRegionNotePayload,
): Promise<ResourcePdfRegionNote> {
  if (isMockDataSource()) {
    return Promise.resolve(createResourcePdfRegionNoteMock(resourceItemId, payload));
  }
  return request<ResourcePdfRegionNote>(
    `/api/resource-items/${encodeURIComponent(resourceItemId)}/pdf-region-notes`,
    { method: 'POST', body: JSON.stringify(payload) },
  );
}

export function updateResourcePdfRegionNote(
  noteId: string,
  payload: UpdateResourcePdfRegionNotePayload,
): Promise<ResourcePdfRegionNote> {
  if (isMockDataSource()) {
    return Promise.resolve(updateResourcePdfRegionNoteMock(noteId, payload));
  }
  return request<ResourcePdfRegionNote>(
    `/api/resource-pdf-region-notes/${encodeURIComponent(noteId)}`,
    { method: 'PATCH', body: JSON.stringify(payload) },
  );
}

export function deleteResourcePdfRegionNote(noteId: string): Promise<void> {
  if (isMockDataSource()) {
    deleteResourcePdfRegionNoteMock(noteId);
    return Promise.resolve();
  }
  return request<void>(`/api/resource-pdf-region-notes/${encodeURIComponent(noteId)}`, {
    method: 'DELETE',
  });
}

export function getResourceExcerpt(id: string): Promise<ResourceExcerpt> {
  if (isMockDataSource()) return Promise.resolve(getResourceExcerptMock(id));
  return request<ResourceExcerpt>(`/api/resource-excerpts/${encodeURIComponent(id)}`);
}

export function updateResourceExcerpt(id: string, payload: UpdateResourceExcerptPayload): Promise<ResourceExcerpt> {
  if (isMockDataSource()) return Promise.resolve(updateResourceExcerptMock(id, payload));
  return request<ResourceExcerpt>(`/api/resource-excerpts/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function deleteResourceExcerpt(id: string): Promise<void> {
  if (isMockDataSource()) {
    deleteResourceExcerptMock(id);
    return Promise.resolve();
  }
  return request<void>(`/api/resource-excerpts/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function listResourceChapters(resourceItemId: string): Promise<ResourceChapter[]> {
  if (isMockDataSource()) return Promise.resolve(listResourceChaptersMock(resourceItemId));
  return request<ResourceChapter[]>(`/api/resource-items/${encodeURIComponent(resourceItemId)}/chapters`);
}

export function createResourceChapter(
  resourceItemId: string,
  payload: CreateResourceChapterPayload,
): Promise<ResourceChapter> {
  if (isMockDataSource()) return Promise.resolve(createResourceChapterMock(resourceItemId, payload));
  return request<ResourceChapter>(`/api/resource-items/${encodeURIComponent(resourceItemId)}/chapters`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateResourceChapter(id: string, payload: UpdateResourceChapterPayload): Promise<ResourceChapter> {
  if (isMockDataSource()) return Promise.resolve(updateResourceChapterMock(id, payload));
  return request<ResourceChapter>(`/api/resource-chapters/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function deleteResourceChapter(id: string): Promise<void> {
  if (isMockDataSource()) {
    deleteResourceChapterMock(id);
    return Promise.resolve();
  }
  return request<void>(`/api/resource-chapters/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export const BOOK_RESOURCE_TYPE_CODE = 'book';
export const WEB_LINK_RESOURCE_TYPE_CODE = 'web-link';
export const DOCUMENT_RESOURCE_TYPE_CODE = 'document';

/** Resource types that support excerpt CRUD (books, documents, and registered web links). */
export function supportsResourceExcerpts(typeCode: string | undefined | null): boolean {
  return typeCode === BOOK_RESOURCE_TYPE_CODE
    || typeCode === WEB_LINK_RESOURCE_TYPE_CODE
    || typeCode === DOCUMENT_RESOURCE_TYPE_CODE;
}

/** Book items may define a multi-level chapter tree. */
export function supportsBookChapters(typeCode: string | undefined | null): boolean {
  return typeCode === BOOK_RESOURCE_TYPE_CODE;
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

async function ensureWebLinkResourceType(): Promise<ResourceType> {
  const types = await listResourceTypes({ page: 0, pageSize: MAX_PAGE_SIZE });
  const existing = types.items.find((type) => type.code === WEB_LINK_RESOURCE_TYPE_CODE);
  if (existing) return existing;

  return createResourceType({
    code: WEB_LINK_RESOURCE_TYPE_CODE,
    name: '网络链接',
    icon: 'link',
    description: '由插入链接功能自动登记的外部网络链接',
    identityFieldKey: 'sourceUrl',
    identityFieldLabel: '源 URL',
  });
}

function normalizeExcerptLocatorKey(locator?: string | null): string {
  return normalizeResourcePositionLocatorKey(locator);
}

async function findWebLinkItem(typeId: string, baseUrl: string, fullHref: string): Promise<ResourceItem | null> {
  const byBase = await listResourceItems({ typeId, identityValue: baseUrl });
  if (byBase.items.length > 0) return byBase.items[0];

  if (fullHref !== baseUrl) {
    const byFull = await listResourceItems({ typeId, identityValue: fullHref });
    if (byFull.items.length > 0) return byFull.items[0];
  }

  return null;
}


export interface RegisterExternalUrlResult {
  mode: ExternalUrlRegistrationMode;
  item: ResourceItem;
  excerpt?: ResourceExcerpt;
  createdItem: boolean;
  createdExcerpt: boolean;
}

/**
 * Register a pasted or inserted URL as a web-link resource, or as an excerpt when the URL carries a hash anchor.
 */
export async function registerExternalUrlFromPaste(
  url: string,
  options: { label?: string; excerptText?: string } = {},
): Promise<RegisterExternalUrlResult> {
  if (isMockDataSource()) {
    return registerResourceUrlFromPasteMock(url, options);
  }

  const result = await request<RegisterExternalUrlResult>('/api/resource-items/register-from-url', {
    method: 'POST',
    body: JSON.stringify({
      url,
      label: options.label,
      excerptText: options.excerptText,
    }),
  });

  return {
    mode: result.mode as ExternalUrlRegistrationMode,
    item: result.item,
    excerpt: result.excerpt,
    createdItem: result.createdItem,
    createdExcerpt: result.createdExcerpt,
  };
}

/** Ensure a page-level web-link resource exists (hash fragments are stripped from identity). */
export async function ensureExternalLinkResource(url: string, label = ''): Promise<ResourceItem> {
  const parsed = parseExternalUrl(url);
  const pageUrl = parsed?.baseUrl ?? url.trim();
  if (!pageUrl) {
    throw new Error('resource URL required');
  }

  const linkType = await ensureWebLinkResourceType();
  const existing = await findWebLinkItem(linkType.id, pageUrl, parsed?.href ?? pageUrl);
  if (existing) return existing;

  const registered = await registerExternalUrlFromPaste(pageUrl, { label });
  return registered.item;
}

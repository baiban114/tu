import type { KnowledgeAnchor, KnowledgeRelation, RelationTypeDef, RelationsByPoint } from '@/api/types';
import { DEFAULT_PAGE_SIZE } from '@/constants/pagination';
import type { PageResult } from '@/constants/pagination';
import { paginateSlice } from '@/utils/clientPagination';
import { anchorLabel } from '@/utils/knowledgeAnchor';
import type { ListKnowledgeRelationsParams } from '@/api/knowledgeRelation';
import {
  findPointById,
  listKnowledgePointsByLocatorMock,
} from '@/mock/knowledgePoint';

const STORAGE_KEY = 'tu-mock-knowledge-relations';

const SYSTEM_TYPES: RelationTypeDef[] = [
  { id: 'rt-sys-source', kbId: null, typeKey: 'source', label: '来源', color: '#52c41a', icon: null, bidirectional: false, system: true, enabled: true },
  { id: 'rt-sys-basis', kbId: null, typeKey: 'basis', label: '依据', color: '#389e0d', icon: null, bidirectional: false, system: true, enabled: true },
  { id: 'rt-sys-case', kbId: null, typeKey: 'case', label: '案例', color: '#1677ff', icon: null, bidirectional: false, system: true, enabled: true },
  { id: 'rt-sys-cites', kbId: null, typeKey: 'cites', label: '引用', color: '#722ed1', icon: null, bidirectional: false, system: true, enabled: true },
  { id: 'rt-sys-related', kbId: null, typeKey: 'related', label: '相关', color: '#8c8c8c', icon: null, bidirectional: true, system: true, enabled: true },
  { id: 'rt-sys-association', kbId: null, typeKey: 'association', label: '联想', color: '#9254de', icon: null, bidirectional: true, system: true, enabled: true },
  { id: 'rt-sys-prerequisite', kbId: null, typeKey: 'prerequisite', label: '前置', color: '#fa8c16', icon: null, bidirectional: false, system: true, enabled: true },
];

function loadRelations(): KnowledgeRelation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as KnowledgeRelation[];
  } catch {
    return [];
  }
}

function saveRelations(relations: KnowledgeRelation[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(relations));
}

function resolveType(kbId: string, typeKey: string): RelationTypeDef {
  return SYSTEM_TYPES.find((item) => item.typeKey === typeKey)
    ?? { id: `rt-custom-${typeKey}`, kbId, typeKey, label: typeKey, color: '#1677ff', icon: null, bidirectional: false, system: false, enabled: true };
}

function newId(): string {
  return `kr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function enrichRelation(relation: KnowledgeRelation): KnowledgeRelation {
  const fromPoint = relation.fromPointId ? findPointById(relation.fromPointId) : undefined;
  const toPoint = relation.toPointId ? findPointById(relation.toPointId) : undefined;
  const fromPointTitle = fromPoint?.title
    ?? relation.fromPointTitle
    ?? (relation.from ? anchorLabel(relation.from) : null);
  return {
    ...relation,
    fromPointTitle,
    toPointTitle: toPoint?.title ?? relation.toPointTitle ?? null,
  };
}

export function listRelationTypesMock(_kbId: string): RelationTypeDef[] {
  return [...SYSTEM_TYPES];
}

export function listKnowledgeRelationsMock(
  kbId: string,
  params: ListKnowledgeRelationsParams,
): PageResult<KnowledgeRelation> {
  const locator = params.locator?.trim() ?? '';
  const pointId = params.pointId?.trim() ?? '';
  const typeKey = params.relationTypeKey?.trim() ?? '';
  const q = params.q?.trim().toLowerCase() ?? '';
  const filtered = loadRelations()
    .map(enrichRelation)
    .filter((item) => {
      if (item.kbId !== kbId) return false;
      if (pointId && item.fromPointId !== pointId && item.toPointId !== pointId) return false;
      if (locator) {
        const anchorMatch = item.from?.locator === locator || item.to?.locator === locator;
        const pointMatch = pointId
          || listKnowledgePointsByLocatorMock(kbId, locator).some((point) => (
            item.fromPointId === point.id || item.toPointId === point.id
          ));
        if (!anchorMatch && !pointMatch) return false;
      }
      if (typeKey && item.relationTypeKey !== typeKey) return false;
      if (q) {
        const hay = `${item.fromPointTitle ?? ''} ${item.toPointTitle ?? ''} ${item.from?.locator ?? ''} ${item.to?.locator ?? ''} ${item.note ?? ''} ${item.relationTypeLabel}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  return paginateSlice(filtered, params.page ?? 0, params.pageSize ?? DEFAULT_PAGE_SIZE);
}

export function listKnowledgeRelationsByAnchorMock(kbId: string, locator: string): {
  locator: string;
  outgoing: KnowledgeRelation[];
  incoming: KnowledgeRelation[];
} {
  const pointIds = listKnowledgePointsByLocatorMock(kbId, locator).map((item) => item.id);
  const all = loadRelations().filter((item) => item.kbId === kbId).map(enrichRelation);
  const outgoing = all.filter((item) => (
    item.from?.locator === locator || (item.fromPointId != null && pointIds.includes(item.fromPointId))
  ));
  const incoming = all.filter((item) => (
    item.to?.locator === locator || (item.toPointId != null && pointIds.includes(item.toPointId))
  ));
  return { locator, outgoing, incoming };
}

export function listKnowledgeRelationsByPointMock(kbId: string, pointId: string): RelationsByPoint {
  const all = loadRelations().filter((item) => item.kbId === kbId).map(enrichRelation);
  return {
    pointId,
    outgoing: all.filter((item) => item.fromPointId === pointId),
    incoming: all.filter((item) => item.toPointId === pointId),
  };
}

export function createKnowledgeRelationMock(
  kbId: string,
  payload: {
    relationTypeKey: string;
    fromPointId?: string;
    toPointId?: string;
    from?: KnowledgeAnchor;
    to?: KnowledgeAnchor;
    note?: string;
    sourceProvenance?: 'user' | 'ai';
  },
): KnowledgeRelation {
  const typeDef = resolveType(kbId, payload.relationTypeKey);
  const fromPointId = payload.fromPointId?.trim() ?? '';
  const toPointId = payload.toPointId?.trim() ?? '';
  if (!toPointId) {
    throw new Error('toPointId is required');
  }
  if (!fromPointId && !payload.from) {
    throw new Error('fromPointId or from anchor is required');
  }
  const fromPoint = fromPointId ? findPointById(fromPointId) : undefined;
  const toPoint = findPointById(toPointId);
  const relation: KnowledgeRelation = {
    id: newId(),
    kbId,
    relationTypeKey: typeDef.typeKey,
    relationTypeLabel: typeDef.label,
    relationTypeColor: typeDef.color,
    bidirectional: typeDef.bidirectional,
    fromPointId: fromPointId || null,
    toPointId,
    fromPointTitle: fromPoint?.title ?? (payload.from ? anchorLabel(payload.from) : null),
    toPointTitle: toPoint?.title ?? null,
    from: payload.from ?? null,
    to: payload.to ?? null,
    note: payload.note ?? null,
    sourceProvenance: payload.sourceProvenance ?? 'user',
    status: 'ok',
  };
  const all = loadRelations();
  all.push(relation);
  saveRelations(all);
  return relation;
}

export function deleteKnowledgeRelationMock(id: string): void {
  saveRelations(loadRelations().filter((item) => item.id !== id));
}

export function clearKnowledgeRelationsMock(): void {
  localStorage.removeItem(STORAGE_KEY);
}

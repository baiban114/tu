import type { KnowledgeGraphDirection, KnowledgeGraphMode } from '@/api/types';

export interface KnowledgeGraphPreferences {
  centerPointId: string;
  mode: KnowledgeGraphMode;
  depth: number;
  direction: KnowledgeGraphDirection;
  selectedTypeKeys: string[];
  collapsedPointIds?: string[];
}

const STORAGE_PREFIX = 'tu:knowledge-graph-prefs';

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}:${userId}`;
}

function isGraphMode(value: unknown): value is KnowledgeGraphMode {
  return value === 'centered' || value === 'prerequisite' || value === 'full';
}

function isDirection(value: unknown): value is KnowledgeGraphDirection {
  return value === 'out' || value === 'in' || value === 'both';
}

function normalizePreferences(raw: Partial<KnowledgeGraphPreferences>): KnowledgeGraphPreferences | null {
  const centerPointId = typeof raw.centerPointId === 'string' ? raw.centerPointId.trim() : '';
  if (!centerPointId) return null;
  const depth = typeof raw.depth === 'number' ? raw.depth : 2;
  return {
    centerPointId,
    mode: isGraphMode(raw.mode) ? raw.mode : 'centered',
    depth: Math.min(Math.max(depth, 1), 3),
    direction: isDirection(raw.direction) ? raw.direction : 'out',
    selectedTypeKeys: Array.isArray(raw.selectedTypeKeys)
      ? raw.selectedTypeKeys.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [],
    collapsedPointIds: Array.isArray(raw.collapsedPointIds)
      ? raw.collapsedPointIds.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [],
  };
}

export function loadKnowledgeGraphPreferences(
  userId: string,
  kbId: string,
): KnowledgeGraphPreferences | null {
  if (typeof window === 'undefined' || !userId.trim() || !kbId.trim()) return null;
  try {
    const raw = window.localStorage.getItem(storageKey(userId.trim()));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, Partial<KnowledgeGraphPreferences>>;
    return normalizePreferences(parsed[kbId.trim()] ?? {});
  } catch {
    return null;
  }
}

export function saveKnowledgeGraphPreferences(
  userId: string,
  kbId: string,
  prefs: KnowledgeGraphPreferences,
): void {
  if (typeof window === 'undefined' || !userId.trim() || !kbId.trim()) return;
  try {
    const key = storageKey(userId.trim());
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as Record<string, KnowledgeGraphPreferences>) : {};
    const normalized = normalizePreferences(prefs);
    if (!normalized) {
      delete parsed[kbId.trim()];
    } else {
      parsed[kbId.trim()] = normalized;
    }
    if (Object.keys(parsed).length === 0) {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(key, JSON.stringify(parsed));
  } catch {
    // ignore storage failures
  }
}

export function clearKnowledgeGraphCenterPoint(userId: string, kbId: string): void {
  const existing = loadKnowledgeGraphPreferences(userId, kbId);
  if (!existing) return;
  saveKnowledgeGraphPreferences(userId, kbId, {
    ...existing,
    centerPointId: '',
  });
}

export interface PageTreePreferences {
  /** Expanded real page / resource-document node ids in the left page tree. */
  expandedNodeIds: string[];
  /** Document pages whose outline (展开目录) is shown under the page node. */
  expandedOutlinePageIds: string[];
}

const STORAGE_KEY = 'tu:page-tree-prefs';

function normalizeIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(
    value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0),
  )];
}

function normalizePreferences(raw: Partial<PageTreePreferences> | null | undefined): PageTreePreferences {
  return {
    expandedNodeIds: normalizeIds(raw?.expandedNodeIds),
    expandedOutlinePageIds: normalizeIds(raw?.expandedOutlinePageIds),
  };
}

function readAll(): Record<string, PageTreePreferences> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Partial<PageTreePreferences>>;
    if (!parsed || typeof parsed !== 'object') return {};
    const result: Record<string, PageTreePreferences> = {};
    for (const [kbId, prefs] of Object.entries(parsed)) {
      if (!kbId.trim()) continue;
      result[kbId] = normalizePreferences(prefs);
    }
    return result;
  } catch {
    return {};
  }
}

export function loadPageTreePreferences(kbId: string): PageTreePreferences {
  if (!kbId.trim()) {
    return { expandedNodeIds: [], expandedOutlinePageIds: [] };
  }
  return normalizePreferences(readAll()[kbId.trim()]);
}

export function savePageTreePreferences(kbId: string, prefs: PageTreePreferences): void {
  if (typeof window === 'undefined' || !kbId.trim()) return;
  try {
    const all = readAll();
    const normalized = normalizePreferences(prefs);
    const empty = normalized.expandedNodeIds.length === 0
      && normalized.expandedOutlinePageIds.length === 0;
    if (empty) {
      delete all[kbId.trim()];
    } else {
      all[kbId.trim()] = normalized;
    }
    if (Object.keys(all).length === 0) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // ignore storage failures
  }
}

export interface PageTocPreferences {
  /** Expanded TOC tree node keys (see getTocExpandKey in TuEditorPage). */
  expandedNodeIds: string[];
  /** Whether the right TOC panel is open. */
  panelOpen: boolean;
  /**
   * When true, TOC expands/collapses and scrolls to follow the heading
   * under the editor cursor. Default on.
   */
  focusFollow: boolean;
}

const STORAGE_KEY = 'tu:page-toc-prefs';

function normalizeIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(
    value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0),
  )];
}

function normalizePreferences(
  raw: Partial<PageTocPreferences> | null | undefined,
): PageTocPreferences {
  return {
    expandedNodeIds: normalizeIds(raw?.expandedNodeIds),
    panelOpen: raw?.panelOpen !== false,
    focusFollow: raw?.focusFollow !== false,
  };
}

function readAll(): Record<string, PageTocPreferences> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Partial<PageTocPreferences>>;
    if (!parsed || typeof parsed !== 'object') return {};
    const result: Record<string, PageTocPreferences> = {};
    for (const [pageId, prefs] of Object.entries(parsed)) {
      if (!pageId.trim()) continue;
      result[pageId] = normalizePreferences(prefs);
    }
    return result;
  } catch {
    return {};
  }
}

export function loadPageTocPreferences(pageId: string): PageTocPreferences {
  if (!pageId.trim()) {
    return { expandedNodeIds: [], panelOpen: true, focusFollow: true };
  }
  return normalizePreferences(readAll()[pageId.trim()]);
}

export function savePageTocPreferences(pageId: string, prefs: PageTocPreferences): void {
  if (typeof window === 'undefined' || !pageId.trim()) return;
  try {
    const all = readAll();
    const normalized = normalizePreferences(prefs);
    const isDefault =
      normalized.expandedNodeIds.length === 0
      && normalized.panelOpen
      && normalized.focusFollow;
    if (isDefault) {
      delete all[pageId.trim()];
    } else {
      all[pageId.trim()] = normalized;
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

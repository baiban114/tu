import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  loadPageTocPreferences,
  savePageTocPreferences,
} from './pageTocPreferences';

function createLocalStorageMock() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
  };
}

describe('pageTocPreferences', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('saves and loads expand state per page', () => {
    const localStorage = createLocalStorageMock();
    vi.stubGlobal('window', { localStorage });

    savePageTocPreferences('page-1', {
      expandedNodeIds: ['local:h1', 'ref-group-r1'],
      panelOpen: false,
    });
    savePageTocPreferences('page-2', {
      expandedNodeIds: ['local:h2'],
      panelOpen: true,
    });

    expect(loadPageTocPreferences('page-1')).toEqual({
      expandedNodeIds: ['local:h1', 'ref-group-r1'],
      panelOpen: false,
    });
    expect(loadPageTocPreferences('page-2')).toEqual({
      expandedNodeIds: ['local:h2'],
      panelOpen: true,
    });
    expect(loadPageTocPreferences('missing')).toEqual({
      expandedNodeIds: [],
      panelOpen: true,
    });
  });

  it('removes default preferences for a page', () => {
    const localStorage = createLocalStorageMock();
    vi.stubGlobal('window', { localStorage });

    savePageTocPreferences('page-1', {
      expandedNodeIds: ['a'],
      panelOpen: false,
    });
    savePageTocPreferences('page-1', {
      expandedNodeIds: [],
      panelOpen: true,
    });

    expect(loadPageTocPreferences('page-1')).toEqual({
      expandedNodeIds: [],
      panelOpen: true,
    });
    expect(localStorage.getItem('tu:page-toc-prefs')).toBeNull();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  loadPageTreePreferences,
  savePageTreePreferences,
} from './pageTreePreferences';

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

describe('pageTreePreferences', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('saves and loads expand state per knowledge base', () => {
    const localStorage = createLocalStorageMock();
    vi.stubGlobal('window', { localStorage });

    savePageTreePreferences('kb-1', {
      expandedNodeIds: ['p1', 'p2'],
      expandedOutlinePageIds: ['p1'],
    });
    savePageTreePreferences('kb-2', {
      expandedNodeIds: ['q1'],
      expandedOutlinePageIds: [],
    });

    expect(loadPageTreePreferences('kb-1')).toEqual({
      expandedNodeIds: ['p1', 'p2'],
      expandedOutlinePageIds: ['p1'],
    });
    expect(loadPageTreePreferences('kb-2')).toEqual({
      expandedNodeIds: ['q1'],
      expandedOutlinePageIds: [],
    });
    expect(loadPageTreePreferences('kb-missing')).toEqual({
      expandedNodeIds: [],
      expandedOutlinePageIds: [],
    });
  });

  it('removes empty preferences for a knowledge base', () => {
    const localStorage = createLocalStorageMock();
    vi.stubGlobal('window', { localStorage });

    savePageTreePreferences('kb-1', {
      expandedNodeIds: ['p1'],
      expandedOutlinePageIds: [],
    });
    savePageTreePreferences('kb-1', {
      expandedNodeIds: [],
      expandedOutlinePageIds: [],
    });

    expect(loadPageTreePreferences('kb-1')).toEqual({
      expandedNodeIds: [],
      expandedOutlinePageIds: [],
    });
    expect(localStorage.getItem('tu:page-tree-prefs')).toBeNull();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearKnowledgeGraphCenterPoint,
  loadKnowledgeGraphPreferences,
  saveKnowledgeGraphPreferences,
} from '@/utils/knowledgeGraphPreferences';

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
    clear: () => {
      store.clear();
    },
  };
}

describe('knowledgeGraphPreferences', () => {
  beforeEach(() => {
    const localStorage = createLocalStorageMock();
    vi.stubGlobal('window', { localStorage });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('saves and loads preferences per user and kb', () => {
    saveKnowledgeGraphPreferences('user-1', 'kb-a', {
      centerPointId: 'kp-1',
      mode: 'centered',
      depth: 2,
      direction: 'out',
      selectedTypeKeys: ['related'],
    });

    expect(loadKnowledgeGraphPreferences('user-1', 'kb-a')).toMatchObject({
      centerPointId: 'kp-1',
      mode: 'centered',
      depth: 2,
    });
    expect(loadKnowledgeGraphPreferences('user-1', 'kb-b')).toBeNull();
    expect(loadKnowledgeGraphPreferences('user-2', 'kb-a')).toBeNull();
  });

  it('clears center point while keeping other settings', () => {
    saveKnowledgeGraphPreferences('user-1', 'kb-a', {
      centerPointId: 'kp-1',
      mode: 'prerequisite',
      depth: 3,
      direction: 'both',
      selectedTypeKeys: ['prerequisite'],
    });

    clearKnowledgeGraphCenterPoint('user-1', 'kb-a');
    expect(loadKnowledgeGraphPreferences('user-1', 'kb-a')).toBeNull();
  });
});

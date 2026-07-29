import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearKnowledgePointReadingPreview,
  loadKnowledgePointReadingPreview,
  normalizeKnowledgePointReadingPreviewState,
  saveKnowledgePointReadingPreview,
} from './knowledgePointReadingState'

function createLocalStorageMock() {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => store.clear(),
  }
}

describe('knowledgePointReadingState', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('normalizes valid state', () => {
    expect(normalizeKnowledgePointReadingPreviewState({
      pointId: ' kp-1 ',
      displayTypeCode: 'concept',
      updatedAt: 1,
    })).toEqual({
      pointId: 'kp-1',
      displayTypeCode: 'concept',
      updatedAt: 1,
    })
  })

  it('saves and loads per page', () => {
    const localStorage = createLocalStorageMock()
    vi.stubGlobal('localStorage', localStorage)

    saveKnowledgePointReadingPreview('u1', 'page-a', { pointId: 'kp-1', updatedAt: 1 })
    saveKnowledgePointReadingPreview('u1', 'page-b', { pointId: 'kp-2', updatedAt: 2 })
    expect(loadKnowledgePointReadingPreview('u1', 'page-a')?.pointId).toBe('kp-1')
    expect(loadKnowledgePointReadingPreview('u1', 'page-b')?.pointId).toBe('kp-2')
  })

  it('clears page state', () => {
    const localStorage = createLocalStorageMock()
    vi.stubGlobal('localStorage', localStorage)

    saveKnowledgePointReadingPreview(null, 'page-a', { pointId: 'kp-1', updatedAt: 1 })
    clearKnowledgePointReadingPreview(null, 'page-a')
    expect(loadKnowledgePointReadingPreview(null, 'page-a')).toBeNull()
  })
})

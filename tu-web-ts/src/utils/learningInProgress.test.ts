import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { HeadingSourceBinding } from '@/api/types'
import {
  buildLearningInProgressResourceLink,
  canAutoMarkFromInProgress,
  clearLearningInProgress,
  formatLearningInProgressLabel,
  formatLearningInProgressMarkAsLabel,
  formatReuseMarkOfferLabel,
  learningInProgressFromBinding,
  learningInProgressToBinding,
  loadLearningInProgress,
  saveLearningInProgress,
} from '@/utils/learningInProgress'

const sampleBinding: HeadingSourceBinding = {
  resourceItemId: 'ri-1',
  resourceExcerptId: 're-1',
  snapshot: {
    resourceTitle: '示例书',
    resourceTypeName: '图书',
    excerptTitle: '第 3 章',
    excerptLocator: 'p. 12',
  },
  markerSource: 'user',
}

describe('learningInProgress', () => {
  const memory = new Map<string, string>()

  beforeEach(() => {
    memory.clear()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => { memory.set(key, value) },
      removeItem: (key: string) => { memory.delete(key) },
    })
    vi.stubGlobal('sessionStorage', {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    })
    clearLearningInProgress('u1')
  })

  it('saves and loads item+excerpt target per user', () => {
    const saved = saveLearningInProgress('u1', sampleBinding)
    expect(saved?.resourceItemId).toBe('ri-1')
    expect(saved?.resourceExcerptId).toBe('re-1')
    expect(canAutoMarkFromInProgress(saved)).toBe(true)

    const loaded = loadLearningInProgress('u1')
    expect(loaded?.snapshot.excerptTitle).toBe('第 3 章')
    expect(formatLearningInProgressLabel(loaded!)).toBe('示例书')
    expect(formatLearningInProgressMarkAsLabel(loaded!)).toBe('第 3 章')
    expect(learningInProgressToBinding(loaded!).resourceExcerptId).toBe('re-1')
  })

  it('supports item-only targets without auto-mark', () => {
    const itemOnly = learningInProgressFromBinding({
      ...sampleBinding,
      resourceExcerptId: null,
      snapshot: {
        resourceTitle: '示例文档',
        resourceTypeName: '文档',
      },
    })
    expect(itemOnly).not.toBeNull()
    expect(canAutoMarkFromInProgress(itemOnly)).toBe(false)
    expect(formatLearningInProgressLabel(itemOnly!)).toBe('示例文档')
    expect(formatLearningInProgressMarkAsLabel(itemOnly!)).toBe('示例文档')

    const link = buildLearningInProgressResourceLink(itemOnly!)
    expect(link.query.itemId).toBe('ri-1')
    expect(link.query.excerptId).toBeUndefined()
  })

  it('rejects empty resource item id', () => {
    expect(saveLearningInProgress('u1', {
      ...sampleBinding,
      resourceItemId: '  ',
    })).toBeNull()
    expect(loadLearningInProgress('u1')).toBeNull()
  })

  it('formats reuse offer label as resource>hierarchy', () => {
    expect(formatReuseMarkOfferLabel(sampleBinding, '第二节')).toBe('示例书>第二节')
    expect(formatReuseMarkOfferLabel(sampleBinding, '示例书>第二节')).toBe('示例书>第二节')
    expect(formatReuseMarkOfferLabel(sampleBinding, '示例书')).toBe('示例书')
  })
})

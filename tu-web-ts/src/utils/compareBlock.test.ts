import { describe, expect, it } from 'vitest'
import {
  COMPARE_BLOCK_DEFAULT_HEIGHT,
  createCompareBlockAttrs,
  createCompareBlockId,
} from './compareBlock'

describe('compareBlock attrs', () => {
  it('creates a stable id prefix', () => {
    expect(createCompareBlockId().startsWith('compare-')).toBe(true)
  })

  it('defaults middle text empty and sides unbound', () => {
    const attrs = createCompareBlockAttrs()
    expect(attrs.height).toBe(COMPARE_BLOCK_DEFAULT_HEIGHT)
    expect(attrs.middleText).toBe('')
    expect(attrs.leftSide).toBeNull()
    expect(attrs.rightSide).toBeNull()
    expect(attrs.title).toBe('文本比较')
    expect(attrs.blockId.startsWith('compare-')).toBe(true)
  })

  it('accepts overrides for sides and middle text', () => {
    const leftSide = {
      resourceItemId: 'ri-1',
      resourceExcerptId: 're-1',
      mode: 'excerpt' as const,
      snapshot: { resourceTitle: '书', excerptTitle: '节选', excerptText: '正文' },
    }
    const attrs = createCompareBlockAttrs({
      middleText: '综合笔记',
      leftSide,
      height: 400,
    })
    expect(attrs.middleText).toBe('综合笔记')
    expect(attrs.leftSide).toEqual(leftSide)
    expect(attrs.rightSide).toBeNull()
    expect(attrs.height).toBe(400)
  })
})

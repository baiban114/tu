import { describe, expect, it } from 'vitest'
import {
  cellContentBindingToData,
  emptyCellContentDocument,
  isCellContentBound,
  readCellContentBinding,
} from '@/utils/cellContent'

describe('cellContent', () => {
  it('reads bound page and abstract document from cell data', () => {
    const doc = emptyCellContentDocument()
    expect(readCellContentBinding({
      boundPageId: ' p1 ',
      boundPageTitle: '文档 A',
      contentDocument: doc,
    })).toEqual({
      boundPageId: 'p1',
      boundPageTitle: '文档 A',
      contentDocument: doc,
    })
  })

  it('treats missing / invalid fields as unbound abstract', () => {
    expect(readCellContentBinding({})).toEqual({
      boundPageId: null,
      boundPageTitle: null,
      contentDocument: null,
    })
    expect(readCellContentBinding({ contentDocument: { type: 'paragraph' } }).contentDocument).toBeNull()
    expect(isCellContentBound({ boundPageId: null })).toBe(false)
    expect(isCellContentBound({ boundPageId: 'p1' })).toBe(true)
  })

  it('serializes binding for cell data patch', () => {
    const doc = emptyCellContentDocument()
    expect(cellContentBindingToData({
      boundPageId: 'p1',
      boundPageTitle: 'Page',
      contentDocument: doc,
    })).toEqual({
      boundPageId: 'p1',
      boundPageTitle: 'Page',
      contentDocument: doc,
    })
  })
})

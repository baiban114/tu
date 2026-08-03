import { describe, expect, it } from 'vitest'
import {
  emptyEdgeContentDocument,
  isEdgeContentBound,
  readEdgeContentBinding,
} from '@/utils/edgeContent'

describe('edgeContent', () => {
  it('reads bound page and abstract document from edge data', () => {
    const doc = emptyEdgeContentDocument()
    expect(readEdgeContentBinding({
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
    expect(readEdgeContentBinding({})).toEqual({
      boundPageId: null,
      boundPageTitle: null,
      contentDocument: null,
    })
    expect(readEdgeContentBinding({ contentDocument: { type: 'paragraph' } }).contentDocument).toBeNull()
    expect(isEdgeContentBound({ boundPageId: null })).toBe(false)
    expect(isEdgeContentBound({ boundPageId: 'p1' })).toBe(true)
  })
})

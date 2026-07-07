import { describe, expect, it } from 'vitest'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { FlatTocEntry } from '@/utils/toc/headings'
import { getTocSectionBoundaryPos } from '@/utils/toc/tocSections'

describe('toc section boundaries', () => {
  it('uses next flat toc entry with same or higher level as boundary', () => {
    const doc = { content: { size: 10 } } as ProseMirrorNode
    const flat: FlatTocEntry[] = [
      { id: 'h-0', blockId: 'h1', level: 2, text: 'H2', pos: 0, sortIndex: 0, sourceType: 'local' },
      { id: 'ref-group-ref-1', blockId: 'ref-1', level: 2, text: '引用', pos: 2, sortIndex: 0, sourceType: 'ref-group' },
      { id: 'h-4', blockId: 'h2', level: 2, text: 'H2 next', pos: 4, sortIndex: 0, sourceType: 'local' },
      { id: 'h-8', blockId: 'h3', level: 3, text: 'H3 inner', pos: 6, sortIndex: 0, sourceType: 'local' },
    ]

    expect(getTocSectionBoundaryPos(flat, 0, doc)).toBe(2)
    expect(getTocSectionBoundaryPos(flat, 1, doc)).toBe(4)
    expect(getTocSectionBoundaryPos(flat, 2, doc)).toBe(10)
    expect(getTocSectionBoundaryPos(flat, 3, doc)).toBe(10)
  })
})

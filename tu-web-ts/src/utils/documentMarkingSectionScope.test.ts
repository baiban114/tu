import { describe, expect, it } from 'vitest'
import { buildDocumentMarkingSectionScope } from '@/utils/documentMarkingSectionScope'
import type { FlatTocEntry } from '@/utils/toc/headings'

describe('documentMarkingSectionScope', () => {
  it('maps local heading section to heading block id', () => {
    const entry: FlatTocEntry = {
      id: 'h-1',
      blockId: 'heading-1',
      level: 2,
      text: '背景介绍',
      pos: 10,
      sortIndex: 0,
      sourceType: 'local',
    }
    expect(buildDocumentMarkingSectionScope(entry)).toEqual({
      sectionHeadingBlockId: 'heading-1',
      sectionTitle: '背景介绍',
    })
  })

  it('maps ref-group section to embed block id', () => {
    const entry: FlatTocEntry = {
      id: 'ref-group-ref-1',
      blockId: 'ref-1',
      level: 2,
      text: '引用页面',
      pos: 20,
      sortIndex: 0,
      sourceType: 'ref-group',
      refId: 'page-2',
    }
    expect(buildDocumentMarkingSectionScope(entry)).toEqual({
      sectionEmbedBlockId: 'ref-1',
      sectionTitle: '引用页面',
    })
  })
})

import { describe, expect, it } from 'vitest'
import {
  buildTocEntrySourceLocator,
  buildTocRootSourceLocator,
  locatorFromHeadingSourceBinding,
} from '@/utils/toc/tocMindmapLocator'
import type { TocTreeItem } from '@/utils/toc/headings'

function toc(partial: Partial<TocTreeItem> & Pick<TocTreeItem, 'id' | 'text'>): TocTreeItem {
  return {
    blockId: partial.blockId ?? partial.id,
    level: partial.level ?? 1,
    pos: partial.pos ?? 0,
    sourceType: partial.sourceType ?? 'local',
    ...partial,
  }
}

describe('tocMindmapLocator', () => {
  it('builds page root locator', () => {
    expect(buildTocRootSourceLocator('p1', '标题')).toBe('page:p1')
  })

  it('builds heading locator for local TOC entries', () => {
    expect(buildTocEntrySourceLocator('p1', toc({ id: 'h1', text: '第一章', blockId: 'b1' })))
      .toBe('page:p1:heading:b1')
  })

  it('builds block locator for ref-group entries', () => {
    expect(buildTocEntrySourceLocator('p1', toc({
      id: 'rg',
      text: '引用',
      blockId: 'ref-1',
      sourceType: 'ref-group',
    }))).toBe('page:p1:block:ref-1')
  })

  it('prefers resource locator from sourceBinding', () => {
    expect(buildTocEntrySourceLocator('p1', toc({
      id: 'h1',
      text: '章',
      blockId: 'b1',
      sourceBinding: {
        resourceItemId: 'ri-1',
        resourceExcerptId: 're-9',
        snapshot: { resourceTitle: '书', excerptTitle: '节选' },
      },
    }))).toBe('resource:ri-1:excerpt:re-9')
  })

  it('builds chapter / item resource locators from binding', () => {
    expect(locatorFromHeadingSourceBinding({
      resourceItemId: 'ri-1',
      resourceChapterId: 'rc-2',
      snapshot: { resourceTitle: '书', chapterTitle: '第1章' },
    })).toBe('resource:ri-1:chapter:rc-2')

    expect(locatorFromHeadingSourceBinding({
      resourceItemId: 'ri-1',
      snapshot: { resourceTitle: '书' },
    })).toBe('resource:ri-1')
  })
})

import { describe, expect, it } from 'vitest'
import { buildHandleMenuItems, buildSectionHandleItems, getSectionHandleMenuContext } from './lineHandleMenu'
import type { FlatTocEntry } from '@/utils/toc/headings'

describe('lineHandleMenu', () => {
  it('includes knowledge actions for paragraph and section handles', () => {
    const paragraphKeys = buildHandleMenuItems({ kind: 'paragraph', pos: 1 }).map((item) => item.key)
    const sectionKeys = buildHandleMenuItems({ kind: 'section', entryId: 'sec-1' }, getSectionHandleMenuContext({
      id: 'sec-1',
      blockId: 'h1',
      level: 2,
      text: 'Heading',
      pos: 0,
      sortIndex: 0,
      sourceType: 'local',
    })).map((item) => item.key)

    expect(paragraphKeys).toContain('add-note')
    expect(paragraphKeys).toContain('create-knowledge-relation')
    expect(sectionKeys).toContain('add-note')
    expect(sectionKeys).toContain('create-knowledge-relation')
    expect(sectionKeys).toContain('section-ai-marking')
  })

  it('uses paragraph labels for paragraph handle and section labels for section handle', () => {
    const paragraphItems = buildHandleMenuItems({ kind: 'paragraph', pos: 1 })
    const sectionItems = buildHandleMenuItems({ kind: 'section', entryId: 'sec-1' }, getSectionHandleMenuContext({
      id: 'sec-1',
      blockId: 'h1',
      level: 2,
      text: 'Heading',
      pos: 0,
      sortIndex: 0,
      sourceType: 'local',
    }))

    expect(paragraphItems.find((item) => item.key === 'add-note')?.label).toBe('添加标注')
    expect(paragraphItems.find((item) => item.key === 'cut')?.label).toBe('剪切段落')
    expect(paragraphItems.find((item) => item.key === 'duplicate')?.label).toBe('复制段落')
    expect(paragraphItems.find((item) => item.key === 'delete')?.label).toBe('删除段落')
    expect(sectionItems.find((item) => item.key === 'add-note')?.label).toBe('添加标注（本节）')
    expect(sectionItems.find((item) => item.key === 'create-knowledge-relation')?.label).toBe('建立关联')
    expect(sectionItems.find((item) => item.key === 'mark-excerpt')?.label).toBe('标记节选（本节）')
    expect(paragraphItems.find((item) => item.key === 'mark-excerpt')?.label).toBe('标记节选')
    expect(sectionItems.find((item) => item.key === 'delete')?.label).toBe('删除本节')
  })

  it('adds section metadata actions based on entry context', () => {
    const localEntry: FlatTocEntry = {
      id: 'h-1',
      blockId: 'h1',
      level: 2,
      text: 'Heading',
      pos: 0,
      sortIndex: 0,
      sourceType: 'local',
    }
    const localKeys = buildSectionHandleItems(localEntry).map((item) => item.key)
    expect(localKeys).toContain('mark-heading-source')
    expect(localKeys).toContain('edit-section-tags')
    expect(localKeys).not.toContain('clear-heading-source')

    const boundEntry: FlatTocEntry = {
      ...localEntry,
      sourceBinding: {
        resourceItemId: 'ri-1',
        resourceExcerptId: 're-1',
        snapshot: { resourceTitle: 'Book', excerptTitle: 'Excerpt' },
      },
    }
    const boundKeys = buildSectionHandleItems(boundEntry).map((item) => item.key)
    expect(boundKeys).toContain('clear-heading-source')

    const refGroupEntry: FlatTocEntry = {
      id: 'ref-1',
      blockId: 'ref-1',
      level: 2,
      text: 'Embed',
      pos: 2,
      sortIndex: 0,
      sourceType: 'ref-group',
    }
    const refKeys = buildSectionHandleItems(refGroupEntry).map((item) => item.key)
    expect(refKeys).toContain('edit-section-tags')
    expect(refKeys).not.toContain('mark-heading-source')
  })
})

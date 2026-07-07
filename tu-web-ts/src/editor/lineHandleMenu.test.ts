import { describe, expect, it } from 'vitest'
import { buildHandleMenuItems } from './lineHandleMenu'

describe('lineHandleMenu', () => {
  it('includes knowledge actions for line and section handles', () => {
    const lineKeys = buildHandleMenuItems({ kind: 'line', pos: 1 }).map((item) => item.key)
    const sectionKeys = buildHandleMenuItems({ kind: 'section', entryId: 'sec-1' }).map((item) => item.key)

    expect(lineKeys).toContain('add-note')
    expect(lineKeys).toContain('create-knowledge-relation')
    expect(sectionKeys).toContain('add-note')
    expect(sectionKeys).toContain('create-knowledge-relation')
  })

  it('only relabels section-specific operations', () => {
    const lineItems = buildHandleMenuItems({ kind: 'line', pos: 1 })
    const sectionItems = buildHandleMenuItems({ kind: 'section', entryId: 'sec-1' })

    expect(lineItems.find((item) => item.key === 'add-note')?.label).toBe('添加标注')
    expect(sectionItems.find((item) => item.key === 'add-note')?.label).toBe('添加标注（本节）')
    expect(lineItems.find((item) => item.key === 'create-knowledge-relation')?.label).toBe('建立关联')
    expect(sectionItems.find((item) => item.key === 'mark-excerpt')?.label).toBe('标记节选（本节）')
    expect(lineItems.find((item) => item.key === 'mark-excerpt')?.label).toBe('标记节选')
  })
})

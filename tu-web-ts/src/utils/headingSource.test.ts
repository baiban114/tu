import { describe, expect, it } from 'vitest'
import { headingSourceMetaChips, serializeHeadingSourceComment, parseHeadingSourceComment } from './headingSource'
import type { HeadingSourceBinding } from '@/api/types'

describe('headingSourceMetaChips', () => {
  it('builds chips with type, work title, locator and excerpt title', () => {
    const binding: HeadingSourceBinding = {
      resourceItemId: 'ri-1',
      resourceExcerptId: 're-1',
      snapshot: {
        resourceTitle: '示例之书',
        resourceTypeName: '图书',
        workTitle: '结构化笔记',
        excerptTitle: '关于结构化笔记',
        excerptLocator: 'page:18',
      },
    }
    expect(headingSourceMetaChips(binding)).toEqual([
      '来源',
      '图书',
      '结构化笔记',
      '第 18 页',
      '关于结构化笔记',
    ])
  })

  it('falls back to resourceTitle when workTitle missing', () => {
    const binding: HeadingSourceBinding = {
      resourceItemId: 'ri-1',
      resourceExcerptId: 're-1',
      snapshot: {
        resourceTitle: '示例之书',
        excerptTitle: '节选 A',
      },
    }
    expect(headingSourceMetaChips(binding)).toEqual(['来源', '示例之书', '节选 A'])
  })
})

describe('heading source workTitle persistence', () => {
  it('roundtrips work-title attribute', () => {
    const binding: HeadingSourceBinding = {
      resourceItemId: 'ri-1',
      resourceExcerptId: 're-2',
      snapshot: {
        resourceTitle: '书',
        workTitle: '归类名',
        excerptTitle: '节选',
      },
    }
    const comment = serializeHeadingSourceComment('hs-1', binding)
    expect(comment).toContain('work-title="归类名"')
    const parsed = parseHeadingSourceComment(comment.replace(/^<!--tu:heading-source\s+/, '').replace(/-->$/, ''))
    expect(parsed?.binding.snapshot.workTitle).toBe('归类名')
  })
})

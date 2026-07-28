import { describe, expect, it } from 'vitest'
import type { HeadingSourceBinding, TextAnnotation } from '@/api/types'
import {
  blockquoteExcerptMetaChips,
  blockquoteExcerptMetaPathParts,
  blockquoteExcerptMetaRole,
  resolveBlockResourceBinding,
} from './blockquoteExcerpt'

const binding = (partial: Partial<HeadingSourceBinding> & Pick<HeadingSourceBinding, 'resourceItemId'>): HeadingSourceBinding => ({
  resourceItemId: partial.resourceItemId,
  resourceExcerptId: partial.resourceExcerptId ?? null,
  snapshot: {
    resourceTitle: partial.snapshot?.resourceTitle || '书名',
    resourceTypeName: partial.snapshot?.resourceTypeName || '图书',
    workTitle: partial.snapshot?.workTitle,
    excerptTitle: partial.snapshot?.excerptTitle,
    excerptLocator: partial.snapshot?.excerptLocator,
  },
})

describe('blockquoteExcerptMetaChips', () => {
  it('uses 资源节选 for excerpt role and 依据 for basis role', () => {
    const b = binding({
      resourceItemId: 'ri-1',
      resourceExcerptId: 're-1',
      snapshot: { resourceTitle: '书名', resourceTypeName: '图书', workTitle: '系列', excerptLocator: 'page:3' },
    })
    expect(blockquoteExcerptMetaChips(b, 'excerpt')[0]).toBe('资源节选')
    expect(blockquoteExcerptMetaChips(b, 'basis')[0]).toBe('依据')
  })

  it('keeps role out of locator path parts', () => {
    const b = binding({
      resourceItemId: 'ri-1',
      resourceExcerptId: 're-1',
      snapshot: { resourceTitle: '书名', resourceTypeName: '图书', workTitle: '系列', excerptLocator: 'page:3' },
    })
    expect(blockquoteExcerptMetaPathParts(b, 'basis')).toEqual(['图书', '系列', '书名', '第 3 页'])
    expect(blockquoteExcerptMetaRole('basis')).toBe('依据')
  })
})

describe('resolveBlockResourceBinding', () => {
  it('prefers stored excerptBinding', () => {
    const stored = binding({
      resourceItemId: 'ri-1',
      resourceExcerptId: 're-1',
      snapshot: { resourceTitle: 'A' },
    })
    const resolved = resolveBlockResourceBinding(
      { attrs: { blockId: 'bq-1', excerptBinding: stored } },
      0,
      10,
      [],
    )
    expect(resolved?.role).toBe('excerpt')
    expect(resolved?.binding.resourceExcerptId).toBe('re-1')
  })

  it('resolves basis annotation without excerpt id', () => {
    const basisBinding = binding({
      resourceItemId: 'ri-2',
      resourceExcerptId: null,
      snapshot: { resourceTitle: '实体' },
    })
    const annotations: TextAnnotation[] = [{
      id: 'basis-1',
      kind: 'basis',
      basisBinding,
      selectedText: '',
      contextBefore: '',
      contextAfter: '',
      note: '',
      color: '#A5D6A7',
      createdAt: 1,
      updatedAt: 1,
      blockId: '',
      unresolved: false,
      scope: 'block',
      spannedBlockIds: ['bq-2'],
    }]
    const resolved = resolveBlockResourceBinding(
      { attrs: { blockId: 'bq-2' } },
      0,
      10,
      annotations,
    )
    expect(resolved?.role).toBe('basis')
    expect(resolved?.binding.resourceItemId).toBe('ri-2')
    expect(resolved?.binding.resourceExcerptId).toBeNull()
  })
})

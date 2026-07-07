import { describe, expect, it } from 'vitest'
import type { PageContent } from '@/api/types'
import { getPageTags, mergeTagPools, setPageTags } from './pageMetadata'

describe('pageMetadata', () => {
  const emptyPage: PageContent = {
    content: '',
    embeds: [],
    annotations: [],
  }

  it('returns empty tags when metadata is missing', () => {
    expect(getPageTags(emptyPage)).toEqual([])
    expect(getPageTags(null)).toEqual([])
  })

  it('normalizes and reads page tags', () => {
    const page: PageContent = {
      ...emptyPage,
      metadata: {
        tags: [{ id: 't1', label: '  重要  ', color: '#1677ff' }],
      },
    }
    expect(getPageTags(page)).toEqual([
      { id: 't1', label: '重要', color: '#1677ff' },
    ])
  })

  it('sets page tags immutably', () => {
    const next = setPageTags(emptyPage, ['设计', 'review'])
    expect(next).not.toBe(emptyPage)
    expect(getPageTags(next)).toHaveLength(2)
    expect(getPageTags(next).map((t) => t.label).sort()).toEqual(['review', '设计'])
  })

  it('removes tags key when cleared', () => {
    const withTags = setPageTags(emptyPage, ['a'])
    const cleared = setPageTags(withTags, [])
    expect(cleared.metadata?.tags).toBeUndefined()
  })

  it('preserves other metadata fields', () => {
    const page: PageContent = {
      ...emptyPage,
      metadata: { primaryEmbedId: 'mindmap-1' },
    }
    const next = setPageTags(page, ['画布'])
    expect(next.metadata?.primaryEmbedId).toBe('mindmap-1')
    expect(getPageTags(next)).toHaveLength(1)
  })

  it('mergeTagPools dedupes by label', () => {
    const merged = mergeTagPools(
      [{ id: '1', label: 'A', color: '#1677ff' }],
      [{ id: '2', label: 'a', color: '#13c2c2' }],
      [{ id: '3', label: 'B', color: '#52c41a' }],
    )
    expect(merged).toHaveLength(2)
    expect(merged.map((t) => t.label)).toEqual(['A', 'B'])
  })
})

import { describe, expect, it } from 'vitest'
import {
  formatResourceHrefPage,
  resourceHrefPageLimitText,
  splitResourceHref,
  syncResourceHrefWithPdfPages,
  stripHrefFragment,
} from '@/editor/linkLabelSuggestQuery'

describe('resource href #page= codec', () => {
  it('splits base without fragment', () => {
    expect(splitResourceHref('resource:ri-1')).toEqual({ base: 'resource:ri-1' })
  })

  it('parses Obsidian-style #page=N and #page=N-M', () => {
    expect(splitResourceHref('resource:ri-1#page=12')).toEqual({
      base: 'resource:ri-1',
      pageStart: 12,
      pageEnd: 12,
    })
    expect(splitResourceHref('resource:ri-1:chapter:c1#page=3-5')).toEqual({
      base: 'resource:ri-1:chapter:c1',
      pageStart: 3,
      pageEnd: 5,
    })
  })

  it('ignores invalid page fragments', () => {
    expect(splitResourceHref('resource:ri-1#page=0')).toEqual({ base: 'resource:ri-1' })
    expect(splitResourceHref('resource:ri-1#page=5-3')).toEqual({ base: 'resource:ri-1' })
    expect(splitResourceHref('resource:ri-1#height=400')).toEqual({ base: 'resource:ri-1' })
  })

  it('formats page fragments', () => {
    expect(formatResourceHrefPage('resource:ri-1', 12)).toBe('resource:ri-1#page=12')
    expect(formatResourceHrefPage('resource:ri-1#page=99', 3, 5)).toBe('resource:ri-1#page=3-5')
    expect(formatResourceHrefPage('resource:ri-1:chapter:c1', 1, 1)).toBe(
      'resource:ri-1:chapter:c1#page=1',
    )
  })

  it('syncs href with pdf pages for excerpt / full', () => {
    expect(syncResourceHrefWithPdfPages('resource:ri-1', 'excerpt', 3, 5)).toBe(
      'resource:ri-1#page=3-5',
    )
    expect(syncResourceHrefWithPdfPages('resource:ri-1#page=3-5', 'full', 1, 100)).toBe(
      'resource:ri-1',
    )
    expect(syncResourceHrefWithPdfPages('resource:ri-1#page=9', 'excerpt', 9, 9)).toBe(
      'resource:ri-1#page=9',
    )
  })

  it('strips fragment', () => {
    expect(stripHrefFragment('resource:ri-1#page=2')).toBe('resource:ri-1')
  })

  it('formats visible page-limit text for collapsed links', () => {
    expect(resourceHrefPageLimitText('resource:ri-1')).toBeNull()
    expect(resourceHrefPageLimitText('resource:ri-1#page=12')).toBe('#page=12')
    expect(resourceHrefPageLimitText('resource:ri-1#page=3-5')).toBe('#page=3-5')
  })
})

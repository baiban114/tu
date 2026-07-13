import { describe, expect, it } from 'vitest'
import {
  collectProtectedLocators,
  isLocatorProtected,
  protectedLocatorSet,
} from '@/utils/documentMarkingContext'
import type { PageContent } from '@/api/types'

describe('documentMarkingContext', () => {
  const pageId = 'page-1'

  it('collects user heading and basis as protected', () => {
    const content: Pick<PageContent, 'document' | 'annotations'> = {
      document: {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: {
              blockId: 'h1',
              level: 2,
              sourceBinding: {
                resourceItemId: 'ri-1',
                resourceExcerptId: 're-1',
                snapshot: { resourceTitle: 'Book', excerptTitle: 'Ch1' },
              },
            },
            content: [{ type: 'text', text: 'Intro' }],
          },
        ],
      },
      annotations: [
        {
          id: 'ann-1',
          selectedText: 'evidence',
          contextBefore: '',
          contextAfter: '',
          note: '',
          color: '#fff',
          createdAt: 1,
          updatedAt: 1,
          kind: 'basis',
          basisBinding: {
            resourceItemId: 'ri-2',
            resourceExcerptId: 're-2',
            snapshot: { resourceTitle: 'Paper' },
          },
        },
      ],
    }

    const protectedEntries = collectProtectedLocators(pageId, content)
    expect(protectedEntries).toHaveLength(2)
    expect(protectedEntries[0].locator).toBe(`page:${pageId}:heading:h1`)
    expect(protectedEntries[1].locator).toBe(`page:${pageId}:annotation:ann-1`)
  })

  it('skips ai markers for protection', () => {
    const content: Pick<PageContent, 'document' | 'annotations'> = {
      document: {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: {
              blockId: 'h-ai',
              level: 2,
              sourceBinding: {
                resourceItemId: 'ri-1',
                resourceExcerptId: 're-1',
                markerSource: 'ai',
                snapshot: { resourceTitle: 'Book' },
              },
            },
            content: [{ type: 'text', text: 'AI heading' }],
          },
        ],
      },
      annotations: [],
    }

    expect(collectProtectedLocators(pageId, content)).toHaveLength(0)
  })

  it('detects locator overlap for protection', () => {
    const protectedSet = protectedLocatorSet([
      { locator: `page:${pageId}:heading:h1`, type: 'heading', label: 'H' },
    ])
    expect(isLocatorProtected(`page:${pageId}:heading:h1`, protectedSet)).toBe(true)
    expect(isLocatorProtected(`page:${pageId}:heading:h2`, protectedSet)).toBe(false)
  })
})

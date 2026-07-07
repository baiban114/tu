import { describe, expect, it } from 'vitest'
import { pageContentToTipTap, tipTapToPageContent } from './converters'
import type { PageContent } from '@/api/types'

describe('heading source markdown roundtrip', () => {
  it('preserves heading source binding through parse and serialize', () => {
    const pc: PageContent = {
      content: [
        '<!--tu:heading-source id="hs-test1" item="ri-1" excerpt="re-2" title="节选标题" locator="p.18" type="book" resource-title="示例之书"-->',
        '## 本节标题',
      ].join('\n'),
      embeds: [],
      annotations: [],
    }

    const doc = pageContentToTipTap(pc)
    const heading = doc.content?.find((node) => node.type === 'heading')
    expect(heading?.attrs?.blockId).toBe('hs-test1')
    expect(heading?.attrs?.sourceBinding).toMatchObject({
      resourceItemId: 'ri-1',
      resourceExcerptId: 're-2',
      snapshot: {
        resourceTitle: '示例之书',
        resourceTypeName: 'book',
        excerptTitle: '节选标题',
        excerptLocator: 'p.18',
      },
    })

    const roundtrip = tipTapToPageContent(doc)
    expect(roundtrip.content).toContain('<!--tu:heading-source id="hs-test1"')
    expect(roundtrip.content).toContain('## 本节标题')
  })

  it('leaves plain headings unchanged', () => {
    const pc: PageContent = {
      content: '## Plain heading',
      embeds: [],
      annotations: [],
    }
    const doc = pageContentToTipTap(pc)
    const heading = doc.content?.find((node) => node.type === 'heading')
    expect(heading?.attrs?.sourceBinding).toBeUndefined()
    expect(tipTapToPageContent(doc).content).toBe('## Plain heading')
  })
})

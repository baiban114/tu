import { describe, expect, it } from 'vitest'
import { pageContentToTipTap, tipTapToPageContent } from './converters'
import type { PageContent } from '@/api/types'

describe('heading section fold markdown roundtrip', () => {
  it('preserves sectionCollapsed and blockId through parse and serialize', () => {
    const pc: PageContent = {
      content: [
        '<!--tu:heading-fold id="hs-fold1" collapsed="true"-->',
        '## 本节标题',
        '',
        '节内段落',
      ].join('\n'),
      embeds: [],
      annotations: [],
    }

    const doc = pageContentToTipTap(pc)
    const heading = doc.content?.find((node) => node.type === 'heading')
    expect(heading?.attrs?.blockId).toBe('hs-fold1')
    expect(heading?.attrs?.sectionCollapsed).toBe(true)

    const roundtrip = tipTapToPageContent(doc)
    expect(roundtrip.content).toContain('<!--tu:heading-fold id="hs-fold1" collapsed="true"-->')
    expect(roundtrip.content).toContain('## 本节标题')
    expect(roundtrip.content).toContain('节内段落')
  })

  it('coexists with heading source comments', () => {
    const pc: PageContent = {
      content: [
        '<!--tu:heading-fold id="hs-both" collapsed="true"-->',
        '<!--tu:heading-source id="hs-both" item="ri-1" excerpt="re-2" title="节选" type="book" resource-title="书"-->',
        '## 双注释标题',
      ].join('\n'),
      embeds: [],
      annotations: [],
    }

    const doc = pageContentToTipTap(pc)
    const heading = doc.content?.find((node) => node.type === 'heading')
    expect(heading?.attrs?.blockId).toBe('hs-both')
    expect(heading?.attrs?.sectionCollapsed).toBe(true)
    expect(heading?.attrs?.sourceBinding).toMatchObject({
      resourceItemId: 'ri-1',
      resourceExcerptId: 're-2',
    })

    const roundtrip = tipTapToPageContent(doc)
    expect(roundtrip.content).toContain('<!--tu:heading-fold id="hs-both" collapsed="true"-->')
    expect(roundtrip.content).toContain('<!--tu:heading-source id="hs-both"')
    expect(roundtrip.content).toContain('## 双注释标题')
  })

  it('preserves stable heading blockId for section tags without fold or source', () => {
    const pc: PageContent = {
      content: [
        '<!--tu:heading-id id="hs-section-b"-->',
        '### B节',
        '',
        'B节正文',
      ].join('\n'),
      embeds: [],
      annotations: [],
    }

    const doc = pageContentToTipTap(pc)
    const heading = doc.content?.find((node) => node.type === 'heading')
    expect(heading?.attrs?.blockId).toBe('hs-section-b')

    const roundtrip = tipTapToPageContent(doc)
    expect(roundtrip.content).toContain('<!--tu:heading-id id="hs-section-b"-->')
    expect(roundtrip.content).toContain('### B节')
  })

  it('omits fold comment when section is expanded', () => {
    const pc: PageContent = {
      content: '## Plain heading\n\nBody',
      embeds: [],
      annotations: [],
    }
    const doc = pageContentToTipTap(pc)
    const heading = doc.content?.find((node) => node.type === 'heading')
    expect(heading?.attrs?.sectionCollapsed).toBeFalsy()
    expect(tipTapToPageContent(doc).content).not.toContain('tu:heading-fold')
  })
})

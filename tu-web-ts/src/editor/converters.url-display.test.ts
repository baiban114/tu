import { describe, expect, it } from 'vitest'
import { pageContentToTipTap, tipTapToPageContent } from './converters'
import type { PageContent } from '@/api/types'

describe('url display markdown roundtrip', () => {
  it('preserves title-mode link display comment', () => {
    const pc: PageContent = {
      content: [
        '<!--tu:link-display mode="title"-->',
        '[Example Site](https://example.com)',
      ].join('\n'),
      embeds: [],
      annotations: [],
    }

    const doc = pageContentToTipTap(pc)
    const paragraph = doc.content?.find((node) => node.type === 'paragraph')
    const textNode = paragraph?.content?.[0]
    expect(textNode?.marks?.[0]).toMatchObject({
      type: 'link',
      attrs: {
        href: 'https://example.com',
        displayMode: 'title',
      },
    })

    const roundtrip = tipTapToPageContent(doc)
    expect(roundtrip.content).toContain('<!--tu:link-display mode="title"-->')
    expect(roundtrip.content).toContain('[Example Site](https://example.com)')
  })

  it('preserves url iframe embed comment', () => {
    const pc: PageContent = {
      content: '<!--tu:url-embed id="ue-test1" url="https://example.com" height="360"-->',
      embeds: [],
      annotations: [],
    }

    const doc = pageContentToTipTap(pc)
    const embed = doc.content?.find((node) => node.type === 'urlEmbedBlock')
    expect(embed?.attrs).toMatchObject({
      blockId: 'ue-test1',
      url: 'https://example.com',
      height: 360,
    })

    const roundtrip = tipTapToPageContent(doc)
    expect(roundtrip.content).toContain('<!--tu:url-embed id="ue-test1" url="https://example.com" height="360"-->')
  })

  it('preserves pdf excerpt comment', () => {
    const pc: PageContent = {
      content: '<!--tu:pdf-excerpt id="pe-test1" fileId="file-abc" fileName="book.pdf" start="3" end="5" height="480"-->',
      embeds: [],
      annotations: [],
    }

    const doc = pageContentToTipTap(pc)
    const embed = doc.content?.find((node) => node.type === 'pdfExcerptBlock')
    expect(embed?.attrs).toMatchObject({
      blockId: 'pe-test1',
      fileId: 'file-abc',
      fileName: 'book.pdf',
      startPage: 3,
      endPage: 5,
      height: 480,
    })

    const roundtrip = tipTapToPageContent(doc)
    expect(roundtrip.content).toContain('<!--tu:pdf-excerpt id="pe-test1" fileId="file-abc" fileName="book.pdf" start="3" end="5" height="480"-->')
  })
})

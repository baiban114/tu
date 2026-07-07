import { describe, expect, it } from 'vitest'
import { pageContentToTipTap, tipTapToPageContent } from './converters'

describe('image markdown roundtrip', () => {
  it('parses empty-alt image as block node', () => {
    const doc = pageContentToTipTap({
      content: '![](/api/files/file-abc123)',
      embeds: [],
      annotations: [],
    })
    expect(doc.content?.some((node) => node.type === 'image' && node.attrs?.src === '/api/files/file-abc123')).toBe(true)
  })

  it('parses legacy escaped empty-alt image as block node', () => {
    const raw = String.raw`\![\](/api/files/file-abc123\)`
    const doc = pageContentToTipTap({
      content: raw,
      embeds: [],
      annotations: [],
    })
    expect(doc.content?.some((node) => node.type === 'image' && node.attrs?.src === '/api/files/file-abc123')).toBe(true)
  })

  it('roundtrips block image markdown', () => {
    const pc = {
      content: 'before\n\n![](/api/files/file-abc123)\n\nafter',
      embeds: [] as [],
      annotations: [] as [],
    }
    const doc = pageContentToTipTap(pc)
    const roundtrip = tipTapToPageContent(doc)
    expect(roundtrip.content).toContain('![](/api/files/file-abc123)')
  })
})

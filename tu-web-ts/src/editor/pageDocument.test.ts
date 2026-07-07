import { describe, expect, it } from 'vitest'
import type { PageContent } from '@/api/types'
import { resolvePageDocument, toV2PageContent, isV2PageContent, PAGE_CONTENT_SCHEMA_V2 } from './pageDocument'
import { tipTapToPageContent } from './converters'

describe('pageDocument', () => {
  it('resolvePageDocument returns stored document when present', () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi' }] }] }
    const pc: PageContent = {
      document: doc,
      schemaVersion: PAGE_CONTENT_SCHEMA_V2,
      content: '',
      embeds: [],
      annotations: [],
    }
    expect(resolvePageDocument(pc)).toEqual(doc)
    expect(isV2PageContent(pc)).toBe(true)
  })

  it('resolvePageDocument migrates v1 markdown lazily', () => {
    const pc: PageContent = {
      content: '## Hello',
      embeds: [],
      annotations: [],
    }
    const doc = resolvePageDocument(pc)
    expect(doc.type).toBe('doc')
    expect(doc.content?.some((n) => n.type === 'heading')).toBe(true)
    expect(isV2PageContent(pc)).toBe(false)
  })

  it('toV2PageContent does not serialize to markdown', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 2, blockId: 'h1' },
          content: [{ type: 'text', text: 'Title' }],
        },
      ],
    }
    const pc = toV2PageContent(doc, [])
    expect(pc.schemaVersion).toBe(PAGE_CONTENT_SCHEMA_V2)
    expect(pc.content).toBe('')
    expect(pc.embeds).toEqual([])
    expect(tipTapToPageContent(doc).content).toContain('## Title')
  })
})

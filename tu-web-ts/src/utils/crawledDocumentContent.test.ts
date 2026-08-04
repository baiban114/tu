import { describe, expect, it } from 'vitest'
import type { ResourceCrawledDocument } from '@/api/externalResource'
import { crawledDocumentToTipTap } from './crawledDocumentContent'

function doc(partial: Partial<ResourceCrawledDocument> = {}): ResourceCrawledDocument {
  return {
    id: 'rcd-1',
    resourceItemId: 'ri-1',
    sourceUrl: 'https://example.com/article',
    title: '示例网页',
    content: '# 示例网页\n\n一段正文。\n\n- 甲\n- 乙',
    crawledAt: '2025-01-01T00:00:00',
    updatedAt: '2025-01-01T00:00:00',
    ...partial,
  }
}

function collectText(node: unknown): string {
  if (!node || typeof node !== 'object') return ''
  const record = node as { text?: string; content?: unknown[] }
  const self = typeof record.text === 'string' ? record.text : ''
  const children = Array.isArray(record.content)
    ? record.content.map((child) => collectText(child)).join('')
    : ''
  return self + children
}

describe('crawledDocumentToTipTap', () => {
  it('returns a doc node parsed from the crawled markdown', () => {
    const result = crawledDocumentToTipTap(doc())

    expect(result.type).toBe('doc')
    expect(Array.isArray(result.content)).toBe(true)
    expect(collectText(result)).toContain('示例网页')
    expect(collectText(result)).toContain('一段正文。')
  })

  it('renders headings and list items as block nodes', () => {
    const result = crawledDocumentToTipTap(doc())
    const types = (result.content ?? []).map((node) => node.type)

    expect(types).toContain('heading')
    expect(types).toContain('bulletList')
  })

  it('falls back to an empty-ish doc for blank content', () => {
    const result = crawledDocumentToTipTap(doc({ content: '' }))

    expect(result.type).toBe('doc')
    expect(collectText(result).trim()).toBe('')
  })
})

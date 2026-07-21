import { describe, expect, it } from 'vitest'
import type { ResourceExcerpt, ResourceItem } from '@/api/externalResource'
import {
  isResourceDocumentTreeId,
  parseResourceDocumentTreeId,
  resourceDocumentTreeId,
  resourceExcerptHeadingBlockId,
  synthesizeResourceDocumentContent,
} from './resourceDocumentContent'

function item(partial: Partial<ResourceItem> = {}): ResourceItem {
  return {
    id: 'ri-1',
    typeId: 'rt-document',
    typeName: '文档',
    identityFieldKey: 'sourceUrl',
    identityFieldLabel: '源 URL',
    title: '示例文档',
    sourceUrl: 'https://example.com/doc',
    note: '备注',
    ...partial,
  }
}

function excerpt(partial: Partial<ResourceExcerpt> & { id: string; sortOrder: number }): ResourceExcerpt {
  return {
    resourceItemId: 'ri-1',
    resourceItemTitle: '示例文档',
    title: partial.title ?? '节选',
    excerptText: partial.excerptText ?? '正文',
    sortOrder: partial.sortOrder,
    id: partial.id,
  }
}

function collectText(node: unknown): string {
  if (!node || typeof node !== 'object') return ''
  const record = node as { text?: string; content?: unknown[] }
  const self = typeof record.text === 'string' ? record.text : ''
  const children = Array.isArray(record.content)
    ? record.content.map(collectText).join('')
    : ''
  return self + children
}

describe('resourceDocumentContent', () => {
  it('builds virtual tree ids', () => {
    expect(resourceDocumentTreeId('ri-1')).toBe('ri:ri-1')
    expect(parseResourceDocumentTreeId('ri:ri-1')).toBe('ri-1')
    expect(isResourceDocumentTreeId('ri:ri-1')).toBe(true)
    expect(isResourceDocumentTreeId('p-1')).toBe(false)
  })

  it('synthesizes empty-excerpt document with meta card text', () => {
    const content = synthesizeResourceDocumentContent(item(), [])
    expect(content.schemaVersion).toBe(2)
    expect(content.document?.type).toBe('doc')
    const texts = collectText(content.document)
    expect(texts).toContain('示例文档')
    expect(texts).toContain('暂无节选正文')
    expect(texts).toContain('https://example.com/doc')
  })

  it('concatenates excerpts in sort order', () => {
    const content = synthesizeResourceDocumentContent(item(), [
      excerpt({ id: 'e2', sortOrder: 2, title: '后', excerptText: 'B' }),
      excerpt({ id: 'e1', sortOrder: 1, title: '前', excerptText: 'A' }),
    ])
    const texts = collectText(content.document)
    const indexA = texts.indexOf('A')
    const indexB = texts.indexOf('B')
    expect(indexA).toBeGreaterThan(-1)
    expect(indexB).toBeGreaterThan(indexA)
    expect(texts).toContain('前')
    expect(texts).toContain('后')
  })

  it('stamps stable blockIds on excerpt h2 headings', () => {
    const content = synthesizeResourceDocumentContent(item(), [
      excerpt({ id: 'e2', sortOrder: 2, title: '后', excerptText: 'B' }),
      excerpt({ id: 'e1', sortOrder: 1, title: '前', excerptText: 'A' }),
    ])
    const headings = (content.document?.content ?? []).filter((node) => node.type === 'heading' && node.attrs?.level === 2)
    expect(headings).toHaveLength(2)
    expect(headings[0]?.attrs?.blockId).toBe(resourceExcerptHeadingBlockId('e1'))
    expect(headings[1]?.attrs?.blockId).toBe(resourceExcerptHeadingBlockId('e2'))
  })
})

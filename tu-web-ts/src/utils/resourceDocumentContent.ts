import type { ResourceExcerpt, ResourceItem } from '@/api/externalResource'
import type { PageContent } from '@/api/types'
import { pageContentToTipTap } from '@/editor/converters'
import { toV2PageContent } from '@/editor/pageDocument'

/** Virtual page-tree id for a KB-linked resource document. */
export function resourceDocumentTreeId(resourceItemId: string): string {
  return `ri:${resourceItemId}`
}

export function parseResourceDocumentTreeId(id: string): string | null {
  if (!id.startsWith('ri:')) return null
  const resourceItemId = id.slice(3).trim()
  return resourceItemId || null
}

export function isResourceDocumentTreeId(id: string | null | undefined): boolean {
  return Boolean(id && parseResourceDocumentTreeId(id))
}

function escapeMarkdownHeading(text: string): string {
  return text.replace(/\s+/g, ' ').trim() || '未命名节选'
}

/**
 * Build a read-only PageContent from a document resource and its excerpts.
 * Excerpts are concatenated in sortOrder; each becomes an h2 + body markdown.
 */
export function synthesizeResourceDocumentContent(
  item: ResourceItem,
  excerpts: ResourceExcerpt[],
): PageContent {
  const sorted = [...excerpts].sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title))
  const parts: string[] = []

  parts.push(`# ${escapeMarkdownHeading(item.title)}`)

  const metaLines: string[] = []
  if (item.sourceUrl?.trim()) metaLines.push(`来源：${item.sourceUrl.trim()}`)
  if (item.note?.trim()) metaLines.push(`备注：${item.note.trim()}`)
  if (metaLines.length) {
    parts.push(metaLines.join('\n\n'))
  }

  if (!sorted.length) {
    parts.push('暂无节选正文。可在资源管理中为该文档添加节选后重新打开。')
  } else {
    sorted.forEach((excerpt, index) => {
      const heading = escapeMarkdownHeading(excerpt.title || `节选 ${index + 1}`)
      parts.push(`## ${heading}`)
      const body = (excerpt.excerptText || '').trim()
      parts.push(body || '_（本节选无正文）_')
    })
  }

  const markdown = parts.join('\n\n').replace(/\n{3,}/g, '\n\n').trim()
  const document = pageContentToTipTap({
    content: markdown,
    embeds: [],
    annotations: [],
    metadata: {
      sourceKind: 'resource-document',
      resourceItemId: item.id,
      readOnly: true,
    },
  })

  return toV2PageContent(document, [], {
    sourceKind: 'resource-document',
    resourceItemId: item.id,
    readOnly: true,
  })
}

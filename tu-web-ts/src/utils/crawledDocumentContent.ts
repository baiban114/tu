import type { JSONContent } from '@tiptap/core'
import type { ResourceCrawledDocument } from '@/api/externalResource'
import { pageContentToTipTap } from '@/editor/converters'

/**
 * Convert a crawled web-page document (stored as Markdown) into TipTap
 * JSONContent so TuEditor can render it read-only without a PageContent
 * wrapper. Mirrors resourceDocumentContent.ts but skips toV2PageContent.
 */
export function crawledDocumentToTipTap(doc: ResourceCrawledDocument): JSONContent {
  return pageContentToTipTap({
    content: doc.content,
    embeds: [],
    annotations: [],
    metadata: {
      sourceKind: 'resource-crawled-document',
      resourceItemId: doc.resourceItemId,
      readOnly: true,
    },
  })
}

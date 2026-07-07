import type { JSONContent } from '@tiptap/core'
import type { PageContent, TextAnnotation } from '@/api/types'
import { pageContentToTipTap } from './converters'

export const PAGE_CONTENT_SCHEMA_V2 = 2

export function isV2PageContent(pc: PageContent): boolean {
  return pc.schemaVersion === PAGE_CONTENT_SCHEMA_V2 || Boolean(pc.document?.type === 'doc')
}

export function resolvePageDocument(pc: PageContent): JSONContent {
  if (pc.document?.type === 'doc') {
    return pc.document
  }
  return pageContentToTipTap(pc)
}

export function toV2PageContent(
  document: JSONContent,
  annotations: TextAnnotation[],
  metadata?: Record<string, unknown>,
): PageContent {
  return {
    document,
    schemaVersion: PAGE_CONTENT_SCHEMA_V2,
    content: '',
    embeds: [],
    annotations,
    metadata,
  }
}

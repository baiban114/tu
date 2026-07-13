import type { JSONContent } from '@tiptap/core'
import type {
  HeadingSourceBinding,
  KnowledgeRelation,
  PageContent,
  TextAnnotation,
} from '@/api/types'
import { effectiveMarkerSource, isUserProtectedMarker } from '@/utils/headingSource'
import { headingAnchor, annotationAnchor } from '@/utils/knowledgeAnchor'

export interface ProtectedLocatorEntry {
  locator: string
  type: 'heading' | 'basis' | 'relation' | 'excerpt'
  label: string
  bindingSummary?: string
}

export interface ReferenceContextEntry {
  locator: string
  type: string
  label: string
  bindingSummary?: string
}

export function isLocatorProtected(suggestionLocator: string, protectedLocators: Set<string> | string[]): boolean {
  const normalized = suggestionLocator.trim()
  if (!normalized) return false
  const entries = protectedLocators instanceof Set ? [...protectedLocators] : protectedLocators
  for (const protectedLocator of entries) {
    const p = protectedLocator.trim()
    if (!p) continue
    if (normalized === p) return true
    if (normalized.startsWith(`${p}:`)) return true
    if (p.startsWith(`${normalized}:`)) return true
  }
  return false
}

function walkDocumentHeadings(
  pageId: string,
  node: JSONContent | undefined,
  onHeading: (blockId: string, title: string, binding: HeadingSourceBinding | null) => void,
): void {
  if (!node) return
  if (node.type === 'heading') {
    const blockId = String(node.attrs?.blockId || '')
    const binding = (node.attrs?.sourceBinding as HeadingSourceBinding | null) ?? null
    const title = collectText(node).trim()
    if (blockId) onHeading(blockId, title, binding)
  }
  node.content?.forEach((child) => walkDocumentHeadings(pageId, child, onHeading))
}

function collectText(node: JSONContent): string {
  if (node.type === 'text') return String(node.text || '')
  return (node.content || []).map(collectText).join('')
}

export function collectProtectedLocators(
  pageId: string,
  content: Pick<PageContent, 'document' | 'annotations'>,
  userRelations: KnowledgeRelation[] = [],
  protectedExcerptLocators: string[] = [],
): ProtectedLocatorEntry[] {
  const entries: ProtectedLocatorEntry[] = []
  const document = content.document

  if (document) {
    walkDocumentHeadings(pageId, document, (blockId, title, binding) => {
      if (!binding?.resourceItemId) return
      if (!isUserProtectedMarker(binding.markerSource)) return
      entries.push({
        locator: headingAnchor(pageId, blockId, title).locator,
        type: 'heading',
        label: title || '标题',
        bindingSummary: binding.snapshot.excerptTitle || binding.snapshot.resourceTitle,
      })
    })
  }

  for (const ann of content.annotations || []) {
    if (ann.kind !== 'basis') continue
    if (!isUserProtectedMarker(ann.markerSource)) continue
    if (!ann.basisBinding?.resourceItemId) continue
    const label = ann.selectedText?.trim() || '依据标注'
    entries.push({
      locator: annotationAnchor(pageId, ann.id, label).locator,
      type: 'basis',
      label,
      bindingSummary: ann.basisBinding.snapshot.excerptTitle || ann.basisBinding.snapshot.resourceTitle,
    })
  }

  for (const relation of userRelations) {
    if (relation.sourceProvenance !== 'user') continue
    const fromLocator = relation.from?.locator
    if (!fromLocator?.startsWith(`page:${pageId}`)) continue
    entries.push({
      locator: fromLocator,
      type: 'relation',
      label: relation.relationTypeLabel || relation.relationTypeKey,
      bindingSummary: relation.toPointTitle || relation.to?.snapshot?.title as string | undefined,
    })
  }

  for (const locator of protectedExcerptLocators) {
    if (!locator) continue
    entries.push({
      locator,
      type: 'excerpt',
      label: '用户节选',
    })
  }

  return entries
}

export function collectReferenceContext(
  pageId: string,
  content: Pick<PageContent, 'document' | 'annotations'>,
  protectedEntries: ProtectedLocatorEntry[],
): ReferenceContextEntry[] {
  const refs: ReferenceContextEntry[] = protectedEntries.map((entry) => ({
    locator: entry.locator,
    type: entry.type,
    label: entry.label,
    bindingSummary: entry.bindingSummary,
  }))

  const document = content.document
  if (document) {
    walkDocumentHeadings(pageId, document, (blockId, title, binding) => {
      if (!binding?.resourceItemId) return
      if (effectiveMarkerSource(binding.markerSource) !== 'ai') return
      refs.push({
        locator: headingAnchor(pageId, blockId, title).locator,
        type: 'heading-ai',
        label: title || '标题',
        bindingSummary: binding.snapshot.excerptTitle || binding.snapshot.resourceTitle,
      })
    })
  }

  for (const ann of content.annotations || []) {
    if (ann.kind !== 'basis') continue
    if (effectiveMarkerSource(ann.markerSource) !== 'ai') continue
    const label = ann.selectedText?.trim() || '依据标注'
    refs.push({
      locator: annotationAnchor(pageId, ann.id, label).locator,
      type: 'basis-ai',
      label,
      bindingSummary: ann.basisBinding?.snapshot.excerptTitle || ann.basisBinding?.snapshot.resourceTitle,
    })
  }

  return refs
}

export function protectedLocatorSet(entries: ProtectedLocatorEntry[]): Set<string> {
  return new Set(entries.map((entry) => entry.locator))
}

import type { BlockTag } from '@/api/types'
import { normalizeBlockTags, normalizeTagLabel } from '@/utils/blockMetadata'
import { mergeTagPools } from '@/utils/pageMetadata'
import type { FlatTocEntry } from '@/utils/toc/headings'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

export type SectionTagsMap = Record<string, BlockTag[]>

export interface SectionTagAnchor {
  text: string
  level: number
}

type SectionTagAnchorsMap = Record<string, SectionTagAnchor>

function isSectionTagAnchorsMap(value: unknown): value is SectionTagAnchorsMap {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Lookup keys for resolving section tags on a local heading (attrs / flat / pos fallback). */
export function getLocalSectionTagLookupKeys(entry: FlatTocEntry, doc: ProseMirrorNode): string[] {
  const keys = new Set<string>()
  const node = doc.nodeAt(entry.pos)
  const attrBlockId = String(node?.attrs?.blockId || '').trim()
  if (attrBlockId) keys.add(`local:${attrBlockId}`)
  if (entry.blockId) keys.add(`local:${entry.blockId}`)
  keys.add(`local:heading-${entry.pos}`)
  return [...keys]
}

export function getSectionTagAnchors(
  metadata: Record<string, unknown> | null | undefined,
): SectionTagAnchorsMap {
  if (!metadata) return {}
  const raw = metadata.sectionTagAnchors
  if (!isSectionTagAnchorsMap(raw)) return {}
  return { ...raw }
}

export function setSectionTagAnchor(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
  anchor: SectionTagAnchor,
): Record<string, unknown> {
  const next = { ...(metadata ?? {}) }
  const existing = isSectionTagAnchorsMap(next.sectionTagAnchors)
    ? { ...next.sectionTagAnchors }
    : {} as SectionTagAnchorsMap
  existing[key] = anchor
  next.sectionTagAnchors = existing
  return next
}

/** Keep all keys that flat entries or existing metadata may reference (avoid pruning stable blockIds). */
export function collectValidSectionTagKeys(
  flat: FlatTocEntry[],
  doc: ProseMirrorNode,
  metadata: Record<string, unknown> | null | undefined,
): string[] {
  const keys = new Set<string>()
  for (const entry of flat) {
    keys.add(getSectionTagKey(entry))
    if (entry.sourceType === 'local') {
      for (const key of getLocalSectionTagLookupKeys(entry, doc)) {
        keys.add(key)
      }
    }
  }
  for (const key of Object.keys(sectionTagsMapFromMetadata(metadata))) {
    keys.add(key)
  }
  return [...keys]
}

export function findLocalSectionEntryForTagKey(
  flat: FlatTocEntry[],
  doc: ProseMirrorNode,
  key: string,
): FlatTocEntry | null {
  if (!key.startsWith('local:')) return null
  const blockId = key.slice('local:'.length)
  return flat.find((entry) => {
    if (entry.sourceType !== 'local') return false
    if (getSectionTagKey(entry) === key) return true
    if (getLocalSectionTagLookupKeys(entry, doc).includes(key)) return true
    if (entry.blockId === blockId) return true
    const node = doc.nodeAt(entry.pos)
    return String(node?.attrs?.blockId || '').trim() === blockId
  }) ?? null
}

/** Headings whose blockId should be synced from section tag anchors/metadata. */
export function listSectionHeadingBlockIdSyncs(
  flat: FlatTocEntry[],
  doc: ProseMirrorNode,
  metadata: Record<string, unknown> | null | undefined,
): Array<{ pos: number; blockId: string }> {
  const sectionMap = sectionTagsMapFromMetadata(metadata)
  const anchors = getSectionTagAnchors(metadata)
  const syncs: Array<{ pos: number; blockId: string }> = []

  for (const [key, tags] of Object.entries(sectionMap)) {
    if (!key.startsWith('local:') || tags.length === 0) continue
    const blockId = key.slice('local:'.length)
    const anchor = anchors[key]
    const entry = anchor
      ? flat.find((item) => (
        item.sourceType === 'local'
        && item.text === anchor.text
        && item.level === anchor.level
      ))
      : findLocalSectionEntryForTagKey(flat, doc, key)
    if (!entry) continue
    const node = doc.nodeAt(entry.pos)
    if (!node || node.type.name !== 'heading') continue
    if (String(node.attrs.blockId || '').trim() === blockId) continue
    syncs.push({ pos: entry.pos, blockId })
  }

  return syncs
}

/** Add anchors for section tags already resolved via lookup keys. */
export function ensureSectionTagAnchorsForFlat(
  metadata: Record<string, unknown> | null | undefined,
  flat: FlatTocEntry[],
  doc: ProseMirrorNode,
): Record<string, unknown> {
  const sectionMap = sectionTagsMapFromMetadata(metadata)
  let next = { ...(metadata ?? {}) }
  let changed = false

  for (const entry of flat) {
    if (entry.sourceType !== 'local') continue
    for (const key of getLocalSectionTagLookupKeys(entry, doc)) {
      if (!sectionMap[key]?.length) continue
      if (getSectionTagAnchors(next)[key]) break
      next = setSectionTagAnchor(next, key, { text: entry.text, level: entry.level })
      changed = true
      break
    }
  }

  return changed ? next : (metadata ?? {})
}

function entryMatchesSectionTagLabel(entryText: string, label: string): boolean {
  const normalizedEntry = entryText.trim().toLowerCase()
  const normalizedLabel = normalizeTagLabel(label).trim().toLowerCase()
  if (!normalizedLabel || !normalizedEntry) return false
  if (normalizedEntry === normalizedLabel) return true
  const strippedEntry = normalizedEntry.replace(/节$/u, '').trim()
  if (strippedEntry === normalizedLabel) return true
  if (normalizedLabel.length >= 2 && strippedEntry.startsWith(normalizedLabel)) return true
  if (normalizedLabel.length >= 2 && normalizedEntry.startsWith(normalizedLabel)) return true
  return false
}

function isOrphanSectionTagKey(
  key: string,
  sectionMap: SectionTagsMap,
  flat: FlatTocEntry[],
  doc: ProseMirrorNode,
  anchors: SectionTagAnchorsMap,
): boolean {
  if (!key.startsWith('local:')) return false
  const blockId = key.slice('local:'.length)
  if (blockId.startsWith('heading-')) return false
  if (anchors[key]) return false
  if (!sectionMap[key]?.length) return false
  return !flat.some((entry) => (
    entry.sourceType === 'local'
    && getLocalSectionTagLookupKeys(entry, doc).includes(key)
  ))
}

/** Resolve section tags for a TOC entry (lookup keys, anchors, blockId, label heuristics). */
export function resolveEntrySectionTags(
  entry: FlatTocEntry,
  sectionTagsMap: SectionTagsMap,
  doc: ProseMirrorNode,
  sectionTagAnchors?: SectionTagAnchorsMap,
): BlockTag[] {
  if (entry.sourceType !== 'local') {
    return sectionTagsMap[getSectionTagKey(entry)] ?? []
  }

  for (const key of getLocalSectionTagLookupKeys(entry, doc)) {
    const tags = sectionTagsMap[key]
    if (tags?.length) return tags
  }

  const anchors = sectionTagAnchors ?? {}
  for (const [key, anchor] of Object.entries(anchors)) {
    if (anchor.text !== entry.text || anchor.level !== entry.level) continue
    const tags = sectionTagsMap[key]
    if (tags?.length) return tags
  }

  const node = doc.nodeAt(entry.pos)
  const attrBlockId = String(node?.attrs?.blockId || '').trim()
  if (attrBlockId && !attrBlockId.startsWith('heading-')) {
    const tags = sectionTagsMap[`local:${attrBlockId}`]
    if (tags?.length) return tags
  }

  const labelMatches: string[] = []
  for (const [key, tags] of Object.entries(sectionTagsMap)) {
    if (!key.startsWith('local:') || !tags.length) continue
    if (anchors[key]) continue
    if (getLocalSectionTagLookupKeys(entry, doc).includes(key)) continue
    if (tags.some((tag) => entryMatchesSectionTagLabel(entry.text, tag.label))) {
      labelMatches.push(key)
    }
  }
  if (labelMatches.length === 1) {
    return sectionTagsMap[labelMatches[0]!] ?? []
  }

  return []
}

function orphanKeyMatchesEntry(tags: BlockTag[], entry: FlatTocEntry): boolean {
  return tags.some((tag) => entryMatchesSectionTagLabel(entry.text, tag.label))
}

/** Link orphan stable keys to local headings that lost persisted blockIds. */
export function reconcileOrphanSectionTagKeys(
  metadata: Record<string, unknown> | null | undefined,
  flat: FlatTocEntry[],
  doc: ProseMirrorNode,
): Record<string, unknown> {
  const sectionMap = sectionTagsMapFromMetadata(metadata)
  let next = metadata ?? {}
  let changed = false
  const anchors = () => getSectionTagAnchors(next)

  let orphanKeys = Object.keys(sectionMap).filter((key) => (
    isOrphanSectionTagKey(key, sectionMap, flat, doc, anchors())
  ))

  let untaggedEntries = flat.filter((entry) => (
    entry.sourceType === 'local'
    && resolveEntrySectionTags(entry, sectionMap, doc, anchors()).length === 0
  )).sort((a, b) => a.pos - b.pos)

  for (const key of [...orphanKeys]) {
    const blockId = key.slice('local:'.length)
    const entry = untaggedEntries.find((item) => {
      const node = doc.nodeAt(item.pos)
      return String(node?.attrs?.blockId || '').trim() === blockId
    })
    if (!entry) continue
    next = setSectionTagAnchor(next, key, { text: entry.text, level: entry.level })
    changed = true
    orphanKeys = orphanKeys.filter((item) => item !== key)
    untaggedEntries = untaggedEntries.filter((item) => item.id !== entry.id)
  }

  for (const key of [...orphanKeys]) {
    const tags = sectionMap[key] ?? []
    const candidates = untaggedEntries.filter((entry) => orphanKeyMatchesEntry(tags, entry))
    if (candidates.length !== 1) continue
    const entry = candidates[0]!
    next = setSectionTagAnchor(next, key, { text: entry.text, level: entry.level })
    changed = true
    orphanKeys = orphanKeys.filter((item) => item !== key)
    untaggedEntries = untaggedEntries.filter((item) => item.id !== entry.id)
  }

  if (orphanKeys.length > 0 && orphanKeys.length === untaggedEntries.length) {
    const raw = metadata?.sectionTags
    const orderedOrphanKeys = isSectionTagsMap(raw)
      ? Object.keys(raw).filter((key) => orphanKeys.includes(key))
      : [...orphanKeys].sort()

    for (let index = 0; index < untaggedEntries.length; index += 1) {
      const key = orderedOrphanKeys[index]
      const entry = untaggedEntries[index]
      if (!key || !entry) continue
      next = setSectionTagAnchor(next, key, { text: entry.text, level: entry.level })
      changed = true
    }
  }

  return changed ? next : (metadata ?? {})
}

function isSectionTagsMap(value: unknown): value is SectionTagsMap {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
export function getSectionTagKey(entry: FlatTocEntry): string {
  if (entry.sourceType === 'local') {
    return `local:${entry.blockId}`
  }
  if (entry.sourceType === 'ref-group') {
    return `ref-group:${entry.blockId}`
  }
  if (entry.sourceType === 'ref-child') {
    if (entry.contentTreeNodeId) {
      return `ref-child:${entry.blockId}:${entry.contentTreeNodeId}`
    }
    return entry.id
  }
  return entry.id
}

export function getSectionTags(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
): BlockTag[] {
  if (!metadata || !key) return []
  const raw = metadata.sectionTags
  if (!isSectionTagsMap(raw)) return []
  return normalizeBlockTags(raw[key])
}

export function setSectionTagsInMetadata(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
  tags: Array<Partial<BlockTag> | string>,
): Record<string, unknown> {
  const next = { ...(metadata ?? {}) }
  const normalizedTags = normalizeBlockTags(tags)
  const existing = isSectionTagsMap(next.sectionTags)
    ? { ...next.sectionTags }
    : {} as SectionTagsMap

  if (normalizedTags.length > 0) {
    existing[key] = normalizedTags
  } else {
    delete existing[key]
  }

  if (Object.keys(existing).length > 0) {
    next.sectionTags = existing
  } else {
    delete next.sectionTags
  }

  return next
}

export function collectSectionTagsFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
): BlockTag[] {
  if (!metadata) return []
  const raw = metadata.sectionTags
  if (!isSectionTagsMap(raw)) return []

  const pools: BlockTag[][] = []
  for (const tags of Object.values(raw)) {
    pools.push(normalizeBlockTags(tags))
  }
  return mergeTagPools(...pools)
}

export function pruneOrphanSectionTags(
  metadata: Record<string, unknown> | null | undefined,
  validKeys: Iterable<string>,
): Record<string, unknown> {
  const next = { ...(metadata ?? {}) }
  const raw = next.sectionTags
  if (!isSectionTagsMap(raw)) return next

  const valid = new Set(validKeys)
  const pruned: SectionTagsMap = {}
  for (const [key, tags] of Object.entries(raw)) {
    if (!valid.has(key)) continue
    const normalized = normalizeBlockTags(tags)
    if (normalized.length > 0) {
      pruned[key] = normalized
    }
  }

  if (Object.keys(pruned).length > 0) {
    next.sectionTags = pruned
  } else {
    delete next.sectionTags
  }

  return next
}

export function sectionTagsMapFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
): SectionTagsMap {
  const raw = metadata?.sectionTags
  if (!isSectionTagsMap(raw)) return {}
  const result: SectionTagsMap = {}
  for (const [key, tags] of Object.entries(raw)) {
    const normalized = normalizeBlockTags(tags)
    if (normalized.length > 0) {
      result[key] = normalized
    }
  }
  return result
}

export function buildSectionTagsByEntryId(
  flat: FlatTocEntry[],
  metadata: Record<string, unknown> | null | undefined,
  doc?: ProseMirrorNode,
): Record<string, BlockTag[]> {
  const sectionTags = sectionTagsMapFromMetadata(metadata)
  const byEntryId: Record<string, BlockTag[]> = {}
  for (const entry of flat) {
    let tags: BlockTag[] | undefined
    if (entry.sourceType === 'local' && doc) {
      const anchors = getSectionTagAnchors(metadata)
      tags = resolveEntrySectionTags(entry, sectionTags, doc, anchors)
    } else {
      tags = sectionTags[getSectionTagKey(entry)]
    }
    if (tags?.length) {
      byEntryId[entry.id] = tags
    }
  }
  return byEntryId
}

export function collectSectionTagLabels(
  metadata: Record<string, unknown> | null | undefined,
): string[] {
  return collectSectionTagsFromMetadata(metadata).map((tag) => normalizeTagLabel(tag.label))
}

import { describe, expect, it } from 'vitest'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { FlatTocEntry } from '@/utils/toc/headings'
import {
  buildSectionTagsByEntryId,
  collectSectionTagsFromMetadata,
  collectValidSectionTagKeys,
  getSectionTagKey,
  getSectionTagAnchors,
  getSectionTags,
  listSectionHeadingBlockIdSyncs,
  pruneOrphanSectionTags,
  reconcileOrphanSectionTagKeys,
  resolveEntrySectionTags,
  sectionTagsMapFromMetadata,
  setSectionTagAnchor,
  setSectionTagsInMetadata,
} from './sectionMetadata'

describe('sectionMetadata', () => {
  const localEntry: FlatTocEntry = {
    id: 'h-10',
    blockId: 'hs-abc',
    level: 2,
    text: '第二节',
    pos: 10,
    sortIndex: 0,
    sourceType: 'local',
  }

  it('builds stable keys per source type', () => {
    expect(getSectionTagKey(localEntry)).toBe('local:hs-abc')
    expect(getSectionTagKey({
      ...localEntry,
      id: 'ref-group-b1',
      blockId: 'b1',
      sourceType: 'ref-group',
    })).toBe('ref-group:b1')
    expect(getSectionTagKey({
      ...localEntry,
      id: 'ref-child-b1-0',
      blockId: 'b1',
      sourceType: 'ref-child',
      contentTreeNodeId: 'ctn-1',
    })).toBe('ref-child:b1:ctn-1')
    expect(getSectionTagKey({
      ...localEntry,
      id: 'ref-child-b1-0',
      blockId: 'b1',
      sourceType: 'ref-child',
    })).toBe('ref-child-b1-0')
  })

  it('sets and reads section tags in metadata', () => {
    const metadata = setSectionTagsInMetadata({}, 'local:hs-abc', ['设计'])
    expect(getSectionTags(metadata, 'local:hs-abc')).toEqual([
      expect.objectContaining({ label: '设计' }),
    ])
  })

  it('removes empty section tag keys', () => {
    const withTag = setSectionTagsInMetadata({}, 'local:hs-abc', ['a'])
    const cleared = setSectionTagsInMetadata(withTag, 'local:hs-abc', [])
    expect(cleared.sectionTags).toBeUndefined()
  })

  it('collects all section tags from metadata', () => {
    let metadata: Record<string, unknown> = {}
    metadata = setSectionTagsInMetadata(metadata, 'local:a', ['x'])
    metadata = setSectionTagsInMetadata(metadata, 'ref-group:b', ['Y'])
    const collected = collectSectionTagsFromMetadata(metadata)
    expect(collected.map((tag) => tag.label).sort()).toEqual(['Y', 'x'])
  })

  it('prunes orphan section tag keys', () => {
    const metadata = setSectionTagsInMetadata(
      setSectionTagsInMetadata({}, 'local:keep', ['a']),
      'local:drop',
      ['b'],
    )
    const pruned = pruneOrphanSectionTags(metadata, ['local:keep'])
    expect(getSectionTags(pruned, 'local:keep')).toHaveLength(1)
    expect(getSectionTags(pruned, 'local:drop')).toHaveLength(0)
  })

  it('maps section tags by flat toc entry id', () => {
    const metadata = setSectionTagsInMetadata({}, 'local:hs-abc', ['节标签'])
    const byId = buildSectionTagsByEntryId([localEntry], metadata)
    expect(byId['h-10']).toEqual([
      expect.objectContaining({ label: '节标签' }),
    ])
  })

  it('retains stable section tag keys when flat entry uses pos fallback', () => {
    const entry: FlatTocEntry = {
      id: 'h-42',
      blockId: 'heading-42',
      level: 3,
      text: 'B节',
      pos: 42,
      sortIndex: 1,
      sourceType: 'local',
    }
    const doc = {
      nodeAt: () => ({ attrs: { blockId: null }, type: { name: 'heading' } }),
    } as unknown as ProseMirrorNode
    let metadata = setSectionTagsInMetadata({}, 'local:hs-stable-b', ['B'])
    const validKeys = collectValidSectionTagKeys([entry], doc, metadata)
    metadata = pruneOrphanSectionTags(metadata, validKeys)
    expect(getSectionTags(metadata, 'local:hs-stable-b')).toHaveLength(1)
  })

  it('reconciles a single orphan section tag key to an untagged heading', () => {
    const entry: FlatTocEntry = {
      id: 'h-42',
      blockId: 'heading-42',
      level: 3,
      text: 'B节',
      pos: 42,
      sortIndex: 1,
      sourceType: 'local',
    }
    const doc = {
      nodeAt: (pos: number) => (
        pos === 42
          ? { attrs: { blockId: null }, type: { name: 'heading' } }
          : null
      ),
    } as unknown as ProseMirrorNode
    let metadata = setSectionTagsInMetadata({}, 'local:hs-stable-b', ['实现'])
    metadata = reconcileOrphanSectionTagKeys(metadata, [entry], doc)
    const syncs = listSectionHeadingBlockIdSyncs([entry], doc, metadata)
    expect(syncs).toEqual([{ pos: 42, blockId: 'hs-stable-b' }])
  })

  it('reconciles multiple orphan section tag keys paired by document order', () => {
    const entryA: FlatTocEntry = {
      id: 'h-10',
      blockId: 'heading-10',
      level: 2,
      text: 'A节',
      pos: 10,
      sortIndex: 0,
      sourceType: 'local',
    }
    const entryB: FlatTocEntry = {
      id: 'h-42',
      blockId: 'heading-42',
      level: 3,
      text: 'B节',
      pos: 42,
      sortIndex: 1,
      sourceType: 'local',
    }
    const doc = {
      nodeAt: (pos: number) => (
        pos === 10 || pos === 42
          ? { attrs: { blockId: null }, type: { name: 'heading' } }
          : null
      ),
    } as unknown as ProseMirrorNode
    let metadata: Record<string, unknown> = {}
    metadata = setSectionTagsInMetadata(metadata, 'local:hs-a', ['设计'])
    metadata = setSectionTagsInMetadata(metadata, 'local:hs-b', ['实现'])
    metadata = reconcileOrphanSectionTagKeys(metadata, [entryA, entryB], doc)
    expect(getSectionTagAnchors(metadata)['local:hs-a']).toEqual({ text: 'A节', level: 2 })
    expect(getSectionTagAnchors(metadata)['local:hs-b']).toEqual({ text: 'B节', level: 3 })
  })

  it('reconcileOrphanSectionTagKeys is idempotent when nothing changes', () => {
    const entry: FlatTocEntry = {
      id: 'h-10',
      blockId: 'hs-abc',
      level: 2,
      text: 'A节',
      pos: 10,
      sortIndex: 0,
      sourceType: 'local',
    }
    const doc = {
      nodeAt: () => ({ attrs: { blockId: 'hs-abc' }, type: { name: 'heading' } }),
    } as unknown as ProseMirrorNode
    const metadata = setSectionTagsInMetadata({}, 'local:hs-abc', ['设计'])
    const first = reconcileOrphanSectionTagKeys(metadata, [entry], doc)
    const second = reconcileOrphanSectionTagKeys(first, [entry], doc)
    expect(second).toBe(first)
  })

  it('resolves orphan section tags by label match without anchors', () => {
    const entryA: FlatTocEntry = {
      id: 'h-10',
      blockId: 'heading-10',
      level: 2,
      text: 'A节',
      pos: 10,
      sortIndex: 0,
      sourceType: 'local',
    }
    const entryB: FlatTocEntry = {
      id: 'h-42',
      blockId: 'heading-42',
      level: 3,
      text: 'B节',
      pos: 42,
      sortIndex: 1,
      sourceType: 'local',
    }
    const doc = {
      nodeAt: () => ({ attrs: { blockId: null }, type: { name: 'heading' } }),
    } as unknown as ProseMirrorNode
    let metadata: Record<string, unknown> = {}
    metadata = setSectionTagsInMetadata(metadata, 'local:hs-random-b', ['B'])
    metadata = setSectionTagsInMetadata(metadata, 'local:hs-random-a', ['A'])
    const sectionMap = sectionTagsMapFromMetadata(metadata)
    expect(resolveEntrySectionTags(entryA, sectionMap, doc).map((tag) => tag.label)).toEqual(['A'])
    expect(resolveEntrySectionTags(entryB, sectionMap, doc).map((tag) => tag.label)).toEqual(['B'])
  })

  it('maps section tags by anchor when flat blockId differs from metadata key', () => {
    const entry: FlatTocEntry = {
      id: 'h-42',
      blockId: 'heading-42',
      level: 3,
      text: 'B节',
      pos: 42,
      sortIndex: 1,
      sourceType: 'local',
    }
    const doc = {
      nodeAt: () => ({ attrs: { blockId: null }, type: { name: 'heading' } }),
    } as unknown as ProseMirrorNode
    let metadata = setSectionTagsInMetadata({}, 'local:hs-stable-b', ['B'])
    metadata = setSectionTagAnchor(metadata, 'local:hs-stable-b', { text: 'B节', level: 3 })
    const byId = buildSectionTagsByEntryId([entry], metadata, doc)
    expect(byId['h-42']).toEqual([
      expect.objectContaining({ label: 'B' }),
    ])
  })
})

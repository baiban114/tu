import { describe, expect, it } from 'vitest'
import { Schema } from '@tiptap/pm/model'
import type { BlockTag } from '@/api/types'
import { setSectionTagsInMetadata, reconcileOrphanSectionTagKeys, getSectionTagAnchors, sectionTagsMapFromMetadata } from '@/utils/sectionMetadata'
import {
  createTextTagSpanFromSelection,
  upsertTextTagSpan,
} from '@/utils/textTagSpanMetadata'
import {
  buildTagFilterDecorationSpecs,
  buildTagFilterHiddenDecorations,
  isTocEntryVisible,
  tagMatchesFilter,
} from './tagFilter'

const tagA: BlockTag = { id: 'tag-a', label: '设计', color: '#1677ff' }
const tagB: BlockTag = { id: 'tag-b', label: '实现', color: '#52c41a' }

const testSchema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      group: 'block',
      content: 'text*',
      parseDOM: [{ tag: 'p' }],
      toDOM: () => ['p', 0],
    },
    heading: {
      group: 'block',
      content: 'text*',
      attrs: {
        level: { default: 2 },
        blockId: { default: null },
      },
      parseDOM: [{ tag: 'h2', attrs: { level: 2 } }],
      toDOM: (node) => [`h${node.attrs.level}`, 0],
    },
    text: { group: 'inline' },
  },
})

function docFromText(parts: Array<{ type: 'heading' | 'paragraph'; text: string; blockId?: string; level?: number }>) {
  const children = parts.map((part) => {
    if (part.type === 'heading') {
      return testSchema.nodes.heading.create(
        { level: part.level ?? 2, blockId: part.blockId ?? null },
        part.text ? testSchema.text(part.text) : undefined,
      )
    }
    return testSchema.nodes.paragraph.create(
      null,
      part.text ? testSchema.text(part.text) : undefined,
    )
  })
  return testSchema.nodes.doc.create(null, children)
}

describe('tagFilter', () => {
  it('matches tags by id or normalized label', () => {
    expect(tagMatchesFilter(tagA, [{ id: 'tag-a', label: '设计' }])).toBe(true)
    expect(tagMatchesFilter(tagA, [{ id: 'other', label: '设计' }])).toBe(true)
    expect(tagMatchesFilter(tagA, [{ id: 'other', label: '实现' }])).toBe(false)
  })

  it('hides untagged sections when filter is active', () => {
    const doc = docFromText([
      { type: 'heading', text: '有标签', blockId: 'hs-tagged' },
      { type: 'paragraph', text: '可见段落' },
      { type: 'heading', text: '无标签', blockId: 'hs-plain' },
      { type: 'paragraph', text: '隐藏段落' },
    ])

    const flat = [
      {
        id: 'h-0',
        blockId: 'hs-tagged',
        level: 2,
        text: '有标签',
        pos: 0,
        sortIndex: 0,
        sourceType: 'local' as const,
      },
      {
        id: 'h-4',
        blockId: 'hs-plain',
        level: 2,
        text: '无标签',
        pos: 0,
        sortIndex: 0,
        sourceType: 'local' as const,
      },
    ]
    doc.forEach((node, offset) => {
      if (node.type.name !== 'heading') return
      const entry = flat.find((item) => item.blockId === node.attrs.blockId)
      if (entry) entry.pos = offset
    })

    const metadata = setSectionTagsInMetadata({}, 'local:hs-tagged', ['设计'])
    const sectionTagsMap = metadata.sectionTags as Record<string, BlockTag[]>

    const hidden = buildTagFilterHiddenDecorations(doc, flat, sectionTagsMap, tagA)
    const untaggedHeading = flat.find((entry) => entry.blockId === 'hs-plain')!
    expect(hidden.some((range) => range.from === untaggedHeading.pos)).toBe(true)
    const taggedHeading = flat.find((entry) => entry.blockId === 'hs-tagged')!
    expect(hidden.some((range) => range.from === taggedHeading.pos)).toBe(false)
  })

  it('shows tagged section body paragraphs when filter is active', () => {
    const doc = docFromText([
      { type: 'heading', text: '有标签', blockId: 'hs-tagged' },
      { type: 'paragraph', text: '可见段落' },
      { type: 'heading', text: '无标签', blockId: 'hs-plain' },
      { type: 'paragraph', text: '隐藏段落' },
    ])

    const flat = [
      {
        id: 'h-0',
        blockId: 'hs-tagged',
        level: 2,
        text: '有标签',
        pos: 0,
        sortIndex: 0,
        sourceType: 'local' as const,
      },
      {
        id: 'h-4',
        blockId: 'hs-plain',
        level: 2,
        text: '无标签',
        pos: 0,
        sortIndex: 0,
        sourceType: 'local' as const,
      },
    ]
    doc.forEach((node, offset) => {
      if (node.type.name !== 'heading') return
      const entry = flat.find((item) => item.blockId === node.attrs.blockId)
      if (entry) entry.pos = offset
    })

    const metadata = setSectionTagsInMetadata({}, 'local:hs-tagged', ['设计'])
    const sectionTagsMap = metadata.sectionTags as Record<string, BlockTag[]>
    const specs = buildTagFilterDecorationSpecs(doc, flat, sectionTagsMap, tagA)

    const isNodeHidden = (pos: number, nodeSize: number) => specs.some(
      (spec) => spec.type === 'node' && spec.from <= pos && spec.to >= pos + nodeSize,
    )

    doc.forEach((node, offset) => {
      if (node.type.name !== 'paragraph') return
      const hidden = isNodeHidden(offset, node.nodeSize)
      if (node.textContent === '可见段落') expect(hidden).toBe(false)
      if (node.textContent === '隐藏段落') expect(hidden).toBe(true)
    })
  })

  it('shows body after nested untagged heading when parent section matches', () => {
    const doc = docFromText([
      { type: 'heading', text: 'H2 tagged', blockId: 'h2', level: 2 },
      { type: 'paragraph', text: 'before h3' },
      { type: 'heading', text: 'H3 inner', blockId: 'h3', level: 3 },
      { type: 'paragraph', text: 'after h3' },
    ])

    const flat = [
      {
        id: 'h-0',
        blockId: 'h2',
        level: 2,
        text: 'H2 tagged',
        pos: 0,
        sortIndex: 0,
        sourceType: 'local' as const,
      },
      {
        id: 'h-1',
        blockId: 'h3',
        level: 3,
        text: 'H3 inner',
        pos: 0,
        sortIndex: 0,
        sourceType: 'local' as const,
      },
    ]
    doc.forEach((node, offset) => {
      if (node.type.name !== 'heading') return
      const entry = flat.find((item) => item.blockId === node.attrs.blockId)
      if (entry) entry.pos = offset
    })

    const metadata = setSectionTagsInMetadata({}, 'local:h2', ['设计'])
    const sectionTagsMap = metadata.sectionTags as Record<string, BlockTag[]>
    const specs = buildTagFilterDecorationSpecs(doc, flat, sectionTagsMap, tagA)

    const isNodeHidden = (pos: number, nodeSize: number) => specs.some(
      (spec) => spec.type === 'node' && spec.from <= pos && spec.to >= pos + nodeSize,
    )

    doc.forEach((node, offset) => {
      if (node.type.name !== 'paragraph') return
      expect(isNodeHidden(offset, node.nodeSize)).toBe(false)
    })

    const innerHeading = flat.find((entry) => entry.blockId === 'h3')!
    expect(isNodeHidden(innerHeading.pos, doc.nodeAt(innerHeading.pos)!.nodeSize)).toBe(false)
  })

  it('shows matching section heading and body together', () => {
    const doc = docFromText([
      { type: 'heading', text: 'A节', blockId: 'h-a', level: 2 },
      { type: 'paragraph', text: 'A节正文' },
    ])

    const flat = [{
      id: 'h-a',
      blockId: 'h-a',
      level: 2,
      text: 'A节',
      pos: 0,
      sortIndex: 0,
      sourceType: 'local' as const,
    }]
    doc.forEach((node, offset) => {
      if (node.type.name === 'heading' && node.attrs.blockId === 'h-a') {
        flat[0].pos = offset
      }
    })

    const metadata = setSectionTagsInMetadata({}, 'local:h-a', ['设计'])
    const sectionTagsMap = metadata.sectionTags as Record<string, BlockTag[]>
    const specs = buildTagFilterDecorationSpecs(doc, flat, sectionTagsMap, tagA)

    const isNodeHidden = (pos: number, nodeSize: number) => specs.some(
      (spec) => spec.type === 'node' && spec.from <= pos && spec.to >= pos + nodeSize,
    )

    doc.forEach((node, offset) => {
      if (node.type.name === 'heading' || node.type.name === 'paragraph') {
        expect(isNodeHidden(offset, node.nodeSize)).toBe(false)
      }
    })
  })

  it('hides nested child section body when child section tag does not match filter', () => {
    const doc = docFromText([
      { type: 'heading', text: 'A节', blockId: 'h-a', level: 2 },
      { type: 'paragraph', text: 'A节正文' },
      { type: 'heading', text: 'B节', blockId: 'h-b', level: 3 },
      { type: 'paragraph', text: 'B节正文应隐藏' },
    ])

    const flat = [
      {
        id: 'h-a',
        blockId: 'h-a',
        level: 2,
        text: 'A节',
        pos: 0,
        sortIndex: 0,
        sourceType: 'local' as const,
      },
      {
        id: 'h-b',
        blockId: 'h-b',
        level: 3,
        text: 'B节',
        pos: 0,
        sortIndex: 0,
        sourceType: 'local' as const,
      },
    ]
    doc.forEach((node, offset) => {
      if (node.type.name !== 'heading') return
      const entry = flat.find((item) => item.blockId === node.attrs.blockId)
      if (entry) entry.pos = offset
    })

    let metadata = setSectionTagsInMetadata({}, 'local:h-a', ['设计'])
    metadata = setSectionTagsInMetadata(metadata, 'local:h-b', ['实现'])
    const sectionTagsMap = metadata.sectionTags as Record<string, BlockTag[]>
    const specs = buildTagFilterDecorationSpecs(doc, flat, sectionTagsMap, tagA)

    const isNodeHidden = (pos: number, nodeSize: number) => specs.some(
      (spec) => spec.type === 'node' && spec.from <= pos && spec.to >= pos + nodeSize,
    )

    doc.forEach((node, offset) => {
      if (node.type.name !== 'paragraph') return
      if (node.textContent === 'A节正文') expect(isNodeHidden(offset, node.nodeSize)).toBe(false)
      if (node.textContent === 'B节正文应隐藏') expect(isNodeHidden(offset, node.nodeSize)).toBe(true)
    })

    const bHeading = flat.find((entry) => entry.blockId === 'h-b')!
    expect(isNodeHidden(bHeading.pos, doc.nodeAt(bHeading.pos)!.nodeSize)).toBe(true)
  })

  it('hides B section after reconciling dual orphan metadata keys without heading blockIds', () => {
    const doc = docFromText([
      { type: 'heading', text: 'A节', level: 2 },
      { type: 'paragraph', text: 'A节正文' },
      { type: 'heading', text: 'B节', level: 3 },
      { type: 'paragraph', text: 'B节正文应隐藏' },
    ])

    const flat = [
      {
        id: 'h-a',
        blockId: 'heading-0',
        level: 2,
        text: 'A节',
        pos: 0,
        sortIndex: 0,
        sourceType: 'local' as const,
      },
      {
        id: 'h-b',
        blockId: 'heading-0',
        level: 3,
        text: 'B节',
        pos: 0,
        sortIndex: 1,
        sourceType: 'local' as const,
      },
    ]
    doc.forEach((node, offset) => {
      if (node.type.name !== 'heading') return
      const entry = flat.find((item) => item.text === node.textContent)
      if (entry) {
        entry.pos = offset
        entry.blockId = `heading-${offset}`
      }
    })

    let metadata: Record<string, unknown> = {}
    metadata = setSectionTagsInMetadata(metadata, 'local:hs-a', ['设计'])
    metadata = setSectionTagsInMetadata(metadata, 'local:hs-b', ['实现'])
    metadata = reconcileOrphanSectionTagKeys(metadata, flat, doc)
    const sectionTagsMap = sectionTagsMapFromMetadata(metadata)
    const anchors = getSectionTagAnchors(metadata)
    const specs = buildTagFilterDecorationSpecs(doc, flat, sectionTagsMap, tagA, [], anchors)

    const isNodeHidden = (pos: number, nodeSize: number) => specs.some(
      (spec) => spec.type === 'node' && spec.from <= pos && spec.to >= pos + nodeSize,
    )

    doc.forEach((node, offset) => {
      if (node.type.name !== 'paragraph') return
      if (node.textContent === 'A节正文') expect(isNodeHidden(offset, node.nodeSize)).toBe(false)
      if (node.textContent === 'B节正文应隐藏') expect(isNodeHidden(offset, node.nodeSize)).toBe(true)
    })
  })

  it('hides B section when orphan keys resolve by tag label without reconcile', () => {
    const doc = docFromText([
      { type: 'heading', text: 'A节', level: 2 },
      { type: 'paragraph', text: 'A节正文' },
      { type: 'heading', text: 'B节', level: 3 },
      { type: 'paragraph', text: 'B节正文应隐藏' },
    ])

    const flat = [
      {
        id: 'h-a',
        blockId: 'heading-0',
        level: 2,
        text: 'A节',
        pos: 0,
        sortIndex: 0,
        sourceType: 'local' as const,
      },
      {
        id: 'h-b',
        blockId: 'heading-0',
        level: 3,
        text: 'B节',
        pos: 0,
        sortIndex: 1,
        sourceType: 'local' as const,
      },
    ]
    doc.forEach((node, offset) => {
      if (node.type.name !== 'heading') return
      const entry = flat.find((item) => item.text === node.textContent)
      if (entry) {
        entry.pos = offset
        entry.blockId = `heading-${offset}`
      }
    })

    let metadata: Record<string, unknown> = {}
    metadata = setSectionTagsInMetadata(metadata, 'local:hs-random-b', ['B'])
    metadata = setSectionTagsInMetadata(metadata, 'local:hs-random-a', ['A'])
    const sectionTagsMap = sectionTagsMapFromMetadata(metadata)
    const tagFilterA: BlockTag = { id: 'tag-a', label: 'A', color: '#1677ff' }
    const specs = buildTagFilterDecorationSpecs(doc, flat, sectionTagsMap, tagFilterA)

    const isNodeHidden = (pos: number, nodeSize: number) => specs.some(
      (spec) => spec.type === 'node' && spec.from <= pos && spec.to >= pos + nodeSize,
    )

    doc.forEach((node, offset) => {
      if (node.type.name !== 'paragraph') return
      if (node.textContent === 'A节正文') expect(isNodeHidden(offset, node.nodeSize)).toBe(false)
      if (node.textContent === 'B节正文应隐藏') expect(isNodeHidden(offset, node.nodeSize)).toBe(true)
    })
  })

  it('hides nested B section when section tags use stable blockId but flat entry uses pos fallback', () => {
    const doc = docFromText([
      { type: 'heading', text: 'A节', blockId: 'h-a', level: 2 },
      { type: 'paragraph', text: 'A节正文' },
      { type: 'heading', text: 'B节', blockId: 'hs-stable-b', level: 3 },
      { type: 'paragraph', text: 'B节正文应隐藏' },
    ])

    let bHeadingPos = -1
    doc.forEach((node, offset) => {
      if (node.type.name === 'heading' && node.attrs.blockId === 'hs-stable-b') {
        bHeadingPos = offset
      }
    })

    const flat = [
      {
        id: 'h-a',
        blockId: 'h-a',
        level: 2,
        text: 'A节',
        pos: 0,
        sortIndex: 0,
        sourceType: 'local' as const,
      },
      {
        id: 'h-b',
        blockId: `heading-${bHeadingPos}`,
        level: 3,
        text: 'B节',
        pos: bHeadingPos,
        sortIndex: 0,
        sourceType: 'local' as const,
      },
    ]
    doc.forEach((node, offset) => {
      if (node.type.name !== 'heading') return
      const entry = flat.find((item) => (
        item.blockId === node.attrs.blockId
        || (node.attrs.blockId === 'hs-stable-b' && item.text === 'B节')
      ))
      if (entry) entry.pos = offset
    })

    let metadata = setSectionTagsInMetadata({}, 'local:h-a', ['设计'])
    metadata = setSectionTagsInMetadata(metadata, 'local:hs-stable-b', ['实现'])
    const sectionTagsMap = metadata.sectionTags as Record<string, BlockTag[]>
    const specs = buildTagFilterDecorationSpecs(doc, flat, sectionTagsMap, tagA)

    const isNodeHidden = (pos: number, nodeSize: number) => specs.some(
      (spec) => spec.type === 'node' && spec.from <= pos && spec.to >= pos + nodeSize,
    )

    doc.forEach((node, offset) => {
      if (node.type.name !== 'paragraph') return
      if (node.textContent === 'B节正文应隐藏') {
        expect(isNodeHidden(offset, node.nodeSize)).toBe(true)
      }
    })
  })

  it('shows only matching text tag spans when filter is active', () => {
    const doc = docFromText([
      { type: 'paragraph', text: '前文关键词后文' },
    ])

    let paragraphPos = -1
    doc.forEach((node, offset) => {
      if (node.type.name === 'paragraph') paragraphPos = offset
    })
    const contentFrom = paragraphPos + 1
    const keywordFrom = contentFrom + 2
    const keywordTo = keywordFrom + 3

    const span = createTextTagSpanFromSelection({
      selectedText: '关键词',
      contextBefore: '前文',
      contextAfter: '后文',
      from: keywordFrom,
      to: keywordTo,
    }, [tagA])
    const metadata = upsertTextTagSpan({}, span)
    const textTagSpans = metadata.textTagSpans as typeof span[]

    const specs = buildTagFilterDecorationSpecs(doc, [], {}, tagA, textTagSpans)
    const inlineHidden = specs.filter((spec) => spec.type === 'inline')
    const nodeHidden = specs.filter((spec) => spec.type === 'node')

    expect(nodeHidden).toHaveLength(0)
    expect(inlineHidden.some((spec) => spec.from <= keywordFrom && spec.to >= keywordTo)).toBe(false)
    expect(inlineHidden.some((spec) => spec.from < keywordFrom || spec.to > keywordTo)).toBe(true)
  })

  it('shows text-tagged snippet inside section with different section tag', () => {
    const doc = docFromText([
      { type: 'heading', text: 'B节', blockId: 'hs-b' },
      { type: 'paragraph', text: '前文关键词后文' },
    ])

    const flat = [
      {
        id: 'h-0',
        blockId: 'hs-b',
        level: 2,
        text: 'B节',
        pos: 0,
        sortIndex: 0,
        sourceType: 'local' as const,
      },
    ]
    doc.forEach((node, offset) => {
      if (node.type.name !== 'heading') return
      const entry = flat.find((item) => item.blockId === node.attrs.blockId)
      if (entry) entry.pos = offset
    })

    let paragraphPos = -1
    doc.forEach((node, offset) => {
      if (node.type.name === 'paragraph') paragraphPos = offset
    })
    const contentFrom = paragraphPos + 1
    const keywordFrom = contentFrom + 2
    const keywordTo = keywordFrom + 3

    const span = createTextTagSpanFromSelection({
      selectedText: '关键词',
      contextBefore: '前文',
      contextAfter: '后文',
      from: keywordFrom,
      to: keywordTo,
    }, [tagA])
    const sectionMetadata = setSectionTagsInMetadata({}, 'local:hs-b', ['实现'])
    const sectionTagsMap = sectionMetadata.sectionTags as Record<string, BlockTag[]>
    const textTagSpans = upsertTextTagSpan({}, span).textTagSpans as typeof span[]

    const specs = buildTagFilterDecorationSpecs(doc, flat, sectionTagsMap, tagA, textTagSpans)
    const isNodeHidden = (pos: number, nodeSize: number) => specs.some(
      (spec) => spec.type === 'node' && spec.from <= pos && spec.to >= pos + nodeSize,
    )

    expect(isNodeHidden(paragraphPos, doc.nodeAt(paragraphPos)!.nodeSize)).toBe(false)
    const inlineHidden = specs.filter((spec) => spec.type === 'inline')
    expect(inlineHidden.some((spec) => spec.from <= keywordFrom && spec.to >= keywordTo)).toBe(false)
  })

  it('shows text-tagged paragraph inside bullet list when filter is active', () => {
    const listSchema = new Schema({
      nodes: {
        doc: { content: 'block+' },
        paragraph: {
          group: 'block',
          content: 'text*',
          parseDOM: [{ tag: 'p' }],
          toDOM: () => ['p', 0],
        },
        bulletList: {
          content: 'listItem+',
          group: 'block',
          parseDOM: [{ tag: 'ul' }],
          toDOM: () => ['ul', 0],
        },
        listItem: {
          content: 'paragraph block*',
          parseDOM: [{ tag: 'li' }],
          toDOM: () => ['li', 0],
        },
        text: { group: 'inline' },
      },
    })

    const paragraph = listSchema.nodes.paragraph.create(null, listSchema.text('前文关键词后文'))
    const listItem = listSchema.nodes.listItem.create(null, paragraph)
    const bulletList = listSchema.nodes.bulletList.create(null, listItem)
    const doc = listSchema.nodes.doc.create(null, bulletList)

    let paragraphPos = -1
    doc.descendants((node, offset) => {
      if (node.type.name === 'paragraph') paragraphPos = offset
    })
    const contentFrom = paragraphPos + 1
    const keywordFrom = contentFrom + 2
    const keywordTo = keywordFrom + 3

    const span = createTextTagSpanFromSelection({
      selectedText: '关键词',
      contextBefore: '前文',
      contextAfter: '后文',
      from: keywordFrom,
      to: keywordTo,
    }, [tagA])
    const textTagSpans = upsertTextTagSpan({}, span).textTagSpans as typeof span[]

    const specs = buildTagFilterDecorationSpecs(doc, [], {}, tagA, textTagSpans)
    const isNodeHidden = (pos: number, nodeSize: number) => specs.some(
      (spec) => spec.type === 'node' && spec.from <= pos && spec.to >= pos + nodeSize,
    )

    expect(isNodeHidden(paragraphPos, doc.nodeAt(paragraphPos)!.nodeSize)).toBe(false)
    const inlineHidden = specs.filter((spec) => spec.type === 'inline')
    expect(inlineHidden.some((spec) => spec.from <= keywordFrom && spec.to >= keywordTo)).toBe(false)
  })

  it('hides list item marker when filtering out an untagged section list', () => {
    const listSchema = new Schema({
      nodes: {
        doc: { content: 'block+' },
        paragraph: {
          group: 'block',
          content: 'text*',
          parseDOM: [{ tag: 'p' }],
          toDOM: () => ['p', 0],
        },
        heading: {
          group: 'block',
          content: 'text*',
          attrs: {
            level: { default: 2 },
            blockId: { default: null },
          },
          parseDOM: [{ tag: 'h2', attrs: { level: 2 } }],
          toDOM: (node) => [`h${node.attrs.level}`, 0],
        },
        bulletList: {
          content: 'listItem+',
          group: 'block',
          parseDOM: [{ tag: 'ul' }],
          toDOM: () => ['ul', 0],
        },
        listItem: {
          content: 'paragraph block*',
          parseDOM: [{ tag: 'li' }],
          toDOM: () => ['li', 0],
        },
        text: { group: 'inline' },
      },
    })

    const taggedHeading = listSchema.nodes.heading.create(
      { level: 2, blockId: 'hs-tagged' },
      listSchema.text('有标签'),
    )
    const visibleParagraph = listSchema.nodes.paragraph.create(null, listSchema.text('可见段落'))
    const untaggedHeading = listSchema.nodes.heading.create(
      { level: 2, blockId: 'hs-plain' },
      listSchema.text('无标签'),
    )
    const hiddenParagraph = listSchema.nodes.paragraph.create(null, listSchema.text('隐藏列表项'))
    const hiddenListItem = listSchema.nodes.listItem.create(null, hiddenParagraph)
    const hiddenList = listSchema.nodes.bulletList.create(null, hiddenListItem)
    const doc = listSchema.nodes.doc.create(null, [
      taggedHeading,
      visibleParagraph,
      untaggedHeading,
      hiddenList,
    ])

    const flat = [
      {
        id: 'h-tagged',
        blockId: 'hs-tagged',
        level: 2,
        text: '有标签',
        pos: 0,
        sortIndex: 0,
        sourceType: 'local' as const,
      },
      {
        id: 'h-plain',
        blockId: 'hs-plain',
        level: 2,
        text: '无标签',
        pos: 0,
        sortIndex: 0,
        sourceType: 'local' as const,
      },
    ]
    doc.forEach((node, offset) => {
      if (node.type.name !== 'heading') return
      const entry = flat.find((item) => item.blockId === node.attrs.blockId)
      if (entry) entry.pos = offset
    })

    const metadata = setSectionTagsInMetadata({}, 'local:hs-tagged', ['设计'])
    const sectionTagsMap = metadata.sectionTags as Record<string, BlockTag[]>
    const specs = buildTagFilterDecorationSpecs(doc, flat, sectionTagsMap, tagA)

    let listItemPos = -1
    let bulletListPos = -1
    doc.descendants((node, offset) => {
      if (node.type.name === 'listItem') listItemPos = offset
      if (node.type.name === 'bulletList') bulletListPos = offset
    })

    const listItem = doc.nodeAt(listItemPos)!
    const bulletList = doc.nodeAt(bulletListPos)!
    const isNodeHidden = (pos: number, nodeSize: number) => specs.some(
      (spec) => spec.type === 'node' && spec.from <= pos && spec.to >= pos + nodeSize,
    )

    expect(isNodeHidden(listItemPos, listItem.nodeSize)).toBe(true)
    expect(isNodeHidden(bulletListPos, bulletList.nodeSize)).toBe(true)
  })

  it('hides block-level image when filtering out an untagged section', () => {
    const imageSchema = new Schema({
      nodes: {
        doc: { content: 'block+' },
        paragraph: {
          group: 'block',
          content: 'text*',
          parseDOM: [{ tag: 'p' }],
          toDOM: () => ['p', 0],
        },
        heading: {
          group: 'block',
          content: 'text*',
          attrs: {
            level: { default: 2 },
            blockId: { default: null },
          },
          parseDOM: [{ tag: 'h2', attrs: { level: 2 } }],
          toDOM: (node) => [`h${node.attrs.level}`, 0],
        },
        image: {
          inline: false,
          group: 'block',
          atom: true,
          attrs: {
            src: { default: '' },
            alt: { default: null },
            title: { default: null },
          },
          parseDOM: [{ tag: 'img[src]' }],
          toDOM: (node) => ['img', { src: node.attrs.src, alt: node.attrs.alt }],
        },
        text: { group: 'inline' },
      },
    })

    const taggedHeading = imageSchema.nodes.heading.create(
      { level: 2, blockId: 'hs-tagged' },
      imageSchema.text('有标签'),
    )
    const untaggedHeading = imageSchema.nodes.heading.create(
      { level: 2, blockId: 'hs-plain' },
      imageSchema.text('无标签'),
    )
    const hiddenImage = imageSchema.nodes.image.create({ src: '/api/files/demo.png', alt: 'demo' })
    const doc = imageSchema.nodes.doc.create(null, [taggedHeading, untaggedHeading, hiddenImage])

    const flat = [
      {
        id: 'h-tagged',
        blockId: 'hs-tagged',
        level: 2,
        text: '有标签',
        pos: 0,
        sortIndex: 0,
        sourceType: 'local' as const,
      },
      {
        id: 'h-plain',
        blockId: 'hs-plain',
        level: 2,
        text: '无标签',
        pos: 0,
        sortIndex: 0,
        sourceType: 'local' as const,
      },
    ]
    doc.forEach((node, offset) => {
      if (node.type.name !== 'heading') return
      const entry = flat.find((item) => item.blockId === node.attrs.blockId)
      if (entry) entry.pos = offset
    })

    const metadata = setSectionTagsInMetadata({}, 'local:hs-tagged', ['设计'])
    const sectionTagsMap = metadata.sectionTags as Record<string, BlockTag[]>
    const specs = buildTagFilterDecorationSpecs(doc, flat, sectionTagsMap, tagA)

    let imagePos = -1
    doc.descendants((node, offset) => {
      if (node.type.name === 'image') imagePos = offset
    })

    const imageNode = doc.nodeAt(imagePos)!
    expect(specs.some(
      (spec) => spec.type === 'node' && spec.from <= imagePos && spec.to >= imagePos + imageNode.nodeSize,
    )).toBe(true)
  })

  it('shows ref-group in toc when a ref-child matches filter', () => {
    const flat = [
      {
        id: 'ref-group-b1',
        blockId: 'b1',
        level: 2,
        text: '引用',
        pos: 2,
        sortIndex: 0,
        sourceType: 'ref-group' as const,
      },
      {
        id: 'ref-child-b1-0',
        blockId: 'b1',
        level: 3,
        text: '子节',
        pos: 2,
        sortIndex: 1,
        sourceType: 'ref-child' as const,
        contentTreeNodeId: 'ctn-1',
      },
    ]
    const metadata = setSectionTagsInMetadata({}, 'ref-child:b1:ctn-1', ['实现'])
    const sectionTagsMap = metadata.sectionTags as Record<string, BlockTag[]>

    expect(isTocEntryVisible(flat[0], flat, sectionTagsMap, tagB)).toBe(true)
    expect(isTocEntryVisible(flat[0], flat, sectionTagsMap, tagA)).toBe(false)
  })
})

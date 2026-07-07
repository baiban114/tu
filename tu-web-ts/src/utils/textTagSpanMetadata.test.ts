import { describe, expect, it } from 'vitest'
import { Schema } from '@tiptap/pm/model'
import {
  collectTextTagSpanTags,
  createTextTagSpanFromSelection,
  getTextTagSpans,
  removeTextTagSpan,
  resolveTextTagSpanRanges,
  setTextTagSpansInMetadata,
  upsertTextTagSpan,
} from './textTagSpanMetadata'

const testSchema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      group: 'block',
      content: 'text*',
      parseDOM: [{ tag: 'p' }],
      toDOM: () => ['p', 0],
    },
    text: { group: 'inline' },
  },
})

describe('textTagSpanMetadata', () => {
  it('stores and reads text tag spans in metadata', () => {
    const span = createTextTagSpanFromSelection({
      selectedText: '关键词',
      contextBefore: '前文',
      contextAfter: '后文',
      from: 10,
      to: 13,
    }, ['设计'])

    const metadata = upsertTextTagSpan({}, span)
    const spans = getTextTagSpans(metadata)
    expect(spans).toHaveLength(1)
    expect(spans[0].tags).toEqual([expect.objectContaining({ label: '设计' })])
  })

  it('removes empty span list from metadata', () => {
    const span = createTextTagSpanFromSelection({
      selectedText: 'x',
      contextBefore: '',
      contextAfter: '',
    })
    const withSpan = upsertTextTagSpan({}, span)
    const cleared = removeTextTagSpan(withSpan, span.id)
    expect(getTextTagSpans(cleared)).toHaveLength(0)
    expect(cleared.textTagSpans).toBeUndefined()
  })

  it('collects tags from all spans', () => {
    let metadata: Record<string, unknown> = {}
    metadata = upsertTextTagSpan(metadata, createTextTagSpanFromSelection({
      selectedText: 'a',
      contextBefore: '',
      contextAfter: '',
    }, ['设计']))
    metadata = upsertTextTagSpan(metadata, {
      ...createTextTagSpanFromSelection({
        selectedText: 'b',
        contextBefore: '',
        contextAfter: '',
      }),
      id: 'tts-2',
      tags: [{ id: 't2', label: '实现' }],
    })
    const tags = collectTextTagSpanTags(metadata)
    expect(tags.map((tag) => tag.label).sort()).toEqual(['实现', '设计'])
  })

  it('replaces span with same id on upsert', () => {
    const span = createTextTagSpanFromSelection({
      selectedText: '词',
      contextBefore: '',
      contextAfter: '',
    }, ['旧'])
    let metadata = upsertTextTagSpan({}, span)
    metadata = upsertTextTagSpan(metadata, { ...span, tags: [{ id: 'n', label: '新' }] })
    expect(getTextTagSpans(metadata)).toHaveLength(1)
    expect(getTextTagSpans(metadata)[0].tags[0].label).toBe('新')
  })

  it('drops spans without selected text', () => {
    const metadata = setTextTagSpansInMetadata({}, [{
      id: 'bad',
      tags: [],
      selectedText: '   ',
      contextBefore: '',
      contextAfter: '',
    }])
    expect(getTextTagSpans(metadata)).toHaveLength(0)
  })

  it('resolves stored text tag span range without context relocation', () => {
    const doc = testSchema.nodes.doc.create(
      null,
      testSchema.nodes.paragraph.create(null, testSchema.text('前文关键词后文')),
    )
    const paragraphPos = 0
    const keywordFrom = paragraphPos + 1 + 2
    const keywordTo = keywordFrom + 3
    const span = createTextTagSpanFromSelection({
      selectedText: '关键词',
      contextBefore: '前文',
      contextAfter: '后文',
      from: keywordFrom,
      to: keywordTo,
    }, ['设计'])

    const ranges = resolveTextTagSpanRanges(doc, [span])
    expect(ranges).toHaveLength(1)
    expect(ranges[0].from).toBe(keywordFrom)
    expect(ranges[0].to).toBe(keywordTo)
  })
})

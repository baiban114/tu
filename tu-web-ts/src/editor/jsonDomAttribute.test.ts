import { describe, expect, it } from 'vitest'
import { generateHTML, generateJSON } from '@tiptap/html'
import { Editor, Node, mergeAttributes } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { HeadingNode } from './extensions/HeadingNode'
import { ParagraphNode } from './extensions/ParagraphNode'
import { jsonDomAttribute } from './jsonDomAttribute'
import {
  collectPageMetaForRange,
  mergePageClipboardMeta,
  parsePageClipboardMeta,
} from './pageMetaClipboard'

const TestEmbedNode = Node.create({
  name: 'x6Block',
  group: 'block',
  atom: true,
  addAttributes() {
    return {
      blockId: { default: '' },
      graphData: jsonDomAttribute('graphData', 'data-graph-data', { nodes: [], edges: [] }),
      metadata: jsonDomAttribute('metadata', 'data-metadata', {}),
    }
  },
  parseHTML() {
    return [{ tag: 'div[data-type="x6-block"]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'x6-block' })]
  },
})

const testExtensions = [
  StarterKit.configure({ heading: false, paragraph: false }),
  HeadingNode.configure({ levels: [1, 2, 3, 4, 5, 6] }),
  ParagraphNode,
  TestEmbedNode,
]

describe('jsonDomAttribute', () => {
  it('round-trips object values through data attributes', () => {
    const attr = jsonDomAttribute('metadata', 'data-metadata', {})
    const rendered = attr.renderHTML?.({ metadata: { tags: [{ label: 'A' }] } }) ?? {}
    expect(rendered).toEqual({
      'data-metadata': JSON.stringify({ tags: [{ label: 'A' }] }),
    })

    const el = {
      getAttribute: (name: string) =>
        name === 'data-metadata' ? (rendered['data-metadata'] as string) : null,
    } as HTMLElement
    expect(attr.parseHTML?.(el)).toEqual({ tags: [{ label: 'A' }] })
  })

  it('omits default-equal values from HTML', () => {
    const attr = jsonDomAttribute('graphData', 'data-graph-data', { nodes: [], edges: [] })
    expect(attr.renderHTML?.({ graphData: { nodes: [], edges: [] } })).toEqual({})
  })
})

describe('block metadata HTML clipboard round-trip', () => {
  it('preserves embed metadata and structured data', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: {
            level: 1,
            blockId: 'h-1',
            sectionCollapsed: true,
            sourceBinding: {
              resourceItemId: 'ri-1',
              resourceExcerptId: 're-1',
              mode: 'excerpt',
            },
          },
          content: [{ type: 'text', text: '节标题' }],
        },
        {
          type: 'x6Block',
          attrs: {
            blockId: 'x6-1',
            graphData: {
              nodes: [{ id: 'n1', x: 1, y: 2 }],
              edges: [],
            },
            metadata: {
              tags: [{ label: '图' }],
              tocSettings: { headingLevel: 2 },
            },
          },
        },
      ],
    }

    const html = generateHTML(doc, testExtensions)
    expect(html).toContain('data-metadata')
    expect(html).toContain('data-graph-data')
    expect(html).not.toContain('[object Object]')

    const parsed = generateJSON(html, testExtensions)
    const nodes = parsed.content ?? []
    expect(nodes[0]?.attrs?.sourceBinding).toMatchObject({
      resourceItemId: 'ri-1',
      resourceExcerptId: 're-1',
    })
    expect(nodes[0]?.attrs?.sectionCollapsed).toBe(true)
    expect(nodes[1]?.attrs?.metadata).toMatchObject({
      tags: [{ label: '图' }],
      tocSettings: { headingLevel: 2 },
    })
    expect(nodes[1]?.attrs?.graphData).toMatchObject({
      nodes: [{ id: 'n1', x: 1, y: 2 }],
    })
  })
})

describe('pageMetaClipboard', () => {
  it('collects section tags for copied blockIds', () => {
    const editor = new Editor({
      extensions: testExtensions,
      content: {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 2, blockId: 'sec-1' },
            content: [{ type: 'text', text: 'A' }],
          },
          {
            type: 'paragraph',
            attrs: { blockId: 'p-1' },
            content: [{ type: 'text', text: 'body' }],
          },
        ],
      },
    })

    const meta = collectPageMetaForRange(
      editor.state.doc,
      0,
      editor.state.doc.content.size,
      {
        'local:sec-1': [{ id: 't1', label: '节标签' }],
        'local:other': [{ id: 't2', label: '无关' }],
      },
      {
        'local:sec-1': { text: 'A', level: 2 },
      },
    )

    expect(meta?.sectionTags).toEqual({
      'local:sec-1': [{ id: 't1', label: '节标签' }],
    })
    expect(meta?.sectionTagAnchors).toEqual({
      'local:sec-1': { text: 'A', level: 2 },
    })
    editor.destroy()
  })

  it('merges clipboard section tags into page metadata', () => {
    const merged = mergePageClipboardMeta(
      { sectionTags: { 'local:old': [{ id: 't0', label: '旧' }] } },
      {
        sectionTags: { 'local:sec-1': [{ id: 't1', label: '新' }] },
        sectionTagAnchors: { 'local:sec-1': { text: 'A', level: 1 } },
      },
    )
    expect(merged.sectionTags).toEqual({
      'local:old': [{ id: 't0', label: '旧' }],
      'local:sec-1': [{ id: 't1', label: '新' }],
    })
    expect(merged.sectionTagAnchors).toEqual({
      'local:sec-1': { text: 'A', level: 1 },
    })
  })

  it('parses clipboard mime payload', () => {
    expect(parsePageClipboardMeta('{"sectionTags":{"local:a":[{"id":"t","label":"t"}]}}')?.sectionTags).toEqual({
      'local:a': [{ id: 't', label: 't' }],
    })
    expect(parsePageClipboardMeta('not-json')).toBeNull()
  })
})

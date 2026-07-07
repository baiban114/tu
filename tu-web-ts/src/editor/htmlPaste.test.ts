import { describe, expect, it } from 'vitest'
import {
  contentNodesFromGenerated,
  hasRichHtmlClipboard,
  sanitizePastedHtml,
} from './pasteHtmlContent'
import { generateJSON } from '@tiptap/html'
import StarterKit from '@tiptap/starter-kit'
import { HeadingNode } from './extensions/HeadingNode'
import { ParagraphNode } from './extensions/ParagraphNode'
import { CodeBlockNode } from './extensions/CodeBlockNode'

const pasteTestExtensions = [
  StarterKit.configure({
    heading: false,
    paragraph: false,
    codeBlock: false,
  }),
  HeadingNode.configure({ levels: [1, 2, 3, 4, 5, 6] }),
  ParagraphNode,
  CodeBlockNode,
]

describe('pasteHtmlContent', () => {
  it('sanitizePastedHtml strips scripts', () => {
    const html = '<p>ok</p><script>alert(1)</script>'
    expect(sanitizePastedHtml(html)).toBe('<p>ok</p>')
  })

  it('hasRichHtmlClipboard detects rich HTML', () => {
    const dt = {
      getData: (type: string) => (type === 'text/html' ? '<p><strong>Hello</strong></p>' : ''),
    } as DataTransfer
    expect(hasRichHtmlClipboard(dt)).toBe(true)
  })

  it('unwraps doc JSON for insertContent', () => {
    const html = '<h1>Title</h1><p>Body</p>'
    const json = generateJSON(html, pasteTestExtensions)
    const nodes = contentNodesFromGenerated(json)
    expect(Array.isArray(nodes)).toBe(true)
    if (Array.isArray(nodes)) {
      expect(nodes.map((n) => n.type)).toEqual(['heading', 'paragraph'])
    }
  })
})

describe('HTML paste schema', () => {
  it('parses basic HTML into tiptap JSON', () => {
    const html = '<h1>Title</h1><p>Hello <strong>world</strong></p><ul><li>one</li></ul>'
    const json = generateJSON(html, pasteTestExtensions)
    expect(json.type).toBe('doc')
    const types = (json.content ?? []).map((node: { type?: string }) => node.type)
    expect(types).toContain('heading')
    expect(types).toContain('paragraph')
    expect(types).toContain('bulletList')
  })
})

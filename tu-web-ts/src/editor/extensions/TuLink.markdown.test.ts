/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { TuLink } from '@/editor/extensions/TuLink'
import { parseInlineMarkdown } from '@/editor/converters'
import {
  findMarkdownLinkInput,
  parseMarkdownLinkSyntaxMatch,
} from '@/editor/extensions/TuLink'
import { findMarkdownLinkEndingAt } from '@/editor/markdownLinkSyntax'

describe('markdown link syntax', () => {
  const bracketedResourceTitle =
    '[[数据结构(C语言版)].严蔚敏_吴伟民.扫描版](resource:ri-a8bed11a9f1347c59f083d1a7aac1ece)'

  it('parses titled markdown links in converters', () => {
    const nodes = parseInlineMarkdown('[百度](https://www.baidu.com "百度首页")')
    expect(nodes).toEqual([
      {
        type: 'text',
        text: '百度',
        marks: [{
          type: 'link',
          attrs: {
            href: 'https://www.baidu.com',
            title: '百度首页',
          },
        }],
      },
    ])
  })

  it('parses simple markdown links in converters', () => {
    const nodes = parseInlineMarkdown('[Example](https://example.com)')
    expect(nodes[0]).toMatchObject({
      type: 'text',
      text: 'Example',
      marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
    })
  })

  it('parses resource links whose title contains balanced brackets', () => {
    const nodes = parseInlineMarkdown(bracketedResourceTitle)
    expect(nodes).toEqual([
      {
        type: 'text',
        text: '[数据结构(C语言版)].严蔚敏_吴伟民.扫描版',
        marks: [{
          type: 'link',
          attrs: {
            href: 'resource:ri-a8bed11a9f1347c59f083d1a7aac1ece',
          },
        }],
      },
    ])
  })

  it('parses escaped inner brackets and does not mistake images for links', () => {
    expect(parseInlineMarkdown(
      '[\\[数据结构\\](C语言版)](resource:ri-1)',
    )[0]).toMatchObject({
      type: 'text',
      text: '[数据结构](C语言版)',
      marks: [{ type: 'link', attrs: { href: 'resource:ri-1' } }],
    })
    expect(parseInlineMarkdown('![cover](https://example.com/a.png)')).toEqual([
      {
        type: 'image',
        attrs: { src: 'https://example.com/a.png', alt: 'cover' },
      },
    ])
  })

  it('matches input-rule pattern including optional title', () => {
    const titled = findMarkdownLinkEndingAt('[百度](https://www.baidu.com "百度首页")')
    expect(parseMarkdownLinkSyntaxMatch(titled!.groups as unknown as RegExpMatchArray)).toEqual({
      label: '百度',
      href: 'https://www.baidu.com',
      title: '百度首页',
    })

    expect(findMarkdownLinkInput('prefix[Example](https://example.com)')).toBe(
      '[Example](https://example.com)',
    )
    const plain = findMarkdownLinkEndingAt('prefix[Example](https://example.com)')
    expect(parseMarkdownLinkSyntaxMatch(plain!.groups as unknown as RegExpMatchArray)).toEqual({
      label: 'Example',
      href: 'https://example.com',
      title: null,
    })
    expect(plain!.source).toBe('[Example](https://example.com)')
  })
})

describe('markdown link input rule', () => {
  let editor: Editor | null = null

  afterEach(() => {
    editor?.destroy()
    editor = null
  })

  it('converts a typed resource link title containing balanced brackets', async () => {
    editor = new Editor({
      element: document.createElement('div'),
      extensions: [
        StarterKit.configure({ link: false }),
        TuLink.configure({
          openOnClick: false,
          autolink: false,
          protocols: ['resource'],
          isAllowedUri: (url) => String(url || '').startsWith('resource:'),
        }),
      ],
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
    })

    editor.commands.insertContent(
      '[[数据结构(C语言版)].严蔚敏_吴伟民.扫描版](resource:ri-a8bed11a9f1347c59f083d1a7aac1ece)',
      { applyInputRules: true },
    )
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(editor.getHTML()).toContain(
      'href="resource:ri-a8bed11a9f1347c59f083d1a7aac1ece"',
    )
    expect(editor.getText()).toBe('[数据结构(C语言版)].严蔚敏_吴伟民.扫描版')
  })
})

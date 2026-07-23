import { describe, expect, it } from 'vitest'
import { parseInlineMarkdown } from '@/editor/converters'
import {
  MARKDOWN_LINK_INPUT_RE,
  parseMarkdownLinkSyntaxMatch,
} from '@/editor/extensions/TuLink'

describe('markdown link syntax', () => {
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

  it('matches input-rule pattern including optional title', () => {
    const titled = '[百度](https://www.baidu.com "百度首页")'.match(MARKDOWN_LINK_INPUT_RE)
    expect(parseMarkdownLinkSyntaxMatch(titled!)).toEqual({
      label: '百度',
      href: 'https://www.baidu.com',
      title: '百度首页',
    })

    const plain = 'prefix[Example](https://example.com)'.match(MARKDOWN_LINK_INPUT_RE)
    expect(parseMarkdownLinkSyntaxMatch(plain!)).toEqual({
      label: 'Example',
      href: 'https://example.com',
      title: null,
    })
    expect(plain![0]).toBe('[Example](https://example.com)')
  })
})

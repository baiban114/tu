/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { TuLink } from '@/editor/extensions/TuLink'
import {
  findLinkLabelEditContext,
  isCaretInLinkLabel,
  splitMarkdownLinkSourceRanges,
} from '@/editor/linkLabelSuggestRanges'
import {
  parseLinkLabelQuery,
  resolveResourceItemHref,
} from '@/editor/linkLabelSuggestQuery'
import { applyLinkSuggest } from '@/editor/linkLabelSuggestApply'
import type { ResourceItem } from '@/api/externalResource'

describe('splitMarkdownLinkSourceRanges / caret-in-label', () => {
  it('splits complete markdown link', () => {
    const parts = splitMarkdownLinkSourceRanges('[文字](https://a.com)', 10)
    expect(parts).toMatchObject({
      labelText: '文字',
      href: 'https://a.com',
      complete: true,
      labelFrom: 11,
      labelTo: 13,
    })
    expect(isCaretInLinkLabel(12, parts!.labelFrom, parts!.labelTo)).toBe(true)
    expect(isCaretInLinkLabel(14, parts!.labelFrom, parts!.labelTo)).toBe(false)
  })

  it('supports incomplete [query without closing bracket', () => {
    const parts = splitMarkdownLinkSourceRanges('[入门>', 1)
    expect(parts).toMatchObject({
      labelText: '入门>',
      href: null,
      complete: false,
    })
  })
})

describe('parseLinkLabelQuery', () => {
  it('parses flat and drilled queries', () => {
    expect(parseLinkLabelQuery('入门')).toEqual({
      pageQuery: '入门',
      headingQuery: null,
      drilled: false,
    })
    expect(parseLinkLabelQuery('入门>')).toEqual({
      pageQuery: '入门',
      headingQuery: '',
      drilled: true,
    })
    expect(parseLinkLabelQuery('入门>安装')).toEqual({
      pageQuery: '入门',
      headingQuery: '安装',
      drilled: true,
    })
  })
})

describe('resolveResourceItemHref', () => {
  it('prefers http sourceUrl then identity then resource locator', () => {
    expect(resolveResourceItemHref({
      id: 'ri-1',
      title: 'A',
      sourceUrl: 'https://example.com/a',
    } as ResourceItem)).toBe('https://example.com/a')

    expect(resolveResourceItemHref({
      id: 'ri-2',
      title: 'B',
      identityValue: 'https://example.com/b',
    } as ResourceItem)).toBe('https://example.com/b')

    expect(resolveResourceItemHref({
      id: 'ri-3',
      title: 'C',
    } as ResourceItem)).toBe('resource:ri-3')
  })
})

describe('findLinkLabelEditContext + applyLinkSuggest', () => {
  it('finds caret in incomplete label and applies suggestion', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const editor = new Editor({
      element: el,
      extensions: [
        StarterKit.configure({ link: false }),
        TuLink.configure({
          openOnClick: false,
          autolink: false,
          protocols: ['http', 'https', 'page', 'resource'],
          isAllowedUri: (url, ctx) => {
            const value = String(url || '')
            if (value.startsWith('page:') || value.startsWith('resource:')) return true
            return !!ctx.defaultValidate(url)
          },
        }),
      ],
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: '[入门' }] }],
      },
    })

    editor.commands.setTextSelection(3)
    const ctx = findLinkLabelEditContext(editor.state)
    expect(ctx?.labelText).toBe('入门')

    applyLinkSuggest(editor, ctx!, {
      id: 'page:p1',
      kind: 'page',
      label: '入门指南',
      href: 'page:p1',
      description: 'page:p1',
    })
    expect(editor.getText()).toBe('[入门指南](page:p1)')
    editor.destroy()
  })
})

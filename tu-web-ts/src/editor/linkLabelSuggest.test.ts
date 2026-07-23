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
  parseResourceLocator,
  formatResourceChildSuggestLabel,
  resolveResourceItemHref,
} from '@/editor/linkLabelSuggestQuery'
import {
  indexChaptersByParent,
  resolveChapterDrillParent,
  collectResourceScopeSuggests,
} from '@/editor/linkLabelSuggest'
import {
  browseChildren,
  deepSearchInSubtree,
  matchRank,
} from '@/editor/hierarchicalScopeSearch'
import { applyLinkSuggest } from '@/editor/linkLabelSuggestApply'
import type { ResourceChapter, ResourceExcerpt, ResourceItem } from '@/api/externalResource'

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
      pathSegments: [],
      childQuery: null,
      headingQuery: null,
      drilled: false,
    })
    expect(parseLinkLabelQuery('入门>')).toEqual({
      pageQuery: '入门',
      pathSegments: [],
      childQuery: '',
      headingQuery: '',
      drilled: true,
    })
    expect(parseLinkLabelQuery('入门>安装')).toEqual({
      pageQuery: '入门',
      pathSegments: [],
      childQuery: '安装',
      headingQuery: '安装',
      drilled: true,
    })
  })

  it('parses multi-level resource path (one level at a time)', () => {
    expect(parseLinkLabelQuery('王道>第1章>')).toEqual({
      pageQuery: '王道',
      pathSegments: ['第1章'],
      childQuery: '',
      headingQuery: '第1章',
      drilled: true,
    })
    expect(parseLinkLabelQuery('王道 > 第1章 > 1.1')).toEqual({
      pageQuery: '王道',
      pathSegments: ['第1章'],
      childQuery: '1.1',
      headingQuery: '第1章 1.1',
      drilled: true,
    })
  })
})

describe('resolveChapterDrillParent / matchChapterAtLevel', () => {
  const chapters: ResourceChapter[] = [
    { id: 'c1', resourceItemId: 'ri', resourceItemTitle: '书', title: '第1章', sortOrder: 1 },
    { id: 'c1a', resourceItemId: 'ri', resourceItemTitle: '书', parentId: 'c1', title: '1.1 概述', sortOrder: 1 },
    { id: 'c1b', resourceItemId: 'ri', resourceItemTitle: '书', parentId: 'c1', title: '1.2 细节', sortOrder: 2 },
    { id: 'c2', resourceItemId: 'ri', resourceItemTitle: '书', title: '第2章', sortOrder: 2 },
  ]

  it('resolves only one level under the path parent', () => {
    expect(resolveChapterDrillParent(chapters, [])).toEqual({
      parentId: null,
      resolvedPath: [],
    })
    expect(resolveChapterDrillParent(chapters, ['第1章'])).toEqual({
      parentId: 'c1',
      resolvedPath: ['第1章'],
    })
    expect(resolveChapterDrillParent(chapters, ['第1', '1.1'])).toEqual({
      parentId: 'c1a',
      resolvedPath: ['第1章', '1.1 概述'],
    })
    expect(resolveChapterDrillParent(chapters, ['不存在'])).toBeNull()

    const root = indexChaptersByParent(chapters).get(null) ?? []
    expect(root.map((c) => c.id)).toEqual(['c1', 'c2'])
    const underC1 = indexChaptersByParent(chapters).get('c1') ?? []
    expect(underC1.map((c) => c.id)).toEqual(['c1a', 'c1b'])
  })
})

describe('parseResourceLocator', () => {
  it('parses item / chapter / excerpt locators', () => {
    expect(parseResourceLocator('resource:ri-1')).toEqual({ itemId: 'ri-1' })
    expect(parseResourceLocator('resource:ri-1:chapter:rc-2')).toEqual({
      itemId: 'ri-1',
      chapterId: 'rc-2',
    })
    expect(parseResourceLocator('resource:ri-1:excerpt:re-3')).toEqual({
      itemId: 'ri-1',
      excerptId: 're-3',
    })
  })

  it('strips #page= fragment before parsing', () => {
    expect(parseResourceLocator('resource:ri-1#page=12')).toEqual({ itemId: 'ri-1' })
    expect(parseResourceLocator('resource:ri-1:chapter:rc-2#page=3-5')).toEqual({
      itemId: 'ri-1',
      chapterId: 'rc-2',
    })
  })
})

describe('formatResourceChildSuggestLabel', () => {
  it('joins resource and child path with >', () => {
    expect(formatResourceChildSuggestLabel('王道2027计算机网络', '第1章')).toBe(
      '王道2027计算机网络 > 第1章',
    )
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

describe('hierarchicalScopeSearch Browse / DeepSearch', () => {
  const nodes = [
    { id: 'c1', parentId: null, title: '第1章', sortOrder: 1 },
    { id: 'c1a', parentId: 'c1', title: '1.1 概述', sortOrder: 1 },
    { id: 'c1a1', parentId: 'c1a', title: 'TCP 握手', sortOrder: 1 },
    { id: 'c1b', parentId: 'c1', title: '1.2 细节', sortOrder: 2 },
    { id: 'c2', parentId: null, title: '第2章', sortOrder: 2 },
  ]

  it('Browse lists only direct children', () => {
    const root = browseChildren(nodes, null)
    expect(root.map((h) => h.node.id)).toEqual(['c1', 'c2'])
    const underC1 = browseChildren(nodes, 'c1', ['第1章'])
    expect(underC1.map((h) => h.node.id)).toEqual(['c1a', 'c1b'])
    expect(underC1[0].pathFromRoot).toEqual(['第1章', '1.1 概述'])
  })

  it('DeepSearch finds descendants and ranks exact before includes', () => {
    expect(matchRank('TCP 握手', 'TCP')).toBe(1)
    expect(matchRank('TCP', 'TCP')).toBe(0)
    const hits = deepSearchInSubtree(nodes, null, 'TCP', [])
    expect(hits.map((h) => h.node.id)).toEqual(['c1a1'])
    expect(hits[0].pathFromScope).toEqual(['第1章', '1.1 概述', 'TCP 握手'])
    const underC1 = deepSearchInSubtree(nodes, 'c1', '握手', ['第1章'])
    expect(underC1.map((h) => h.node.id)).toEqual(['c1a1'])
    expect(underC1[0].pathFromRoot).toEqual(['第1章', '1.1 概述', 'TCP 握手'])
  })
})

describe('collectResourceScopeSuggests display / apply separation', () => {
  const item = {
    id: 'ri',
    title: '王道2027计算机网络',
  } as ResourceItem

  const chapters: ResourceChapter[] = [
    { id: 'c1', resourceItemId: 'ri', resourceItemTitle: '书', title: '第1章', sortOrder: 1 },
    { id: 'c1a', resourceItemId: 'ri', resourceItemTitle: '书', parentId: 'c1', title: '1.1 概述', sortOrder: 1 },
    { id: 'c1a1', resourceItemId: 'ri', resourceItemTitle: '书', parentId: 'c1a', title: 'TCP 握手', sortOrder: 1 },
    { id: 'c2', resourceItemId: 'ri', resourceItemTitle: '书', title: '第2章', sortOrder: 2 },
  ]

  const excerpts: ResourceExcerpt[] = []

  it('Browse root shows only top-level chapter names', () => {
    const items = collectResourceScopeSuggests(item, chapters, excerpts, [], '', 20)
    expect(items.map((i) => i.label)).toEqual(['第1章', '第2章'])
    expect(items[0].applyLabel).toBe('王道2027计算机网络 > 第1章')
    expect(items[0].description).toBe('第1章')
  })

  it('DeepSearch lists leaf title only but applyLabel keeps full path', () => {
    const items = collectResourceScopeSuggests(item, chapters, excerpts, [], 'TCP', 20)
    expect(items).toHaveLength(1)
    expect(items[0].label).toBe('TCP 握手')
    expect(items[0].applyLabel).toBe('王道2027计算机网络 > 第1章 > 1.1 概述 > TCP 握手')
    expect(items[0].description).toBe('第1章 > 1.1 概述 > TCP 握手')
    expect(items[0].href).toBe('resource:ri:chapter:c1a1')
  })

  it('DeepSearch under chapter scope does not escape subtree', () => {
    const items = collectResourceScopeSuggests(item, chapters, excerpts, ['第1章'], 'TCP', 20)
    expect(items.map((i) => i.label)).toEqual(['TCP 握手'])
    expect(items[0].applyLabel).toBe('王道2027计算机网络 > 第1章 > 1.1 概述 > TCP 握手')
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

  it('prefers applyLabel over label when writing into []', () => {
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
        content: [{ type: 'paragraph', content: [{ type: 'text', text: '[王道>' }] }],
      },
    })

    editor.commands.setTextSelection(3)
    const ctx = findLinkLabelEditContext(editor.state)
    applyLinkSuggest(editor, ctx!, {
      id: 'resource:ri:chapter:c1',
      kind: 'resourceChapter',
      label: '第1章',
      applyLabel: '王道2027计算机网络 > 第1章',
      href: 'resource:ri:chapter:c1',
      description: '第1章',
    })
    expect(editor.getText()).toBe('[王道2027计算机网络 > 第1章](resource:ri:chapter:c1)')
    editor.destroy()
  })
})

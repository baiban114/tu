/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { TuLink } from '@/editor/extensions/TuLink'
import {
  formatMarkdownLinkSource,
  isMarkdownLinkSourceText,
  collapseActiveLinkIrSource,
  getDocumentJsonWithCollapsedLinkIr,
  LINK_IR_SKIP_EXPAND_META,
  linkIrSourceKey,
} from '@/editor/extensions/linkIrSource'

describe('formatMarkdownLinkSource', () => {
  it('formats plain and titled links', () => {
    expect(formatMarkdownLinkSource('百度', 'https://baidu.com')).toBe('[百度](https://baidu.com)')
    expect(formatMarkdownLinkSource('百度', 'https://baidu.com', '首页')).toBe(
      '[百度](https://baidu.com "首页")',
    )
  })

  it('detects source text', () => {
    expect(isMarkdownLinkSourceText('[a](b)')).toBe(true)
    expect(isMarkdownLinkSourceText('a')).toBe(false)
  })
})

describe('link IR source expand/collapse', () => {
  let editor: Editor | null = null

  afterEach(() => {
    editor?.destroy()
    editor = null
  })

  function createEditor() {
    const el = document.createElement('div')
    document.body.appendChild(el)
    return new Editor({
      element: el,
      extensions: [
        StarterKit.configure({ link: false }),
        TuLink.configure({ openOnClick: false, autolink: false }),
      ],
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: '百度',
                marks: [{ type: 'link', attrs: { href: 'https://baidu.com', title: '首页' } }],
              },
            ],
          },
        ],
      },
    })
  }

  it('expands to markdown source when caret enters the link', () => {
    editor = createEditor()
    editor.commands.setTextSelection(2) // inside 「百度」
    expect(editor.getText()).toBe('[百度](https://baidu.com "首页")')
    expect(linkIrSourceKey.getState(editor.state)).toMatchObject({
      from: 1,
      to: 1 + '[百度](https://baidu.com "首页")'.length,
    })
    expect(editor.getHTML()).not.toContain('<a ')
  })

  it('does not keep link mark on expanded source (avoids [[label](url)](url) on save)', () => {
    editor = createEditor()
    editor.commands.setTextSelection(2)
    const json = editor.getJSON()
    const textNode = json.content?.[0]?.content?.[0] as { text?: string; marks?: unknown[] } | undefined
    expect(textNode?.text).toBe('[百度](https://baidu.com "首页")')
    expect(textNode?.marks ?? []).toEqual([])
  })

  it('collapseActiveLinkIrSource restores link before persist', () => {
    editor = createEditor()
    editor.commands.setTextSelection(2)
    expect(linkIrSourceKey.getState(editor.state)).not.toBeNull()

    const linkType = editor.schema.marks.link!
    const tr = collapseActiveLinkIrSource(editor.state, linkType, () => true)
    expect(tr).not.toBeNull()
    editor.view.dispatch(tr!)
    expect(editor.getText()).toBe('百度')
    expect(editor.getHTML()).toContain('href="https://baidu.com"')
    expect(linkIrSourceKey.getState(editor.state)).toBeNull()
  })

  it('getDocumentJsonWithCollapsedLinkIr snapshots without mutating live IR', () => {
    editor = createEditor()
    editor.commands.setTextSelection(2)
    expect(linkIrSourceKey.getState(editor.state)).not.toBeNull()
    const liveText = editor.getText()
    expect(liveText).toContain('[百度]')

    const json = getDocumentJsonWithCollapsedLinkIr(
      editor.state,
      editor.schema.marks.link,
      () => true,
    )
    const para = (json as { content?: Array<{ content?: Array<{ text?: string; marks?: unknown[] }> }> }).content?.[0]
    const textNode = para?.content?.[0]
    expect(textNode?.text).toBe('百度')
    expect(textNode?.marks?.length).toBeGreaterThan(0)

    // Live editor still in source mode — no flicker/collapse side effects.
    expect(editor.getText()).toBe(liveText)
    expect(linkIrSourceKey.getState(editor.state)).not.toBeNull()
  })

  it('collapses back to link when caret leaves the source', () => {
    editor = createEditor()
    // Ensure there is content after the link so the caret can leave the source range.
    editor.commands.insertContentAt(editor.state.doc.content.size - 1, '尾')
    editor.commands.setTextSelection(2)
    expect(editor.getText()).toContain('[百度]')

    const active = linkIrSourceKey.getState(editor.state)
    expect(active).not.toBeNull()
    editor.commands.setTextSelection(active!.to + 1)
    expect(editor.getText()).toBe('百度尾')
    expect(editor.getHTML()).toContain('href="https://baidu.com"')
    expect(linkIrSourceKey.getState(editor.state)).toBeNull()
  })

  it('does not expand when caret is only after the link', () => {
    editor = createEditor()
    // pos after 「百度」 inside paragraph: 1(start) + 2(chars) = 3
    editor.commands.setTextSelection(3)
    expect(editor.getText()).toBe('百度')
    expect(linkIrSourceKey.getState(editor.state)).toBeNull()
  })

  it('LINK_IR_SKIP_EXPAND_META prevents expand (page load / setContent restore)', () => {
    editor = createEditor()
    editor.chain()
      .command(({ tr }) => {
        tr.setMeta(LINK_IR_SKIP_EXPAND_META, true)
        return true
      })
      .setTextSelection(2)
      .run()
    expect(editor.getText()).toBe('百度')
    expect(editor.getHTML()).toContain('href="https://baidu.com"')
    expect(linkIrSourceKey.getState(editor.state)).toBeNull()
  })
})

describe('plain markdown link → link on leave', () => {
  let editor: Editor | null = null

  afterEach(() => {
    editor?.destroy()
    editor = null
  })

  function createPlainEditor(text: string) {
    const el = document.createElement('div')
    document.body.appendChild(el)
    return new Editor({
      element: el,
      extensions: [
        StarterKit.configure({ link: false }),
        TuLink.configure({ openOnClick: false, autolink: false }),
      ],
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: text ? [{ type: 'text', text }] : [],
          },
        ],
      },
    })
  }

  it('activates IR on complete plain source under caret', () => {
    editor = createPlainEditor('[文字](https://example.com)尾')
    editor.commands.setTextSelection(3) // inside label
    expect(linkIrSourceKey.getState(editor.state)).toMatchObject({
      from: 1,
      to: 1 + '[文字](https://example.com)'.length,
    })
    expect(editor.getText()).toBe('[文字](https://example.com)尾')
    expect(editor.getHTML()).not.toContain('<a ')
  })

  it('converts plain source to link when caret leaves', () => {
    editor = createPlainEditor('[文字](https://example.com)尾')
    editor.commands.setTextSelection(3)
    expect(linkIrSourceKey.getState(editor.state)).not.toBeNull()

    const active = linkIrSourceKey.getState(editor.state)!
    editor.commands.setTextSelection(active.to + 1)
    expect(editor.getText()).toBe('文字尾')
    expect(editor.getHTML()).toContain('href="https://example.com"')
    expect(linkIrSourceKey.getState(editor.state)).toBeNull()
  })

  it('converts after filling insides of a pre-typed skeleton then leaving', () => {
    editor = createPlainEditor('[]()尾')
    // Simulate finishing by replacing skeleton with a complete markdown link.
    editor.commands.setTextSelection(1)
    editor.view.dispatch(
      editor.state.tr.insertText('[文字](https://example.com)', 1, 1 + '[]()'.length),
    )
    // Caret stays in the inserted range → IR activates
    editor.commands.setTextSelection(3)
    expect(linkIrSourceKey.getState(editor.state)).not.toBeNull()

    const active = linkIrSourceKey.getState(editor.state)!
    editor.commands.setTextSelection(active.to + 1)
    expect(editor.getText()).toBe('文字尾')
    expect(editor.getHTML()).toContain('href="https://example.com"')
  })

  it('collapseActiveLinkIrSource converts plain source under caret on persist', () => {
    editor = createPlainEditor('[文字](https://example.com)')
    editor.commands.setTextSelection(3)
    const linkType = editor.schema.marks.link!
    const tr = collapseActiveLinkIrSource(editor.state, linkType, () => true)
    expect(tr).not.toBeNull()
    editor.view.dispatch(tr!)
    expect(editor.getText()).toBe('文字')
    expect(editor.getHTML()).toContain('href="https://example.com"')
  })
})

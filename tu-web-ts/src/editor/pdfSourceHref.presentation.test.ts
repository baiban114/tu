/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { PdfExcerptBlockNode, createPdfExcerptNodeAttrs } from '@/editor/extensions/PdfExcerptBlockNode'
import { buildUrlHoverTargetFromPdfBlock } from '@/editor/urlHoverTarget'
import { canRestoreInlineLinkFromHref, disabledLinkPresentationModes } from '@/editor/linkPresentation'

describe('pdf sourceHref presentation', () => {
  let editor: Editor | null = null

  afterEach(() => {
    editor?.destroy()
    editor = null
  })

  it('keeps sourceHref on insert so「链接」stays enabled', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    editor = new Editor({
      element: el,
      extensions: [
        StarterKit.configure({ link: false }),
        PdfExcerptBlockNode,
      ],
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
    })

    const attrs = createPdfExcerptNodeAttrs({
      fileId: 'file-1',
      fileName: 'book.pdf',
      viewMode: 'full',
      startPage: 1,
      endPage: 1,
      sourceHref: 'resource:ri-a9f32a2947d24be0a43db8c59b844e76',
      sourceLabel: '王道2027计算机网络>',
    })

    editor.commands.insertContent({ type: 'pdfExcerptBlock', attrs })

    let foundAttrs: Record<string, unknown> | null = null
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'pdfExcerptBlock') {
        foundAttrs = node.attrs as Record<string, unknown>
        return false
      }
      return true
    })
    expect(foundAttrs).toMatchObject({
      sourceHref: 'resource:ri-a9f32a2947d24be0a43db8c59b844e76',
      sourceLabel: '王道2027计算机网络>',
    })

    const target = buildUrlHoverTargetFromPdfBlock(editor, String(attrs.blockId))
    expect(target?.url).toBe('resource:ri-a9f32a2947d24be0a43db8c59b844e76')
    expect(canRestoreInlineLinkFromHref(target?.url)).toBe(true)
    expect(disabledLinkPresentationModes(target!.url, 'pdf')).not.toContain('link')
  })

  it('disables link only for legacy pdf without sourceHref', () => {
    expect(canRestoreInlineLinkFromHref('file:abc')).toBe(false)
    expect(disabledLinkPresentationModes('file:abc', 'pdf')).toContain('link')
    expect(disabledLinkPresentationModes('resource:ri-1', 'pdf')).not.toContain('link')
  })
})

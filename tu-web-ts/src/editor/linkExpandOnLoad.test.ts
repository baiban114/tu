/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { TuLink } from '@/editor/extensions/TuLink'
import { LINK_IR_SKIP_EXPAND_META, linkIrSourceKey } from '@/editor/extensions/linkIrSource'

const LABEL = '王道2027计算机网络>'
const HREF = 'resource:ri-a9f32a2947d24be0a43db8c59b844e76'
const SAMPLE = `[${LABEL}](${HREF})`

function createTuLink() {
  return TuLink.configure({
    openOnClick: false,
    autolink: false,
    protocols: ['http', 'https', 'resource'],
    isAllowedUri: (url, ctx) => {
      const value = String(url || '').trim()
      if (value.startsWith('resource:')) return true
      return !!ctx.defaultValidate(url)
    },
  })
}

const linkDoc = {
  type: 'doc' as const,
  content: [{
    type: 'paragraph',
    content: [{
      type: 'text',
      text: LABEL,
      marks: [{ type: 'link', attrs: { href: HREF } }],
    }],
  }],
}

describe('resource link page-load expand', () => {
  let editor: Editor | null = null
  afterEach(() => {
    editor?.destroy()
    editor = null
  })

  it('setContent + setTextSelection expands without skip meta (bug repro)', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    editor = new Editor({
      element: el,
      extensions: [StarterKit.configure({ link: false }), createTuLink()],
      content: '<p>hello</p>',
    })
    editor.commands.setContent(linkDoc, { emitUpdate: false })
    editor.commands.setTextSelection({ from: 1, to: 1 })
    expect(editor.getText()).toBe(SAMPLE)
    expect(linkIrSourceKey.getState(editor.state)).not.toBeNull()
  })

  it('setContent + restore with SKIP_EXPAND keeps link rendered', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    editor = new Editor({
      element: el,
      extensions: [StarterKit.configure({ link: false }), createTuLink()],
      content: '<p>hello</p>',
    })
    editor.commands.setContent(linkDoc, { emitUpdate: false })
    // Mimic TuEditor.restoreSelectionAfterContentSync
    editor.chain()
      .command(({ tr }) => {
        tr.setMeta(LINK_IR_SKIP_EXPAND_META, true)
        return true
      })
      .setTextSelection({ from: 1, to: 1 })
      .run()
    expect(editor.getText()).toBe(LABEL)
    expect(editor.getHTML()).toContain(`href="${HREF}"`)
    expect(linkIrSourceKey.getState(editor.state)).toBeNull()
  })
})

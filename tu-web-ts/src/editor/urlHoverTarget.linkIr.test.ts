/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { TextSelection } from '@tiptap/pm/state'
import { TuLink } from '@/editor/extensions/TuLink'
import { linkIrSourceKey } from '@/editor/extensions/linkIrSource'
import { buildUrlHoverTargetFromLinkIr, buildUrlHoverTargetFromLinkMarkAtPos } from '@/editor/urlHoverTarget'
import { shouldShowSelectionBubbleMenu } from '@/editor/selectionToolbar'

describe('url hover / selection toolbar vs link IR', () => {
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
                marks: [{ type: 'link', attrs: { href: 'https://baidu.com' } }],
              },
            ],
          },
        ],
      },
    })
  }

  it('builds hover target for whole IR markdown span (not bare URL)', () => {
    editor = createEditor()
    editor.commands.setTextSelection(2)
    const active = linkIrSourceKey.getState(editor.state)
    expect(active).not.toBeNull()

    const target = buildUrlHoverTargetFromLinkIr(editor, active)
    expect(target).toMatchObject({
      kind: 'inline',
      url: 'https://baidu.com/',
      from: active!.from,
      to: active!.to,
      label: '百度',
      displayMode: 'link',
    })
    expect(editor.state.doc.textBetween(target!.from, target!.to, '')).toBe('[百度](https://baidu.com)')
  })

  it('keeps a resolvable IR hover target after expand (toolbar should stay)', () => {
    editor = createEditor()
    // Simulate: HTML link was hover target, then caret enters → IR expand
    expect(buildUrlHoverTargetFromLinkMarkAtPos(editor, 2)).toMatchObject({
      label: '百度',
      url: 'https://baidu.com/',
    })
    editor.commands.setTextSelection(2)
    const active = linkIrSourceKey.getState(editor.state)
    expect(active).not.toBeNull()
    expect(buildUrlHoverTargetFromLinkIr(editor, active)).not.toBeNull()
  })

  it('hides selection bubble menu while link IR source is active', () => {
    editor = createEditor()
    editor.commands.setTextSelection(2)
    const active = linkIrSourceKey.getState(editor.state)
    expect(active).not.toBeNull()

    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, active!.from + 1, active!.to - 1)),
    )

    const { from, to } = editor.state.selection
    expect(
      shouldShowSelectionBubbleMenu(
        editor,
        editor.view,
        editor.state,
        from,
        to,
        false,
        false,
      ),
    ).toBe(false)
  })
})

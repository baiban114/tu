import { Extension } from '@tiptap/core'
import type { Editor } from '@tiptap/core'

/**
 * Enter inside a heading: keep the heading, put the new line in a paragraph.
 * Empty heading → convert to paragraph (exit heading).
 */
export function handleHeadingEnter(editor: Editor): boolean {
  if (!editor.isActive('heading')) {
    return false
  }

  const { $from } = editor.state.selection
  if ($from.parent.type.name !== 'heading') {
    return false
  }

  if ($from.parent.content.size === 0) {
    return editor.commands.setNode('paragraph')
  }

  if (!editor.commands.splitBlock()) {
    return false
  }

  // Mid-heading splits keep both halves as heading; convert the new half.
  // At end, TipTap may already create a paragraph — leave it alone.
  if (editor.isActive('heading')) {
    return editor.commands.setNode('paragraph')
  }

  return true
}

/**
 * Enter inside a heading creates a following paragraph (body text),
 * instead of another heading of the same level.
 */
export const HeadingEnterFix = Extension.create({
  name: 'headingEnterFix',

  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => handleHeadingEnter(editor),
    }
  },
})

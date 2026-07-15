import type { Editor } from '@tiptap/core'
import { isTextSelection } from '@tiptap/core'
import { getAnnotationSelectionPayload } from '@/editor/annotationText'

const TEXT_BLOCK_NODE_TYPES = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'codeBlock',
  'bulletList',
  'orderedList',
  'listItem',
  'taskList',
  'taskItem',
  'image',
])

export interface SelectionToolbarActions {
  canAddNote: boolean
  canMarkResourceExcerpt: boolean
  canSetExcerptBasis: boolean
  canEditTextTags: boolean
  canCreateKnowledgeRelation: boolean
  canShow: boolean
}

function collectSpannedBlockIds(doc: Editor['state']['doc'], from: number, to: number): string[] {
  const seen = new Set<string>()
  const ids: string[] = []
  let hasNonTextBlock = false

  doc.nodesBetween(from, to, (node) => {
    const blockId = node.attrs?.blockId
    if (!blockId || seen.has(blockId)) return true
    if (!node.isBlock && !node.type.isAtom) return true

    const blockType = node.type.name
    if (!TEXT_BLOCK_NODE_TYPES.has(blockType)) {
      hasNonTextBlock = true
    }
    seen.add(blockId)
    ids.push(blockId)
    return true
  })

  return ids.length > 1 || hasNonTextBlock ? ids : []
}

function isSelectionInHeading(editor: Editor): boolean {
  const { $from } = editor.state.selection
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name === 'heading') return true
  }
  return false
}

export function getSelectionToolbarActions(
  editor: Editor,
  from: number,
  to: number,
): SelectionToolbarActions {
  const payload = getAnnotationSelectionPayload(editor.state.doc, from, to)
  const hasText = payload.selectedText.trim().length > 0
  const spannedBlockIds = collectSpannedBlockIds(editor.state.doc, from, to)
  const inHeading = isSelectionInHeading(editor)

  const canAddNote = hasText || spannedBlockIds.length > 0
  const canMarkResourceExcerpt = hasText && !inHeading
  const canSetExcerptBasis = hasText && !inHeading
  const canEditTextTags = hasText && spannedBlockIds.length === 0
  const canCreateKnowledgeRelation = canAddNote && !inHeading
  const canShow = canAddNote || canMarkResourceExcerpt || canSetExcerptBasis || canEditTextTags || canCreateKnowledgeRelation

  return {
    canAddNote,
    canMarkResourceExcerpt,
    canSetExcerptBasis,
    canEditTextTags,
    canCreateKnowledgeRelation,
    canShow,
  }
}

export function shouldShowSelectionBubbleMenu(
  editor: Editor,
  view: Editor['view'],
  state: Editor['state'],
  from: number,
  to: number,
  suppressed: boolean,
  isMouseSelecting: boolean,
  menuElement?: HTMLElement | null,
): boolean {
  if (suppressed || !editor.isEditable || isMouseSelecting) return false

  const { selection } = state
  const { empty } = selection
  const isEmptyTextBlock = !state.doc.textBetween(from, to).length && isTextSelection(selection)
  const isChildOfMenu = menuElement?.contains(document.activeElement) ?? false
  const hasEditorFocus = view.hasFocus() || isChildOfMenu

  if (!hasEditorFocus || suppressed) return false
  if (empty || isEmptyTextBlock) return false

  return getSelectionToolbarActions(editor, from, to).canShow
}

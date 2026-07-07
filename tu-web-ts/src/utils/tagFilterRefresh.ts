import type { Editor } from '@tiptap/core'
import { TAG_CONTENT_FILTER_META } from '@/editor/extensions/TagContentFilter'

export function dispatchTagFilterRefresh(editor: Editor | null | undefined): void {
  if (!editor?.view) return
  editor.view.dispatch(editor.state.tr.setMeta(TAG_CONTENT_FILTER_META, true))
}

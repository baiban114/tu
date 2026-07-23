import type { Editor } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import {
  formatMarkdownLinkSource,
  LINK_IR_META,
  type LinkIrSourceState,
} from '@/editor/extensions/linkIrSource'
import type { LinkLabelEditContext } from '@/editor/linkLabelSuggestRanges'
import type { LinkSuggestItem } from '@/editor/linkLabelSuggestQuery'

/** Replace the markdown link span with selected suggestion; keep IR source mode. */
export function applyLinkSuggest(
  editor: Editor,
  context: LinkLabelEditContext,
  item: LinkSuggestItem,
): void {
  const source = formatMarkdownLinkSource(item.label, item.href)
  const { state, view } = editor
  const tr = state.tr
  tr.replaceWith(context.replaceFrom, context.replaceTo, state.schema.text(source))
  const from = context.replaceFrom
  const to = from + source.length
  const labelEnd = from + 1 + item.label.length
  tr.setSelection(TextSelection.create(tr.doc, Math.min(labelEnd, to)))
  tr.setMeta(LINK_IR_META, {
    from,
    to,
    displayMode: 'link',
  } satisfies LinkIrSourceState)
  tr.setMeta('addToHistory', true)
  tr.setMeta('preventAutolink', true)
  view.dispatch(tr)
}

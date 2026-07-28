import type { Editor } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import {
  formatMarkdownLinkSource,
  LINK_IR_META,
  type LinkIrSourceState,
} from '@/editor/extensions/linkIrSource'
import type { LinkLabelEditContext } from '@/editor/linkLabelSuggestRanges'
import {
  extractLinkLabelPageRange,
  HEADING_SEP,
  type LinkSuggestItem,
} from '@/editor/linkLabelSuggestQuery'

/**
 * Visible `[]` title after select: resource/PDF name for resource locators;
 * otherwise the suggest list label (page / heading).
 */
export function suggestDisplayTitle(item: LinkSuggestItem): string {
  if (
    item.kind === 'resourceItem'
    || item.kind === 'resourceChapter'
    || item.kind === 'resourceExcerpt'
  ) {
    const path = item.applyLabel ?? item.label
    const first = path.split(HEADING_SEP)[0]?.trim() || item.label
    return extractLinkLabelPageRange(first).text || item.label
  }
  return item.label
}

/** Replace the markdown link span with selected suggestion; keep IR source mode. */
export function applyLinkSuggest(
  editor: Editor,
  context: LinkLabelEditContext,
  item: LinkSuggestItem,
): void {
  const writtenLabel = suggestDisplayTitle(item)
  const source = formatMarkdownLinkSource(writtenLabel, item.href)
  const { state, view } = editor
  const tr = state.tr
  tr.replaceWith(context.replaceFrom, context.replaceTo, state.schema.text(source))
  const from = context.replaceFrom
  const to = from + source.length
  // Leave caret in `()` so the user can continue `>` browse by editing the href draft.
  const hrefCaret = from + 1 + writtenLabel.length + 2 + item.href.length
  tr.setSelection(TextSelection.create(tr.doc, Math.min(hrefCaret, to)))
  tr.setMeta(LINK_IR_META, {
    from,
    to,
    displayMode: 'link',
  } satisfies LinkIrSourceState)
  tr.setMeta('addToHistory', true)
  tr.setMeta('preventAutolink', true)
  view.dispatch(tr)
}

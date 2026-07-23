import { getMarkRange } from '@tiptap/core'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import type { Mark, MarkType } from '@tiptap/pm/model'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export const linkIrSourceKey = new PluginKey<LinkIrSourceState | null>('tuLinkIrSource')

/** Meta key: plugin state replacement for expand/collapse transactions. */
export const LINK_IR_META = 'tuLinkIr'

/**
 * Meta key: skip expand / plain-activate for this transaction.
 * Used when TuEditor restores selection after setContent (page load / blocks sync)
 * so links stay rendered as `<a>` instead of flashing into `[label](url)` source.
 */
export const LINK_IR_SKIP_EXPAND_META = 'tuLinkIrSkipExpand'

const COLLAPSE_RE =
  /^\[([^\]]+)\]\(([^)\s]+)(?:\s+(?:"([^"]*)"|'([^']*)'))?\)$/

/** Find complete markdown links inside a textblock (not anchored to caret end). */
const FIND_IN_BLOCK_RE =
  /\[([^\]]+)\]\(([^)\s]+)(?:\s+(?:"([^"]*)"|'([^']*)'))?\)/g

export interface LinkIrSourceState {
  from: number
  to: number
  displayMode: string
}

export function formatMarkdownLinkSource(
  label: string,
  href: string,
  title?: string | null,
): string {
  const trimmedTitle = title?.trim()
  if (trimmedTitle) {
    return `[${label}](${href} "${trimmedTitle.replace(/"/g, '\\"')}")`
  }
  return `[${label}](${href})`
}

export function isMarkdownLinkSourceText(text: string): boolean {
  return COLLAPSE_RE.test(text)
}

export function parseMarkdownLinkSource(text: string): {
  label: string
  href: string
  title: string | null
} | null {
  const match = text.match(COLLAPSE_RE)
  if (!match) return null
  const label = match[1]?.trim() ?? ''
  const href = match[2]?.trim() ?? ''
  const title = (match[3] || match[4] || '').trim() || null
  if (!label || !href) return null
  return { label, href, title }
}

function parseCollapseSource(text: string): {
  label: string
  href: string
  title: string | null
} | null {
  return parseMarkdownLinkSource(text)
}

interface LinkAtSelection {
  from: number
  to: number
  mark: Mark
  label: string
}

/**
 * Link under caret for IR expand.
 * - Inside link text → expand
 * - Caret at start touching link (nodeAfter) → expand
 * - Caret only after link (nodeBefore, marks empty) → do not expand
 */
export function findLinkAtSelection(
  state: EditorState,
  linkType: MarkType,
): LinkAtSelection | null {
  const { selection } = state
  const resolveAt = (pos: number): LinkAtSelection | null => {
    const $pos = state.doc.resolve(pos)
    let mark = $pos.marks().find((item) => item.type === linkType && item.attrs.href)
    if (!mark && $pos.nodeAfter?.isText) {
      mark = $pos.nodeAfter.marks.find((item) => item.type === linkType && item.attrs.href)
    }
    if (!mark) return null
    const range = getMarkRange($pos, linkType, mark.attrs)
    if (!range || range.to <= range.from) return null
    return {
      from: range.from,
      to: range.to,
      mark,
      label: state.doc.textBetween(range.from, range.to, ''),
    }
  }

  if (selection.empty) {
    return resolveAt(selection.from)
  }

  const a = resolveAt(selection.from)
  const b = resolveAt(Math.max(selection.from, selection.to - 1))
  if (!a || !b || a.from !== b.from || a.to !== b.to) return null
  if (selection.from < a.from || selection.to > a.to) return null
  return a
}

/**
 * Complete plain-text `[label](href)` under `pos` (no link mark on the span).
 * Used when caret enters pasted / hand-built markdown so leave can collapse to a link.
 */
export function findPlainMarkdownLinkSourceAt(
  state: EditorState,
  pos: number,
  linkType: MarkType,
): { from: number; to: number } | null {
  const safePos = Math.max(0, Math.min(pos, state.doc.content.size))
  const $pos = state.doc.resolve(safePos)
  if (!$pos.parent.isTextblock) return null

  const blockStart = $pos.start()
  const blockEnd = $pos.end()
  const blockText = state.doc.textBetween(blockStart, blockEnd, '\0', '\0')

  FIND_IN_BLOCK_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = FIND_IN_BLOCK_RE.exec(blockText)) !== null) {
    const from = blockStart + match.index
    const to = from + match[0].length
    if (safePos < from || safePos > to) continue
    if (!parseCollapseSource(match[0])) continue
    if (state.doc.rangeHasMark(from, to, linkType)) continue
    return { from, to }
  }
  return null
}

function selectionInsideRange(
  state: EditorState,
  from: number,
  to: number,
): boolean {
  const { selection } = state
  return selection.from >= from && selection.to <= to
}

function mapRangeThroughTransactions(
  transactions: readonly Transaction[],
  from: number,
  to: number,
): { from: number; to: number } | null {
  let nextFrom = from
  let nextTo = to
  for (const tr of transactions) {
    nextFrom = tr.mapping.map(nextFrom, 1)
    nextTo = tr.mapping.map(nextTo, -1)
  }
  if (nextFrom >= nextTo) return null
  return { from: nextFrom, to: nextTo }
}

function mapIrState(
  tr: Transaction,
  value: LinkIrSourceState | null,
): LinkIrSourceState | null {
  if (!value) return null
  const from = tr.mapping.map(value.from, 1)
  const to = tr.mapping.map(value.to, -1)
  if (from >= to) return null
  return { ...value, from, to }
}

function buildActivatePlainSourceTransaction(
  state: EditorState,
  from: number,
  to: number,
): Transaction {
  return state.tr
    .setMeta(LINK_IR_META, { from, to, displayMode: 'link' } satisfies LinkIrSourceState)
    .setMeta('addToHistory', false)
    .setMeta('preventAutolink', true)
}

export interface LinkIrSourcePluginOptions {
  getLinkType: () => MarkType
  isAllowedHref: (href: string) => boolean
}

export function createLinkIrSourcePlugin(options: LinkIrSourcePluginOptions): Plugin<LinkIrSourceState | null> {
  return new Plugin<LinkIrSourceState | null>({
    key: linkIrSourceKey,
    state: {
      init: () => null,
      apply(tr, value) {
        if (tr.getMeta(LINK_IR_META) !== undefined) {
          return tr.getMeta(LINK_IR_META) as LinkIrSourceState | null
        }
        if (!tr.docChanged) return value
        return mapIrState(tr, value)
      },
    },
    props: {
      decorations(state) {
        const active = linkIrSourceKey.getState(state)
        if (!active || active.to <= active.from) return null
        return DecorationSet.create(state.doc, [
          Decoration.inline(active.from, active.to, { class: 'tu-link-ir-source' }),
        ])
      },
    },
    appendTransaction(transactions, oldState, newState) {
      const irMetaTr = transactions.find((tr) => tr.getMeta(LINK_IR_META) !== undefined)
      // Expand / plain-activate sets non-null meta — stop. Clear/collapse sets null — may rescue.
      if (irMetaTr && irMetaTr.getMeta(LINK_IR_META) !== null) {
        return null
      }

      const linkType = options.getLinkType()
      const prevActive = linkIrSourceKey.getState(newState)
      const selectionChanged = transactions.some((tr) => tr.selectionSet)
      const docChanged = transactions.some((tr) => tr.docChanged)
      const afterClear = !!irMetaTr && irMetaTr.getMeta(LINK_IR_META) === null
      // TuEditor sets this when restoring selection after setContent (page load / blocks sync).
      const skipExpand = transactions.some((tr) => tr.getMeta(LINK_IR_SKIP_EXPAND_META))

      if (prevActive) {
        const text = newState.doc.textBetween(prevActive.from, prevActive.to, '')
        const stillSource = isMarkdownLinkSourceText(text)
        const becameLink = newState.doc.rangeHasMark(prevActive.from, prevActive.to, linkType)

        if (!stillSource || becameLink) {
          return newState.tr
            .setMeta(LINK_IR_META, null)
            .setMeta('addToHistory', false)
        }

        if (selectionInsideRange(newState, prevActive.from, prevActive.to)) {
          return null
        }
        return buildCollapseTransaction(newState, prevActive, linkType, options.isAllowedHref)
      }

      // Caret left a plain `[label](href)` that was never IR-activated (e.g. finished by
      // editing insides of `[]()`, or paste that skipped PasteRule) → convert on leave.
      if (selectionChanged) {
        const leftPlain = findPlainMarkdownLinkSourceAt(
          oldState,
          oldState.selection.head,
          linkType,
        )
        if (leftPlain) {
          const mapped = mapRangeThroughTransactions(transactions, leftPlain.from, leftPlain.to)
          if (
            mapped
            && !selectionInsideRange(newState, mapped.from, mapped.to)
          ) {
            const text = newState.doc.textBetween(mapped.from, mapped.to, '')
            if (
              parseCollapseSource(text)
              && !newState.doc.rangeHasMark(mapped.from, mapped.to, linkType)
            ) {
              const parsed = parseCollapseSource(text)
              if (parsed && options.isAllowedHref(parsed.href)) {
                return buildCollapseTransaction(
                  newState,
                  { from: mapped.from, to: mapped.to, displayMode: 'link' },
                  linkType,
                  options.isAllowedHref,
                )
              }
            }
          }
        }
      }

      if (skipExpand) return null

      if (!selectionChanged && !afterClear && !docChanged) return null

      const link = findLinkAtSelection(newState, linkType)
      if (link?.label) {
        // Only expand when selection moved into a link (or after IR clear), not on every
        // docChanged while caret sits after a link — preserves InputRule convert UX.
        if (selectionChanged || afterClear) {
          return buildExpandTransaction(newState, link)
        }
      }

      // Caret inside complete plain markdown → enter IR source mode (decoration only).
      // Leave path above / prevActive collapse then turns it into a real link.
      if (selectionChanged || docChanged || afterClear) {
        const plain = findPlainMarkdownLinkSourceAt(
          newState,
          newState.selection.head,
          linkType,
        )
        if (plain && selectionInsideRange(newState, plain.from, plain.to)) {
          const parsed = parseCollapseSource(
            newState.doc.textBetween(plain.from, plain.to, ''),
          )
          if (parsed && options.isAllowedHref(parsed.href)) {
            return buildActivatePlainSourceTransaction(newState, plain.from, plain.to)
          }
        }
      }

      return null
    },
  })
}

function buildExpandTransaction(
  state: EditorState,
  link: LinkAtSelection,
): Transaction {
  const href = String(link.mark.attrs.href || '')
  const title = typeof link.mark.attrs.title === 'string' ? link.mark.attrs.title : null
  const displayMode = typeof link.mark.attrs.displayMode === 'string'
    ? link.mark.attrs.displayMode
    : 'link'
  const source = formatMarkdownLinkSource(link.label, href, title)
  const tr = state.tr
  const offsetInLabel = Math.max(0, Math.min(state.selection.from - link.from, link.label.length))
  // insertText keeps marks from the replaced range; that would leave link mark on the
  // markdown source and serialize as [[label](href)](href). Always insert plain text.
  tr.replaceWith(link.from, link.to, state.schema.text(source))
  tr.removeStoredMark(link.mark.type)
  const from = link.from
  const to = link.from + source.length
  const caret = from + 1 + offsetInLabel
  tr.setSelection(TextSelection.create(tr.doc, Math.min(caret, to)))
  tr.setMeta(LINK_IR_META, { from, to, displayMode } satisfies LinkIrSourceState)
  tr.setMeta('addToHistory', false)
  tr.setMeta('preventAutolink', true)
  return tr
}

function buildCollapseTransaction(
  state: EditorState,
  active: LinkIrSourceState,
  linkType: MarkType,
  isAllowedHref: (href: string) => boolean,
): Transaction {
  const text = state.doc.textBetween(active.from, active.to, '')
  const tr = state.tr
  tr.setMeta(LINK_IR_META, null)
  tr.setMeta('addToHistory', false)
  tr.setMeta('preventAutolink', true)

  const parsed = parseCollapseSource(text)
  if (!parsed || !isAllowedHref(parsed.href)) {
    return tr
  }

  tr.replaceWith(active.from, active.to, state.schema.text(parsed.label))
  tr.addMark(
    active.from,
    active.from + parsed.label.length,
    linkType.create({
      href: parsed.href,
      title: parsed.title,
      displayMode: active.displayMode === 'title' ? 'title' : 'link',
    }),
  )
  return tr
}

/** Collapse IR source before persist/export so expanded markdown never leaks into storage. */
export function collapseActiveLinkIrSource(
  state: EditorState,
  linkType: MarkType,
  isAllowedHref: (href: string) => boolean,
): Transaction | null {
  const active = linkIrSourceKey.getState(state)
  if (active && active.to > active.from) {
    return buildCollapseTransaction(state, active, linkType, isAllowedHref)
  }

  // Plain `[label](href)` under caret (e.g. pasted, never left) — convert on persist too.
  const plain = findPlainMarkdownLinkSourceAt(state, state.selection.head, linkType)
  if (!plain) return null
  const text = state.doc.textBetween(plain.from, plain.to, '')
  const parsed = parseCollapseSource(text)
  if (!parsed || !isAllowedHref(parsed.href)) return null
  return buildCollapseTransaction(
    state,
    { from: plain.from, to: plain.to, displayMode: 'link' },
    linkType,
    isAllowedHref,
  )
}

/**
 * Persistable doc JSON with active IR collapsed, without mutating the live editor.
 * Keeps source-mode editing stable (no collapse→expand flicker / label trim while typing).
 */
export function getDocumentJsonWithCollapsedLinkIr(
  state: EditorState,
  linkType: MarkType | undefined,
  isAllowedHref: (href: string) => boolean,
): Record<string, unknown> {
  if (!linkType) return state.doc.toJSON() as Record<string, unknown>
  const tr = collapseActiveLinkIrSource(state, linkType, isAllowedHref)
  const doc = tr ? state.apply(tr).doc : state.doc
  return doc.toJSON() as Record<string, unknown>
}

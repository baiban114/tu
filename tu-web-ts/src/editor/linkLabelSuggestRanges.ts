import type { EditorState } from '@tiptap/pm/state'
import { findLinkAtSelection, linkIrSourceKey } from '@/editor/extensions/linkIrSource'

export interface LinkLabelEditContext {
  /** Inclusive markdown span to replace (starts at `[`). */
  replaceFrom: number
  replaceTo: number
  /** Label content range (exclusive of `[` / `]` for markdown; full mark span when collapsed). */
  labelFrom: number
  labelTo: number
  labelText: string
  href: string | null
  title: string | null
  complete: boolean
}

/**
 * Split markdown link source text into label / href character offsets relative to `sourceFrom`.
 * Supports complete `[label](href)` and incomplete `[label` / `[label](`.
 */
export function splitMarkdownLinkSourceRanges(
  sourceText: string,
  sourceFrom: number,
): {
  labelFrom: number
  labelTo: number
  hrefFrom: number | null
  hrefTo: number | null
  labelText: string
  href: string | null
  title: string | null
  complete: boolean
  replaceTo: number
} | null {
  if (!sourceText.startsWith('[')) return null

  const closeBracket = sourceText.indexOf(']')
  if (closeBracket < 0) {
    const labelText = sourceText.slice(1)
    return {
      labelFrom: sourceFrom + 1,
      labelTo: sourceFrom + sourceText.length,
      hrefFrom: null,
      hrefTo: null,
      labelText,
      href: null,
      title: null,
      complete: false,
      replaceTo: sourceFrom + sourceText.length,
    }
  }

  const labelText = sourceText.slice(1, closeBracket)
  const labelFrom = sourceFrom + 1
  const labelTo = sourceFrom + closeBracket

  if (sourceText[closeBracket + 1] !== '(') {
    return {
      labelFrom,
      labelTo,
      hrefFrom: null,
      hrefTo: null,
      labelText,
      href: null,
      title: null,
      complete: false,
      replaceTo: sourceFrom + closeBracket + 1,
    }
  }

  const afterParen = sourceText.slice(closeBracket + 2)
  const closeParen = afterParen.indexOf(')')
  if (closeParen < 0) {
    return {
      labelFrom,
      labelTo,
      hrefFrom: sourceFrom + closeBracket + 2,
      hrefTo: sourceFrom + sourceText.length,
      labelText,
      href: afterParen.trim() || null,
      title: null,
      complete: false,
      replaceTo: sourceFrom + sourceText.length,
    }
  }

  const hrefChunk = afterParen.slice(0, closeParen)
  const titled = hrefChunk.match(/^([^\s]+)(?:\s+(?:"([^"]*)"|'([^']*)'))?$/)
  const href = (titled?.[1] ?? hrefChunk).trim()
  const title = (titled?.[2] || titled?.[3] || '').trim() || null
  const replaceTo = sourceFrom + closeBracket + 2 + closeParen + 1
  return {
    labelFrom,
    labelTo,
    hrefFrom: sourceFrom + closeBracket + 2,
    hrefTo: sourceFrom + closeBracket + 2 + closeParen,
    labelText,
    href: href || null,
    title,
    complete: Boolean(labelText.trim() && href),
    replaceTo,
  }
}

export function isCaretInLinkLabel(
  caret: number,
  labelFrom: number,
  labelTo: number,
): boolean {
  return caret >= labelFrom && caret <= labelTo
}

/**
 * Resolve the markdown-link label edit context under caret (IR active, incomplete `[query`, or collapsed link mark).
 */
export function findLinkLabelEditContext(
  state: EditorState,
  caret = state.selection.head,
): LinkLabelEditContext | null {
  const active = linkIrSourceKey.getState(state)
  if (active && active.to > active.from) {
    const text = state.doc.textBetween(active.from, active.to, '')
    const parts = splitMarkdownLinkSourceRanges(text, active.from)
    if (parts && isCaretInLinkLabel(caret, parts.labelFrom, parts.labelTo)) {
      return {
        replaceFrom: active.from,
        replaceTo: parts.replaceTo,
        labelFrom: parts.labelFrom,
        labelTo: parts.labelTo,
        labelText: parts.labelText,
        href: parts.href,
        title: parts.title,
        complete: parts.complete,
      }
    }
  }

  const $pos = state.doc.resolve(Math.max(0, Math.min(caret, state.doc.content.size)))
  if (!$pos.parent.isTextblock) return null

  const blockStart = $pos.start()
  const blockEnd = $pos.end()
  const blockText = state.doc.textBetween(blockStart, blockEnd, '\0', '\0')
  const offset = caret - blockStart
  if (offset < 0 || offset > blockText.length) return null

  const before = blockText.slice(0, offset)
  const openIdx = before.lastIndexOf('[')
  if (openIdx >= 0 && !before.slice(openIdx + 1).includes(']')) {
    const fromOpen = blockText.slice(openIdx)
    const parts = splitMarkdownLinkSourceRanges(fromOpen, blockStart + openIdx)
    if (parts && isCaretInLinkLabel(caret, parts.labelFrom, parts.labelTo)) {
      return {
        replaceFrom: blockStart + openIdx,
        replaceTo: parts.replaceTo,
        labelFrom: parts.labelFrom,
        labelTo: parts.labelTo,
        labelText: parts.labelText,
        href: parts.href,
        title: parts.title,
        complete: parts.complete,
      }
    }
  }

  const linkType = state.schema.marks.link
  if (!linkType) return null
  const linkAt = findLinkAtSelection(state, linkType)
  if (!linkAt) return null
  if (!isCaretInLinkLabel(caret, linkAt.from, linkAt.to)) return null
  const href = typeof linkAt.mark.attrs.href === 'string' ? linkAt.mark.attrs.href : null
  const titleRaw = linkAt.mark.attrs.title
  const title = typeof titleRaw === 'string' && titleRaw.trim() ? titleRaw : null
  return {
    replaceFrom: linkAt.from,
    replaceTo: linkAt.to,
    labelFrom: linkAt.from,
    labelTo: linkAt.to,
    labelText: linkAt.label,
    href,
    title,
    complete: Boolean(linkAt.label.trim() && href),
  }
}

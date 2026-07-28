import type { EditorState } from '@tiptap/pm/state'
import { linkIrSourceKey } from '@/editor/extensions/linkIrSource'

export interface LinkLabelEditContext {
  /** Inclusive markdown span to replace (starts at `[`). */
  replaceFrom: number
  replaceTo: number
  /** Label content range (exclusive of `[` / `]`). */
  labelFrom: number
  labelTo: number
  labelText: string
  /** Href draft range (exclusive of `(` / `)`); null when `](` not started. */
  hrefFrom: number | null
  hrefTo: number | null
  /** Raw text inside `()` used as the search query. */
  hrefText: string
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
  hrefText: string
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
      hrefText: '',
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
      hrefText: '',
      href: null,
      title: null,
      complete: false,
      replaceTo: sourceFrom + closeBracket + 1,
    }
  }

  const afterParen = sourceText.slice(closeBracket + 2)
  const closeParen = afterParen.indexOf(')')
  if (closeParen < 0) {
    const hrefText = afterParen
    return {
      labelFrom,
      labelTo,
      hrefFrom: sourceFrom + closeBracket + 2,
      hrefTo: sourceFrom + sourceText.length,
      labelText,
      hrefText,
      href: hrefText.trim() || null,
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
    hrefText: hrefChunk,
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

export function isCaretInLinkHref(
  caret: number,
  hrefFrom: number | null,
  hrefTo: number | null,
): boolean {
  return hrefFrom != null && hrefTo != null && caret >= hrefFrom && caret <= hrefTo
}

function toEditContext(
  replaceFrom: number,
  parts: NonNullable<ReturnType<typeof splitMarkdownLinkSourceRanges>>,
): LinkLabelEditContext {
  return {
    replaceFrom,
    replaceTo: parts.replaceTo,
    labelFrom: parts.labelFrom,
    labelTo: parts.labelTo,
    labelText: parts.labelText,
    hrefFrom: parts.hrefFrom,
    hrefTo: parts.hrefTo,
    hrefText: parts.hrefText,
    href: parts.href,
    title: parts.title,
    complete: parts.complete,
  }
}

/**
 * Resolve markdown-link **href** edit context under caret (resource/page search lives in `()`).
 * Label-only incomplete `[query` and collapsed link marks do not arm search.
 */
export function findLinkLabelEditContext(
  state: EditorState,
  caret = state.selection.head,
): LinkLabelEditContext | null {
  const active = linkIrSourceKey.getState(state)
  if (active && active.to > active.from) {
    const text = state.doc.textBetween(active.from, active.to, '')
    const parts = splitMarkdownLinkSourceRanges(text, active.from)
    if (parts && isCaretInLinkHref(caret, parts.hrefFrom, parts.hrefTo)) {
      return toEditContext(active.from, parts)
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
  if (openIdx >= 0) {
    const fromOpen = blockText.slice(openIdx)
    const parts = splitMarkdownLinkSourceRanges(fromOpen, blockStart + openIdx)
    if (parts && isCaretInLinkHref(caret, parts.hrefFrom, parts.hrefTo)) {
      return toEditContext(blockStart + openIdx, parts)
    }
  }

  // Collapsed link marks: search only after IR expands to `[…](…)`.
  return null
}

import type { Editor } from '@tiptap/core'
import {
  linkIrSourceKey,
  parseMarkdownLinkSource,
  type LinkIrSourceState,
} from '@/editor/extensions/linkIrSource'
import { isInternalLocatorHref } from '@/editor/linkLabelSuggestQuery'
import { parseExternalUrl } from '@/utils/externalUrlResource'
import type { UrlDisplayMode } from '@/utils/urlDisplay'
import { URL_EMBED_DEFAULT_HEIGHT } from '@/utils/urlDisplay'

function readUrlEmbedHeight(editor: Editor, blockId: string): number {
  let height = URL_EMBED_DEFAULT_HEIGHT
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'urlEmbedBlock' && node.attrs.blockId === blockId) {
      height = Number(node.attrs.height) || URL_EMBED_DEFAULT_HEIGHT
      return false
    }
    return true
  })
  return height
}

export type UrlHoverTargetKind = 'inline' | 'iframe' | 'pdf'

export interface UrlHoverTarget {
  kind: UrlHoverTargetKind
  url: string
  displayMode: UrlDisplayMode
  from: number
  to: number
  blockId?: string
  iframeHeight?: number
  label?: string
  anchorRect: DOMRect
}

/** Accept http(s) URLs and in-app locators (`resource:` / `page:`) for hover toolbar. */
export function normalizeUrlHoverHref(href: string): string | null {
  const trimmed = href.trim()
  if (!trimmed) return null
  const external = parseExternalUrl(trimmed)
  if (external) return external.href
  if (isInternalLocatorHref(trimmed)) return trimmed
  return null
}

function getLinkRangeAtPos(editor: Editor, pos: number): { from: number; to: number; url: string; displayMode: UrlDisplayMode; label: string } | null {
  const { doc } = editor.state
  const $pos = doc.resolve(pos)
  const mark = $pos.marks().find((item) => item.type.name === 'link' && item.attrs.href)
  if (!mark) return null

  const href = String(mark.attrs.href || '')
  if (!href) return null

  let from = pos
  let to = pos
  while (from > $pos.start() && doc.rangeHasMark(from - 1, from, mark.type)) {
    from -= 1
  }
  while (to < $pos.end() && doc.rangeHasMark(to, to + 1, mark.type)) {
    to += 1
  }

  const label = doc.textBetween(from, to, '')
  const displayMode = mark.attrs.displayMode === 'title' ? 'title' : 'link'
  return { from, to, url: href, displayMode, label }
}

function rectFromRange(editor: Editor, from: number, to: number): DOMRect | null {
  try {
    const start = editor.view.coordsAtPos(from)
    const end = editor.view.coordsAtPos(Math.max(from, to))
    const left = Math.min(start.left, end.left)
    const right = Math.max(start.right, end.right)
    const top = Math.min(start.top, end.top)
    const bottom = Math.max(start.bottom, end.bottom)
    return new DOMRect(left, top, Math.max(1, right - left), Math.max(1, bottom - top))
  } catch {
    try {
      const start = editor.view.coordsAtPos(from)
      return new DOMRect(start.left, start.top, 1, Math.max(1, start.bottom - start.top))
    } catch {
      return null
    }
  }
}

function findPdfBlockById(editor: Editor, blockId: string): { pos: number; node: import('@tiptap/pm/model').Node } | null {
  let found: { pos: number; node: import('@tiptap/pm/model').Node } | null = null
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'pdfExcerptBlock' && node.attrs.blockId === blockId) {
      found = { pos, node }
      return false
    }
    return true
  })
  return found
}

/** Build presentation target from a pdfExcerptBlock (for hover or NodeView toolbar). */
export function buildUrlHoverTargetFromPdfBlock(
  editor: Editor,
  blockId: string,
  anchorRect?: DOMRect | null,
): UrlHoverTarget | null {
  const found = findPdfBlockById(editor, blockId)
  if (!found) return null
  const { pos, node } = found
  const sourceHref = String(node.attrs.sourceHref || '').trim()
  const fileName = String(node.attrs.fileName || '')
  const sourceLabel = String(node.attrs.sourceLabel || '').trim()
  const url = sourceHref || `file:${String(node.attrs.fileId || '')}`
  let rect = anchorRect ?? null
  if (!rect) {
    const dom = editor.view.nodeDOM(pos)
    if (dom instanceof HTMLElement) {
      const root = (dom.querySelector('.pdf-excerpt-block-nv') as HTMLElement | null) ?? dom
      rect = root.getBoundingClientRect()
    }
  }
  if (!rect) return null
  return {
    kind: 'pdf',
    url,
    displayMode: 'pdf',
    from: pos,
    to: pos + node.nodeSize,
    blockId,
    label: sourceLabel || fileName || url,
    anchorRect: rect,
  }
}

/** Hover target for active markdown IR source — whole `[label](url)` span, not the bare URL. */
export function buildUrlHoverTargetFromLinkIr(
  editor: Editor,
  active?: LinkIrSourceState | null,
): UrlHoverTarget | null {
  const ir = active ?? linkIrSourceKey.getState(editor.state)
  if (!ir || ir.to <= ir.from) return null
  const text = editor.state.doc.textBetween(ir.from, ir.to, '')
  const parsed = parseMarkdownLinkSource(text)
  if (!parsed) return null
  const href = normalizeUrlHoverHref(parsed.href)
  if (!href) return null
  const rect = rectFromRange(editor, ir.from, ir.to)
  if (!rect) return null
  return {
    kind: 'inline',
    url: href,
    displayMode: ir.displayMode === 'title' ? 'title' : 'link',
    from: ir.from,
    to: ir.to,
    label: parsed.label,
    anchorRect: rect,
  }
}

export function buildUrlHoverTargetFromLinkMarkAtPos(
  editor: Editor,
  pos: number,
): UrlHoverTarget | null {
  const linkRange = getLinkRangeAtPos(editor, pos)
  if (!linkRange) return null
  const href = normalizeUrlHoverHref(linkRange.url)
  if (!href) return null
  const rect = rectFromRange(editor, linkRange.from, linkRange.to)
  if (!rect) return null
  return {
    kind: 'inline',
    url: href,
    displayMode: linkRange.displayMode,
    from: linkRange.from,
    to: linkRange.to,
    label: linkRange.label,
    anchorRect: rect,
  }
}

function resolveLinkIrHoverAtPos(editor: Editor, pos: number): UrlHoverTarget | null {
  const active = linkIrSourceKey.getState(editor.state)
  if (!active || active.to <= active.from) return null
  if (pos < active.from || pos > active.to) return null
  return buildUrlHoverTargetFromLinkIr(editor, active)
}

/**
 * Resolve hover toolbar target:
 * - iframe / pdf embed blocks
 * - active markdown IR source (`[label](url)`), whole span
 * - HTML / `link` mark anchors (`a[href]`)
 */
export function resolveUrlHoverTarget(editor: Editor, event: MouseEvent): UrlHoverTarget | null {
  const target = event.target
  if (!(target instanceof HTMLElement)) return null

  const iframeBlock = target.closest('.url-embed-block-nv, [data-type="url-embed-block"]') as HTMLElement | null
  if (iframeBlock) {
    const blockId = iframeBlock.getAttribute('data-block-id')
      || iframeBlock.closest('[data-block-id]')?.getAttribute('data-block-id')
      || ''
    const url = iframeBlock.querySelector('iframe')?.getAttribute('src')
      || iframeBlock.querySelector('.url-embed-block__fallback-url')?.textContent?.trim()
      || ''
    if (!url) return null
    const rect = iframeBlock.getBoundingClientRect()
    return {
      kind: 'iframe',
      url,
      displayMode: 'iframe',
      from: 0,
      to: 0,
      blockId: blockId || undefined,
      iframeHeight: blockId ? readUrlEmbedHeight(editor, blockId) : URL_EMBED_DEFAULT_HEIGHT,
      anchorRect: rect,
    }
  }

  const pdfBlock = target.closest('.pdf-excerpt-block-nv, [data-type="pdf-excerpt-block"]') as HTMLElement | null
  if (pdfBlock) {
    const blockId = pdfBlock.getAttribute('data-block-id')
      || pdfBlock.closest('[data-block-id]')?.getAttribute('data-block-id')
      || ''
    if (!blockId) return null
    return buildUrlHoverTargetFromPdfBlock(editor, blockId, pdfBlock.getBoundingClientRect())
  }

  const coords = editor.view.posAtCoords({ left: event.clientX, top: event.clientY })
  if (coords) {
    const irTarget = resolveLinkIrHoverAtPos(editor, coords.pos)
    if (irTarget) return irTarget
  }

  // Decorations may wrap IR text without a dedicated DOM hook; also try class hit.
  if (target.closest('.tu-link-ir-source')) {
    const active = linkIrSourceKey.getState(editor.state)
    if (active) {
      const irTarget = buildUrlHoverTargetFromLinkIr(editor, active)
      if (irTarget) return irTarget
    }
  }

  const anchor = target.closest('a[href]') as HTMLAnchorElement | null
  if (!anchor) return null

  const pos = editor.view.posAtDOM(anchor, 0)
  const linkRange = getLinkRangeAtPos(editor, pos)
  if (!linkRange) return null
  const rect = rectFromRange(editor, linkRange.from, linkRange.to) || anchor.getBoundingClientRect()
  return {
    kind: 'inline',
    url: linkRange.url,
    displayMode: linkRange.displayMode,
    from: linkRange.from,
    to: linkRange.to,
    label: linkRange.label,
    anchorRect: rect,
  }
}

/** @deprecated 使用 {@link resolveUrlHoverTargetAnchorRect} 以在滚动时获得实时坐标 */
export function urlHoverTargetAnchorRect(target: UrlHoverTarget | null): DOMRect | null {
  return target?.anchorRect ?? null
}

/** 按当前视口重新测量锚点，供派生 UI 随滚动/布局变化跟贴触发源 */
export function resolveUrlHoverTargetAnchorRect(
  editor: Editor | null | undefined,
  target: UrlHoverTarget | null,
): DOMRect | null {
  if (!target) return null

  if (target.kind === 'inline' && editor) {
    const live = rectFromRange(editor, target.from, target.to)
    if (live) return live
  }

  if (target.kind === 'iframe' && target.blockId) {
    const editorDom = editor?.view.dom
    const blockEl = editorDom?.querySelector<HTMLElement>(
      `[data-block-id="${CSS.escape(target.blockId)}"]`,
    )
    const root = (blockEl?.querySelector('.url-embed-block-nv') as HTMLElement | null) ?? blockEl
    if (root) return root.getBoundingClientRect()
  }

  if (target.kind === 'pdf' && target.blockId) {
    const editorDom = editor?.view.dom
    const blockEl = editorDom?.querySelector<HTMLElement>(
      `[data-block-id="${CSS.escape(target.blockId)}"]`,
    )
    const root = (blockEl?.querySelector('.pdf-excerpt-block-nv') as HTMLElement | null) ?? blockEl
    if (root) return root.getBoundingClientRect()
  }

  return target.anchorRect
}

export function urlHoverTargetsEqual(a: UrlHoverTarget | null, b: UrlHoverTarget | null): boolean {
  if (!a && !b) return true
  if (!a || !b) return false
  return a.kind === b.kind
    && a.url === b.url
    && a.displayMode === b.displayMode
    && a.from === b.from
    && a.to === b.to
    && a.blockId === b.blockId
    && a.iframeHeight === b.iframeHeight
}

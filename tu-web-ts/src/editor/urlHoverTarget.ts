import type { Editor } from '@tiptap/core'
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

export type UrlHoverTargetKind = 'inline' | 'iframe'

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

const PLAIN_URL_RE = /https?:\/\/[^\s<>"'`]+/gi

function normalizeUrl(url: string): string {
  return url.replace(/[),.!?;:\]]+$/g, '')
}

function findPlainUrlRange(text: string, offsetInText: number): { from: number; to: number; url: string } | null {
  let match: RegExpExecArray | null
  PLAIN_URL_RE.lastIndex = 0
  while ((match = PLAIN_URL_RE.exec(text)) !== null) {
    const raw = match[0]
    const url = normalizeUrl(raw)
    const start = match.index
    const end = start + raw.length
    if (offsetInText >= start && offsetInText <= end) {
      const parsed = parseExternalUrl(url)
      if (!parsed) return null
      return { from: start, to: end, url: parsed.href }
    }
  }
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
    const end = editor.view.coordsAtPos(to)
    const left = Math.min(start.left, end.left)
    const right = Math.max(start.right, end.right)
    const top = Math.min(start.top, end.top)
    const bottom = Math.max(start.bottom, end.bottom)
    return new DOMRect(left, top, right - left, bottom - top)
  } catch {
    return null
  }
}

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

  const anchor = target.closest('a[href]') as HTMLAnchorElement | null
  if (anchor) {
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

  const coords = editor.view.posAtCoords({ left: event.clientX, top: event.clientY })
  if (!coords) return null

  const $pos = editor.state.doc.resolve(coords.pos)
  const parent = $pos.parent
  if (!parent.isTextblock) return null

  const parentStart = $pos.start()
  const offsetInParent = coords.pos - parentStart
  const parentText = parent.textBetween(0, parent.content.size, '\n', '\n')
  const plainRange = findPlainUrlRange(parentText, offsetInParent)
  if (!plainRange) return null

  const from = parentStart + plainRange.from
  const to = parentStart + plainRange.to
  const rect = rectFromRange(editor, from, to)
  if (!rect) return null

  return {
    kind: 'inline',
    url: plainRange.url,
    displayMode: 'link',
    from,
    to,
    label: parentText.slice(plainRange.from, plainRange.to),
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

export const EDITOR_GUTTER_BTN_SIZE = 28

export interface ContentScrollGutterAnchor {
  rect: DOMRect
  paddingLeft: number
  foldLeft: number
  hoverLeft: number
}

export function getContentScrollGutterAnchor(el: HTMLElement | null | undefined): ContentScrollGutterAnchor | null {
  if (!el) return null
  const scrollEl = el.closest('.content-scroll') as HTMLElement | null
  if (!scrollEl) return null

  const rect = scrollEl.getBoundingClientRect()
  const paddingLeft = Number.parseFloat(getComputedStyle(scrollEl).paddingLeft) || 0
  const half = EDITOR_GUTTER_BTN_SIZE / 2

  const outerLeft = rect.left + half
  const innerLeft = rect.left + Math.max(half, paddingLeft - half)

  return {
    rect,
    paddingLeft,
    foldLeft: innerLeft,
    hoverLeft: outerLeft,
  }
}

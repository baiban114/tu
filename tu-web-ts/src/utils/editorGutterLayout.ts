export const EDITOR_GUTTER_BTN_SIZE = 28

export interface ContentScrollGutterAnchor {
  rect: DOMRect
  paddingLeft: number
  foldLeft: number
  hoverLeft: number
}

/** 悬停手柄触发条：从装订线左侧延伸到折叠钮左缘（无缝隙，不再依赖消失延迟） */
export interface HandleTriggerBounds {
  left: number
  right: number
  width: number
  /** 蓝色圆点中心 X（仍用 hoverLeft） */
  dotCenterX: number
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

export function getHandleTriggerBounds(gutter: ContentScrollGutterAnchor): HandleTriggerBounds {
  const half = EDITOR_GUTTER_BTN_SIZE / 2
  // 右缘贴齐折叠钮左缘
  const right = gutter.foldLeft - half
  const hoverLeftEdge = gutter.hoverLeft - half
  const left = Math.min(gutter.rect.left, hoverLeftEdge)
  const width = Math.max(EDITOR_GUTTER_BTN_SIZE, right - left)
  return {
    left,
    right: left + width,
    width,
    dotCenterX: gutter.hoverLeft,
  }
}

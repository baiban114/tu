export const EDITOR_GUTTER_BTN_SIZE = 28

export interface ContentScrollGutterAnchor {
  rect: DOMRect
  paddingLeft: number
  foldLeft: number
  hoverLeft: number
}

/** 悬停手柄触发条：覆盖手柄圆点，并向右延伸到正文左缘（无缝隙） */
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

export function getHandleTriggerBounds(
  gutter: ContentScrollGutterAnchor,
  options?: { contentLeft?: number },
): HandleTriggerBounds {
  const half = EDITOR_GUTTER_BTN_SIZE / 2
  // 左缘：覆盖手柄圆点整宽，再略向外扩半钮，避免移入圆点时出界
  const hoverLeftEdge = gutter.hoverLeft - half
  const left = Math.min(gutter.rect.left, hoverLeftEdge) - half
  // 右缘：折叠钮左缘，且至少贴到正文左缘，消除「正文 → 手柄」死区
  const foldRight = gutter.foldLeft + half
  const contentLeft = options?.contentLeft
  const right = contentLeft != null
    ? Math.max(foldRight, contentLeft)
    : foldRight
  const width = Math.max(EDITOR_GUTTER_BTN_SIZE, right - left)
  return {
    left,
    right: left + width,
    width,
    dotCenterX: gutter.hoverLeft,
  }
}

/** 指针是否落在手柄触发条（水平）内；可选带入当前手柄竖直范围 */
export function isPointInHandleTriggerZone(
  clientX: number,
  clientY: number,
  trigger: HandleTriggerBounds,
  vertical?: { top: number; height: number } | null,
): boolean {
  if (clientX < trigger.left || clientX >= trigger.right) return false
  if (!vertical) return true
  return clientY >= vertical.top && clientY <= vertical.top + vertical.height
}

import { onBeforeUnmount, reactive, ref, unref, watch, type MaybeRef, type Ref } from 'vue'

export type FloatingPlacement = 'top' | 'right' | 'below'

export interface FloatingAnchorRect {
  top: number
  left: number
  right: number
  bottom: number
  width: number
  height: number
}

export interface FloatingPosition {
  top: number
  left: number
  zIndex: number
}

export interface AnchoredFloatingOptions {
  visible: Ref<boolean>
  getAnchorRect: () => FloatingAnchorRect | DOMRect | null | undefined
  placement?: FloatingPlacement
  offset?: number
  zIndex?: number
  /** 预估浮层宽度，用于视口内定位 */
  floatingWidth?: MaybeRef<number>
  /** 预估浮层高度，用于视口内定位 */
  floatingHeight?: MaybeRef<number>
  viewportPadding?: number
  /** 除 window 外额外监听 scroll 的容器（如 `.content-scroll`） */
  getScrollRoots?: () => readonly (HTMLElement | Window)[]
}

const DEFAULT_VIEWPORT_PADDING = 12

function clampFloatingPosition(
  top: number,
  left: number,
  width: number,
  height: number,
  padding: number,
): { top: number; left: number } {
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const maxLeft = Math.max(padding, viewportWidth - width - padding)
  const maxTop = Math.max(padding, viewportHeight - height - padding)
  return {
    left: Math.min(Math.max(padding, left), maxLeft),
    top: Math.min(Math.max(padding, top), maxTop),
  }
}

function clampHorizontalToAnchorAndViewport(
  left: number,
  width: number,
  anchor: FloatingAnchorRect | DOMRect | null | undefined,
  padding: number,
): number {
  const viewportWidth = window.innerWidth
  let minLeft = padding
  let maxLeft = viewportWidth - width - padding
  if (anchor && anchor.width > 0) {
    minLeft = Math.max(minLeft, anchor.left)
    maxLeft = Math.min(maxLeft, anchor.right - width)
  }
  if (minLeft > maxLeft) {
    if (anchor && anchor.width > 0) {
      return Math.max(padding, Math.min(anchor.left, viewportWidth - width - padding))
    }
    return Math.max(padding, Math.min(left, maxLeft))
  }
  return Math.min(Math.max(minLeft, left), maxLeft)
}

export function useAnchoredFloating(options: AnchoredFloatingOptions) {
  const position = reactive<FloatingPosition>({
    top: 0,
    left: 0,
    zIndex: options.zIndex ?? 20,
  })
  const anchorVersion = ref(0)
  let rafId = 0
  let boundScrollRoots: (HTMLElement | Window)[] = []

  const compute = () => {
    if (!options.visible.value) return
    const rect = options.getAnchorRect()
    if (!rect) {
      options.visible.value = false
      return
    }
    const offset = options.offset ?? 10
    const padding = options.viewportPadding ?? DEFAULT_VIEWPORT_PADDING
    const floatWidth = unref(options.floatingWidth) ?? 0
    const floatHeight = unref(options.floatingHeight) ?? 0

    const placement = options.placement ?? 'top'

    if (placement === 'right') {
      let top = rect.top - offset
      let left = rect.right + offset
      if (floatWidth > 0 && left + floatWidth > window.innerWidth - padding) {
        left = rect.left - floatWidth - offset
      }
      if (floatWidth > 0 && floatHeight > 0) {
        const clamped = clampFloatingPosition(top, left, floatWidth, floatHeight, padding)
        top = clamped.top
        left = clamped.left
      }
      position.top = top
      position.left = left
    } else if (placement === 'below') {
      const effectiveWidth = floatWidth > 0 && rect.width > 0
        ? Math.min(floatWidth, rect.width)
        : floatWidth
      let top = rect.bottom + offset
      let left = rect.left
      if (effectiveWidth > 0) {
        left = clampHorizontalToAnchorAndViewport(left, effectiveWidth, rect, padding)
      }
      if (effectiveWidth > 0 && floatHeight > 0) {
        const clamped = clampFloatingPosition(top, left, effectiveWidth, floatHeight, padding)
        top = clamped.top
        left = clampHorizontalToAnchorAndViewport(clamped.left, effectiveWidth, rect, padding)
      }
      position.top = top
      position.left = left
    } else {
      let top = rect.top - offset
      let left = rect.left + rect.width / 2
      if (floatWidth > 0 && floatHeight > 0) {
        left -= floatWidth / 2
        top -= floatHeight
        const clamped = clampFloatingPosition(top, left, floatWidth, floatHeight, padding)
        top = clamped.top
        left = clamped.left
      }
      position.top = top
      position.left = left
    }
    anchorVersion.value += 1
  }

  const scheduleUpdate = () => {
    if (rafId) cancelAnimationFrame(rafId)
    rafId = requestAnimationFrame(() => {
      rafId = 0
      compute()
    })
  }

  const bindScrollRoots = () => {
    for (const root of boundScrollRoots) {
      root.removeEventListener('scroll', scheduleUpdate, true)
    }
    const roots = new Set<HTMLElement | Window>([window])
    for (const root of options.getScrollRoots?.() ?? []) {
      roots.add(root)
    }
    boundScrollRoots = [...roots]
    for (const root of boundScrollRoots) {
      root.addEventListener('scroll', scheduleUpdate, true)
    }
  }

  const bind = () => {
    bindScrollRoots()
    window.addEventListener('resize', scheduleUpdate)
  }

  const unbind = () => {
    for (const root of boundScrollRoots) {
      root.removeEventListener('scroll', scheduleUpdate, true)
    }
    boundScrollRoots = []
    window.removeEventListener('resize', scheduleUpdate)
    if (rafId) {
      cancelAnimationFrame(rafId)
      rafId = 0
    }
  }

  watch(
    options.visible,
    (visible) => {
      if (visible) {
        bind()
        scheduleUpdate()
      } else {
        unbind()
      }
    },
    { flush: 'post' },
  )

  onBeforeUnmount(unbind)

  return {
    position,
    updatePosition: scheduleUpdate,
    anchorVersion,
  }
}

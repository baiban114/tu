import { computed, nextTick, onBeforeUnmount, reactive, ref, watch, type ComputedRef, type Ref } from 'vue'

export const DEFAULT_VIEWPORT_PANEL_PADDING = 12

export interface ViewportPoint {
  x: number
  y: number
}

/** Clamp a fixed-position panel so it stays fully inside the viewport. */
export function clampFixedPanelToViewport(
  left: number,
  top: number,
  panelWidth: number,
  panelHeight: number,
  padding = DEFAULT_VIEWPORT_PANEL_PADDING,
  viewportWidth = window.innerWidth,
  viewportHeight = window.innerHeight,
): { left: number; top: number } {
  const maxLeft = Math.max(padding, viewportWidth - panelWidth - padding)
  const maxTop = Math.max(padding, viewportHeight - panelHeight - padding)
  return {
    left: Math.min(Math.max(padding, left), maxLeft),
    top: Math.min(Math.max(padding, top), maxTop),
  }
}

/** Estimate position before the panel is rendered (uses guessed dimensions). */
export function estimateFixedPanelPosition(
  clientX: number,
  clientY: number,
  estimatedWidth: number,
  estimatedHeight: number,
  padding = DEFAULT_VIEWPORT_PANEL_PADDING,
  viewportWidth = window.innerWidth,
  viewportHeight = window.innerHeight,
): { left: number; top: number } {
  return clampFixedPanelToViewport(clientX, clientY, estimatedWidth, estimatedHeight, padding, viewportWidth, viewportHeight)
}

export interface UseViewportClampedFixedPanelOptions {
  visible: Ref<boolean> | ComputedRef<boolean>
  getSourcePoint: () => ViewportPoint | null
  padding?: number
}

/**
 * Keeps a `position: fixed` panel fully inside the viewport.
 * Measures the panel after mount and reclamps on resize.
 */
export function useViewportClampedFixedPanel(options: UseViewportClampedFixedPanelOptions) {
  const panelRef = ref<HTMLElement | null>(null)
  const position = reactive({ left: 0, top: 0 })
  const padding = options.padding ?? DEFAULT_VIEWPORT_PANEL_PADDING

  const syncPosition = () => {
    const point = options.getSourcePoint()
    if (!point) return
    const el = panelRef.value
    if (!el) {
      position.left = point.x
      position.top = point.y
      return
    }
    const rect = el.getBoundingClientRect()
    const clamped = clampFixedPanelToViewport(point.x, point.y, rect.width, rect.height, padding)
    position.left = clamped.left
    position.top = clamped.top
  }

  const handleResize = () => {
    if (options.visible.value) syncPosition()
  }

  watch(
    () => options.visible.value,
    (visible) => {
      if (visible) {
        const point = options.getSourcePoint()
        if (point) {
          position.left = point.x
          position.top = point.y
        }
        nextTick(syncPosition)
        window.addEventListener('resize', handleResize)
      } else {
        window.removeEventListener('resize', handleResize)
      }
    },
  )

  watch(
    () => {
      const point = options.getSourcePoint()
      return point ? `${point.x},${point.y}` : null
    },
    () => {
      if (!options.visible.value) return
      nextTick(syncPosition)
    },
  )

  onBeforeUnmount(() => {
    window.removeEventListener('resize', handleResize)
  })

  return { panelRef, position, syncPosition }
}

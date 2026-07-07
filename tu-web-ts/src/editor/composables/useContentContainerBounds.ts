import { nextTick, onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

/** Horizontal inset when clamping block width to the editor content column. */
export const CONTENT_CONTAINER_EDGE_INSET = 12

/**
 * Track the maximum width a nodeView block may occupy inside `.content-container`.
 * Updates when the page TOC opens/closes or the content column is resized.
 */
export function useContentContainerBounds(wrapperRef: Ref<HTMLElement | null>) {
  const maxWidth = ref<number | null>(null)

  let resizeObserver: ResizeObserver | null = null

  const measure = () => {
    const el = wrapperRef.value
    if (!el) {
      maxWidth.value = null
      return
    }
    const container = el.closest('.content-container') as HTMLElement | null
    if (!container) {
      maxWidth.value = null
      return
    }
    const containerRect = container.getBoundingClientRect()
    const elRect = el.getBoundingClientRect()
    maxWidth.value = Math.max(
      0,
      Math.round(containerRect.right - elRect.left - CONTENT_CONTAINER_EDGE_INSET),
    )
  }

  const clampWidth = (width: number, minWidth = 0) => {
    const bounded = maxWidth.value == null ? width : Math.min(width, maxWidth.value)
    return Math.max(minWidth, bounded)
  }

  onMounted(() => {
    void nextTick(measure)

    const el = wrapperRef.value
    if (!el || typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return
    }

    const observed = new Set<Element>()
    const container = el.closest('.content-container')
    const shell = el.closest('.content-shell')
    const toc = el.closest('.content-shell')?.querySelector('.page-toc')
    if (container) observed.add(container)
    if (shell) observed.add(shell)
    if (toc) observed.add(toc)

    resizeObserver = new ResizeObserver(measure)
    observed.forEach((target) => resizeObserver!.observe(target))
    window.addEventListener('resize', measure)
  })

  onBeforeUnmount(() => {
    resizeObserver?.disconnect()
    resizeObserver = null
    window.removeEventListener('resize', measure)
  })

  return { maxWidth, measure, clampWidth }
}

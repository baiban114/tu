import type { PdfDocumentProxy } from './pdfjsSetup'

const DEFAULT_PLACEHOLDER_HEIGHT = 120
const MAX_CONCURRENT_RENDERS = 3
const PREFETCH_DISTANCE = 2
const EVICTION_DISTANCE = 5
const DEFAULT_ZOOM_SCALE = 1
/** Coalesce same-tick / double ResizeObserver notifications (TOC open is instant). */
const RESIZE_DEBOUNCE_MS = 48
const RESIZE_WIDTH_EPSILON_PX = 2

function isPdfRenderingCancelled(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const name = String((error as { name?: unknown }).name || '')
  const message = String((error as { message?: unknown }).message || '')
  return name === 'RenderingCancelledException'
    || /rendering cancelled/i.test(message)
}

export interface PdfPageRenderCallbacks {
  getDoc: () => PdfDocumentProxy | null
  getHost: (pageNumber: number) => HTMLElement | undefined
  getScrollRoot: () => HTMLElement | null
  onRenderError: (message: string) => void
  onPlaceholderHeight?: (pageNumber: number, height: number) => void
  onPageRendered?: (pageNumber: number) => void
  onPageEvicted?: (pageNumber: number) => void
}

export class PdfPageRenderManager {
  private readonly renderedPages = new Set<number>()
  private readonly renderTasks = new Map<number, { cancel?: () => void }>()
  private readonly placeholderHeights = new Map<number, number>()
  private readonly pageProxies = new Map<number, { cleanup?: () => void }>()
  private activeRenders = 0
  private readonly renderQueue: number[] = []
  private readonly renderFailures = new Map<number, number>()
  private readonly retryTimers = new Map<number, ReturnType<typeof setTimeout>>()
  private visiblePages = new Set<number>()
  private rangeStart = 1
  private rangeEnd = 1
  private zoomScale = DEFAULT_ZOOM_SCALE
  private lastLayoutWidth = 0
  private estimatedAspectRatio = 0
  private readonly lastHostWidths = new Map<number, number>()
  private suppressResize = false
  private disposed = false
  private resizeDebounceTimer: ReturnType<typeof setTimeout> | null = null
  private pendingResizePage: number | null = null

  constructor(private readonly callbacks: PdfPageRenderCallbacks) {}

  dispose() {
    this.disposed = true
    if (this.resizeDebounceTimer) {
      clearTimeout(this.resizeDebounceTimer)
      this.resizeDebounceTimer = null
    }
    this.pendingResizePage = null
    for (const timer of this.retryTimers.values()) clearTimeout(timer)
    this.retryTimers.clear()
    this.cancelAllTasks()
    this.evictAllPages()
    this.renderQueue.length = 0
    this.visiblePages.clear()
  }

  setRange(startPage: number, endPage: number) {
    this.rangeStart = startPage
    this.rangeEnd = endPage
  }

  setZoomScale(scale: number) {
    const next = Number.isFinite(scale) && scale > 0 ? scale : DEFAULT_ZOOM_SCALE
    if (Math.abs(next - this.zoomScale) < 0.001) return
    this.zoomScale = next
    this.suppressResize = true
    for (const pageNumber of [...this.renderedPages]) {
      const task = this.renderTasks.get(pageNumber)
      task?.cancel?.()
      this.renderTasks.delete(pageNumber)
      this.renderedPages.delete(pageNumber)
      this.enqueueRender(pageNumber)
    }
    this.syncVisiblePages()
    void this.releaseSuppressResizeWhenIdle()
  }

  getZoomScale(): number {
    return this.zoomScale
  }

  getPlaceholderHeight(pageNumber: number): number {
    const explicitHeight = this.placeholderHeights.get(pageNumber)
    if (explicitHeight != null) return explicitHeight
    if (this.estimatedAspectRatio <= 0) return DEFAULT_PLACEHOLDER_HEIGHT
    const width = this.lastLayoutWidth || this.resolveRenderWidth(pageNumber)
    return width > 0
      ? Math.max(1, Math.round(width * this.estimatedAspectRatio))
      : DEFAULT_PLACEHOLDER_HEIGHT
  }

  /**
   * Seed page boxes before intersection rendering starts.
   * Keeping aspect-ratio-sized placeholders prevents the scrollbar thumb from
   * jumping whenever a new page replaces its 120px loading shell.
   */
  async primePlaceholderSizes(
    pageNumbers: number[],
  ): Promise<void> {
    const doc = this.callbacks.getDoc()
    if (!doc || this.disposed) return
    const uniquePages = [...new Set(pageNumbers)].filter((page) => (
      page >= this.rangeStart && page <= this.rangeEnd
    ))
    if (uniquePages.length === 0) return

    const measuredRatios = new Map<number, number>()
    const measurementPages = uniquePages.length <= 24
      ? uniquePages
      : [...new Set([uniquePages[0], uniquePages[uniquePages.length - 1]])]
    for (const pageNumber of measurementPages) {
      try {
        const page = await doc.getPage(pageNumber)
        if (this.disposed) return
        const viewport = page.getViewport({ scale: 1 })
        const ratio = viewport.height / viewport.width
        if (!Number.isFinite(ratio) || ratio <= 0) continue
        measuredRatios.set(pageNumber, ratio)
      } catch {
        // A malformed sample must not prevent the remaining placeholders from
        // settling before lazy rendering starts.
      }
    }

    const seededAspectRatio = Math.max(0, ...measuredRatios.values())
    if (seededAspectRatio <= 0) return
    this.estimatedAspectRatio = seededAspectRatio

    for (const pageNumber of uniquePages) {
      try {
        const ratio = measuredRatios.get(pageNumber) ?? seededAspectRatio
        const width = this.resolveRenderWidth(pageNumber)
        if (width <= 0) continue
        const height = Math.max(1, Math.round(width * ratio))
        this.placeholderHeights.set(pageNumber, height)
        this.callbacks.onPlaceholderHeight?.(pageNumber, height)
      } catch {
        // Host measurement can fail transiently during layout; rendering still
        // supplies an accurate height for this page later.
      }
    }
  }

  isRendered(pageNumber: number): boolean {
    return this.renderedPages.has(pageNumber)
  }

  handleIntersection(pageNumber: number, isIntersecting: boolean) {
    if (isIntersecting) {
      this.visiblePages.add(pageNumber)
    } else {
      this.visiblePages.delete(pageNumber)
    }
    this.syncVisiblePages()
    this.trimStaleActiveRenders()
  }

  handleResize(pageNumber: number) {
    if (this.suppressResize || this.disposed) return
    this.pendingResizePage = pageNumber
    if (this.resizeDebounceTimer) clearTimeout(this.resizeDebounceTimer)
    this.resizeDebounceTimer = setTimeout(() => {
      this.resizeDebounceTimer = null
      const page = this.pendingResizePage
      this.pendingResizePage = null
      if (page != null) this.flushResize(page)
    }, RESIZE_DEBOUNCE_MS)
  }

  /** Immediate resize flush (e.g. after sidebar drag settles). */
  flushPendingResize() {
    if (this.resizeDebounceTimer) {
      clearTimeout(this.resizeDebounceTimer)
      this.resizeDebounceTimer = null
    }
    const page = this.pendingResizePage
    this.pendingResizePage = null
    if (page != null) this.flushResize(page)
  }

  private flushResize(pageNumber: number) {
    if (this.suppressResize || this.disposed) return

    const width = this.resolveRenderWidth(pageNumber)
    if (width <= 0) return

    if (this.lastLayoutWidth > 0 && Math.abs(width - this.lastLayoutWidth) < RESIZE_WIDTH_EPSILON_PX) {
      return
    }

    const pagesToUpdate = this.lastLayoutWidth > 0
      ? [...new Set([...this.renderedPages, ...this.visiblePages, pageNumber])]
      : [pageNumber]

    this.lastLayoutWidth = width

    // Ignore ResizeObserver chatter from placeholder/height settle until paints finish.
    this.suppressResize = true

    // Keep current bitmaps on screen (CSS-scaled) so hosts never blank while re-rasterizing.
    this.scaleDisplayedCanvases(width)

    for (const page of pagesToUpdate) {
      if (page < this.rangeStart || page > this.rangeEnd) continue
      this.lastHostWidths.set(page, width)
      const task = this.renderTasks.get(page)
      if (task) {
        task.cancel?.()
        this.renderTasks.delete(page)
      }
      // Drop from rendered set so we can enqueue, but do NOT clear host children.
      this.renderedPages.delete(page)
      this.enqueueRender(page)
    }
    void this.releaseSuppressResizeWhenIdle()
  }

  /** Stretch existing canvases to the new layout width without clearing the host. */
  private scaleDisplayedCanvases(newWidth: number) {
    const cssWidth = Math.max(1, Math.floor(newWidth))
    for (const pageNumber of this.renderedPages) {
      const host = this.callbacks.getHost(pageNumber)
      const canvas = host?.querySelector('canvas')
      if (!(canvas instanceof HTMLCanvasElement) || canvas.width <= 0) continue
      const aspect = canvas.height / canvas.width
      const cssHeight = Math.max(1, Math.round(cssWidth * aspect))
      canvas.style.width = `${cssWidth}px`
      canvas.style.height = `${cssHeight}px`
      this.placeholderHeights.set(pageNumber, cssHeight)
      this.callbacks.onPlaceholderHeight?.(pageNumber, cssHeight)
    }
  }

  requestRender(pageNumber: number) {
    this.enqueueRender(pageNumber)
  }

  private syncVisiblePages() {
    const targets = new Set<number>()
    for (const pageNumber of this.visiblePages) {
      targets.add(pageNumber)
      for (let offset = 1; offset <= PREFETCH_DISTANCE; offset += 1) {
        targets.add(pageNumber - offset)
        targets.add(pageNumber + offset)
      }
    }

    for (const pageNumber of targets) {
      if (pageNumber < this.rangeStart || pageNumber > this.rangeEnd) continue
      this.enqueueRender(pageNumber)
    }
    this.trimStaleQueuedPages()

    const anchorPages = this.visiblePages.size > 0
      ? [...this.visiblePages]
      : targets.size > 0
        ? [...targets]
        : []

    if (anchorPages.length === 0) return

    for (const renderedPage of [...this.renderedPages]) {
      const nearest = Math.min(...anchorPages.map((page) => Math.abs(page - renderedPage)))
      if (nearest > EVICTION_DISTANCE) {
        this.evictPage(renderedPage)
      }
    }
  }

  private trimStaleQueuedPages() {
    if (this.visiblePages.size === 0) return
    const nearestVisibleDistance = Math.max(
      PREFETCH_DISTANCE + 1,
      EVICTION_DISTANCE - 1,
    )
    for (let index = this.renderQueue.length - 1; index >= 0; index -= 1) {
      const page = this.renderQueue[index]
      if (this.visiblePages.has(page)) continue
      const nearest = Math.min(
        ...Array.from(this.visiblePages, (visible) => Math.abs(visible - page)),
      )
      if (nearest > nearestVisibleDistance) this.renderQueue.splice(index, 1)
    }
  }

  /** Stop stale offscreen work so the current viewport can render next. */
  private trimStaleActiveRenders() {
    if (this.visiblePages.size === 0) return
    for (const [pageNumber, task] of this.renderTasks) {
      if (this.visiblePages.has(pageNumber)) continue
      const nearest = Math.min(
        ...Array.from(this.visiblePages, (visible) => Math.abs(visible - pageNumber)),
      )
      if (nearest <= PREFETCH_DISTANCE + 1) continue
      task.cancel?.()
      this.renderTasks.delete(pageNumber)
      if (!this.renderQueue.includes(pageNumber)) this.renderQueue.push(pageNumber)
      void this.pumpQueue()
    }
  }

  private enqueueRender(pageNumber: number) {
    if (this.disposed) return
    if (pageNumber < this.rangeStart || pageNumber > this.rangeEnd) return
    if (this.renderedPages.has(pageNumber)) return
    if (this.renderQueue.includes(pageNumber)) return
    const visible = this.visiblePages.has(pageNumber)
    if (visible) {
      const firstNonVisible = this.renderQueue.findIndex((page) => !this.visiblePages.has(page))
      this.renderQueue.splice(
        firstNonVisible < 0 ? this.renderQueue.length : firstNonVisible,
        0,
        pageNumber,
      )
    } else {
      this.renderQueue.push(pageNumber)
    }
    void this.pumpQueue()
  }

  private async pumpQueue() {
    while (!this.disposed && this.activeRenders < MAX_CONCURRENT_RENDERS && this.renderQueue.length > 0) {
      const pageNumber = this.renderQueue.shift()
      if (pageNumber == null) return
      if (this.renderedPages.has(pageNumber)) continue
      this.activeRenders += 1
      try {
        await this.renderPage(pageNumber)
      } finally {
        this.activeRenders -= 1
        void this.pumpQueue()
      }
    }
  }

  private resolveRenderWidth(pageNumber: number): number {
    const root = this.callbacks.getScrollRoot()
    if (root) {
      const style = getComputedStyle(root)
      const paddingX = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0)
      const contentWidth = root.clientWidth - paddingX
      if (contentWidth > 0) {
        const host = this.callbacks.getHost(pageNumber)
        const pageShell = host?.parentElement
        if (pageShell) {
          const pageStyle = getComputedStyle(pageShell)
          const pagePaddingX = (parseFloat(pageStyle.paddingLeft) || 0) + (parseFloat(pageStyle.paddingRight) || 0)
          return Math.floor(contentWidth - pagePaddingX)
        }
        return Math.floor(contentWidth)
      }
    }

    const host = this.callbacks.getHost(pageNumber)
    return host?.clientWidth || 0
  }

  private async renderPage(pageNumber: number) {
    const doc = this.callbacks.getDoc()
    if (!doc || this.disposed || this.renderedPages.has(pageNumber)) return

    const host = this.callbacks.getHost(pageNumber)
    if (!host) {
      this.scheduleRetry(pageNumber)
      return
    }

    const hostWidth = this.resolveRenderWidth(pageNumber)
    if (hostWidth <= 0) {
      this.scheduleRetry(pageNumber)
      return
    }

    try {
      const page = await doc.getPage(pageNumber)
      if (this.disposed) return

      const viewport = page.getViewport({ scale: 1 })
      this.estimatedAspectRatio ||= viewport.height / viewport.width
      const scale = (hostWidth / viewport.width) * this.zoomScale
      const scaledViewport = page.getViewport({ scale })

      const canvas = document.createElement('canvas')
      const canvasWidth = Math.floor(scaledViewport.width)
      const canvasHeight = Math.floor(scaledViewport.height)
      canvas.width = canvasWidth
      canvas.height = canvasHeight
      canvas.className = 'pdf-excerpt-block__canvas'
      canvas.style.display = 'block'
      canvas.style.width = `${canvasWidth}px`
      canvas.style.height = `${canvasHeight}px`

      const context = canvas.getContext('2d')
      if (!context) {
        this.scheduleRetry(pageNumber)
        return
      }

      const task = page.render({ canvasContext: context, viewport: scaledViewport, canvas })
      this.renderTasks.set(pageNumber, task)
      await task.promise
      this.renderTasks.delete(pageNumber)

      if (this.disposed) return

      const currentHost = this.callbacks.getHost(pageNumber)
      if (!currentHost) return

      currentHost.replaceChildren(canvas)
      this.renderedPages.add(pageNumber)
      this.renderFailures.delete(pageNumber)
      this.callbacks.onPageRendered?.(pageNumber)
      this.pageProxies.set(pageNumber, page)
      this.lastLayoutWidth = hostWidth
      this.lastHostWidths.set(pageNumber, hostWidth)
      const height = canvasHeight
      this.placeholderHeights.set(pageNumber, height)
      this.callbacks.onPlaceholderHeight?.(pageNumber, height)
    } catch (error) {
      this.renderTasks.delete(pageNumber)
      if (this.disposed) return
      // Expected when zoom/resize/page switch cancels an in-flight paint — do not surface as UI error.
      if (isPdfRenderingCancelled(error)) {
        if (!this.renderedPages.has(pageNumber) && !this.renderQueue.includes(pageNumber)) {
          this.enqueueRender(pageNumber)
        }
        return
      }
      this.callbacks.onRenderError(
        error instanceof Error ? error.message : 'PDF 页面渲染失败',
      )
      this.scheduleRetry(pageNumber)
    }
  }

  private scheduleRetry(pageNumber: number) {
    if (this.disposed) return
    if (this.retryTimers.has(pageNumber)) return
    const failures = (this.renderFailures.get(pageNumber) ?? 0) + 1
    this.renderFailures.set(pageNumber, failures)
    if (failures > 3) return
    const timer = setTimeout(() => {
      this.retryTimers.delete(pageNumber)
      if (!this.disposed) this.enqueueRender(pageNumber)
    }, 80 * failures)
    this.retryTimers.set(pageNumber, timer)
  }

  private evictPage(pageNumber: number) {
    const task = this.renderTasks.get(pageNumber)
    task?.cancel?.()
    this.renderTasks.delete(pageNumber)

    const page = this.pageProxies.get(pageNumber)
    page?.cleanup?.()
    this.pageProxies.delete(pageNumber)
    this.renderedPages.delete(pageNumber)
    this.renderFailures.delete(pageNumber)
    this.callbacks.onPageEvicted?.(pageNumber)
    const retryTimer = this.retryTimers.get(pageNumber)
    if (retryTimer) clearTimeout(retryTimer)
    this.retryTimers.delete(pageNumber)

    const host = this.callbacks.getHost(pageNumber)
    if (host) {
      host.replaceChildren()
    }
  }

  private evictAllPages() {
    for (const pageNumber of [...this.renderedPages]) {
      this.evictPage(pageNumber)
    }
  }

  private cancelAllTasks() {
    this.renderTasks.forEach((task) => task.cancel?.())
    this.renderTasks.clear()
    this.renderedPages.clear()
  }

  private async releaseSuppressResizeWhenIdle() {
    while (!this.disposed && (this.activeRenders > 0 || this.renderQueue.length > 0)) {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve())
      })
    }
    if (!this.disposed) {
      this.suppressResize = false
    }
  }
}

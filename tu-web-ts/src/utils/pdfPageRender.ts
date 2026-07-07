import type { PdfDocumentProxy } from './pdfjsSetup'

const DEFAULT_PLACEHOLDER_HEIGHT = 120
const MAX_CONCURRENT_RENDERS = 2
const PREFETCH_DISTANCE = 1
const EVICTION_DISTANCE = 5
const DEFAULT_ZOOM_SCALE = 1

export interface PdfPageRenderCallbacks {
  getDoc: () => PdfDocumentProxy | null
  getHost: (pageNumber: number) => HTMLElement | undefined
  getScrollRoot: () => HTMLElement | null
  onRenderError: (message: string) => void
  onPlaceholderHeight?: (pageNumber: number, height: number) => void
}

export class PdfPageRenderManager {
  private readonly renderedPages = new Set<number>()
  private readonly renderTasks = new Map<number, { cancel?: () => void }>()
  private readonly placeholderHeights = new Map<number, number>()
  private readonly pageProxies = new Map<number, { cleanup?: () => void }>()
  private activeRenders = 0
  private readonly renderQueue: number[] = []
  private visiblePages = new Set<number>()
  private rangeStart = 1
  private rangeEnd = 1
  private zoomScale = DEFAULT_ZOOM_SCALE
  private readonly lastHostWidths = new Map<number, number>()
  private suppressResize = false
  private disposed = false

  constructor(private readonly callbacks: PdfPageRenderCallbacks) {}

  dispose() {
    this.disposed = true
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
    return this.placeholderHeights.get(pageNumber) ?? DEFAULT_PLACEHOLDER_HEIGHT
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
  }

  handleResize(pageNumber: number) {
    if (this.suppressResize) return

    const host = this.callbacks.getHost(pageNumber)
    if (!host) return

    const width = host.clientWidth || this.callbacks.getScrollRoot()?.clientWidth || 0
    if (width <= 0) return

    const lastWidth = this.lastHostWidths.get(pageNumber)
    if (lastWidth != null && Math.abs(width - lastWidth) < 2) {
      return
    }
    this.lastHostWidths.set(pageNumber, width)

    if (this.renderedPages.has(pageNumber)) {
      const task = this.renderTasks.get(pageNumber)
      task?.cancel?.()
      this.renderTasks.delete(pageNumber)
      this.renderedPages.delete(pageNumber)
    }
    this.enqueueRender(pageNumber)
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

  private enqueueRender(pageNumber: number) {
    if (this.disposed) return
    if (pageNumber < this.rangeStart || pageNumber > this.rangeEnd) return
    if (this.renderedPages.has(pageNumber)) return
    if (this.renderQueue.includes(pageNumber)) return
    this.renderQueue.push(pageNumber)
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

  private async renderPage(pageNumber: number) {
    const doc = this.callbacks.getDoc()
    if (!doc || this.disposed || this.renderedPages.has(pageNumber)) return

    const host = this.callbacks.getHost(pageNumber)
    if (!host) return

    const hostWidth = host.clientWidth || this.callbacks.getScrollRoot()?.clientWidth || 0
    if (hostWidth <= 0) return

    try {
      const page = await doc.getPage(pageNumber)
      if (this.disposed) return

      const viewport = page.getViewport({ scale: 1 })
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
      if (!context) return

      const task = page.render({ canvasContext: context, viewport: scaledViewport, canvas })
      this.renderTasks.set(pageNumber, task)
      await task.promise
      this.renderTasks.delete(pageNumber)

      if (this.disposed) return

      const currentHost = this.callbacks.getHost(pageNumber)
      if (!currentHost) return

      currentHost.replaceChildren(canvas)
      this.renderedPages.add(pageNumber)
      this.pageProxies.set(pageNumber, page)
      this.lastHostWidths.set(pageNumber, hostWidth)
      const height = canvasHeight
      this.placeholderHeights.set(pageNumber, height)
      this.callbacks.onPlaceholderHeight?.(pageNumber, height)
    } catch (error) {
      this.renderTasks.delete(pageNumber)
      if (!this.disposed) {
        this.callbacks.onRenderError(
          error instanceof Error ? error.message : 'PDF 页面渲染失败',
        )
      }
    }
  }

  private evictPage(pageNumber: number) {
    const task = this.renderTasks.get(pageNumber)
    task?.cancel?.()
    this.renderTasks.delete(pageNumber)

    const page = this.pageProxies.get(pageNumber)
    page?.cleanup?.()
    this.pageProxies.delete(pageNumber)
    this.renderedPages.delete(pageNumber)

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

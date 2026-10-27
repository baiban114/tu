import { describe, expect, it, vi } from 'vitest'
import { PdfPageRenderManager } from './pdfPageRender'
import type { PdfDocumentProxy } from './pdfjsSetup'

function createManager(getDoc: () => PdfDocumentProxy | null = () => null) {
  const onPlaceholderHeight = vi.fn()
  const host = {
    clientWidth: 600,
    parentElement: null,
    querySelector: () => null,
    replaceChildren: () => {},
  } as unknown as HTMLElement
  const manager = new PdfPageRenderManager({
    getDoc,
    getHost: () => host,
    getScrollRoot: () => null,
    onRenderError: () => {},
    onPlaceholderHeight,
  })
  return { manager, onPlaceholderHeight }
}

describe('PdfPageRenderManager placeholder stability', () => {
  it('seeds aspect-ratio-sized placeholders before lazy rendering', async () => {
    const onPlaceholderHeight = vi.fn()
    const host = {
      clientWidth: 600,
      parentElement: null,
    } as unknown as HTMLElement
    const getPage = vi.fn(async () => ({
      getViewport: () => ({ width: 600, height: 800 }),
    }))
    const manager = new PdfPageRenderManager({
      getDoc: () => ({ getPage }) as unknown as PdfDocumentProxy,
      getHost: () => host,
      getScrollRoot: () => null,
      onRenderError: () => {},
      onPlaceholderHeight,
    })
    manager.setRange(1, 3)

    await manager.primePlaceholderSizes([1, 2, 3])

    expect(getPage).toHaveBeenCalledTimes(3)
    expect(manager.getPlaceholderHeight(1)).toBe(800)
    expect(manager.getPlaceholderHeight(3)).toBe(800)
    expect(onPlaceholderHeight).toHaveBeenCalledTimes(3)
  })

  it('samples edge pages for large documents and reserves the larger height', async () => {
    const onPlaceholderHeight = vi.fn()
    const host = {
      clientWidth: 600,
      parentElement: null,
    } as unknown as HTMLElement
    const getPage = vi.fn(async (pageNumber: number) => ({
      getViewport: () => ({
        width: 600,
        height: pageNumber === 25 ? 900 : 800,
      }),
    }))
    const manager = new PdfPageRenderManager({
      getDoc: () => ({ getPage, numPages: 25 }) as unknown as PdfDocumentProxy,
      getHost: () => host,
      getScrollRoot: () => null,
      onRenderError: () => {},
      onPlaceholderHeight,
    })
    manager.setRange(1, 25)

    await manager.primePlaceholderSizes(Array.from({ length: 25 }, (_, index) => index + 1))

    expect(getPage).toHaveBeenCalledTimes(2)
    expect(getPage).toHaveBeenNthCalledWith(1, 1)
    expect(getPage).toHaveBeenNthCalledWith(2, 25)
    expect(manager.getPlaceholderHeight(1)).toBe(800)
    expect(manager.getPlaceholderHeight(13)).toBe(900)
    expect(manager.getPlaceholderHeight(25)).toBe(900)
    expect(onPlaceholderHeight).toHaveBeenNthCalledWith(1, 1, 800)
    expect(onPlaceholderHeight).toHaveBeenNthCalledWith(25, 25, 900)
    expect(onPlaceholderHeight).toHaveBeenCalledTimes(25)
  })

  it('keeps the default fallback when document measurement is unavailable', () => {
    const { manager } = createManager()
    expect(manager.getPlaceholderHeight(1)).toBe(120)
  })

})

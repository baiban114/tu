import { describe, expect, it } from 'vitest'
import {
  clampFixedPanelToViewport,
  DEFAULT_VIEWPORT_PANEL_PADDING,
  estimateFixedPanelPosition,
  resolvePreferBottomLeftPanelPosition,
} from './viewportPanel'

const VIEWPORT = { width: 800, height: 600 }

describe('clampFixedPanelToViewport', () => {
  it('keeps panel inside viewport when near bottom-right', () => {
    const padding = DEFAULT_VIEWPORT_PANEL_PADDING
    const width = 160
    const height = 200
    const result = clampFixedPanelToViewport(700, 550, width, height, padding, VIEWPORT.width, VIEWPORT.height)
    expect(result.left).toBe(800 - width - padding)
    expect(result.top).toBe(600 - height - padding)
  })

  it('keeps panel inside viewport when near top-left', () => {
    const padding = DEFAULT_VIEWPORT_PANEL_PADDING
    const result = clampFixedPanelToViewport(0, 0, 120, 80, padding, VIEWPORT.width, VIEWPORT.height)
    expect(result.left).toBe(padding)
    expect(result.top).toBe(padding)
  })

  it('estimateFixedPanelPosition matches clamp with guessed size', () => {
    const estimated = estimateFixedPanelPosition(700, 550, 180, 220, DEFAULT_VIEWPORT_PANEL_PADDING, VIEWPORT.width, VIEWPORT.height)
    const clamped = clampFixedPanelToViewport(700, 550, 180, 220, DEFAULT_VIEWPORT_PANEL_PADDING, VIEWPORT.width, VIEWPORT.height)
    expect(estimated).toEqual(clamped)
  })
})

describe('resolvePreferBottomLeftPanelPosition', () => {
  const gap = 8
  const padding = DEFAULT_VIEWPORT_PANEL_PADDING
  const panel = { width: 180, height: 220 }

  it('places left of content column when browser window has room', () => {
    const contentLeft = 280
    const anchor = { left: 40, top: 100, right: 68, bottom: 128, width: 28, height: 28 }
    const result = resolvePreferBottomLeftPanelPosition(
      anchor, panel.width, panel.height, gap, padding, VIEWPORT.width, VIEWPORT.height, contentLeft,
    )
    expect(result.left).toBe(contentLeft - gap - panel.width)
    expect(result.top).toBe(anchor.bottom + gap)
  })

  it('falls back to contentLeft when window cannot fit left-of-content', () => {
    const contentLeft = 100
    const anchor = { left: 40, top: 100, right: 68, bottom: 128, width: 28, height: 28 }
    const result = resolvePreferBottomLeftPanelPosition(
      anchor, panel.width, panel.height, gap, padding, VIEWPORT.width, VIEWPORT.height, contentLeft,
    )
    expect(result.left).toBe(contentLeft)
    expect(result.top).toBe(anchor.bottom + gap)
  })

  it('does not treat content viewport as the left-space bound (would wrongly flip right)', () => {
    // content column starts far right; left-of-content still fits in the browser window.
    const contentLeft = 400
    const anchor = { left: 360, top: 100, right: 388, bottom: 128, width: 28, height: 28 }
    const result = resolvePreferBottomLeftPanelPosition(
      anchor, panel.width, panel.height, gap, padding, VIEWPORT.width, VIEWPORT.height, contentLeft,
    )
    expect(result.left).toBe(contentLeft - gap - panel.width)
    expect(result.left).toBeLessThan(anchor.left)
  })

  it('flips above when near the browser bottom edge', () => {
    const contentLeft = 280
    const anchor = { left: 40, top: 500, right: 68, bottom: 528, width: 28, height: 28 }
    const result = resolvePreferBottomLeftPanelPosition(
      anchor, panel.width, panel.height, gap, padding, VIEWPORT.width, VIEWPORT.height, contentLeft,
    )
    expect(result.left).toBe(contentLeft - gap - panel.width)
    expect(result.top).toBe(anchor.top - gap - panel.height)
  })
})

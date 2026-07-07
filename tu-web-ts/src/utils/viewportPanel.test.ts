import { describe, expect, it } from 'vitest'
import {
  clampFixedPanelToViewport,
  DEFAULT_VIEWPORT_PANEL_PADDING,
  estimateFixedPanelPosition,
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

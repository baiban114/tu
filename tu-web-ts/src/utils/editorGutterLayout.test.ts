import { describe, expect, it } from 'vitest'
import {
  EDITOR_GUTTER_BTN_SIZE,
  getHandleTriggerBounds,
  isPointInHandleTriggerZone,
  type ContentScrollGutterAnchor,
} from './editorGutterLayout'

function gutter(partial?: Partial<ContentScrollGutterAnchor>): ContentScrollGutterAnchor {
  return {
    rect: {
      left: 100,
      top: 0,
      width: 800,
      height: 600,
      right: 900,
      bottom: 600,
      x: 100,
      y: 0,
      toJSON() { return this },
    } as DOMRect,
    paddingLeft: 48,
    foldLeft: 100 + 48 - EDITOR_GUTTER_BTN_SIZE / 2,
    hoverLeft: 100 + EDITOR_GUTTER_BTN_SIZE / 2,
    ...partial,
  }
}

describe('getHandleTriggerBounds', () => {
  it('covers handle dot and extends left beyond scroll edge', () => {
    const bounds = getHandleTriggerBounds(gutter())
    expect(bounds.left).toBeLessThan(100)
    expect(bounds.dotCenterX).toBe(100 + EDITOR_GUTTER_BTN_SIZE / 2)
    expect(bounds.left).toBeLessThanOrEqual(bounds.dotCenterX - EDITOR_GUTTER_BTN_SIZE / 2)
  })

  it('extends right to content left when provided', () => {
    const bounds = getHandleTriggerBounds(gutter(), { contentLeft: 200 })
    expect(bounds.right).toBeGreaterThanOrEqual(200)
  })
})

describe('isPointInHandleTriggerZone', () => {
  it('matches horizontal strip and optional vertical range', () => {
    const bounds = getHandleTriggerBounds(gutter(), { contentLeft: 180 })
    expect(isPointInHandleTriggerZone(bounds.dotCenterX, 50, bounds)).toBe(true)
    expect(isPointInHandleTriggerZone(bounds.left - 1, 50, bounds)).toBe(false)
    expect(isPointInHandleTriggerZone(bounds.dotCenterX, 10, bounds, { top: 40, height: 30 })).toBe(false)
    expect(isPointInHandleTriggerZone(bounds.dotCenterX, 50, bounds, { top: 40, height: 30 })).toBe(true)
  })
})

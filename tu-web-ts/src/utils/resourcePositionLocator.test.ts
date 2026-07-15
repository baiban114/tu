import { describe, expect, it } from 'vitest'
import {
  buildResourcePositionLocator,
  formatResourcePositionLocator,
  normalizeResourcePositionLocator,
  parseResourcePositionLocator,
  resourcePositionDisplay,
  splitResourcePositionLocator,
} from './resourcePositionLocator'

describe('resourcePositionLocator', () => {
  it('formats and parses anchor locator', () => {
    expect(formatResourcePositionLocator({ kind: 'anchor', anchor: 'intro' })).toBe('anchor:intro')
    expect(parseResourcePositionLocator('anchor:intro')).toEqual({ kind: 'anchor', anchor: 'intro' })
    expect(resourcePositionDisplay('anchor:intro')).toBe('#intro')
  })

  it('normalizes hash and legacy page forms', () => {
    expect(normalizeResourcePositionLocator('#intro')).toBe('anchor:intro')
    expect(normalizeResourcePositionLocator('p. 18')).toBe('page:18')
    expect(normalizeResourcePositionLocator('p.1–p.20')).toBe('page:1-20')
  })

  it('formats page range and paragraph', () => {
    expect(buildResourcePositionLocator('pageRange', '1-20')).toBe('page:1-20')
    expect(buildResourcePositionLocator('paragraph', '3')).toBe('paragraph:3')
    expect(resourcePositionDisplay('page:1-20')).toBe('第 1–20 页')
    expect(resourcePositionDisplay('paragraph:3')).toBe('第 3 段')
  })

  it('splits stored locator for editing', () => {
    expect(splitResourcePositionLocator('anchor:intro', 'web-link')).toEqual({
      kind: 'anchor',
      value: 'intro',
    })
    expect(splitResourcePositionLocator('page:12', 'book')).toEqual({
      kind: 'page',
      value: '12',
    })
  })
})

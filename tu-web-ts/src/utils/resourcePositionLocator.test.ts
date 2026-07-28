import { describe, expect, it } from 'vitest'
import {
  buildResourcePositionLocator,
  formatPdfClipLocator,
  formatResourcePositionLocator,
  normalizeResourcePositionLocator,
  parseResourcePositionLocator,
  pdfClipGeometryFromLocator,
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

  it('encodes and parses page locator with clip', () => {
    expect(formatResourcePositionLocator({
      kind: 'page',
      page: 12,
      clipTop: 0.2,
      clipBottom: 0.75,
    })).toBe('page:12&clip=0.2-0.75')
    expect(parseResourcePositionLocator('page:12&clip=0.2-0.75')).toEqual({
      kind: 'page',
      page: 12,
      clipTop: 0.2,
      clipBottom: 0.75,
    })
    expect(formatResourcePositionLocator({
      kind: 'pageRange',
      page: 3,
      endPage: 5,
      clipTop: 0.2,
      clipBottom: 0.8,
    })).toBe('page:3-5&clip=0.2-0.8')
    expect(normalizeResourcePositionLocator('page:12&clip=0-1')).toBe('page:12')
    expect(resourcePositionDisplay('page:12&clip=0.2-0.75')).toBe('第 12 页 20%–75%')
  })

  it('builds pdf clip locator from geometry', () => {
    expect(formatPdfClipLocator({
      startPage: 3,
      endPage: 5,
      clipTop: 0.2,
      clipBottom: 0.8,
    })).toBe('page:3-5&clip=0.2-0.8')
    expect(pdfClipGeometryFromLocator('page:3-5&clip=0.2-0.8')).toEqual({
      startPage: 3,
      endPage: 5,
      clipTop: 0.2,
      clipBottom: 0.8,
    })
  })

  it('builds excerpt-bound resource href fragment helpers via locator', () => {
    const locator = formatPdfClipLocator({
      startPage: 3,
      endPage: 5,
      clipTop: 0.2,
      clipBottom: 0.8,
    })
    expect(locator).toBe('page:3-5&clip=0.2-0.8')
    expect(`resource:ri-1:excerpt:re-9#${locator.replace(/^page:/, 'page=')}`).toBe(
      'resource:ri-1:excerpt:re-9#page=3-5&clip=0.2-0.8',
    )
  })

  it('keeps free-text legacy locators as legacy for editing', () => {
    expect(splitResourcePositionLocator('第 3 章', 'book')).toEqual({
      kind: 'legacy',
      value: '第 3 章',
    })
    expect(resourcePositionDisplay('第 3 章')).toBe('第 3 章')
    expect(normalizeResourcePositionLocator('第 3 章')).toBe('第 3 章')
  })
})

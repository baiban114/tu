import { describe, expect, it } from 'vitest'
import {
  findMinContentWidthForMaxLines,
  wrapPlainTextLines,
} from './mindmapNodeFit'

const unitMeasure = (text: string) => text.length * 10

describe('mindmapNodeFit text wrapping', () => {
  it('wraps by character when exceeding max width', () => {
    expect(wrapPlainTextLines('abcdefgh', 35, unitMeasure)).toEqual([
      'abc',
      'def',
      'gh',
    ])
  })

  it('preserves explicit newlines', () => {
    expect(wrapPlainTextLines('ab\ncdef', 30, unitMeasure)).toEqual([
      'ab',
      'cde',
      'f',
    ])
  })

  it('finds min width that keeps line count within limit', () => {
    // "abcdefgh" is 80px single-line; 2 lines need >= 40px content width
    const width = findMinContentWidthForMaxLines('abcdefgh', 2, unitMeasure, 10, 200)
    expect(width).toBe(40)
    expect(wrapPlainTextLines('abcdefgh', width, unitMeasure).length).toBeLessThanOrEqual(2)
  })
})

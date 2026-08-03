import { describe, expect, it } from 'vitest'
import { parseShapeDragPayload } from './materialDrag'

describe('parseShapeDragPayload', () => {
  it('parses preset shapes', () => {
    expect(parseShapeDragPayload(JSON.stringify({ kind: 'preset', preset: 'rect' }))).toEqual({
      kind: 'preset',
      preset: 'rect',
    })
    expect(parseShapeDragPayload(JSON.stringify({ kind: 'preset', preset: 'diamond' }))).toEqual({
      kind: 'preset',
      preset: 'diamond',
    })
  })

  it('parses uml preset', () => {
    expect(parseShapeDragPayload(JSON.stringify({ kind: 'uml-preset' }))).toEqual({
      kind: 'uml-preset',
    })
  })

  it('rejects invalid payloads', () => {
    expect(parseShapeDragPayload('')).toBeNull()
    expect(parseShapeDragPayload('{')).toBeNull()
    expect(parseShapeDragPayload(JSON.stringify({ kind: 'preset', preset: 'hexagon' }))).toBeNull()
    expect(parseShapeDragPayload(JSON.stringify({ kind: 'other' }))).toBeNull()
  })
})

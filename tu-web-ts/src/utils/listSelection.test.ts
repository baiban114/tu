import { describe, expect, it } from 'vitest'
import { applyListClickSelection, topmostSelectedIds } from './listSelection'

describe('applyListClickSelection', () => {
  const flat = ['a', 'b', 'c', 'd']

  it('replaces selection on plain click', () => {
    const result = applyListClickSelection({
      clickedId: 'c',
      flatIds: flat,
      current: new Set(['a']),
      anchorId: 'a',
      ctrlOrMeta: false,
      shiftKey: false,
    })
    expect([...result.next]).toEqual(['c'])
    expect(result.anchorId).toBe('c')
  })

  it('toggles with ctrl', () => {
    const result = applyListClickSelection({
      clickedId: 'b',
      flatIds: flat,
      current: new Set(['a']),
      anchorId: 'a',
      ctrlOrMeta: true,
      shiftKey: false,
    })
    expect(result.next.has('a')).toBe(true)
    expect(result.next.has('b')).toBe(true)
  })

  it('ranges with shift from anchor', () => {
    const result = applyListClickSelection({
      clickedId: 'd',
      flatIds: flat,
      current: new Set(['b']),
      anchorId: 'b',
      ctrlOrMeta: false,
      shiftKey: true,
    })
    expect([...result.next].sort()).toEqual(['b', 'c', 'd'])
  })
})

describe('topmostSelectedIds', () => {
  it('drops descendants when ancestor is selected', () => {
    const parentById = new Map<string, string | null>([
      ['root', null],
      ['child', 'root'],
      ['leaf', 'child'],
      ['other', null],
    ])
    const selected = new Set(['root', 'leaf', 'other'])
    expect(topmostSelectedIds(selected, parentById).sort()).toEqual(['other', 'root'])
  })
})

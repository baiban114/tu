import { describe, expect, it } from 'vitest'
import { resolveTagEditorEnterAction } from './tagEditorEnter'

describe('resolveTagEditorEnterAction', () => {
  it('prefers creating a new tag when label is not an exact pool match', () => {
    expect(resolveTagEditorEnterAction(true, 2)).toBe('create')
  })

  it('picks first search match only when exact create is unavailable', () => {
    expect(resolveTagEditorEnterAction(false, 1)).toBe('pick-first')
  })

  it('does nothing when there is nothing to add', () => {
    expect(resolveTagEditorEnterAction(false, 0)).toBe('noop')
  })
})

import { describe, expect, it } from 'vitest'
import { CODE_BLOCK_EMPTY_CHAR, codeBlockNodeText, isCodeBlockEffectivelyEmpty, normalizeCodeBlockText } from './codeBlockText'

describe('normalizeCodeBlockText', () => {
  it('strips only the editor placeholder and preserves code lines', () => {
    expect(normalizeCodeBlockText('\nline1\nline2\n\n')).toBe('\nline1\nline2\n\n')
    expect(normalizeCodeBlockText('hello')).toBe('hello')
    expect(normalizeCodeBlockText('\n\n')).toBe('\n\n')
    expect(normalizeCodeBlockText('\nhello\n')).toBe('\nhello\n')
    expect(normalizeCodeBlockText(CODE_BLOCK_EMPTY_CHAR)).toBe('')
  })
})

describe('codeBlockNodeText', () => {
  it('keeps a placeholder only for truly empty editable content', () => {
    expect(codeBlockNodeText('')).toBe(CODE_BLOCK_EMPTY_CHAR)
    expect(codeBlockNodeText(CODE_BLOCK_EMPTY_CHAR)).toBe(CODE_BLOCK_EMPTY_CHAR)
    expect(codeBlockNodeText('hello')).toBe('hello')
  })

  it('preserves boundary newlines inserted while editing', () => {
    expect(codeBlockNodeText('\nhello')).toBe('\nhello')
    expect(codeBlockNodeText('hello\n')).toBe('hello\n')
    expect(codeBlockNodeText(`${CODE_BLOCK_EMPTY_CHAR}\nhello`)).toBe('\nhello')
  })
})

describe('isCodeBlockEffectivelyEmpty', () => {
  it('treats placeholder-only blocks as empty', () => {
    expect(isCodeBlockEffectivelyEmpty('')).toBe(true)
    expect(isCodeBlockEffectivelyEmpty(CODE_BLOCK_EMPTY_CHAR)).toBe(true)
    expect(isCodeBlockEffectivelyEmpty('\n\n')).toBe(true)
    expect(isCodeBlockEffectivelyEmpty('hello')).toBe(false)
  })
})

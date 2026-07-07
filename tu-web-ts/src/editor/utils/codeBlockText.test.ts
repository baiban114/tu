import { describe, expect, it } from 'vitest'
import { CODE_BLOCK_EMPTY_CHAR, codeBlockNodeText, isCodeBlockEffectivelyEmpty, normalizeCodeBlockText } from './codeBlockText'

describe('normalizeCodeBlockText', () => {
  it('strips placeholder, leading and trailing newlines', () => {
    expect(normalizeCodeBlockText('\nline1\nline2\n\n')).toBe('line1\nline2')
    expect(normalizeCodeBlockText('hello')).toBe('hello')
    expect(normalizeCodeBlockText('\n\n')).toBe('')
    expect(normalizeCodeBlockText('\nhello\n')).toBe('hello')
    expect(normalizeCodeBlockText(CODE_BLOCK_EMPTY_CHAR)).toBe('')
  })
})

describe('codeBlockNodeText', () => {
  it('keeps placeholder for empty normalized content', () => {
    expect(codeBlockNodeText('')).toBe(CODE_BLOCK_EMPTY_CHAR)
    expect(codeBlockNodeText(CODE_BLOCK_EMPTY_CHAR)).toBe(CODE_BLOCK_EMPTY_CHAR)
    expect(codeBlockNodeText('hello')).toBe('hello')
  })
})

describe('isCodeBlockEffectivelyEmpty', () => {
  it('treats placeholder-only blocks as empty', () => {
    expect(isCodeBlockEffectivelyEmpty('')).toBe(true)
    expect(isCodeBlockEffectivelyEmpty(CODE_BLOCK_EMPTY_CHAR)).toBe(true)
    expect(isCodeBlockEffectivelyEmpty('hello')).toBe(false)
  })
})

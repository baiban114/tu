import { describe, expect, it } from 'vitest'
import {
  CODE_BLOCK_PLAIN_SELECT_VALUE,
  codeBlockLanguageFromSelect,
  codeBlockLanguageLabel,
  codeBlockSelectValue,
} from './codeBlockLanguages'

describe('codeBlockLanguages', () => {
  it('maps plain storage to non-empty select value', () => {
    expect(codeBlockSelectValue(null)).toBe(CODE_BLOCK_PLAIN_SELECT_VALUE)
    expect(codeBlockSelectValue('')).toBe(CODE_BLOCK_PLAIN_SELECT_VALUE)
    expect(codeBlockLanguageLabel(null)).toBe('纯文本')
  })

  it('round-trips language select values', () => {
    expect(codeBlockSelectValue('java')).toBe('java')
    expect(codeBlockLanguageFromSelect('java')).toBe('java')
    expect(codeBlockLanguageFromSelect(CODE_BLOCK_PLAIN_SELECT_VALUE)).toBeNull()
    expect(codeBlockLanguageFromSelect(null)).toBeNull()
  })
})

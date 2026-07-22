import { describe, expect, it } from 'vitest'
import {
  classifyAccessUrlSync,
  defaultAccessUrl,
  extractStoredFileId,
  guessAccessUrlFileName,
  listAccessUrls,
} from '@/utils/accessUrlInsert'

describe('accessUrlInsert', () => {
  it('lists and defaults access urls', () => {
    expect(listAccessUrls(['', '  /a  ', ' /b '])).toEqual(['/a', '/b'])
    expect(defaultAccessUrl(['', '/first', '/second'])).toBe('/first')
    expect(defaultAccessUrl([])).toBe('')
  })

  it('extracts stored file ids', () => {
    expect(extractStoredFileId('/api/files/file-abc')).toBe('file-abc')
    expect(extractStoredFileId('http://localhost:8080/api/files/file-abc#page=1')).toBe('file-abc')
    expect(extractStoredFileId('https://cdn.example/book.pdf')).toBeNull()
  })

  it('classifies by extension', () => {
    expect(classifyAccessUrlSync('/api/files/x/book.pdf')).toBe('pdf')
    expect(classifyAccessUrlSync('https://cdn.example/a.PNG?x=1')).toBe('image')
    expect(classifyAccessUrlSync('/api/files/file-abc')).toBe('externalResource')
  })

  it('guesses file names', () => {
    expect(guessAccessUrlFileName('https://cdn.example/docs/Guide.pdf', '忽略')).toBe('Guide.pdf')
    expect(guessAccessUrlFileName('/api/files/file-abc', '算法导论')).toBe('算法导论')
  })
})

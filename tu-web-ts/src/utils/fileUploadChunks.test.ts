import { describe, expect, it } from 'vitest'
import {
  fileUploadFingerprint,
  planUploadParts,
  shouldUseMultipartUpload,
} from '@/utils/fileUploadChunks'

describe('fileUploadChunks', () => {
  it('plans contiguous parts', () => {
    expect(planUploadParts(20, 8)).toEqual([
      { partNumber: 1, start: 0, end: 8 },
      { partNumber: 2, start: 8, end: 16 },
      { partNumber: 3, start: 16, end: 20 },
    ])
  })

  it('uses fingerprint of name/size/mtime', () => {
    expect(fileUploadFingerprint({ name: 'a.pdf', size: 10, lastModified: 99 })).toBe('a.pdf|10|99')
  })

  it('switches to multipart at threshold', () => {
    expect(shouldUseMultipartUpload(7 * 1024 * 1024)).toBe(false)
    expect(shouldUseMultipartUpload(8 * 1024 * 1024)).toBe(true)
  })
})

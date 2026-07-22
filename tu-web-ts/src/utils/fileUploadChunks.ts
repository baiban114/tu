/** Pure helpers for resumable / chunked file uploads. */

export const DEFAULT_MULTIPART_THRESHOLD_BYTES = 8 * 1024 * 1024
export const DEFAULT_MULTIPART_CHUNK_BYTES = 8 * 1024 * 1024
export const MIN_MULTIPART_PART_BYTES = 5 * 1024 * 1024

export function fileUploadFingerprint(file: Pick<File, 'name' | 'size' | 'lastModified'>): string {
  return `${file.name}|${file.size}|${file.lastModified}`
}

export function planUploadParts(
  sizeBytes: number,
  chunkSizeBytes: number,
): { partNumber: number; start: number; end: number }[] {
  if (sizeBytes <= 0) return []
  const chunk = Math.max(chunkSizeBytes, 1)
  const parts: { partNumber: number; start: number; end: number }[] = []
  let start = 0
  let partNumber = 1
  while (start < sizeBytes) {
    const end = Math.min(start + chunk, sizeBytes)
    parts.push({ partNumber, start, end })
    start = end
    partNumber += 1
  }
  return parts
}

export function shouldUseMultipartUpload(
  sizeBytes: number,
  thresholdBytes: number = DEFAULT_MULTIPART_THRESHOLD_BYTES,
): boolean {
  return sizeBytes >= thresholdBytes
}

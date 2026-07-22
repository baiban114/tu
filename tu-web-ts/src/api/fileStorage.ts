import { isMockDataSource } from '@/dev/dataSource'
import {
  DEFAULT_MULTIPART_CHUNK_BYTES,
  DEFAULT_MULTIPART_THRESHOLD_BYTES,
  fileUploadFingerprint,
  planUploadParts,
  shouldUseMultipartUpload,
} from '@/utils/fileUploadChunks'

export interface FileUploadResult {
  id: string
  url: string
  contentType: string
  sizeBytes: number
}

export interface FileUploadProgress {
  uploadedBytes: number
  totalBytes: number
  uploadedParts: number
  totalParts: number
}

export interface UploadFileOptions {
  onProgress?: (progress: FileUploadProgress) => void
  signal?: AbortSignal
  /** Force single-shot POST even for large files. */
  forceSimple?: boolean
  /** Concurrent part uploads (multipart only). */
  concurrency?: number
}

interface ApiEnvelope<T> {
  code: number
  message: string
  data: T
}

interface UploadConfig {
  multipartThresholdBytes: number
  multipartChunkSizeBytes: number
}

interface InitMultipartResponse {
  uploadId: string
  fileId: string
  chunkSizeBytes: number
  sizeBytes: number
  uploadedPartNumbers: number[]
}

interface MultipartStatus {
  uploadId: string
  fileId: string
  status: string
  sizeBytes: number
  chunkSizeBytes: number
  uploadedPartNumbers: number[]
}

interface ResumeState {
  fingerprint: string
  uploadId: string
  fileId: string
  chunkSizeBytes: number
  sizeBytes: number
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
const RESUME_STORAGE_PREFIX = 'tu:file-upload:'

const mockFileUrls = new Map<string, string>()
let cachedUploadConfig: UploadConfig | null = null

function buildUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path
  return `${API_BASE_URL}${path}`
}

export function buildFileUrl(fileId: string): string {
  if (isMockDataSource()) {
    const mockUrl = mockFileUrls.get(fileId)
    if (mockUrl) return mockUrl
  }
  return buildUrl(`/api/files/${fileId}`)
}

async function readEnvelope<T>(response: Response): Promise<T> {
  let payload: ApiEnvelope<T> | null = null
  try {
    payload = (await response.json()) as ApiEnvelope<T>
  } catch {
    if (!response.ok) {
      throw new Error(`Upload failed with status ${response.status}`)
    }
    throw new Error('Upload failed')
  }
  if (!response.ok) {
    throw new Error(payload?.message || `Upload failed with status ${response.status}`)
  }
  if (!payload || payload.code !== 0) {
    throw new Error(payload?.message || 'Upload failed')
  }
  return payload.data
}

function resumeKey(fingerprint: string): string {
  return `${RESUME_STORAGE_PREFIX}${fingerprint}`
}

function loadResumeState(fingerprint: string): ResumeState | null {
  try {
    const raw = localStorage.getItem(resumeKey(fingerprint))
    if (!raw) return null
    const parsed = JSON.parse(raw) as ResumeState
    if (!parsed?.uploadId || parsed.fingerprint !== fingerprint) return null
    return parsed
  } catch {
    return null
  }
}

function saveResumeState(state: ResumeState): void {
  try {
    localStorage.setItem(resumeKey(state.fingerprint), JSON.stringify(state))
  } catch {
    // ignore quota / private mode
  }
}

function clearResumeState(fingerprint: string): void {
  try {
    localStorage.removeItem(resumeKey(fingerprint))
  } catch {
    // ignore
  }
}

async function fetchUploadConfig(): Promise<UploadConfig> {
  if (cachedUploadConfig) return cachedUploadConfig
  try {
    const response = await fetch(buildUrl('/api/files/upload-config'))
    const data = await readEnvelope<{
      multipartThresholdBytes: number
      multipartChunkSizeBytes: number
    }>(response)
    cachedUploadConfig = {
      multipartThresholdBytes: data.multipartThresholdBytes || DEFAULT_MULTIPART_THRESHOLD_BYTES,
      multipartChunkSizeBytes: Math.max(
        data.multipartChunkSizeBytes || DEFAULT_MULTIPART_CHUNK_BYTES,
        DEFAULT_MULTIPART_CHUNK_BYTES,
      ),
    }
  } catch {
    cachedUploadConfig = {
      multipartThresholdBytes: DEFAULT_MULTIPART_THRESHOLD_BYTES,
      multipartChunkSizeBytes: DEFAULT_MULTIPART_CHUNK_BYTES,
    }
  }
  return cachedUploadConfig
}

async function uploadFileSimple(file: File, options?: UploadFileOptions): Promise<FileUploadResult> {
  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch(buildUrl('/api/files'), {
    method: 'POST',
    body: formData,
    signal: options?.signal,
  })
  const data = await readEnvelope<FileUploadResult>(response)
  options?.onProgress?.({
    uploadedBytes: file.size,
    totalBytes: file.size,
    uploadedParts: 1,
    totalParts: 1,
  })
  return data
}

async function mapPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  const limit = Math.max(1, concurrency)
  let index = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = items[index]
      index += 1
      await worker(current)
    }
  })
  await Promise.all(runners)
}

async function uploadFileMultipart(file: File, options?: UploadFileOptions): Promise<FileUploadResult> {
  const fingerprint = fileUploadFingerprint(file)
  const config = await fetchUploadConfig()
  let uploadId = ''
  let chunkSizeBytes = config.multipartChunkSizeBytes
  let uploaded = new Set<number>()

  const resumed = loadResumeState(fingerprint)
  if (resumed && resumed.sizeBytes === file.size) {
    try {
      const status = await readEnvelope<MultipartStatus>(
        await fetch(buildUrl(`/api/files/uploads/${encodeURIComponent(resumed.uploadId)}`), {
          signal: options?.signal,
        }),
      )
      if (status.status === 'uploading') {
        uploadId = status.uploadId
        chunkSizeBytes = status.chunkSizeBytes || resumed.chunkSizeBytes
        uploaded = new Set(status.uploadedPartNumbers || [])
      } else {
        clearResumeState(fingerprint)
      }
    } catch {
      clearResumeState(fingerprint)
    }
  }

  if (!uploadId) {
    const initiated = await readEnvelope<InitMultipartResponse>(
      await fetch(buildUrl('/api/files/uploads'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
        }),
        signal: options?.signal,
      }),
    )
    uploadId = initiated.uploadId
    chunkSizeBytes = initiated.chunkSizeBytes
    uploaded = new Set(initiated.uploadedPartNumbers || [])
    saveResumeState({
      fingerprint,
      uploadId,
      fileId: initiated.fileId,
      chunkSizeBytes,
      sizeBytes: file.size,
    })
  }

  const parts = planUploadParts(file.size, chunkSizeBytes)
  const pending = parts.filter((part) => !uploaded.has(part.partNumber))
  const concurrency = options?.concurrency ?? 3

  const emitProgress = () => {
    const uploadedBytes = parts
      .filter((part) => uploaded.has(part.partNumber))
      .reduce((sum, part) => sum + (part.end - part.start), 0)
    options?.onProgress?.({
      uploadedBytes,
      totalBytes: file.size,
      uploadedParts: uploaded.size,
      totalParts: parts.length,
    })
  }
  emitProgress()

  try {
    await mapPool(pending, concurrency, async (part) => {
      if (options?.signal?.aborted) {
        throw new DOMException('Upload aborted', 'AbortError')
      }
      const blob = file.slice(part.start, part.end)
      const response = await fetch(
        buildUrl(`/api/files/uploads/${encodeURIComponent(uploadId)}/parts/${part.partNumber}`),
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/octet-stream',
          },
          body: blob,
          signal: options?.signal,
        },
      )
      await readEnvelope(response)
      uploaded.add(part.partNumber)
      emitProgress()
    })

    const completed = await readEnvelope<FileUploadResult>(
      await fetch(buildUrl(`/api/files/uploads/${encodeURIComponent(uploadId)}/complete`), {
        method: 'POST',
        signal: options?.signal,
      }),
    )
    clearResumeState(fingerprint)
    options?.onProgress?.({
      uploadedBytes: file.size,
      totalBytes: file.size,
      uploadedParts: parts.length,
      totalParts: parts.length,
    })
    return completed
  } catch (error) {
    if (options?.signal?.aborted) {
      try {
        await fetch(buildUrl(`/api/files/uploads/${encodeURIComponent(uploadId)}`), {
          method: 'DELETE',
        })
      } catch {
        // keep resume state if abort API fails
      }
      clearResumeState(fingerprint)
    }
    throw error
  }
}

export async function uploadFile(file: File, options?: UploadFileOptions): Promise<FileUploadResult> {
  if (isMockDataSource()) {
    const id = `mock-file-${Date.now()}`
    const url = URL.createObjectURL(file)
    mockFileUrls.set(id, url)
    options?.onProgress?.({
      uploadedBytes: file.size,
      totalBytes: file.size,
      uploadedParts: 1,
      totalParts: 1,
    })
    return {
      id,
      url,
      contentType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
    }
  }

  if (options?.forceSimple) {
    return uploadFileSimple(file, options)
  }

  const config = await fetchUploadConfig()
  if (!shouldUseMultipartUpload(file.size, config.multipartThresholdBytes)) {
    return uploadFileSimple(file, options)
  }
  return uploadFileMultipart(file, options)
}

export async function uploadPdfFile(file: File, options?: UploadFileOptions): Promise<FileUploadResult> {
  if (file.type && file.type !== 'application/pdf') {
    throw new Error('Only PDF files are supported')
  }
  return uploadFile(file, options)
}

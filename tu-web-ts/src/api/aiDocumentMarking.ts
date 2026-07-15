import { isMockDataSource } from '@/dev/dataSource'
import type { DocumentMarkingResponse } from '@/api/types'
import { request } from './http'
import { generateDocumentMarkingMockStream } from '@/mock/aiDocumentMarking'

export interface AnalyzeDocumentMarkingPayload {
  pageId: string
  kbId?: string | null
  replaceExistingAi?: boolean | null
  sectionHeadingBlockId?: string | null
  sectionEmbedBlockId?: string | null
  sectionTitle?: string | null
}

export type DocumentMarkingProgressPhase =
  | 'started'
  | 'model_call'
  | 'tool_call'
  | 'tool_done'
  | 'parsing'
  | 'completed'
  | 'failed'
  | 'cancelled'

export interface DocumentMarkingProgressEvent {
  phase: DocumentMarkingProgressPhase
  message: string
  round?: number | null
  toolName?: string | null
  elapsedMs?: number | null
  result?: DocumentMarkingResponse | null
}

export interface GenerateDocumentMarkingStreamOptions {
  onEvent: (event: DocumentMarkingProgressEvent) => void
  signal?: AbortSignal
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

const buildUrl = (path: string): string => {
  if (/^https?:\/\//.test(path)) return path
  return `${API_BASE_URL}${path}`
}

const parseSseBlock = (block: string): DocumentMarkingProgressEvent | null => {
  const lines = block.split('\n')
  let data = ''
  for (const line of lines) {
    if (line.startsWith('data:')) {
      data += line.slice(5).trimStart()
    }
  }
  if (!data) return null
  try {
    return JSON.parse(data) as DocumentMarkingProgressEvent
  } catch {
    return null
  }
}

async function generateDocumentMarkingStreamBackend(
  payload: AnalyzeDocumentMarkingPayload,
  options: GenerateDocumentMarkingStreamOptions,
): Promise<DocumentMarkingResponse> {
  const response = await fetch(buildUrl('/api/ai/document-marking/analyze/stream'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(payload),
    signal: options.signal,
  })

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`
    try {
      const body = await response.json() as { message?: string }
      if (body.message) message = body.message
    } catch {
      // ignore
    }
    throw new Error(message)
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error('Streaming response is not supported')

  const decoder = new TextDecoder()
  let buffer = ''
  let result: DocumentMarkingResponse | null = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const blocks = buffer.split('\n\n')
    buffer = blocks.pop() || ''
    for (const block of blocks) {
      const event = parseSseBlock(block.trim())
      if (!event) continue
      options.onEvent(event)
      if (event.phase === 'completed' && event.result) {
        result = event.result
      }
      if (event.phase === 'failed') {
        throw new Error(event.message || '文档标记分析失败')
      }
      if (event.phase === 'cancelled') {
        throw new DOMException('Aborted', 'AbortError')
      }
    }
  }

  if (!result) {
    throw new Error('文档标记分析失败：未收到完整结果')
  }
  return result
}

export function generateDocumentMarkingStream(
  payload: AnalyzeDocumentMarkingPayload,
  options: GenerateDocumentMarkingStreamOptions,
): Promise<DocumentMarkingResponse> {
  if (isMockDataSource()) {
    return generateDocumentMarkingMockStream(payload, options)
  }
  return generateDocumentMarkingStreamBackend(payload, options)
}

export function analyzeDocumentMarking(payload: AnalyzeDocumentMarkingPayload): Promise<DocumentMarkingResponse> {
  if (isMockDataSource()) {
    return generateDocumentMarkingMockStream(payload, { onEvent: () => {} })
  }
  return request<DocumentMarkingResponse>('/api/ai/document-marking/analyze', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function clearPageAiMarkers(pageId: string): Promise<void> {
  if (isMockDataSource()) return
  await request<void>(`/api/ai/document-marking/pages/${pageId}/ai-markers`, { method: 'DELETE' })
}

import { isMockDataSource } from '@/dev/dataSource'
import { request } from './http'
import { assembleLearningDocumentMockStream } from '@/mock/aiLearningDocument'

export type AssemblyInsertType = 'refBlock' | 'externalResourceBlock' | 'pdfExcerptBlock' | 'heading'

export type AssemblyInsert =
  | {
      type: 'refBlock'
      forPointId: string
      refId: string
      refType: 'page' | 'block'
      title?: string | null
    }
  | {
      type: 'externalResourceBlock'
      forPointId: string
      itemId: string
      excerptId?: string | null
      title?: string | null
    }
  | {
      type: 'pdfExcerptBlock'
      forPointId: string
      fileId: string
      startPage?: number | null
      endPage?: number | null
      title?: string | null
    }
  | {
      type: 'heading'
      forPointId: string
      level?: number | null
      text: string
    }

export interface LearningDocumentAssemblyPlan {
  topic: string
  orderedPointIds: string[]
  inserts: AssemblyInsert[]
  warnings?: string[] | null
}

export interface AssembleLearningDocumentPayload {
  topic: string
  kbId: string
}

export type LearningDocumentAssemblyProgressPhase =
  | 'started'
  | 'model_call'
  | 'tool_call'
  | 'tool_done'
  | 'parsing'
  | 'completed'
  | 'failed'
  | 'cancelled'

export interface LearningDocumentAssemblyProgressEvent {
  phase: LearningDocumentAssemblyProgressPhase
  message: string
  round?: number | null
  toolName?: string | null
  elapsedMs?: number | null
  result?: LearningDocumentAssemblyPlan | null
}

export interface AssembleLearningDocumentStreamOptions {
  onEvent: (event: LearningDocumentAssemblyProgressEvent) => void
  signal?: AbortSignal
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

const buildUrl = (path: string): string => {
  if (/^https?:\/\//.test(path)) return path
  return `${API_BASE_URL}${path}`
}

const parseSseBlock = (block: string): LearningDocumentAssemblyProgressEvent | null => {
  const lines = block.split('\n')
  let data = ''
  for (const line of lines) {
    if (line.startsWith('data:')) {
      data += line.slice(5).trimStart()
    }
  }
  if (!data) return null
  try {
    return JSON.parse(data) as LearningDocumentAssemblyProgressEvent
  } catch {
    return null
  }
}

async function assembleLearningDocumentStreamBackend(
  payload: AssembleLearningDocumentPayload,
  options: AssembleLearningDocumentStreamOptions,
): Promise<LearningDocumentAssemblyPlan> {
  const response = await fetch(buildUrl('/api/ai/learning-document/assemble/stream'), {
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

  const onAbort = () => {
    void reader.cancel().catch(() => undefined)
  }
  options.signal?.addEventListener('abort', onAbort, { once: true })
  if (options.signal?.aborted) {
    onAbort()
    throw new DOMException('Aborted', 'AbortError')
  }

  const decoder = new TextDecoder()
  let buffer = ''
  let result: LearningDocumentAssemblyPlan | null = null

  try {
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
          throw new Error(event.message || '学习文档编排失败')
        }
        if (event.phase === 'cancelled') {
          throw new DOMException('Aborted', 'AbortError')
        }
      }
    }
  } finally {
    options.signal?.removeEventListener('abort', onAbort)
  }

  if (!result) {
    throw new Error('学习文档编排失败：未收到完整结果')
  }
  return result
}

export function assembleLearningDocumentStream(
  payload: AssembleLearningDocumentPayload,
  options: AssembleLearningDocumentStreamOptions,
): Promise<LearningDocumentAssemblyPlan> {
  if (isMockDataSource()) {
    return assembleLearningDocumentMockStream(payload, options)
  }
  return assembleLearningDocumentStreamBackend(payload, options)
}

export function assembleLearningDocument(
  payload: AssembleLearningDocumentPayload,
): Promise<LearningDocumentAssemblyPlan> {
  if (isMockDataSource()) {
    return assembleLearningDocumentMockStream(payload, { onEvent: () => {} })
  }
  return request<LearningDocumentAssemblyPlan>('/api/ai/learning-document/assemble', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

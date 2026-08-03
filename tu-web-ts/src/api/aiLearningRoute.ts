import { isMockDataSource } from '@/dev/dataSource'
import { request } from './http'
import { generateLearningRouteMockStream } from '@/mock/aiLearningRoute'

export interface LearningRouteItem {
  pointId?: string | null
  title: string
  summary?: string | null
  estimatedHours?: number | null
  /** Optional finer-grained sub-steps. */
  children?: LearningRouteItem[] | null
}

export interface LearningRoutePlan {
  topic: string
  orderedItems: LearningRouteItem[]
  warnings?: string[]
}

export interface LearningRouteChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface GenerateLearningRoutePayload {
  topic: string
  kbId: string
  seedPointIds?: string[]
  messages?: LearningRouteChatMessage[]
  previousPlanJson?: string | null
}

export type LearningRouteProgressPhase =
  | 'started'
  | 'model_call'
  | 'thinking'
  | 'tool_call'
  | 'tool_done'
  | 'parsing'
  | 'completed'
  | 'failed'
  | 'cancelled'

export interface LearningRouteProgressEvent {
  phase: LearningRouteProgressPhase
  message: string
  round?: number | null
  toolName?: string | null
  elapsedMs?: number | null
  result?: LearningRoutePlan | null
}

export interface GenerateLearningRouteStreamOptions {
  onEvent: (event: LearningRouteProgressEvent) => void
  signal?: AbortSignal
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

function buildUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path
  return `${API_BASE_URL}${path}`
}

function parseSseBlock(block: string): LearningRouteProgressEvent | null {
  const lines = block.split('\n')
  let data = ''
  for (const line of lines) {
    if (line.startsWith('data:')) {
      data += line.slice(5).trimStart()
    }
  }
  if (!data) return null
  try {
    return JSON.parse(data) as LearningRouteProgressEvent
  } catch {
    return null
  }
}

async function generateLearningRouteStreamBackend(
  payload: GenerateLearningRoutePayload,
  options: GenerateLearningRouteStreamOptions,
): Promise<LearningRoutePlan> {
  const response = await fetch(buildUrl('/api/ai/learning-route/generate/stream'), {
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
  let result: LearningRoutePlan | null = null

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
        result = event.result as LearningRoutePlan
      }
      if (event.phase === 'failed') {
        throw new Error(event.message || '生成学习路线失败')
      }
      if (event.phase === 'cancelled') {
        throw new DOMException('Aborted', 'AbortError')
      }
    }
  }

  if (!result) {
    throw new Error('生成学习路线失败：未收到完整结果')
  }
  return result
}

export function generateLearningRouteStream(
  payload: GenerateLearningRoutePayload,
  options: GenerateLearningRouteStreamOptions,
): Promise<LearningRoutePlan> {
  if (isMockDataSource()) {
    return generateLearningRouteMockStream(payload, options)
  }
  return generateLearningRouteStreamBackend(payload, options)
}

export async function generateLearningRoute(
  payload: GenerateLearningRoutePayload,
): Promise<LearningRoutePlan> {
  if (isMockDataSource()) {
    return generateLearningRouteMockStream(payload, { onEvent: () => {} })
  }
  return request<LearningRoutePlan>('/api/ai/learning-route/generate', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

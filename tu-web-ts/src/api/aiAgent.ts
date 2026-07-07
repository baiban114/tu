import { isMockDataSource } from '@/dev/dataSource'
import { appendMockAiAgentRunLog } from './aiRuns'
import { request } from './http'

export interface GenerateLearningPlanPayload {
  topic: string
  totalHours?: number | null
  dailyHours?: number | null
  deadline?: string | null
  kbId?: string | null
  enableWebSearch?: boolean | null
}

export interface LearningPlanNode {
  title: string
  description?: string | null
  estimatedHours?: number | null
  resource?: string | null
  children?: LearningPlanNode[]
}

export interface LearningPlanResponse {
  title: string
  totalEstimatedHours: number
  items: LearningPlanNode[]
}

export type LearningPlanProgressPhase =
  | 'started'
  | 'model_call'
  | 'tool_call'
  | 'tool_done'
  | 'parsing'
  | 'completed'
  | 'failed'
  | 'cancelled'

export interface LearningPlanProgressEvent {
  phase: LearningPlanProgressPhase
  message: string
  round?: number | null
  toolName?: string | null
  elapsedMs?: number | null
  result?: LearningPlanResponse | null
}

export interface GenerateLearningPlanStreamOptions {
  onEvent: (event: LearningPlanProgressEvent) => void
  signal?: AbortSignal
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

const buildUrl = (path: string): string => {
  if (/^https?:\/\//.test(path)) return path
  return `${API_BASE_URL}${path}`
}

const clampHours = (value: number, fallback: number) => {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

const mockStep = (title: string, estimatedHours: number, resource: string): LearningPlanNode => ({
  title,
  estimatedHours,
  resource,
})

const readMockAgentSettings = () => {
  try {
    return JSON.parse(window.localStorage.getItem('tu:mock-ai-settings') || '{}')
  } catch {
    return {}
  }
}

const buildMockLearningPlan = (payload: GenerateLearningPlanPayload): LearningPlanResponse => {
  const topic = payload.topic.trim()
  const totalHours = clampHours(Number(payload.totalHours), 18)
  const sectionHours = Math.max(2, Math.round((totalHours / 3) * 10) / 10)
  const items: LearningPlanNode[] = [
    {
      title: '建立基础框架',
      description: `明确 ${topic} 的核心概念、术语和学习边界。`,
      children: [
        mockStep('梳理概念地图', Math.max(1, sectionHours * 0.4), '官方文档或权威教程'),
        mockStep('完成入门练习', Math.max(1, sectionHours * 0.6), '交互式练习或示例项目'),
      ],
    },
    {
      title: '专项训练',
      description: '围绕关键能力拆分练习，并记录薄弱点。',
      children: [
        mockStep('主题拆解与笔记', Math.max(1, sectionHours * 0.45), '专题文章与视频课程'),
        mockStep('小项目实践', Math.max(1, sectionHours * 0.75), '开源示例或练习仓库'),
      ],
    },
    {
      title: '复盘与输出',
      description: '用可交付成果检验学习效果。',
      children: [
        mockStep('错题与知识点复盘', Math.max(1, sectionHours * 0.35), '个人笔记'),
        mockStep('完成总结作品', Math.max(1, sectionHours * 0.45), '博客、演示或项目 README'),
      ],
    },
  ]
  const totalEstimatedHours = items.reduce((sum, section) => {
    return sum + (section.children || []).reduce((childSum, child) => childSum + Number(child.estimatedHours || 0), 0)
  }, 0)

  return {
    title: `${topic} 学习计划`,
    totalEstimatedHours: Math.round(totalEstimatedHours * 100) / 100,
    items,
  }
}

const appendMockRunLog = (payload: GenerateLearningPlanPayload, response: LearningPlanResponse) => {
  const topic = payload.topic.trim()
  const settings = readMockAgentSettings()
  const now = new Date()
  const finishedAt = new Date(now.getTime() + 420)
  const systemPrompt = [
    'You generate structured learning plans. Return only valid JSON.',
    'Default to Simplified Chinese for all user-facing output values.',
  ].join('\n')
  const userPrompt = [
    `Learning goal: ${topic}`,
    `Total available hours: ${payload.totalHours ?? 'not specified'}`,
    `Daily study hours: ${payload.dailyHours ?? 'not specified'}`,
    `Deadline: ${payload.deadline || 'not specified'}`,
    'Generate a chapter-based multi-level learning plan.',
  ].join('\n')
  appendMockAiAgentRunLog({
    taskType: 'learning-plan',
    status: 'success',
    baseUrl: settings.baseUrl || 'mock://ai-agent',
    model: settings.model || 'mock-model',
    startedAt: now.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: 420,
    systemPrompt,
    userPrompt,
    requestBodyJson: JSON.stringify({ model: settings.model || 'mock-model' }, null, 2),
    rawResponseBody: JSON.stringify({ choices: [{ message: { content: JSON.stringify(response) } }] }, null, 2),
    outputText: JSON.stringify(response, null, 2),
    promptTokens: 120,
    completionTokens: 260,
    totalTokens: 380,
  })
}

const sleep = (ms: number, signal?: AbortSignal) => {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const timer = window.setTimeout(() => resolve(), ms)
    signal?.addEventListener('abort', () => {
      window.clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }, { once: true })
  })
}

const emitMockProgress = async (
  options: GenerateLearningPlanStreamOptions,
  phase: LearningPlanProgressPhase,
  message: string,
  extra?: Partial<LearningPlanProgressEvent>,
) => {
  options.onEvent({
    phase,
    message,
    round: extra?.round ?? null,
    toolName: extra?.toolName ?? null,
    elapsedMs: extra?.elapsedMs ?? null,
    result: extra?.result ?? null,
  })
  await sleep(120, options.signal)
}

async function generateLearningPlanMockStream(
  payload: GenerateLearningPlanPayload,
  options: GenerateLearningPlanStreamOptions,
): Promise<LearningPlanResponse> {
  const startedAt = Date.now()
  const elapsed = () => Date.now() - startedAt
  await emitMockProgress(options, 'started', '开始生成学习计划', { elapsedMs: elapsed() })
  await emitMockProgress(options, 'model_call', '正在调用模型（第 1 轮）', { round: 1, elapsedMs: elapsed() })
  if (payload.enableWebSearch) {
    await emitMockProgress(options, 'tool_call', '正在联网搜索…', { toolName: 'searchWeb', elapsedMs: elapsed() })
    await emitMockProgress(options, 'tool_done', '联网搜索 完成', { toolName: 'searchWeb', elapsedMs: elapsed() })
  } else if (payload.kbId) {
    await emitMockProgress(options, 'tool_call', '正在搜索知识库…', {
      toolName: 'searchKnowledgeBasePages',
      elapsedMs: elapsed(),
    })
    await emitMockProgress(options, 'tool_done', '搜索知识库 完成', {
      toolName: 'searchKnowledgeBasePages',
      elapsedMs: elapsed(),
    })
  }
  await emitMockProgress(options, 'model_call', '正在调用模型（第 2 轮）', { round: 2, elapsedMs: elapsed() })
  await emitMockProgress(options, 'parsing', '正在整理学习计划…', { elapsedMs: elapsed() })
  const response = buildMockLearningPlan(payload)
  appendMockRunLog(payload, response)
  options.onEvent({
    phase: 'completed',
    message: '学习计划生成完成',
    elapsedMs: elapsed(),
    result: response,
  })
  return response
}

const parseSseBlock = (block: string): LearningPlanProgressEvent | null => {
  const lines = block.split('\n')
  let data = ''
  for (const line of lines) {
    if (line.startsWith('data:')) {
      data += line.slice(5).trimStart()
    }
  }
  if (!data) return null
  try {
    return JSON.parse(data) as LearningPlanProgressEvent
  } catch {
    return null
  }
}

async function generateLearningPlanStreamBackend(
  payload: GenerateLearningPlanPayload,
  options: GenerateLearningPlanStreamOptions,
): Promise<LearningPlanResponse> {
  const response = await fetch(buildUrl('/api/ai/learning-plan/generate/stream'), {
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
      // ignore parse errors
    }
    throw new Error(message)
  }

  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('Streaming response is not supported')
  }

  const decoder = new TextDecoder()
  let buffer = ''
  let result: LearningPlanResponse | null = null

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
        throw new Error(event.message || '生成学习计划失败')
      }
      if (event.phase === 'cancelled') {
        throw new DOMException('Aborted', 'AbortError')
      }
    }
  }

  if (!result) {
    throw new Error('生成学习计划失败：未收到完整结果')
  }
  return result
}

export function generateLearningPlanStream(
  payload: GenerateLearningPlanPayload,
  options: GenerateLearningPlanStreamOptions,
): Promise<LearningPlanResponse> {
  if (isMockDataSource()) {
    return generateLearningPlanMockStream(payload, options)
  }
  return generateLearningPlanStreamBackend(payload, options)
}

/** @deprecated Use generateLearningPlanStream for progress and cancellation support. */
export function generateLearningPlan(payload: GenerateLearningPlanPayload): Promise<LearningPlanResponse> {
  if (isMockDataSource()) {
    return generateLearningPlanMockStream(payload, { onEvent: () => {} })
  }
  return request<LearningPlanResponse>('/api/ai/learning-plan/generate', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

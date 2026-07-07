import { isMockDataSource } from '@/dev/dataSource'
import { request } from './http'

export interface PageResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export interface AiAgentRunLogSummary {
  id: string
  taskType: string
  status: string
  baseUrl?: string | null
  model?: string | null
  startedAt: string
  finishedAt?: string | null
  durationMs?: number | null
  promptTokens?: number | null
  completionTokens?: number | null
  totalTokens?: number | null
}

export interface AiAgentRunLogDetail extends AiAgentRunLogSummary {
  systemPrompt?: string | null
  userPrompt?: string | null
  requestBodyJson?: string | null
  rawResponseBody?: string | null
  outputText?: string | null
  errorMessage?: string | null
}

export interface ListAiAgentRunLogsParams {
  page?: number
  pageSize?: number
  taskType?: string
  status?: string
}

const STORAGE_KEY = 'tu:mock-ai-run-logs'

const readMockLogs = (): AiAgentRunLogDetail[] => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

const writeMockLogs = (logs: AiAgentRunLogDetail[]) => {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(logs))
}

export function appendMockAiAgentRunLog(log: Omit<AiAgentRunLogDetail, 'id'> & { id?: string }) {
  const id = log.id || `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  writeMockLogs([{ ...log, id }, ...readMockLogs()])
}

export function listAiAgentRunLogs(params: ListAiAgentRunLogsParams = {}): Promise<PageResponse<AiAgentRunLogSummary>> {
  const page = Math.max(0, params.page ?? 0)
  const pageSize = Math.max(1, Math.min(params.pageSize ?? 10, 200))
  if (isMockDataSource()) {
    const filtered = readMockLogs()
      .filter((log) => !params.taskType || log.taskType === params.taskType)
      .filter((log) => !params.status || log.status === params.status)
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    const from = page * pageSize
    return Promise.resolve({
      items: filtered.slice(from, from + pageSize),
      total: filtered.length,
      page,
      pageSize,
    })
  }
  const query = new URLSearchParams()
  query.set('page', String(page))
  query.set('pageSize', String(pageSize))
  if (params.taskType) query.set('taskType', params.taskType)
  if (params.status) query.set('status', params.status)
  return request<PageResponse<AiAgentRunLogSummary>>(`/api/ai/runs?${query.toString()}`)
}

export function getAiAgentRunLog(id: string): Promise<AiAgentRunLogDetail> {
  if (isMockDataSource()) {
    const log = readMockLogs().find((item) => item.id === id)
    return log ? Promise.resolve(log) : Promise.reject(new Error('AI Agent 记录不存在'))
  }
  return request<AiAgentRunLogDetail>(`/api/ai/runs/${encodeURIComponent(id)}`)
}

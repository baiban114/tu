import { isMockDataSource } from '@/dev/dataSource'
import { getPageContentMock, getPageTreeMock, listKnowledgeBasesMock } from '@/mock/store'
import type { PageContent, PageItem } from './types'
import { request } from './http'
import type { PageResult } from '@/constants/pagination'

export interface KnowledgeChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface KnowledgeChatSource {
  kbId: string
  pageId: string
  blockId?: string | null
  title: string
  content: string
  blockType?: string | null
  score?: number | null
}

export interface KnowledgeChatResponse {
  answer: string
  sources: KnowledgeChatSource[]
  reasoningContent?: string | null
  selectedKbId: string
  selectedKbName: string
  conversationId: string
}

export interface KnowledgeChatPayload {
  kbId?: string | null
  question: string
  messages?: KnowledgeChatMessage[]
  conversationId?: string | null
  mode?: 'fast' | 'deep'
}

export interface KnowledgeChatHistoryMessage extends KnowledgeChatMessage {
  id: string
  reasoningContent?: string | null
  sources: KnowledgeChatSource[]
  selectedKbId?: string | null
  selectedKbName?: string | null
  createdAt: string
}

export interface KnowledgeChatSession {
  id: string
  title: string
  selectedKbId?: string | null
  selectedKbName?: string | null
  createdAt: string
  updatedAt: string
}

export interface KnowledgeChatConversation {
  id: string
  title: string
  createdAt: string
  messages: KnowledgeChatHistoryMessage[]
}

export type KnowledgeChatStreamPhase =
  | 'started'
  | 'reasoning_delta'
  | 'answer_delta'
  | 'model_call'
  | 'tool_call'
  | 'tool_done'
  | 'completed'
  | 'failed'

export interface KnowledgeChatStreamEvent {
  phase: KnowledgeChatStreamPhase
  delta?: string | null
  message?: string | null
  result?: KnowledgeChatResponse | null
  round?: number | null
  toolName?: string | null
}

export interface KnowledgeChatStreamOptions {
  onEvent: (event: KnowledgeChatStreamEvent) => void
  signal?: AbortSignal
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

function buildUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path
  return `${API_BASE_URL}${path}`
}

function flattenPages(items: PageItem[]): PageItem[] {
  return items.flatMap((item) => [item, ...flattenPages(item.children || [])])
}

function collectJsonText(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(collectJsonText).join(' ')
  if (!value || typeof value !== 'object') return ''
  const record = value as Record<string, unknown>
  return [record.text, record.content, record.title, record.label].map(collectJsonText).join(' ')
}

function pageContentText(content: PageContent): string {
  return [content.content, collectJsonText(content.document), collectJsonText(content.embeds)]
    .join(' ')
    .replace(/[#*_>`~\[\]()!-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function mockAnswer(payload: KnowledgeChatPayload): KnowledgeChatResponse {
  const terms = payload.question.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || []
  const knowledgeBases = listKnowledgeBasesMock()
  const requestedKnowledgeBase = payload.kbId
    ? knowledgeBases.find((item) => item.id === payload.kbId)
    : undefined
  const candidateKnowledgeBases = requestedKnowledgeBase ? [requestedKnowledgeBase] : knowledgeBases
  const rankedKnowledgeBases = candidateKnowledgeBases.map((knowledgeBase) => {
    const pages = flattenPages(getPageTreeMock(knowledgeBase.id))
    const searchableText = [knowledgeBase.name, knowledgeBase.description, ...pages.map((page) => page.title)]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    const score = terms.reduce((total, term) => total + (searchableText.includes(term) ? 1 : 0), 0)
    return { knowledgeBase, score }
  })
  const selectedKnowledgeBase = rankedKnowledgeBases.sort((left, right) => right.score - left.score)[0]?.knowledgeBase
  if (!selectedKnowledgeBase) {
    return {
      answer: '当前用户没有可用于问答的知识库。',
      sources: [],
      reasoningContent: '',
      selectedKbId: '',
      selectedKbName: '',
      conversationId: '',
    }
  }
  const candidates = flattenPages(getPageTreeMock(selectedKnowledgeBase.id)).map((page) => {
    const content = getPageContentMock(page.id)
    const text = pageContentText(content)
    const haystack = `${page.title} ${text}`.toLowerCase()
    const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0)
    return { page, text, score }
  })
  const matched = candidates
    .filter((item) => item.text && (item.score > 0 || terms.length === 0))
    .sort((left, right) => right.score - left.score)
    .slice(0, 3)
  const fallback = matched.length ? matched : candidates.filter((item) => item.text).slice(0, 2)
  const sources: KnowledgeChatSource[] = fallback.map(({ page, text, score }) => ({
    kbId: selectedKnowledgeBase.id,
    pageId: page.id,
    title: page.title,
    content: text.length > 260 ? `${text.slice(0, 260)}…` : text,
    score: score || 0.5,
  }))
  if (!sources.length) {
    return {
      answer: '当前知识库还没有可用于回答的内容。请先添加文档内容，再重新提问。',
      sources: [],
      reasoningContent: '',
      selectedKbId: selectedKnowledgeBase.id,
      selectedKbName: selectedKnowledgeBase.name,
      conversationId: '',
    }
  }
  return {
    answer: `根据当前知识库，与“${payload.question}”最相关的资料集中在${sources.map((source, index) => `《${source.title}》[来源${index + 1}]`).join('、')}。本地测试模式不会调用大模型；连接后端并配置 AI Agent 后，系统会基于这些检索证据生成完整的专业回答。`,
    sources,
    reasoningContent: '本地测试模式推理轨迹：根据问题提取检索词，按匹配度选择当前知识库页面，并使用命中的页面组织回答。',
    selectedKbId: selectedKnowledgeBase.id,
    selectedKbName: selectedKnowledgeBase.name,
    conversationId: '',
  }
}

interface MockKnowledgeChatSession extends KnowledgeChatSession {
  messages: KnowledgeChatHistoryMessage[]
}

function mockSessionStorageKey(userId: string): string {
  return `tu:knowledge-chat:sessions:${userId || 'dev-local-user'}`
}

function readMockSessions(userId: string): MockKnowledgeChatSession[] {
  try {
    const raw = localStorage.getItem(mockSessionStorageKey(userId))
    return raw ? JSON.parse(raw) as MockKnowledgeChatSession[] : []
  } catch {
    return []
  }
}

function writeMockSessions(userId: string, sessions: MockKnowledgeChatSession[]) {
  localStorage.setItem(mockSessionStorageKey(userId), JSON.stringify(sessions))
}

function persistMockTurn(
  payload: KnowledgeChatPayload,
  response: KnowledgeChatResponse,
  userId: string,
): KnowledgeChatResponse {
  const sessions = readMockSessions(userId)
  let session = payload.conversationId
    ? sessions.find((item) => item.id === payload.conversationId)
    : undefined
  if (payload.conversationId && !session) {
    throw new Error('知识问答会话不存在')
  }
  const now = new Date().toISOString()
  if (!session) {
    session = {
      id: `chat-${crypto.randomUUID()}`,
      title: payload.question.slice(0, 80),
      selectedKbId: response.selectedKbId,
      selectedKbName: response.selectedKbName,
      createdAt: now,
      updatedAt: now,
      messages: [],
    }
    sessions.push(session)
  }
  session.selectedKbId = response.selectedKbId
  session.selectedKbName = response.selectedKbName
  session.updatedAt = now
  session.messages.push(
    {
      id: `chatmsg-${crypto.randomUUID()}`,
      role: 'user',
      content: payload.question,
      sources: [],
      createdAt: now,
    },
    {
      id: `chatmsg-${crypto.randomUUID()}`,
      role: 'assistant',
      content: response.answer,
      reasoningContent: response.reasoningContent,
      sources: response.sources,
      selectedKbId: response.selectedKbId,
      selectedKbName: response.selectedKbName,
      createdAt: now,
    },
  )
  writeMockSessions(userId, sessions)
  return { ...response, conversationId: session.id }
}

export async function listKnowledgeChatSessions(
  page: number,
  pageSize: number,
  userId: string,
): Promise<PageResult<KnowledgeChatSession>> {
  if (isMockDataSource()) {
    const sessions = readMockSessions(userId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    const start = Math.max(0, page) * pageSize
    return {
      items: sessions.slice(start, start + pageSize).map(({ messages: _messages, ...session }) => session),
      total: sessions.length,
      page,
      pageSize,
    }
  }
  return request<PageResult<KnowledgeChatSession>>(
    `/api/ai/knowledge-chat/conversations?page=${page}&pageSize=${pageSize}`,
    { headers: { 'X-User-Id': userId || 'dev-local-user' } },
  )
}

export async function getKnowledgeChatConversation(
  conversationId: string,
  userId: string,
): Promise<KnowledgeChatConversation> {
  if (isMockDataSource()) {
    const session = readMockSessions(userId).find((item) => item.id === conversationId)
    if (!session) throw new Error('知识问答会话不存在')
    return {
      id: session.id,
      title: session.title,
      createdAt: session.createdAt,
      messages: session.messages,
    }
  }
  return request<KnowledgeChatConversation>(`/api/ai/knowledge-chat/conversations/${conversationId}`, {
    headers: { 'X-User-Id': userId || 'dev-local-user' },
  })
}

function parseSseBlock(block: string): KnowledgeChatStreamEvent | null {
  const data = block
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n')
  if (!data) return null
  try {
    return JSON.parse(data) as KnowledgeChatStreamEvent
  } catch {
    return null
  }
}

function abortError(): DOMException {
  return new DOMException('Aborted', 'AbortError')
}

async function emitMockText(
  phase: 'reasoning_delta' | 'answer_delta',
  value: string,
  options: KnowledgeChatStreamOptions,
) {
  const characters = Array.from(value)
  for (let index = 0; index < characters.length; index += 3) {
    if (options.signal?.aborted) throw abortError()
    options.onEvent({ phase, delta: characters.slice(index, index + 3).join('') })
    const delayMs = phase === 'reasoning_delta' ? 80 : 12
    await new Promise((resolve) => window.setTimeout(resolve, delayMs))
  }
}

async function askKnowledgeBaseMockStream(
  payload: KnowledgeChatPayload,
  userId: string,
  options: KnowledgeChatStreamOptions,
): Promise<KnowledgeChatResponse> {
  options.onEvent({ phase: 'started' })
  const response = mockAnswer(payload)
  if (payload.mode === 'deep') {
    options.onEvent({ phase: 'model_call', message: '正在调用模型（第 1 轮）', round: 1 })
    options.onEvent({
      phase: 'tool_call',
      message: '正在检索当前知识库…',
      toolName: 'queryCurrentKnowledgeBase',
    })
    options.onEvent({
      phase: 'tool_done',
      message: '检索当前知识库完成',
      toolName: 'queryCurrentKnowledgeBase',
    })
    options.onEvent({ phase: 'model_call', message: '正在调用模型（第 2 轮）', round: 2 })
    await emitMockText('reasoning_delta', response.reasoningContent || '', options)
  } else {
    await emitMockText('reasoning_delta', response.reasoningContent || '', options)
  }
  await emitMockText('answer_delta', response.answer, options)
  const persistedResponse = persistMockTurn(payload, response, userId)
  options.onEvent({ phase: 'completed', result: persistedResponse })
  return persistedResponse
}

async function askKnowledgeBaseBackendStream(
  payload: KnowledgeChatPayload,
  userId: string,
  options: KnowledgeChatStreamOptions,
): Promise<KnowledgeChatResponse> {
  const response = await fetch(buildUrl('/api/ai/knowledge-chat/stream'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      'X-User-Id': userId || 'dev-local-user',
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
      // Keep the status-based message when the response is not JSON.
    }
    throw new Error(message)
  }
  const reader = response.body?.getReader()
  if (!reader) throw new Error('Streaming response is not supported')

  const decoder = new TextDecoder()
  let buffer = ''
  let result: KnowledgeChatResponse | null = null
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
    const blocks = buffer.split('\n\n')
    buffer = blocks.pop() || ''
    for (const block of blocks) {
      const event = parseSseBlock(block.trim())
      if (!event) continue
      options.onEvent(event)
      if (event.phase === 'completed' && event.result) result = event.result
      if (event.phase === 'failed') throw new Error(event.message || '知识库问答失败')
    }
  }
  if (!result) throw new Error('知识库问答失败：未收到完整结果')
  return result
}

export function askKnowledgeBaseStream(
  payload: KnowledgeChatPayload,
  userId: string,
  options: KnowledgeChatStreamOptions,
): Promise<KnowledgeChatResponse> {
  return isMockDataSource()
    ? askKnowledgeBaseMockStream(payload, userId, options)
    : askKnowledgeBaseBackendStream(payload, userId, options)
}

export async function askKnowledgeBase(
  payload: KnowledgeChatPayload,
  userId: string,
): Promise<KnowledgeChatResponse> {
  if (isMockDataSource()) {
    return persistMockTurn(payload, mockAnswer(payload), userId)
  }
  return request<KnowledgeChatResponse>('/api/ai/knowledge-chat', {
    method: 'POST',
    headers: { 'X-User-Id': userId || 'dev-local-user' },
    body: JSON.stringify(payload),
  })
}

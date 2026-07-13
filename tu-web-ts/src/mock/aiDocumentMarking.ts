import type { AnalyzeDocumentMarkingPayload, DocumentMarkingProgressEvent } from '@/api/aiDocumentMarking'
import type { DocumentMarkingResponse } from '@/api/types'

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

const emit = async (
  options: { onEvent: (event: DocumentMarkingProgressEvent) => void; signal?: AbortSignal },
  phase: DocumentMarkingProgressEvent['phase'],
  message: string,
  extra?: Partial<DocumentMarkingProgressEvent>,
) => {
  options.onEvent({
    phase,
    message,
    round: extra?.round ?? null,
    toolName: extra?.toolName ?? null,
    elapsedMs: extra?.elapsedMs ?? null,
    result: extra?.result ?? null,
  })
  await sleep(100, options.signal)
}

function buildMockResponse(pageId: string): DocumentMarkingResponse {
  return {
    runId: `mock-dm-${Date.now()}`,
    suggestions: [
      {
        id: 'sug-1',
        action: 'bindSource',
        locator: `page:${pageId}:heading:mock-h1`,
        resourceItemId: 'ri-mock-1',
        resourceExcerptId: 're-mock-1',
        confidence: 0.85,
        reason: '该标题与外部资源章节主题一致',
        markerSource: 'ai',
      },
      {
        id: 'sug-2',
        action: 'createRelation',
        locator: `page:${pageId}:block:page-content`,
        relationTypeKey: 'case',
        toPointId: 'kp-mock-1',
        confidence: 0.72,
        reason: '正文案例可关联到知识点',
        markerSource: 'ai',
      },
    ],
  }
}

export async function generateDocumentMarkingMockStream(
  payload: AnalyzeDocumentMarkingPayload,
  options: { onEvent: (event: DocumentMarkingProgressEvent) => void; signal?: AbortSignal },
): Promise<DocumentMarkingResponse> {
  const startedAt = Date.now()
  const elapsed = () => Date.now() - startedAt
  await emit(options, 'started', '开始分析文档标记', { elapsedMs: elapsed() })
  await emit(options, 'model_call', '正在调用模型（第 1 轮）', { round: 1, elapsedMs: elapsed() })
  if (payload.kbId) {
    await emit(options, 'tool_call', '正在搜索知识库…', { toolName: 'searchKnowledgeBasePages', elapsedMs: elapsed() })
    await emit(options, 'tool_done', '搜索知识库 完成', { toolName: 'searchKnowledgeBasePages', elapsedMs: elapsed() })
  }
  await emit(options, 'parsing', '正在校验标记建议…', { elapsedMs: elapsed() })
  const response = buildMockResponse(payload.pageId)
  options.onEvent({
    phase: 'completed',
    message: '文档标记分析完成',
    elapsedMs: elapsed(),
    result: response,
  })
  return response
}

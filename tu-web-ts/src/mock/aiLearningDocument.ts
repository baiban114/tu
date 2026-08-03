import type {
  AssembleLearningDocumentPayload,
  LearningDocumentAssemblyPlan,
  LearningDocumentAssemblyProgressEvent,
} from '@/api/aiLearningDocument'

const sleep = (ms: number, signal?: AbortSignal) => {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const timer = globalThis.setTimeout(() => resolve(), ms)
    signal?.addEventListener('abort', () => {
      globalThis.clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }, { once: true })
  })
}

const emit = async (
  options: { onEvent: (event: LearningDocumentAssemblyProgressEvent) => void; signal?: AbortSignal },
  phase: LearningDocumentAssemblyProgressEvent['phase'],
  message: string,
  extra?: Partial<LearningDocumentAssemblyProgressEvent>,
) => {
  options.onEvent({
    phase,
    message,
    round: extra?.round ?? null,
    toolName: extra?.toolName ?? null,
    elapsedMs: extra?.elapsedMs ?? null,
    result: extra?.result ?? null,
  })
  await sleep(80, options.signal)
}

function buildMockPlan(payload: AssembleLearningDocumentPayload): LearningDocumentAssemblyPlan {
  const topic = payload.topic.trim() || '学习主题'
  return {
    topic,
    orderedPointIds: ['kp-demo-1', 'kp-demo-2'],
    inserts: [
      {
        type: 'heading',
        forPointId: 'kp-demo-1',
        level: 2,
        text: '基础概念',
      },
      {
        type: 'refBlock',
        forPointId: 'kp-demo-1',
        refId: 'p-demo-2',
        refType: 'page',
        title: '基础概念',
      },
      {
        type: 'heading',
        forPointId: 'kp-demo-2',
        level: 2,
        text: '数据结构',
      },
      {
        type: 'refBlock',
        forPointId: 'kp-demo-2',
        refId: 'p-demo-3',
        refType: 'page',
        title: '数据结构',
      },
    ],
    warnings: [
      'Mock：知识点与材料 ID 为演示数据；无候选材料时一期不会生成正文顶替。',
    ],
  }
}

export async function assembleLearningDocumentMockStream(
  payload: AssembleLearningDocumentPayload,
  options: { onEvent: (event: LearningDocumentAssemblyProgressEvent) => void; signal?: AbortSignal },
): Promise<LearningDocumentAssemblyPlan> {
  const startedAt = Date.now()
  const elapsed = () => Date.now() - startedAt
  await emit(options, 'started', '开始编排学习文档', { elapsedMs: elapsed() })
  await emit(options, 'model_call', '正在分析相关知识点…', { round: 1, elapsedMs: elapsed() })
  await emit(options, 'tool_call', '正在搜索知识点…', {
    toolName: 'searchKnowledgePoints',
    elapsedMs: elapsed(),
  })
  await emit(options, 'tool_done', '搜索知识点 完成', {
    toolName: 'searchKnowledgePoints',
    elapsedMs: elapsed(),
  })
  await emit(options, 'tool_call', '正在整理前置顺序…', {
    toolName: 'getPointNeighborhood',
    elapsedMs: elapsed(),
  })
  await emit(options, 'tool_done', '整理顺序 完成', {
    toolName: 'getPointNeighborhood',
    elapsedMs: elapsed(),
  })
  await emit(options, 'tool_call', '正在匹配可插入材料…', {
    toolName: 'listPointInsertCandidates',
    elapsedMs: elapsed(),
  })
  await emit(options, 'tool_done', '匹配材料 完成', {
    toolName: 'listPointInsertCandidates',
    elapsedMs: elapsed(),
  })
  await emit(options, 'parsing', '正在校验编排计划…', { elapsedMs: elapsed() })
  const result = buildMockPlan(payload)
  options.onEvent({
    phase: 'completed',
    message: '学习文档编排完成',
    elapsedMs: elapsed(),
    result,
  })
  return result
}

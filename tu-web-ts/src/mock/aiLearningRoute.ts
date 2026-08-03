import type {
  GenerateLearningRoutePayload,
  GenerateLearningRouteStreamOptions,
  LearningRoutePlan,
  LearningRouteProgressEvent,
} from '@/api/aiLearningRoute'

function emit(
  options: GenerateLearningRouteStreamOptions,
  phase: LearningRouteProgressEvent['phase'],
  message: string,
  extra?: Partial<LearningRouteProgressEvent>,
) {
  options.onEvent({
    phase,
    message,
    round: extra?.round ?? null,
    toolName: extra?.toolName ?? null,
    elapsedMs: extra?.elapsedMs ?? null,
    result: extra?.result ?? null,
  })
}

export function generateLearningRouteMock(
  payload: GenerateLearningRoutePayload,
): Promise<LearningRoutePlan> {
  return generateLearningRouteMockStream(payload, { onEvent: () => {} })
}

export async function generateLearningRouteMockStream(
  payload: GenerateLearningRoutePayload,
  options: GenerateLearningRouteStreamOptions,
): Promise<LearningRoutePlan> {
  const seed = payload.seedPointIds?.[0]
  const topic = payload.topic.trim() || '学习目标'
  const followUp = payload.messages?.filter((m) => m.role === 'user').at(-1)?.content?.trim()
  const focusHint = (payload.seedPointIds?.length ?? 0) > 1
    ? `用户在侧栏选中了 ${payload.seedPointIds!.length} 个关注点，优先围绕这些点编排。`
    : '从目标倒推必要前置。'

  emit(options, 'started', '开始分析学习路线（mock）', { elapsedMs: 0 })
  await delay(80, options.signal)
  emit(options, 'model_call', '正在调用模型（第 1 轮）', { round: 1, elapsedMs: 80 })
  await delay(60, options.signal)
  emit(options, 'thinking', [
    `先理解目标「${topic}」。`,
    focusHint,
    '我会先检索库内已有知识点，再按前置关系排序；缺口处用可创建标题占位。',
  ].join('\n'), { round: 1, elapsedMs: 140 })
  await delay(100, options.signal)
  emit(options, 'tool_call', '调用 searchKnowledgePoints', {
    round: 1,
    toolName: 'searchKnowledgePoints',
    elapsedMs: 200,
  })
  await delay(80, options.signal)
  emit(options, 'tool_done', '已检索知识点', {
    round: 1,
    toolName: 'searchKnowledgePoints',
    elapsedMs: 280,
  })
  emit(options, 'model_call', '正在调用模型（第 2 轮）', { round: 2, elapsedMs: 300 })
  await delay(60, options.signal)
  emit(options, 'thinking', followUp
    ? `根据用户反馈「${followUp.slice(0, 60)}」调整粗粒度步骤，并为关键步骤补充细粒度子计划。`
    : '粗粒度两步：预备概念 → 目标；预备概念下挂两条更细的练习型子步骤。', {
    round: 2,
    elapsedMs: 360,
  })
  emit(options, 'parsing', '正在整理学习路线…', { elapsedMs: 380 })

  const plan: LearningRoutePlan = {
    topic,
    orderedItems: [
      {
        pointId: null,
        title: followUp ? `${topic} · 修订预备` : `${topic} · 预备概念`,
        summary: followUp
          ? `Mock 按反馈修订：${followUp.slice(0, 80)}`
          : 'Mock：进入目标前的预备知识点',
        estimatedHours: 1,
        children: [
          {
            pointId: null,
            title: '核心术语对照',
            summary: '细粒度：先对齐名词与记号',
            estimatedHours: 0.5,
          },
          {
            pointId: null,
            title: '最小例题',
            summary: '细粒度：用一题验证理解',
            estimatedHours: 0.5,
          },
        ],
      },
      {
        pointId: seed ?? null,
        title: topic,
        summary: 'Mock：目标知识点',
        estimatedHours: 2,
      },
    ],
    warnings: seed ? [] : ['mock: no seed point id; goal title used as new point'],
  }

  emit(options, 'completed', '学习路线分析完成（mock）', {
    elapsedMs: 420,
    result: plan,
  })
  return plan
}

function delay(ms: number, signal?: AbortSignal) {
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

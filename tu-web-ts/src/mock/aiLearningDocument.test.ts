import { describe, expect, it } from 'vitest'
import { assembleLearningDocumentMockStream } from '@/mock/aiLearningDocument'
import type { LearningDocumentAssemblyProgressEvent } from '@/api/aiLearningDocument'

describe('assembleLearningDocumentMockStream', () => {
  it('emits progress phases and a deterministic plan', async () => {
    const phases: LearningDocumentAssemblyProgressEvent['phase'][] = []
    const plan = await assembleLearningDocumentMockStream(
      { topic: '数据结构', kbId: 'kb-demo-1' },
      {
        onEvent: (event) => {
          phases.push(event.phase)
        },
      },
    )

    expect(phases[0]).toBe('started')
    expect(phases).toContain('tool_call')
    expect(phases).toContain('parsing')
    expect(phases.at(-1)).toBe('completed')
    expect(plan.topic).toBe('数据结构')
    expect(plan.orderedPointIds).toEqual(['kp-demo-1', 'kp-demo-2'])
    expect(plan.inserts.every((item) => item.type !== 'paragraph' as string)).toBe(true)
    expect(plan.inserts.some((item) => item.type === 'heading')).toBe(true)
    expect(plan.inserts.some((item) => item.type === 'refBlock')).toBe(true)
  })

  it('supports abort', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      assembleLearningDocumentMockStream(
        { topic: 'x', kbId: 'kb-demo-1' },
        {
          signal: controller.signal,
          onEvent: () => undefined,
        },
      ),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })
})

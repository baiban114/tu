import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { LearningRoutePlan } from '@/api/aiLearningRoute'
import { flattenLearningRouteItems, applyLearningRoutePlan } from './applyLearningRoute'

const createKnowledgePoint = vi.fn()
const updateKnowledgePoint = vi.fn()
const listKnowledgePoints = vi.fn()
const createKnowledgeRelation = vi.fn()
const listKnowledgeRelationsByPoint = vi.fn()

vi.mock('@/api/knowledgePoint', () => ({
  createKnowledgePoint: (...args: unknown[]) => createKnowledgePoint(...args),
  updateKnowledgePoint: (...args: unknown[]) => updateKnowledgePoint(...args),
  listKnowledgePoints: (...args: unknown[]) => listKnowledgePoints(...args),
}))

vi.mock('@/api/knowledgeRelation', () => ({
  createKnowledgeRelation: (...args: unknown[]) => createKnowledgeRelation(...args),
  listKnowledgeRelationsByPoint: (...args: unknown[]) => listKnowledgeRelationsByPoint(...args),
}))

describe('flattenLearningRouteItems', () => {
  it('flattens parent then children depth-first', () => {
    const flat = flattenLearningRouteItems([
      {
        title: 'A',
        children: [{ title: 'A1' }, { title: 'A2', children: [{ title: 'A2a' }] }],
      },
      { title: 'B' },
    ])
    expect(flat.map((item) => item.title)).toEqual(['A', 'A1', 'A2', 'A2a', 'B'])
  })
})

describe('applyLearningRoutePlan', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listKnowledgePoints.mockResolvedValue({ items: [], total: 0, page: 0, pageSize: 20 })
    listKnowledgeRelationsByPoint.mockResolvedValue({ outgoing: [], incoming: [] })
    createKnowledgeRelation.mockResolvedValue({})
    let seq = 0
    createKnowledgePoint.mockImplementation(async (_kbId: string, payload: { title: string; parentId?: string }) => {
      seq += 1
      return { id: `kp-${seq}`, title: payload.title, parentId: payload.parentId ?? null }
    })
    updateKnowledgePoint.mockResolvedValue({})
  })

  it('creates children with parentId and wires adjacent prerequisite edges', async () => {
    const plan: LearningRoutePlan = {
      topic: '图论',
      orderedItems: [
        {
          title: '预备',
          children: [
            { title: '术语' },
            { title: '例题' },
          ],
        },
        { title: '图论' },
      ],
    }

    const result = await applyLearningRoutePlan('kb-1', plan)

    expect(createKnowledgePoint).toHaveBeenCalledTimes(4)
    expect(createKnowledgePoint.mock.calls[0][1]).toMatchObject({ title: '预备', parentId: undefined })
    expect(createKnowledgePoint.mock.calls[1][1]).toMatchObject({ title: '术语', parentId: 'kp-1' })
    expect(createKnowledgePoint.mock.calls[2][1]).toMatchObject({ title: '例题', parentId: 'kp-1' })
    expect(createKnowledgePoint.mock.calls[3][1]).toMatchObject({ title: '图论', parentId: undefined })

    expect(result.orderedPointIds).toEqual(['kp-1', 'kp-2', 'kp-3', 'kp-4'])
    expect(result.parentedCount).toBe(2)
    expect(createKnowledgeRelation).toHaveBeenCalledTimes(3)
    expect(createKnowledgeRelation.mock.calls[0][1]).toMatchObject({
      fromPointId: 'kp-2',
      toPointId: 'kp-1',
      relationTypeKey: 'prerequisite',
    })
  })

  it('reparents existing matched points under the plan parent', async () => {
    listKnowledgePoints.mockResolvedValue({
      items: [{ id: 'kp-exist', title: '术语', parentId: null }],
      total: 1,
      page: 0,
      pageSize: 20,
    })
    createKnowledgePoint.mockImplementation(async (_kbId: string, payload: { title: string }) => ({
      id: 'kp-parent',
      title: payload.title,
      parentId: null,
    }))

    await applyLearningRoutePlan('kb-1', {
      topic: 't',
      orderedItems: [
        {
          title: '预备',
          children: [{ title: '术语' }],
        },
      ],
    })

    expect(updateKnowledgePoint).toHaveBeenCalledWith('kp-exist', { parentId: 'kp-parent' })
  })
})

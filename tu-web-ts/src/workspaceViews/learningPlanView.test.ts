import { describe, expect, it } from 'vitest'
import type { KnowledgeGraphResponse } from '@/api/types'
import {
  assembleLearningPlanSnapshot,
  goalFromLearningInProgress,
  goalFromStudyflowGoal,
  locatorsFromLearningInProgress,
  mergeKnowledgeGraphs,
  orderPointsForLearning,
  paginateLearningPlanRows,
} from './learningPlanView'

function graph(partial: Partial<KnowledgeGraphResponse>): KnowledgeGraphResponse {
  return {
    nodes: [],
    edges: [],
    meta: {
      mode: 'prerequisite',
      totalPoints: 0,
      totalRelations: 0,
      truncated: false,
      warnings: [],
    },
    ...partial,
  }
}

describe('learningPlanView', () => {
  it('builds locators from learning-in-progress (excerpt then item)', () => {
    const locators = locatorsFromLearningInProgress({
      resourceItemId: 'ri-1',
      resourceExcerptId: 're-9',
      snapshot: { resourceTitle: '算法导论' },
      updatedAt: 1,
    })
    expect(locators).toEqual([
      'resource:ri-1:excerpt:re-9',
      'resource:ri-1',
    ])
    expect(goalFromLearningInProgress({
      resourceItemId: 'ri-1',
      resourceExcerptId: 're-9',
      snapshot: { resourceTitle: '算法导论' },
      updatedAt: 1,
    }).label).toBe('算法导论')
  })

  it('maps studyflow goal to seed point and locators', () => {
    const goal = goalFromStudyflowGoal({
      id: 'lg-1',
      title: '图算法',
      knowledgePointId: 'kp-9',
      resourceItemId: 'ri-1',
      resourceExcerptId: 're-2',
    })
    expect(goal.source).toBe('studyflow-goal')
    expect(goal.seedPointIds).toEqual(['kp-9'])
    expect(goal.locators[0]).toBe('resource:ri-1:excerpt:re-2')
    expect(goal.studyflowGoalId).toBe('lg-1')
  })

  it('orders prerequisites before dependents', () => {
    const rows = orderPointsForLearning(
      [
        { id: 'a', title: 'A', sortOrder: 0 },
        { id: 'b', title: 'B', sortOrder: 0 },
        { id: 'c', title: 'C', sortOrder: 0 },
      ],
      [
        {
          id: 'e1',
          fromPointId: 'c',
          toPointId: 'b',
          relationTypeKey: 'prerequisite',
          label: '前置',
          bidirectional: false,
        },
        {
          id: 'e2',
          fromPointId: 'b',
          toPointId: 'a',
          relationTypeKey: 'prerequisite',
          label: '前置',
          bidirectional: false,
        },
      ],
      new Set(['c']),
    )
    expect(rows.map((r) => r.pointId)).toEqual(['a', 'b', 'c'])
    expect(rows.find((r) => r.pointId === 'c')?.role).toBe('goal')
    expect(rows.find((r) => r.pointId === 'a')?.role).toBe('prerequisite')
  })

  it('merges graphs and assembles snapshot', () => {
    const merged = mergeKnowledgeGraphs([
      graph({
        nodes: [{ id: 'g', title: 'Goal', sortOrder: 0 }],
        edges: [],
        meta: {
          mode: 'prerequisite',
          totalPoints: 1,
          totalRelations: 0,
          truncated: true,
          warnings: ['cycle'],
        },
      }),
      graph({
        nodes: [
          { id: 'g', title: 'Goal', sortOrder: 0 },
          { id: 'p', title: 'Prereq', sortOrder: 0 },
        ],
        edges: [{
          id: 'e1',
          fromPointId: 'g',
          toPointId: 'p',
          relationTypeKey: 'prerequisite',
          label: '前置',
          bidirectional: false,
        }],
      }),
    ])
    expect(merged.nodes).toHaveLength(2)
    expect(merged.truncated).toBe(true)
    expect(merged.warnings).toEqual(['cycle'])

    const snapshot = assembleLearningPlanSnapshot({
      kbId: 'kb-1',
      goal: {
        source: 'manual-point',
        label: 'Goal',
        locators: [],
        seedPointIds: ['g'],
      },
      seedPointIds: ['g'],
      graphs: [
        graph({
          nodes: merged.nodes,
          edges: merged.edges,
          meta: {
            mode: 'prerequisite',
            totalPoints: 2,
            totalRelations: 1,
            truncated: false,
            warnings: [],
          },
        }),
      ],
      builtAt: 42,
    })
    expect(snapshot.rows.map((r) => r.pointId)).toEqual(['p', 'g'])
    expect(snapshot.builtAt).toBe(42)
  })

  it('paginates rows with fixed page size', () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({
      pointId: `p${i}`,
      title: `T${i}`,
      role: 'prerequisite' as const,
      order: i,
    }))
    const page0 = paginateLearningPlanRows(rows, 0, 10)
    expect(page0.items).toHaveLength(10)
    expect(page0.total).toBe(12)
    const page1 = paginateLearningPlanRows(rows, 1, 10)
    expect(page1.items).toHaveLength(2)
    expect(page1.page).toBe(1)
  })
})

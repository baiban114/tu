import { describe, expect, it } from 'vitest'
import type { KnowledgePoint, KnowledgePointAnchor, KnowledgeRelation } from '@/api/types'
import { composeKnowledgePointDocument } from './composeKnowledgePointDocument'
import { getKnowledgePointDisplayTypeDef, registerKnowledgePointDisplayTypeDef } from './displayTypeRegistry'
import { resolveKnowledgePointDisplayTypeCode } from './resolveDisplayType'
import {
  knowledgePointDocumentToMarkdown,
  knowledgePointDocumentToTipTapDoc,
  parseKnowledgePointDisplayComment,
  serializeKnowledgePointDisplayComment,
} from './serializeDocumentView'
import { registerKnowledgePointDisplayStrategy } from './strategies/registry'
import type { KnowledgePointDisplayDataPort } from './types'
import type { KnowledgePointDocumentDisplayStrategy } from './strategies/types'

function point(partial: Partial<KnowledgePoint> & Pick<KnowledgePoint, 'id' | 'title'>): KnowledgePoint {
  return {
    kbId: 'kb-1',
    status: 'active',
    sortOrder: 0,
    ...partial,
  }
}

function relation(partial: Partial<KnowledgeRelation> & Pick<KnowledgeRelation, 'id' | 'fromPointId' | 'toPointId' | 'relationTypeKey'>): KnowledgeRelation {
  return {
    kbId: 'kb-1',
    relationTypeLabel: partial.relationTypeKey,
    bidirectional: false,
    sourceProvenance: 'user',
    status: 'active',
    ...partial,
  }
}

function createFakePort(opts: {
  points: KnowledgePoint[]
  outgoing?: KnowledgeRelation[]
  incoming?: KnowledgeRelation[]
  anchors?: KnowledgePointAnchor[]
}): KnowledgePointDisplayDataPort {
  const byId = new Map(opts.points.map((p) => [p.id, p]))
  return {
    async getPoint(id) {
      const found = byId.get(id)
      if (!found) throw new Error(`missing ${id}`)
      return found
    },
    async listRelationsByPoint() {
      return {
        outgoing: opts.outgoing ?? [],
        incoming: opts.incoming ?? [],
      }
    },
    async listAnchors() {
      return opts.anchors ?? []
    },
  }
}

describe('resolveKnowledgePointDisplayTypeCode', () => {
  it('prefers override, then point field, then concept', () => {
    expect(resolveKnowledgePointDisplayTypeCode(point({ id: 'a', title: 'A' }))).toBe('concept')
    expect(resolveKnowledgePointDisplayTypeCode(point({ id: 'a', title: 'A', displayTypeCode: 'case' }))).toBe('case')
    expect(resolveKnowledgePointDisplayTypeCode(
      point({ id: 'a', title: 'A', displayTypeCode: 'case' }),
      'prerequisite_chain',
    )).toBe('prerequisite_chain')
  })
})

describe('composeKnowledgePointDocument', () => {
  it('composes concept display from summary, relations and anchors', async () => {
    const self = point({
      id: 'p1',
      title: '函数',
      summary: '映射关系',
      aliases: ['映射'],
    })
    const pre = point({ id: 'p0', title: '集合' })
    const related = point({ id: 'p2', title: '导数', summary: '变化率' })

    const vm = await composeKnowledgePointDocument({
      kbId: 'kb-1',
      pointId: 'p1',
      data: createFakePort({
        points: [self, pre, related],
        outgoing: [
          relation({ id: 'r1', fromPointId: 'p1', toPointId: 'p2', relationTypeKey: 'related' }),
        ],
        incoming: [
          relation({ id: 'r2', fromPointId: 'p0', toPointId: 'p1', relationTypeKey: 'prerequisite' }),
        ],
        anchors: [
          {
            id: 'a1',
            knowledgePointId: 'p1',
            kind: 'heading',
            locator: 'page:pg1/heading:h1',
            snapshot: { title: '第一章' },
            role: 'evidence',
            primary: true,
          },
        ],
      }),
    })

    expect(vm.title).toBe('函数')
    expect(vm.displayTypeCode).toBe('concept')
    expect(vm.sections.map((s) => s.key)).toEqual(['summary', 'aliases', 'related', 'prerequisites', 'evidence'])
    expect(vm.sections.find((s) => s.key === 'related')?.points?.[0]).toMatchObject({
      id: 'p2',
      title: '导数',
    })
    expect(vm.sections.find((s) => s.key === 'prerequisites')?.points?.[0]).toMatchObject({
      id: 'p0',
      title: '集合',
    })
    expect(vm.sections.find((s) => s.key === 'evidence')?.anchors?.[0].label).toBe('第一章')
  })

  it('uses prerequisite_chain slots for in/out prerequisite edges', async () => {
    const self = point({ id: 'p1', title: '极限', displayTypeCode: 'prerequisite_chain' })
    const vm = await composeKnowledgePointDocument({
      kbId: 'kb-1',
      pointId: 'p1',
      data: createFakePort({
        points: [
          self,
          point({ id: 'pre', title: '连续' }),
          point({ id: 'next', title: '导数' }),
        ],
        outgoing: [
          relation({ id: 'r1', fromPointId: 'p1', toPointId: 'next', relationTypeKey: 'prerequisite' }),
        ],
        incoming: [
          relation({ id: 'r2', fromPointId: 'pre', toPointId: 'p1', relationTypeKey: 'prerequisite' }),
        ],
      }),
    })
    expect(vm.displayTypeCode).toBe('prerequisite_chain')
    expect(vm.sections.map((s) => s.key)).toEqual(['prerequisites', 'successors'])
  })

  it('allows registering a custom strategy for a display type', async () => {
    const custom: KnowledgePointDocumentDisplayStrategy = {
      id: 'stubStrategy',
      async compose(ctx) {
        return {
          pointId: ctx.pointId,
          displayTypeCode: 'stub',
          title: 'stub-title',
          sections: [{ key: 'x', title: 'X', kind: 'text', body: 'hello' }],
          binding: { pointId: ctx.pointId, displayTypeCode: 'stub', title: 'stub-title' },
        }
      },
    }
    registerKnowledgePointDisplayStrategy(custom)
    registerKnowledgePointDisplayTypeDef({
      code: 'stub',
      name: 'Stub',
      strategyId: 'stubStrategy',
      compose: { includeSummary: false, relationSlots: [], anchorSlots: [] },
    })

    const vm = await composeKnowledgePointDocument({
      kbId: 'kb-1',
      pointId: 'p1',
      displayTypeCode: 'stub',
      data: createFakePort({ points: [point({ id: 'p1', title: 'ignored' })] }),
    })
    expect(vm.title).toBe('stub-title')
    expect(vm.sections[0].body).toBe('hello')
    expect(getKnowledgePointDisplayTypeDef('stub').strategyId).toBe('stubStrategy')
  })
})

describe('serializeDocumentView', () => {
  it('roundtrips display comment and renders markdown / tip tap', async () => {
    const vm = await composeKnowledgePointDocument({
      kbId: 'kb-1',
      pointId: 'p1',
      data: createFakePort({
        points: [point({ id: 'p1', title: '集合', summary: '无序对象组' })],
      }),
    })
    const comment = serializeKnowledgePointDisplayComment(vm)
    expect(comment).toContain('point="p1"')
    expect(comment).toContain('type="concept"')
    const attrs = comment.replace(/^<!--tu:knowledge-point-display\s+/, '').replace(/-->$/, '')
    expect(parseKnowledgePointDisplayComment(attrs)).toEqual({
      pointId: 'p1',
      displayTypeCode: 'concept',
      title: '集合',
    })

    const md = knowledgePointDocumentToMarkdown(vm)
    expect(md).toContain('## 集合')
    expect(md).toContain('### 摘要')
    expect(md).toContain('无序对象组')

    const doc = knowledgePointDocumentToTipTapDoc(vm)
    expect(doc.type).toBe('doc')
    expect(doc.content?.[0]).toMatchObject({ type: 'heading', attrs: { level: 2 } })
  })
})

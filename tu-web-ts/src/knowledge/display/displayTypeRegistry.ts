import type { KnowledgePointDisplayTypeDef } from './types'

export const DEFAULT_KNOWLEDGE_POINT_DISPLAY_TYPE = 'concept'

/**
 * Built-in display type registry (config-driven).
 * Most types share strategyId `relationCompose` and differ only by compose slots.
 */
export const BUILTIN_KNOWLEDGE_POINT_DISPLAY_TYPES: KnowledgePointDisplayTypeDef[] = [
  {
    code: 'concept',
    name: '概念',
    description: '摘要 + 相关/联想点 + 主要证据',
    strategyId: 'relationCompose',
    compose: {
      includeSummary: true,
      includeAliases: true,
      relationSlots: [
        {
          key: 'related',
          title: '相关知识点',
          relationTypeKeys: ['related', 'association'],
          direction: 'both',
          limit: 12,
        },
        {
          key: 'prerequisites',
          title: '前置',
          relationTypeKeys: ['prerequisite'],
          direction: 'in',
          limit: 8,
        },
      ],
      anchorSlots: [
        {
          key: 'evidence',
          title: '证据位置',
          primaryFirst: true,
          limit: 8,
        },
      ],
    },
  },
  {
    code: 'case',
    name: '案例',
    description: '案例摘要 + 关联概念 + 依据边 + 资源/页证据',
    strategyId: 'relationCompose',
    compose: {
      includeSummary: true,
      relationSlots: [
        {
          key: 'concepts',
          title: '关联概念',
          relationTypeKeys: ['case', 'related', 'association'],
          direction: 'both',
          limit: 12,
        },
        {
          key: 'basis',
          title: '依据',
          relationTypeKeys: ['basis'],
          direction: 'out',
          limit: 8,
        },
      ],
      anchorSlots: [
        {
          key: 'evidence',
          title: '案例证据',
          anchorKinds: ['page', 'heading', 'section', 'annotation', 'resourceExcerpt', 'resourceItem'],
          primaryFirst: true,
          limit: 10,
        },
      ],
    },
  },
  {
    code: 'prerequisite_chain',
    name: '前置链',
    description: '摘要 + 前驱/后继（学习路线向）',
    strategyId: 'relationCompose',
    compose: {
      includeSummary: true,
      relationSlots: [
        {
          key: 'prerequisites',
          title: '前置知识点',
          relationTypeKeys: ['prerequisite'],
          direction: 'in',
          limit: 16,
        },
        {
          key: 'successors',
          title: '后继知识点',
          relationTypeKeys: ['prerequisite'],
          direction: 'out',
          limit: 16,
        },
      ],
      anchorSlots: [],
    },
  },
  {
    code: 'source_linked',
    name: '来源关联',
    description: '摘要 + source 边 + 资源/标题证据',
    strategyId: 'relationCompose',
    compose: {
      includeSummary: true,
      relationSlots: [
        {
          key: 'sources',
          title: '来源',
          relationTypeKeys: ['source', 'cites'],
          direction: 'both',
          limit: 12,
        },
      ],
      anchorSlots: [
        {
          key: 'resourceEvidence',
          title: '资源证据',
          anchorKinds: ['resourceItem', 'resourceExcerpt', 'heading'],
          primaryFirst: true,
          limit: 10,
        },
      ],
    },
  },
]

const byCode = new Map(
  BUILTIN_KNOWLEDGE_POINT_DISPLAY_TYPES.map((def) => [def.code, def] as const),
)

export function getKnowledgePointDisplayTypeDef(
  code: string | null | undefined,
): KnowledgePointDisplayTypeDef {
  const key = (code || DEFAULT_KNOWLEDGE_POINT_DISPLAY_TYPE).trim() || DEFAULT_KNOWLEDGE_POINT_DISPLAY_TYPE
  return byCode.get(key) || byCode.get(DEFAULT_KNOWLEDGE_POINT_DISPLAY_TYPE)!
}

export function listKnowledgePointDisplayTypeDefs(): KnowledgePointDisplayTypeDef[] {
  return [...BUILTIN_KNOWLEDGE_POINT_DISPLAY_TYPES]
}

export function registerKnowledgePointDisplayTypeDef(def: KnowledgePointDisplayTypeDef): void {
  byCode.set(def.code, def)
}

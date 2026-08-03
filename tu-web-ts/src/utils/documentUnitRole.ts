import type { TextAnnotation } from '@/api/types'

/** Document-unit role for SPS (system / problem / solution) writing. */
export type DocumentUnitRole = 'system' | 'problem' | 'solution'

export const DOCUMENT_UNIT_ROLES: readonly DocumentUnitRole[] = [
  'system',
  'problem',
  'solution',
] as const

export const DOCUMENT_UNIT_ROLE_LABEL: Record<DocumentUnitRole, string> = {
  system: '系统',
  problem: '问题',
  solution: '解决方案',
}

/** Highlight colors aligned with existing annotation palette. */
export const DOCUMENT_UNIT_ROLE_COLOR: Record<DocumentUnitRole, string> = {
  system: '#CFD8DC',
  problem: '#FFCC80',
  solution: '#80CBC4',
}

export const DOCUMENT_UNIT_ROLE_SHADOW: Record<DocumentUnitRole, string> = {
  system: 'box-shadow:0 0 0 2px rgba(96,125,139,0.4)',
  problem: 'box-shadow:0 0 0 2px rgba(255,152,0,0.4)',
  solution: 'box-shadow:0 0 0 2px rgba(0,150,136,0.4)',
}

export function isDocumentUnitRole(value: unknown): value is DocumentUnitRole {
  return value === 'system' || value === 'problem' || value === 'solution'
}

export function documentUnitRoleLabel(role: DocumentUnitRole | null | undefined): string {
  if (!role || !isDocumentUnitRole(role)) return ''
  return DOCUMENT_UNIT_ROLE_LABEL[role]
}

export function documentUnitRoleColor(role: DocumentUnitRole | null | undefined): string {
  if (!role || !isDocumentUnitRole(role)) return '#CFD8DC'
  return DOCUMENT_UNIT_ROLE_COLOR[role]
}

export function annotationUnitRole(ann: TextAnnotation): DocumentUnitRole | null {
  if (ann.kind !== 'unitRole') return null
  return isDocumentUnitRole(ann.unitRole) ? ann.unitRole : null
}

/** TipTap JSON for slash 「系统设计模板」: three h2 sections with empty paragraphs. */
export function buildSpsTemplateContent(): {
  type: 'doc'
  content: Array<Record<string, unknown>>
} {
  const section = (title: string) => ([
    {
      type: 'heading',
      attrs: { level: 2, blockId: '' },
      content: [{ type: 'text', text: title }],
    },
    {
      type: 'paragraph',
      attrs: { blockId: '' },
    },
  ])
  return {
    type: 'doc',
    content: [
      ...section(DOCUMENT_UNIT_ROLE_LABEL.system),
      ...section(DOCUMENT_UNIT_ROLE_LABEL.problem),
      ...section(DOCUMENT_UNIT_ROLE_LABEL.solution),
    ],
  }
}

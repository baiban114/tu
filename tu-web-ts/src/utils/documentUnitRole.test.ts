import { describe, expect, it } from 'vitest'
import {
  DOCUMENT_UNIT_ROLE_COLOR,
  DOCUMENT_UNIT_ROLE_LABEL,
  annotationUnitRole,
  buildSpsTemplateContent,
  documentUnitRoleLabel,
  isDocumentUnitRole,
} from './documentUnitRole'
import type { TextAnnotation } from '@/api/types'

describe('documentUnitRole', () => {
  it('validates roles', () => {
    expect(isDocumentUnitRole('system')).toBe(true)
    expect(isDocumentUnitRole('problem')).toBe(true)
    expect(isDocumentUnitRole('solution')).toBe(true)
    expect(isDocumentUnitRole('note')).toBe(false)
  })

  it('labels and colors cover all roles', () => {
    expect(DOCUMENT_UNIT_ROLE_LABEL.system).toBe('系统')
    expect(DOCUMENT_UNIT_ROLE_LABEL.problem).toBe('问题')
    expect(DOCUMENT_UNIT_ROLE_LABEL.solution).toBe('解决方案')
    expect(DOCUMENT_UNIT_ROLE_COLOR.system).toBeTruthy()
    expect(documentUnitRoleLabel('problem')).toBe('问题')
  })

  it('reads unitRole from annotations', () => {
    const ann: TextAnnotation = {
      id: '1',
      kind: 'unitRole',
      unitRole: 'solution',
      selectedText: 'x',
      contextBefore: '',
      contextAfter: '',
      note: '',
      color: '#80CBC4',
      createdAt: 1,
      updatedAt: 1,
    }
    expect(annotationUnitRole(ann)).toBe('solution')
    expect(annotationUnitRole({ ...ann, kind: 'note' })).toBeNull()
  })

  it('builds SPS template with three h2 sections', () => {
    const doc = buildSpsTemplateContent()
    const headings = doc.content.filter((node) => node.type === 'heading')
    expect(headings).toHaveLength(3)
    expect((headings[0].content as Array<{ text: string }>)[0].text).toBe('系统')
    expect((headings[1].content as Array<{ text: string }>)[0].text).toBe('问题')
    expect((headings[2].content as Array<{ text: string }>)[0].text).toBe('解决方案')
  })
})

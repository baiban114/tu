import { describe, expect, it } from 'vitest'
import type { AssemblyInsert, LearningDocumentAssemblyPlan } from '@/api/aiLearningDocument'
import {
  assemblyInsertKey,
  assemblyInsertsToDocument,
  filterSelectedInserts,
} from '@/utils/learningDocumentAssembly'

describe('learningDocumentAssembly', () => {
  const inserts: AssemblyInsert[] = [
    { type: 'heading', forPointId: 'kp-1', level: 2, text: '基础概念' },
    { type: 'refBlock', forPointId: 'kp-1', refId: 'p-1', refType: 'page', title: '笔记' },
    {
      type: 'externalResourceBlock',
      forPointId: 'kp-1',
      itemId: 'ri-1',
      excerptId: 're-1',
      title: '节选',
    },
    {
      type: 'pdfExcerptBlock',
      forPointId: 'kp-1',
      fileId: 'file-1',
      startPage: 2,
      endPage: 3,
      title: 'PDF',
    },
  ]

  it('builds tipTap document from inserts without prose paragraphs', () => {
    const doc = assemblyInsertsToDocument(inserts)
    expect(doc.type).toBe('doc')
    expect(doc.content?.map((n) => n.type)).toEqual([
      'heading',
      'refBlock',
      'externalResourceBlock',
      'pdfExcerptBlock',
    ])
    expect(doc.content?.[0]?.content?.[0]).toMatchObject({ type: 'text', text: '基础概念' })
    expect(doc.content?.[1]?.attrs).toMatchObject({ refId: 'p-1', refType: 'page' })
    expect(doc.content?.[2]?.attrs?.externalResource).toMatchObject({
      resourceItemId: 'ri-1',
      resourceExcerptId: 're-1',
      mode: 'excerpt',
    })
    expect(doc.content?.[3]?.attrs).toMatchObject({
      fileId: 'file-1',
      startPage: 2,
      endPage: 3,
    })
  })

  it('filters selected inserts by stable keys', () => {
    const plan: LearningDocumentAssemblyPlan = {
      topic: '主题',
      orderedPointIds: ['kp-1'],
      inserts,
    }
    const selected = new Set([assemblyInsertKey(inserts[0], 0), assemblyInsertKey(inserts[2], 2)])
    expect(filterSelectedInserts(plan, selected).map((item) => item.type)).toEqual([
      'heading',
      'externalResourceBlock',
    ])
  })

  it('returns empty paragraph placeholder when no inserts', () => {
    const doc = assemblyInsertsToDocument([])
    expect(doc.content).toEqual([{ type: 'paragraph' }])
  })
})

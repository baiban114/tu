import type { JSONContent } from '@tiptap/core'
import type { AssemblyInsert, LearningDocumentAssemblyPlan } from '@/api/aiLearningDocument'
import { createPdfExcerptBlockId, PDF_EXCERPT_DEFAULT_HEIGHT } from '@/utils/pdfExcerpt'

export function assemblyInsertKey(insert: AssemblyInsert, index: number): string {
  switch (insert.type) {
    case 'heading':
      return `heading:${insert.forPointId}:${insert.text}:${index}`
    case 'refBlock':
      return `refBlock:${insert.forPointId}:${insert.refType}:${insert.refId}:${index}`
    case 'externalResourceBlock':
      return `externalResourceBlock:${insert.forPointId}:${insert.itemId}:${insert.excerptId || ''}:${index}`
    case 'pdfExcerptBlock':
      return `pdfExcerptBlock:${insert.forPointId}:${insert.fileId}:${insert.startPage || ''}:${insert.endPage || ''}:${index}`
    default:
      return `unknown:${index}`
  }
}

export function assemblyInsertLabel(insert: AssemblyInsert): string {
  switch (insert.type) {
    case 'heading':
      return `标题：${insert.text}`
    case 'refBlock':
      return `引用${insert.refType === 'page' ? '页面' : '块'}：${insert.title?.trim() || insert.refId}`
    case 'externalResourceBlock':
      return insert.excerptId
        ? `资源节选：${insert.title?.trim() || insert.excerptId}`
        : `外部资源：${insert.title?.trim() || insert.itemId}`
    case 'pdfExcerptBlock': {
      const range =
        insert.startPage != null
          ? ` p.${insert.startPage}${insert.endPage != null && insert.endPage !== insert.startPage ? `-${insert.endPage}` : ''}`
          : ''
      return `PDF 摘页：${insert.title?.trim() || insert.fileId}${range}`
    }
    default:
      return '未知材料'
  }
}

function newBlockId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().replace(/-/g, '')}`
}

function insertToNode(insert: AssemblyInsert): JSONContent | null {
  switch (insert.type) {
    case 'heading': {
      const level = Math.min(6, Math.max(1, Number(insert.level) || 2))
      const text = insert.text.trim()
      if (!text) return null
      return {
        type: 'heading',
        attrs: { level, blockId: newBlockId('h') },
        content: [{ type: 'text', text }],
      }
    }
    case 'refBlock': {
      if (!insert.refId.trim()) return null
      return {
        type: 'refBlock',
        attrs: {
          blockId: newBlockId('ref'),
          title: insert.title?.trim() || '',
          headingLevel: 0,
          refId: insert.refId,
          refType: insert.refType === 'page' ? 'page' : 'block',
          width: null,
          height: null,
          metadata: {},
          sectionCollapsed: false,
        },
      }
    }
    case 'externalResourceBlock': {
      if (!insert.itemId.trim()) return null
      const excerptId = insert.excerptId?.trim() || null
      return {
        type: 'externalResourceBlock',
        attrs: {
          blockId: newBlockId('er'),
          title: insert.title?.trim() || '',
          headingLevel: 0,
          width: null,
          height: null,
          externalResource: {
            resourceItemId: insert.itemId,
            resourceExcerptId: excerptId,
            mode: excerptId ? 'excerpt' : 'resource',
            snapshot: { resourceTitle: insert.title?.trim() || '' },
          },
          metadata: {},
          sectionCollapsed: false,
        },
      }
    }
    case 'pdfExcerptBlock': {
      if (!insert.fileId.trim()) return null
      const startPage = Math.max(1, Number(insert.startPage) || 1)
      const endPage = Math.max(startPage, Number(insert.endPage) || startPage)
      const title = insert.title?.trim() || ''
      return {
        type: 'pdfExcerptBlock',
        attrs: {
          blockId: createPdfExcerptBlockId(),
          fileId: insert.fileId,
          fileName: title || 'PDF',
          viewMode: 'excerpt',
          startPage,
          endPage,
          height: PDF_EXCERPT_DEFAULT_HEIGHT,
          clipTop: 0,
          clipBottom: 1,
          notesVisible: false,
          title,
          sourceHref: '',
          sourceLabel: title,
        },
      }
    }
    default:
      return null
  }
}

/** Build a TipTap document from selected assembly inserts only (no AI prose). */
export function assemblyInsertsToDocument(inserts: AssemblyInsert[]): JSONContent {
  const content: JSONContent[] = []
  for (const insert of inserts) {
    const node = insertToNode(insert)
    if (node) content.push(node)
  }
  if (!content.length) {
    content.push({ type: 'paragraph' })
  }
  return { type: 'doc', content }
}

export function filterSelectedInserts(
  plan: LearningDocumentAssemblyPlan,
  selectedKeys: Set<string>,
): AssemblyInsert[] {
  return plan.inserts.filter((insert, index) => selectedKeys.has(assemblyInsertKey(insert, index)))
}

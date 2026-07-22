import { buildFileUrl } from '@/api/fileStorage'
import {
  extractStoredFileId,
  resolveAccessUrlInsertKind,
} from '@/utils/accessUrlInsert'
import { acquirePdfDocument, releasePdfDocument } from '@/utils/pdfDocumentCache'
import {
  buildPdfSidebarTree,
  type PdfSidebarNode,
  type PdfSidebarSource,
} from '@/utils/pdfOutline'
import { formatResourcePositionLocator } from '@/utils/resourcePositionLocator'

/** Keep local type codes to avoid pulling heavy api/mock graph into unit tests. */
const BOOK_RESOURCE_TYPE_CODE = 'book'
const DOCUMENT_RESOURCE_TYPE_CODE = 'document'

export interface ChapterOutlineLoadResult {
  ok: boolean
  message?: string
  source?: PdfSidebarSource
  nodes: PdfSidebarNode[]
  loadUrl?: string
}

export interface ChapterFieldsFromOutline {
  title: string
  locator?: string
}

export function resolvePdfLoadUrl(accessUrl: string): string {
  const trimmed = accessUrl.trim()
  const fileId = extractStoredFileId(trimmed)
  if (fileId) return buildFileUrl(fileId)
  return trimmed
}

export function chapterFieldsFromOutlineNode(node: PdfSidebarNode): ChapterFieldsFromOutline {
  const title = node.title.trim().slice(0, 255) || '未命名'
  const locator = node.pageNumber != null && node.pageNumber > 0
    ? formatResourcePositionLocator({ kind: 'page', page: node.pageNumber })
    : undefined
  return { title, locator: locator || undefined }
}

/**
 * Load chapter-structure candidates from a resource entity.
 * Access URL is only the open/load handle; algorithm depends on resource type + content kind.
 * Book/document + PDF → PDF outline bookmarks (fallback: page list when outline missing).
 */
export async function loadChapterStructureFromResource(options: {
  typeCode?: string | null
  accessUrl: string
}): Promise<ChapterOutlineLoadResult> {
  const accessUrl = options.accessUrl.trim()
  if (!accessUrl) {
    return { ok: false, message: '请选择访问地址以打开资源', nodes: [] }
  }

  const typeCode = options.typeCode?.trim() || ''
  if (typeCode !== BOOK_RESOURCE_TYPE_CODE && typeCode !== DOCUMENT_RESOURCE_TYPE_CODE) {
    return {
      ok: false,
      message: '当前资源类型暂不支持从资源内容判断章节（图书/文档的站内 PDF 可从书签判断）',
      nodes: [],
    }
  }

  const kind = await resolveAccessUrlInsertKind(accessUrl)
  if (kind !== 'pdf') {
    return {
      ok: false,
      message: '访问内容不是 PDF。站内 PDF 图书请从书签/目录判断章节结构',
      nodes: [],
    }
  }

  const loadUrl = resolvePdfLoadUrl(accessUrl)
  try {
    const doc = await acquirePdfDocument(loadUrl)
    try {
      const total = Math.max(1, doc.numPages)
      const { nodes, source } = await buildPdfSidebarTree(doc, 1, total, {
        viewMode: 'full',
        skipPageListOver: 500,
      })
      if (nodes.length === 0) {
        return {
          ok: false,
          message: source === 'outline'
            ? 'PDF 书签为空'
            : 'PDF 无书签，且页数过多无法列出页目录；请手工填写章节',
          source,
          nodes: [],
          loadUrl,
        }
      }
      return {
        ok: true,
        source,
        nodes,
        loadUrl,
        message: source === 'outline'
          ? `已读取 PDF 书签（${countOutlineNodes(nodes)} 项）`
          : `无书签，已列出页目录（${nodes.length} 页）`,
      }
    } finally {
      releasePdfDocument(loadUrl)
    }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : '无法打开 PDF 访问地址',
      nodes: [],
      loadUrl,
    }
  }
}

export function countOutlineNodes(nodes: PdfSidebarNode[]): number {
  let total = 0
  const walk = (list: PdfSidebarNode[]) => {
    for (const node of list) {
      total += 1
      if (node.children.length) walk(node.children)
    }
  }
  walk(nodes)
  return total
}

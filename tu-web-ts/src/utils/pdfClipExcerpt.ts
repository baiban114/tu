import {
  ensurePdfClipExcerpt,
  listResourceItems,
  type ResourceExcerpt,
} from '@/api/externalResource'
import { MAX_PAGE_SIZE } from '@/constants/pagination'
import { parseResourceLocator } from '@/editor/linkLabelSuggestQuery'
import { extractStoredFileId, listAccessUrls } from '@/utils/accessUrlInsert'
import {
  formatPdfClipLocator,
  formatPdfClipRangeLabel,
  type PdfClipGeometry,
} from '@/utils/resourcePositionLocator'

function clampClip(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, Math.round(value * 1000) / 1000))
}

function isClipActive(clipTop: number, clipBottom: number): boolean {
  return clipTop > 0.001 || clipBottom < 0.999
}

/** Build sourceHref bound to excerpt entity, with #page&clip viewport fragment. */
export function buildPdfClipExcerptSourceHref(
  resourceItemId: string,
  excerptId: string,
  geometry: PdfClipGeometry,
): string {
  const base = `resource:${resourceItemId}:excerpt:${excerptId}`
  const startPage = Math.max(1, Math.floor(Number(geometry.startPage) || 1))
  const endPage = Math.max(startPage, Math.floor(Number(geometry.endPage) || startPage))
  const clipTop = clampClip(geometry.clipTop)
  const clipBottom = clampClip(geometry.clipBottom)
  const pagePart = startPage === endPage
    ? `page=${startPage}`
    : `page=${startPage}-${endPage}`
  if (!isClipActive(clipTop, clipBottom)) {
    return `${base}#${pagePart}`
  }
  return `${base}#${pagePart}&clip=${clipTop}-${clipBottom}`
}

/**
 * Resolve resource item id for a PDF block: explicit id, sourceHref locator,
 * or reverse lookup of `/api/files/{fileId}` on resource access URLs.
 */
export async function resolveResourceItemIdForPdf(input: {
  resourceItemId?: string | null
  sourceHref?: string | null
  fileId?: string | null
}): Promise<string | null> {
  const fromRegion = String(input.resourceItemId || '').trim()
  if (fromRegion) return fromRegion

  const fromHref = parseResourceLocator(input.sourceHref)?.itemId?.trim()
  if (fromHref) return fromHref

  const fileId = String(input.fileId || '').trim()
  if (!fileId) return null
  return findResourceItemIdByStoredFileId(fileId)
}

/** Find a resource item whose access URL (or sourceUrl) points at this stored file. */
export async function findResourceItemIdByStoredFileId(fileId: string): Promise<string | null> {
  const id = String(fileId || '').trim()
  if (!id) return null
  try {
    const result = await listResourceItems({ page: 0, pageSize: MAX_PAGE_SIZE })
    for (const item of result.items) {
      const urls = listAccessUrls(item.accessUrls)
      if (item.sourceUrl) urls.push(item.sourceUrl)
      for (const url of urls) {
        if (extractStoredFileId(url) === id) return item.id
      }
    }
  } catch {
    return null
  }
  return null
}

export async function ensurePdfClipExcerptEntity(
  resourceItemId: string,
  geometry: PdfClipGeometry,
  options: { fileId?: string; title?: string } = {},
): Promise<ResourceExcerpt> {
  const startPage = Math.max(1, Math.floor(Number(geometry.startPage) || 1))
  const endPage = Math.max(startPage, Math.floor(Number(geometry.endPage) || startPage))
  const clipTop = Number(geometry.clipTop) || 0
  const clipBottom = geometry.clipBottom == null ? 1 : Number(geometry.clipBottom)
  return ensurePdfClipExcerpt(resourceItemId, {
    startPage,
    endPage,
    clipTop,
    clipBottom,
    fileId: options.fileId,
    title: options.title || formatPdfClipRangeLabel({ startPage, endPage, clipTop, clipBottom }),
  })
}

export function pdfClipLocatorKey(geometry: PdfClipGeometry): string {
  return formatPdfClipLocator(geometry).toLowerCase()
}

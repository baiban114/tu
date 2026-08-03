import type { JSONContent } from '@tiptap/core'

/**
 * Shared board cell payload for node / edge “内容”:
 * bind a real document page, or keep an abstract TipTap doc on the cell.
 */
export interface CellContentBinding {
  /** When set, rich-text edits the real page document (same identity). */
  boundPageId?: string | null
  /** Cached title for inspector display. */
  boundPageTitle?: string | null
  /**
   * Abstract document when unbound.
   * TipTap JSON (`type: 'doc'`); ignored as source of truth while bound.
   */
  contentDocument?: JSONContent | null
}

export function emptyCellContentDocument(): JSONContent {
  return {
    type: 'doc',
    content: [{ type: 'paragraph' }],
  }
}

export function readCellContentBinding(data: Record<string, unknown> | null | undefined): CellContentBinding {
  const boundPageId = typeof data?.boundPageId === 'string' && data.boundPageId.trim()
    ? data.boundPageId.trim()
    : null
  const boundPageTitle = typeof data?.boundPageTitle === 'string' && data.boundPageTitle.trim()
    ? data.boundPageTitle.trim()
    : null
  const rawDoc = data?.contentDocument
  const contentDocument = rawDoc && typeof rawDoc === 'object' && (rawDoc as JSONContent).type === 'doc'
    ? (rawDoc as JSONContent)
    : null
  return { boundPageId, boundPageTitle, contentDocument }
}

export function isCellContentBound(binding: CellContentBinding): boolean {
  return Boolean(binding.boundPageId?.trim())
}

/** Persist binding fields onto an X6 cell data object. */
export function cellContentBindingToData(binding: CellContentBinding): Record<string, unknown> {
  return {
    boundPageId: binding.boundPageId ?? null,
    boundPageTitle: binding.boundPageTitle ?? null,
    contentDocument: binding.contentDocument ?? null,
  }
}

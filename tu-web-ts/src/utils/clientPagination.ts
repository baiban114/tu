import { DEFAULT_PAGE_SIZE } from '@/constants/pagination'

export interface ClientPageSlice<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

/** Slice an in-memory list for client-side pagination (dialogs, pickers). */
export function paginateSlice<T>(
  items: readonly T[],
  page: number,
  pageSize: number = DEFAULT_PAGE_SIZE,
): ClientPageSlice<T> {
  const safePage = Math.max(0, page)
  const safeSize = Math.max(1, pageSize)
  const start = safePage * safeSize
  return {
    items: items.slice(start, start + safeSize),
    total: items.length,
    page: safePage,
    pageSize: safeSize,
  }
}

export function clampPage(page: number, total: number, pageSize: number): number {
  if (total <= 0) return 0
  const maxPage = Math.max(0, Math.ceil(total / pageSize) - 1)
  return Math.min(Math.max(0, page), maxPage)
}

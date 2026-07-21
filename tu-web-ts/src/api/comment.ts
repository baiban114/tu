import { request } from './http'
import { isMockDataSource } from '@/dev/dataSource'
import { DEFAULT_PAGE_SIZE } from '@/constants/pagination'
import type { PageResponse } from './aiRuns'
import {
  createContentCommentMock,
  deleteContentCommentMock,
  listContentCommentRepliesMock,
  listContentCommentsMock,
} from '@/mock/store'

export type { PageResponse }

export interface ContentComment {
  id: string
  pageId: string
  annotationId?: string | null
  parentId?: string | null
  authorUserId: string
  authorDisplayName: string
  body: string
  createdAt: string
  updatedAt: string
  replyCount: number
}

export interface CreateContentCommentPayload {
  annotationId?: string | null
  parentId?: string | null
  body: string
}

export interface ListContentCommentsParams {
  annotationId?: string | null
  page?: number
  pageSize?: number
}

export interface ListContentCommentRepliesParams {
  page?: number
  pageSize?: number
}

function buildQuery(params: Record<string, string | number | undefined | null>): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    query.set(key, String(value))
  }
  const qs = query.toString()
  return qs ? `?${qs}` : ''
}

export function listContentComments(
  pageId: string,
  params: ListContentCommentsParams = {},
): Promise<PageResponse<ContentComment>> {
  const page = params.page ?? 0
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE
  if (isMockDataSource()) {
    return Promise.resolve(
      listContentCommentsMock(pageId, {
        annotationId: params.annotationId,
        page,
        pageSize,
      }),
    )
  }
  return request<PageResponse<ContentComment>>(
    `/api/pages/${encodeURIComponent(pageId)}/comments${buildQuery({
      annotationId: params.annotationId,
      page,
      pageSize,
    })}`,
  )
}

export function listContentCommentReplies(
  pageId: string,
  commentId: string,
  params: ListContentCommentRepliesParams = {},
): Promise<PageResponse<ContentComment>> {
  const page = params.page ?? 0
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE
  if (isMockDataSource()) {
    return Promise.resolve(listContentCommentRepliesMock(pageId, commentId, { page, pageSize }))
  }
  return request<PageResponse<ContentComment>>(
    `/api/pages/${encodeURIComponent(pageId)}/comments/${encodeURIComponent(commentId)}/replies${buildQuery({
      page,
      pageSize,
    })}`,
  )
}

export function createContentComment(
  pageId: string,
  payload: CreateContentCommentPayload,
): Promise<ContentComment> {
  if (isMockDataSource()) {
    return Promise.resolve(createContentCommentMock(pageId, payload))
  }
  return request<ContentComment>(`/api/pages/${encodeURIComponent(pageId)}/comments`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function deleteContentComment(pageId: string, commentId: string): Promise<void> {
  if (isMockDataSource()) {
    deleteContentCommentMock(pageId, commentId)
    return Promise.resolve()
  }
  return request<void>(
    `/api/pages/${encodeURIComponent(pageId)}/comments/${encodeURIComponent(commentId)}`,
    { method: 'DELETE' },
  )
}

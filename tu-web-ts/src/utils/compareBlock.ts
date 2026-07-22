import type { ExternalResourceEmbedData } from '@/api/types'

export const COMPARE_BLOCK_DEFAULT_HEIGHT = 320

export type CompareSide = 'left' | 'right'

export function createCompareBlockId(): string {
  return `compare-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function createCompareBlockAttrs(input?: {
  blockId?: string
  title?: string
  height?: number
  middleText?: string
  leftSide?: ExternalResourceEmbedData | null
  rightSide?: ExternalResourceEmbedData | null
}) {
  return {
    blockId: input?.blockId || createCompareBlockId(),
    title: input?.title ?? '文本比较',
    height: input?.height ?? COMPARE_BLOCK_DEFAULT_HEIGHT,
    middleText: input?.middleText ?? '',
    leftSide: input?.leftSide ?? null,
    rightSide: input?.rightSide ?? null,
    metadata: {} as Record<string, unknown>,
  }
}

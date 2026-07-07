import { ref } from 'vue'
import type { BlockTag } from '@/api/types'

/** In-memory per-page tag filter (not persisted). */
const activeTagByPageId = ref(new Map<string, BlockTag>())
const revision = ref(0)

export function getTagFilterRevision(): number {
  return revision.value
}

export function getActiveTagFilter(pageId: string | null | undefined): BlockTag | null {
  if (!pageId) return null
  return activeTagByPageId.value.get(pageId) ?? null
}

export function setActiveTagFilter(pageId: string, tag: BlockTag | null): void {
  const next = new Map(activeTagByPageId.value)
  if (tag) {
    next.set(pageId, tag)
  } else {
    next.delete(pageId)
  }
  activeTagByPageId.value = next
  revision.value += 1
}

export function clearTagFilterSession(): void {
  activeTagByPageId.value = new Map()
  revision.value += 1
}

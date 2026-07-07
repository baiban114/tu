import { ref } from 'vue'

/** In-memory fold state for ref-group / ref-child TOC sections (no page content API). */
const collapsedEntryIds = ref(new Set<string>())
const revision = ref(0)

export function getSectionFoldRevision(): number {
  return revision.value
}

export function isSessionEntryCollapsed(entryId: string): boolean {
  return collapsedEntryIds.value.has(entryId)
}

export function toggleSessionEntryCollapse(entryId: string): boolean {
  const next = new Set(collapsedEntryIds.value)
  if (next.has(entryId)) {
    next.delete(entryId)
  } else {
    next.add(entryId)
  }
  collapsedEntryIds.value = next
  revision.value += 1
  return next.has(entryId)
}

export function clearSectionFoldSession() {
  collapsedEntryIds.value = new Set()
  revision.value += 1
}

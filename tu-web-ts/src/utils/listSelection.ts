/**
 * Shared list/tree click selection: plain replace, Ctrl/⌘ toggle, Shift range.
 */

export function applyListClickSelection(input: {
  clickedId: string
  /** Visible order for Shift range (e.g. expanded tree flattened). */
  flatIds: string[]
  current: ReadonlySet<string>
  anchorId: string | null
  ctrlOrMeta: boolean
  shiftKey: boolean
}): { next: Set<string>; anchorId: string } {
  const { clickedId, flatIds, current, anchorId, ctrlOrMeta, shiftKey } = input

  if (shiftKey && anchorId && flatIds.includes(anchorId) && flatIds.includes(clickedId)) {
    const a = flatIds.indexOf(anchorId)
    const b = flatIds.indexOf(clickedId)
    const from = Math.min(a, b)
    const to = Math.max(a, b)
    const range = flatIds.slice(from, to + 1)
    if (ctrlOrMeta) {
      const next = new Set(current)
      for (const id of range) next.add(id)
      return { next, anchorId }
    }
    return { next: new Set(range), anchorId }
  }

  if (ctrlOrMeta) {
    const next = new Set(current)
    if (next.has(clickedId)) next.delete(clickedId)
    else next.add(clickedId)
    return { next, anchorId: clickedId }
  }

  return { next: new Set([clickedId]), anchorId: clickedId }
}

/** Keep ids whose ancestors are not also selected (safe batch-delete roots). */
export function topmostSelectedIds(
  selectedIds: ReadonlySet<string>,
  parentById: Map<string, string | null>,
): string[] {
  const result: string[] = []
  for (const id of selectedIds) {
    let parent = parentById.get(id) ?? null
    let covered = false
    while (parent) {
      if (selectedIds.has(parent)) {
        covered = true
        break
      }
      parent = parentById.get(parent) ?? null
    }
    if (!covered) result.push(id)
  }
  return result
}

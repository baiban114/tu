/** Resolve tag editor Enter / create-button action. */
export function resolveTagEditorEnterAction(
  canCreateTag: boolean,
  filteredCandidateCount: number,
): 'create' | 'pick-first' | 'noop' {
  if (canCreateTag) return 'create'
  if (filteredCandidateCount > 0) return 'pick-first'
  return 'noop'
}

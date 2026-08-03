/** True when existing prerequisite closure is already enough to show a route. */
export function hasUsableLearningRoute(
  rowCount: number,
  seedPointIds: string[],
): boolean {
  if (rowCount >= 2) return true
  // Single seed with no prerequisites is not a usable "chain"
  if (rowCount === 1 && seedPointIds.length > 0) return false
  return false
}

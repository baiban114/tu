/**
 * Hierarchical scope search (定位系统 › 搜索系统).
 * Browse = direct children; DeepSearch = title match in subtree.
 * @see tu-web-ts/docs/markdown-hyperlinks.md
 */

export interface ScopeTreeNode {
  id: string
  parentId: string | null
  title: string
  sortOrder: number
}

export interface ScopeHit<T extends ScopeTreeNode = ScopeTreeNode> {
  node: T
  /** Titles from tree root to this node (inclusive). */
  pathFromRoot: string[]
  /** Titles from current scope parent (exclusive) to this node (inclusive). */
  pathFromScope: string[]
  /** Depth under scope parent (1 = direct child). */
  depth: number
}

export type MatchRank = 0 | 1 | 2

/** 0 exact, 1 prefix, 2 includes; null = no match. */
export function matchRank(title: string, query: string): MatchRank | null {
  const needle = query.trim().toLowerCase()
  if (!needle) return null
  const hay = title.trim().toLowerCase()
  if (hay === needle) return 0
  if (hay.startsWith(needle)) return 1
  if (hay.includes(needle)) return 2
  return null
}

export function indexNodesByParent<T extends ScopeTreeNode>(
  nodes: T[],
): Map<string | null, T[]> {
  const byParent = new Map<string | null, T[]>()
  for (const node of nodes) {
    const key = node.parentId ?? null
    const list = byParent.get(key) ?? []
    list.push(node)
    byParent.set(key, list)
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, 'zh'))
  }
  return byParent
}

export function matchNodeAtLevel<T extends ScopeTreeNode>(
  siblings: T[],
  segment: string,
): T | null {
  const needle = segment.trim().toLowerCase()
  if (!needle || siblings.length === 0) return null
  const exact = siblings.find((node) => node.title.trim().toLowerCase() === needle)
  if (exact) return exact
  const partial = siblings.filter((node) => node.title.toLowerCase().includes(needle))
  if (partial.length === 1) return partial[0]
  const startsWith = partial.filter((node) => node.title.toLowerCase().startsWith(needle))
  if (startsWith.length === 1) return startsWith[0]
  return null
}

/** Resolve path segments to the scope parent id whose children/subtree are queried. */
export function resolveScopeParent<T extends ScopeTreeNode>(
  nodes: T[],
  pathSegments: string[],
): { parentId: string | null; resolvedPath: string[] } | null {
  const byParent = indexNodesByParent(nodes)
  let parentId: string | null = null
  const resolvedPath: string[] = []
  for (const segment of pathSegments) {
    if (!segment.trim()) return null
    const match: T | null = matchNodeAtLevel(byParent.get(parentId) ?? [], segment)
    if (!match) return null
    parentId = match.id
    resolvedPath.push(match.title)
  }
  return { parentId, resolvedPath }
}

function buildParentMap<T extends ScopeTreeNode>(nodes: T[]): Map<string, T> {
  return new Map(nodes.map((node) => [node.id, node]))
}

export function pathTitlesFromRoot<T extends ScopeTreeNode>(
  nodeId: string,
  byId: Map<string, T>,
): string[] {
  const titles: string[] = []
  let current: T | undefined = byId.get(nodeId)
  const guard = new Set<string>()
  while (current && !guard.has(current.id)) {
    guard.add(current.id)
    titles.unshift(current.title)
    current = current.parentId ? byId.get(current.parentId) : undefined
  }
  return titles
}

/** Direct children under parentId (Browse). */
export function browseChildren<T extends ScopeTreeNode>(
  nodes: T[],
  parentId: string | null,
  scopePath: string[] = [],
): ScopeHit<T>[] {
  const byParent = indexNodesByParent(nodes)
  return (byParent.get(parentId) ?? []).map((node) => ({
    node,
    pathFromRoot: [...scopePath, node.title],
    pathFromScope: [node.title],
    depth: 1,
  }))
}

/**
 * DeepSearch: all descendants under parentId whose title matches query.
 * parentId null = whole forest roots' subtrees (all nodes).
 */
export function deepSearchInSubtree<T extends ScopeTreeNode>(
  nodes: T[],
  parentId: string | null,
  query: string,
  scopePath: string[] = [],
): ScopeHit<T>[] {
  const needle = query.trim()
  if (!needle) return browseChildren(nodes, parentId, scopePath)

  const byParent = indexNodesByParent(nodes)
  const byId = buildParentMap(nodes)
  const hits: Array<ScopeHit<T> & { rank: MatchRank }> = []

  const walk = (pid: string | null, depth: number, pathFromScope: string[]) => {
    for (const node of byParent.get(pid) ?? []) {
      const nextPath = [...pathFromScope, node.title]
      const rank = matchRank(node.title, needle)
      if (rank != null) {
        const pathFromRoot = parentId == null
          ? pathTitlesFromRoot(node.id, byId)
          : [...scopePath, ...nextPath]
        hits.push({
          node,
          pathFromRoot,
          pathFromScope: nextPath,
          depth,
          rank,
        })
      }
      walk(node.id, depth + 1, nextPath)
    }
  }

  walk(parentId, 1, [])

  hits.sort((a, b) => (
    a.rank - b.rank
    || a.depth - b.depth
    || a.node.sortOrder - b.node.sortOrder
    || a.node.title.localeCompare(b.node.title, 'zh')
  ))

  return hits.map(({ rank: _rank, ...hit }) => hit)
}

/** Collect id set of parentId plus all descendants (for excerpt chapter filter). */
export function collectSubtreeIds<T extends ScopeTreeNode>(
  nodes: T[],
  parentId: string | null,
): Set<string | null> {
  const byParent = indexNodesByParent(nodes)
  const ids = new Set<string | null>()
  if (parentId == null) {
    ids.add(null)
    for (const node of nodes) ids.add(node.id)
    return ids
  }
  ids.add(parentId)
  const walk = (pid: string) => {
    for (const child of byParent.get(pid) ?? []) {
      ids.add(child.id)
      walk(child.id)
    }
  }
  walk(parentId)
  return ids
}

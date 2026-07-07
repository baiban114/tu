import { ref, computed } from 'vue'

export function useExpandCollapse() {
  const expanded = ref<Set<string>>(new Set())

  function toggle(key: string) {
    const next = new Set(expanded.value)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    expanded.value = next
  }

  function expand(...keys: string[]) {
    const next = new Set(expanded.value)
    for (const k of keys) next.add(k)
    expanded.value = next
  }

  function collapse(...keys: string[]) {
    const next = new Set(expanded.value)
    for (const k of keys) next.delete(k)
    expanded.value = next
  }

  function expandAll(keys: string[]) {
    expanded.value = new Set(keys)
  }

  function collapseAll() {
    expanded.value = new Set()
  }

  function isExpanded(key: string) {
    return expanded.value.has(key)
  }

  function allExpanded(total: number) {
    return total > 0 && expanded.value.size === total
  }

  function allCollapsed() {
    return expanded.value.size === 0
  }

  const expandedCount = computed(() => expanded.value.size)

  return {
    expanded,
    toggle,
    expand,
    collapse,
    expandAll,
    collapseAll,
    isExpanded,
    allExpanded,
    allCollapsed,
    expandedCount,
  }
}

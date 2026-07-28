<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { TreeNode } from '@/utils/tree'
import { applyListClickSelection } from '@/utils/listSelection'
import TreeListNode from './TreeListNode.vue'

const props = withDefaults(defineProps<{
  nodes: TreeNode[]
  selectedId?: string | null
  /** When multiSelect is on, these ids are highlighted (in addition to selectedId focus). */
  selectedIds?: string[]
  multiSelect?: boolean
  defaultExpandDepth?: number
  indentPx?: number
  emptyText?: string
  isSelectable?: (node: TreeNode) => boolean
}>(), {
  selectedId: null,
  selectedIds: () => [],
  multiSelect: false,
  defaultExpandDepth: 1,
  indentPx: 16,
  emptyText: '暂无数据',
})

const emit = defineEmits<{
  select: [node: TreeNode]
  'update:selectedIds': [ids: string[]]
  toggle: [node: TreeNode, expanded: boolean]
}>()

const expandedIds = ref<Set<string>>(new Set())
const selectionAnchorId = ref<string | null>(null)
const panelEl = ref<HTMLElement | null>(null)

const selectedIdSet = computed(() => new Set(props.selectedIds ?? []))

function collectExpandableIds(nodes: TreeNode[], depth: number, acc: Set<string>) {
  for (const node of nodes) {
    if (node.children?.length && depth < props.defaultExpandDepth) {
      acc.add(node.id)
      collectExpandableIds(node.children, depth + 1, acc)
    }
  }
}

function resetExpandedFromDepth() {
  const next = new Set<string>()
  collectExpandableIds(props.nodes, 0, next)
  expandedIds.value = next
}

watch(
  () => [props.nodes, props.defaultExpandDepth] as const,
  () => resetExpandedFromDepth(),
  { immediate: true, deep: true },
)

watch(
  () => props.selectedId,
  (selectedId) => {
    if (!selectedId) return
    const expandPath = (nodes: TreeNode[], path: string[] = []): boolean => {
      for (const node of nodes) {
        if (node.id === selectedId) {
          for (const id of path) expandedIds.value.add(id)
          return true
        }
        if (node.children?.length && expandPath(node.children, [...path, node.id])) {
          expandedIds.value.add(node.id)
          return true
        }
      }
      return false
    }
    expandPath(props.nodes)
  },
)

const hasNodes = computed(() => props.nodes.length > 0)

function isNodeSelectable(node: TreeNode): boolean {
  return props.isSelectable ? props.isSelectable(node) : true
}

function flattenVisibleIds(nodes: TreeNode[]): string[] {
  const ids: string[] = []
  const walk = (list: TreeNode[]) => {
    for (const node of list) {
      if (!isNodeSelectable(node)) continue
      ids.push(node.id)
      if (node.children?.length && expandedIds.value.has(node.id)) {
        walk(node.children)
      }
    }
  }
  walk(nodes)
  return ids
}

function findNodeById(nodes: TreeNode[], id: string): TreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    if (node.children?.length) {
      const found = findNodeById(node.children, id)
      if (found) return found
    }
  }
  return null
}

function onToggle(event: MouseEvent, node: TreeNode) {
  event.stopPropagation()
  if (!node.children?.length) return
  const next = new Set(expandedIds.value)
  if (next.has(node.id)) {
    next.delete(node.id)
    emit('toggle', node, false)
  } else {
    next.add(node.id)
    emit('toggle', node, true)
  }
  expandedIds.value = next
}

function onSelect(event: MouseEvent, node: TreeNode) {
  if (!props.multiSelect) {
    emit('select', node)
    return
  }
  const result = applyListClickSelection({
    clickedId: node.id,
    flatIds: flattenVisibleIds(props.nodes),
    current: selectedIdSet.value,
    anchorId: selectionAnchorId.value,
    ctrlOrMeta: event.ctrlKey || event.metaKey,
    shiftKey: event.shiftKey,
  })
  selectionAnchorId.value = result.anchorId
  emit('update:selectedIds', [...result.next])
  emit('select', node)
}

/* —— Marquee (drag) multi-select —— */
let marqueeActive = false
let marqueeStartX = 0
let marqueeStartY = 0
let marqueeListenersAttached = false
const marqueeRect = ref<{ left: number; top: number; width: number; height: number } | null>(null)
const marqueeBaseIds = ref<Set<string>>(new Set())

function rectsIntersect(
  a: { left: number; top: number; right: number; bottom: number },
  b: DOMRect,
) {
  return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom)
}

function collectMarqueeHits(box: { left: number; top: number; right: number; bottom: number }) {
  if (!panelEl.value) return [] as string[]
  const rows = panelEl.value.querySelectorAll<HTMLElement>('[data-tree-node-id].tree-list-node__row')
  const hits: string[] = []
  rows.forEach((row) => {
    const id = row.dataset.treeNodeId
    if (!id) return
    const node = findNodeById(props.nodes, id)
    if (!node || !isNodeSelectable(node)) return
    if (rectsIntersect(box, row.getBoundingClientRect())) hits.push(id)
  })
  return hits
}

function onMarqueeMove(event: MouseEvent) {
  if (!marqueeActive) return
  const x1 = Math.min(marqueeStartX, event.clientX)
  const y1 = Math.min(marqueeStartY, event.clientY)
  const x2 = Math.max(marqueeStartX, event.clientX)
  const y2 = Math.max(marqueeStartY, event.clientY)
  marqueeRect.value = { left: x1, top: y1, width: x2 - x1, height: y2 - y1 }
  const hits = collectMarqueeHits({ left: x1, top: y1, right: x2, bottom: y2 })
  const next = new Set(marqueeBaseIds.value)
  for (const id of hits) next.add(id)
  emit('update:selectedIds', [...next])
}

function onMarqueeEnd() {
  if (!marqueeActive) return
  marqueeActive = false
  marqueeRect.value = null
  if (marqueeListenersAttached) {
    marqueeListenersAttached = false
    window.removeEventListener('mousemove', onMarqueeMove)
    window.removeEventListener('mouseup', onMarqueeEnd)
  }
}

function onPanelMouseDown(event: MouseEvent) {
  if (!props.multiSelect || event.button !== 0) return
  const target = event.target as HTMLElement
  if (target.closest('.tree-list-node__row') || target.closest('.tree-list-node__toggle')) return

  marqueeActive = true
  marqueeStartX = event.clientX
  marqueeStartY = event.clientY
  marqueeRect.value = { left: event.clientX, top: event.clientY, width: 0, height: 0 }
  marqueeBaseIds.value = event.ctrlKey || event.metaKey
    ? new Set(selectedIdSet.value)
    : new Set()
  if (!(event.ctrlKey || event.metaKey)) {
    emit('update:selectedIds', [])
  }
  if (!marqueeListenersAttached) {
    marqueeListenersAttached = true
    window.addEventListener('mousemove', onMarqueeMove)
    window.addEventListener('mouseup', onMarqueeEnd)
  }
  event.preventDefault()
}

onBeforeUnmount(() => {
  onMarqueeEnd()
})
</script>

<template>
  <div
    ref="panelEl"
    class="tree-list-panel"
    :class="{ 'tree-list-panel--multi': multiSelect }"
    role="tree"
    @mousedown="onPanelMouseDown"
  >
    <p v-if="!hasNodes" class="tree-list-panel__empty">{{ emptyText }}</p>
    <ul v-else class="tree-list-panel__list">
      <TreeListNode
        v-for="node in nodes"
        :key="node.id"
        :node="node"
        :depth="0"
        :indent-px="indentPx"
        :selected-id="selectedId"
        :selected-ids="multiSelect ? selectedIdSet : undefined"
        :expanded-ids="expandedIds"
        :is-selectable="isNodeSelectable"
        @toggle="onToggle"
        @select="onSelect"
      />
    </ul>
    <div
      v-if="marqueeRect"
      class="tree-list-panel__marquee"
      :style="{
        left: `${marqueeRect.left}px`,
        top: `${marqueeRect.top}px`,
        width: `${marqueeRect.width}px`,
        height: `${marqueeRect.height}px`,
      }"
    />
  </div>
</template>

<style scoped>
.tree-list-panel {
  position: relative;
  min-width: 0;
  min-height: 120px;
}

.tree-list-panel--multi {
  user-select: none;
}

.tree-list-panel__empty {
  margin: 0;
  padding: 12px 8px;
  color: #667085;
  font-size: 13px;
}

.tree-list-panel__list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.tree-list-panel__marquee {
  position: fixed;
  z-index: 40;
  pointer-events: none;
  box-sizing: border-box;
  border: 1px solid rgba(22, 119, 255, 0.65);
  background: rgba(22, 119, 255, 0.12);
}
</style>

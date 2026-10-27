<script setup lang="ts" generic="TMeta = unknown">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { TreeContextMenuItem, TreeNode } from '@/utils/tree'
import { applyListClickSelection } from '@/utils/listSelection'
import { useViewportClampedFixedPanel } from '@/utils/viewportPanel'
import TreeListNode from './TreeListNode.vue'

const props = withDefaults(defineProps<{
  nodes: TreeNode<TMeta>[]
  selectedId?: string | null
  /** When multiSelect is on, these ids are highlighted in addition to selectedId focus. */
  selectedIds?: string[]
  multiSelect?: boolean
  defaultExpandDepth?: number
  /** Controlled expansion. When omitted, expand/collapse state lives in this component. */
  expandedIds?: string[]
  indentPx?: number
  emptyText?: string
  isSelectable?: (node: TreeNode<TMeta>) => boolean
  getNodeDescription?: (node: TreeNode<TMeta>) => string
  getNodeAriaLabel?: (node: TreeNode<TMeta>) => string
  /** Enables native drag reorder with optional nested drops. */
  draggable?: boolean
  canDrag?: (node: TreeNode<TMeta>) => boolean
  canDrop?: (dragged: TreeNode<TMeta>, target: TreeNode<TMeta>) => boolean
  /** Allow dropping onto the middle of a row. Disabled by default for compatibility. */
  allowDropInside?: boolean
  /** Returning an empty list leaves the browser context menu available. */
  contextMenuItems?: (node: TreeNode<TMeta>) => TreeContextMenuItem[]
  isRenamable?: (node: TreeNode<TMeta>) => boolean
}>(), {
  selectedId: null,
  selectedIds: () => [],
  multiSelect: false,
  defaultExpandDepth: 1,
  expandedIds: undefined,
  indentPx: 16,
  emptyText: '暂无数据',
  getNodeDescription: undefined,
  getNodeAriaLabel: undefined,
  draggable: false,
  canDrag: undefined,
  canDrop: undefined,
  allowDropInside: false,
  contextMenuItems: undefined,
  isRenamable: undefined,
})

const emit = defineEmits([
  'select',
  'update:selectedIds',
  'toggle',
  'update:expandedIds',
  'menuAction',
  'reorder',
  'rename',
])

const internalExpandedIds = ref<Set<string>>(new Set())
const selectionAnchorId = ref<string | null>(null)
const panelEl = ref<HTMLElement | null>(null)
const draggingId = ref<string | null>(null)
const dropTargetId = ref<string | null>(null)
const dropPosition = ref<'before' | 'after' | 'inside' | null>(null)
const renamingId = ref<string | null>(null)
const renameDraft = ref('')

const contextMenu = ref<{
  visible: boolean
  node: TreeNode<TMeta> | null
  items: TreeContextMenuItem[]
  x: number
  y: number
}>({
  visible: false,
  node: null,
  items: [],
  x: 0,
  y: 0,
})
const contextMenuSourcePoint = computed(() => (
  contextMenu.value.visible
    ? { x: contextMenu.value.x, y: contextMenu.value.y }
    : null
))
const { panelRef: contextMenuRef, position: contextMenuPosition } = useViewportClampedFixedPanel({
  visible: computed(() => contextMenu.value.visible),
  getSourcePoint: () => contextMenuSourcePoint.value,
})

const selectedIdSet = computed(() => new Set(props.selectedIds ?? []))
const expandedIdSet = computed(() => (
  props.expandedIds == null
    ? internalExpandedIds.value
    : new Set(props.expandedIds)
))
const hasNodes = computed(() => props.nodes.length > 0)

function collectExpandableIds(nodes: TreeNode<TMeta>[], depth: number, acc: Set<string>) {
  for (const node of nodes) {
    if (node.children?.length && depth < props.defaultExpandDepth) {
      acc.add(node.id)
      collectExpandableIds(node.children, depth + 1, acc)
    }
  }
}

function resetExpandedFromDepth() {
  if (props.expandedIds != null) return
  const next = new Set<string>()
  collectExpandableIds(props.nodes, 0, next)
  internalExpandedIds.value = next
}

watch(
  () => [props.nodes, props.defaultExpandDepth, props.expandedIds] as const,
  () => resetExpandedFromDepth(),
  { immediate: true, deep: true },
)

function findNodeById(nodes: TreeNode<TMeta>[], id: string): TreeNode<TMeta> | null {
  for (const node of nodes) {
    if (node.id === id) return node
    if (node.children?.length) {
      const found = findNodeById(node.children, id)
      if (found) return found
    }
  }
  return null
}

function findTreePath(
  nodes: TreeNode<TMeta>[],
  id: string,
  path: TreeNode<TMeta>[] = [],
): TreeNode<TMeta>[] | null {
  for (const node of nodes) {
    const nextPath = [...path, node]
    if (node.id === id) return nextPath
    if (node.children?.length) {
      const found = findTreePath(node.children, id, nextPath)
      if (found) return found
    }
  }
  return null
}

watch(
  () => props.selectedId,
  (selectedId) => {
    if (!selectedId) return
    const path = findTreePath(props.nodes, selectedId)
    if (!path) return
    const next = new Set(expandedIdSet.value)
    for (const node of path.slice(0, -1)) next.add(node.id)
    if (props.expandedIds == null) internalExpandedIds.value = next
    else emit('update:expandedIds', [...next])
    void nextTick().then(() => {
      const row = Array.from(
        panelEl.value?.querySelectorAll<HTMLElement>('[data-tree-node-id].tree-list-node__row') ?? [],
      ).find((item) => item.dataset.treeNodeId === selectedId)
      row?.scrollIntoView({ block: 'nearest' })
    })
  },
)

function isNodeSelectable(node: TreeNode<TMeta>): boolean {
  return props.isSelectable ? props.isSelectable(node) : true
}

function flattenVisibleIds(nodes: TreeNode<TMeta>[]): string[] {
  const ids: string[] = []
  const walk = (list: TreeNode<TMeta>[]) => {
    for (const node of list) {
      if (!isNodeSelectable(node)) continue
      ids.push(node.id)
      if (node.children?.length && expandedIdSet.value.has(node.id)) {
        walk(node.children)
      }
    }
  }
  walk(nodes)
  return ids
}

function onToggle(event: MouseEvent, node: TreeNode<TMeta>) {
  event.stopPropagation()
  if (!node.children?.length) return
  const next = new Set(expandedIdSet.value)
  const expanded = !next.has(node.id)
  if (expanded) next.add(node.id)
  else next.delete(node.id)
  if (props.expandedIds == null) internalExpandedIds.value = next
  else emit('update:expandedIds', [...next])
  emit('toggle', node, expanded)
}

function onSelect(event: MouseEvent, node: TreeNode<TMeta>) {
  closeContextMenu()
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

function nodeCanDrag(node: TreeNode<TMeta>) {
  if (!props.draggable) return false
  return props.canDrag ? props.canDrag(node) : true
}

function nodeCanDrop(dragged: TreeNode<TMeta>, target: TreeNode<TMeta>) {
  if (dragged.id === target.id) return false
  return props.canDrop ? props.canDrop(dragged, target) : true
}

function clearDragState() {
  draggingId.value = null
  dropTargetId.value = null
  dropPosition.value = null
}

function onDragStart(event: DragEvent, node: TreeNode<TMeta>) {
  if (!nodeCanDrag(node)) {
    event.preventDefault()
    return
  }
  closeContextMenu()
  cancelRename()
  draggingId.value = node.id
  dropTargetId.value = null
  dropPosition.value = null
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', node.id)
  }
}

function onDragOver(event: DragEvent, node: TreeNode<TMeta>) {
  const draggedId = draggingId.value
  if (!draggedId) return
  const dragged = findNodeById(props.nodes, draggedId)
  if (!dragged || !nodeCanDrop(dragged, node)) {
    if (dropTargetId.value) clearDragState()
    return
  }
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const offsetY = event.clientY - rect.top
  const edgeSize = Math.min(10, rect.height / 3)
  dropTargetId.value = node.id
  dropPosition.value = props.allowDropInside
    && offsetY > edgeSize
    && offsetY < rect.height - edgeSize
    ? 'inside'
    : offsetY < rect.height / 2
      ? 'before'
      : 'after'
}

function onDrop(event: DragEvent, node: TreeNode<TMeta>) {
  event.preventDefault()
  const draggedId = draggingId.value
  const position = dropPosition.value
  clearDragState()
  if (!draggedId || !position) return
  const dragged = findNodeById(props.nodes, draggedId)
  if (!dragged || !nodeCanDrop(dragged, node)) return
  emit('reorder', { dragged, target: node, position })
}

function openContextMenu(event: MouseEvent, node: TreeNode<TMeta>) {
  const items = props.contextMenuItems?.(node) ?? []
  if (items.length === 0) return
  event.preventDefault()
  event.stopPropagation()
  contextMenu.value = {
    visible: true,
    node,
    items,
    x: event.clientX,
    y: event.clientY,
  }
}

function closeContextMenu() {
  if (!contextMenu.value.visible) return
  contextMenu.value.visible = false
  contextMenu.value.node = null
  contextMenu.value.items = []
}

function closeContextMenuOnEscape(event: KeyboardEvent) {
  if (event.key === 'Escape') closeContextMenu()
}

watch(
  () => contextMenu.value.visible,
  (visible) => {
    if (visible) {
      document.addEventListener('click', closeContextMenu)
      document.addEventListener('keydown', closeContextMenuOnEscape)
    } else {
      document.removeEventListener('click', closeContextMenu)
      document.removeEventListener('keydown', closeContextMenuOnEscape)
    }
  },
)

function onContextMenuItem(item: TreeContextMenuItem, event: MouseEvent) {
  const node = contextMenu.value.node
  if (!node || item.disabled) return
  event.preventDefault()
  event.stopPropagation()
  closeContextMenu()
  emit('menuAction', { node, item, event })
}

function onPanelContextMenu(event: MouseEvent) {
  const target = event.target as HTMLElement | null
  if (target?.closest('.tree-list-node__row')) return
  event.preventDefault()
}

function startRename(node: TreeNode<TMeta>) {
  if (!props.isRenamable?.(node)) return
  closeContextMenu()
  renamingId.value = node.id
  renameDraft.value = node.label
}

function commitRename(node: TreeNode<TMeta>) {
  if (renamingId.value !== node.id) return
  const label = renameDraft.value.trim().slice(0, 120)
  renamingId.value = null
  renameDraft.value = ''
  if (!label || label === node.label) return
  emit('rename', { node, label })
}

function cancelRename() {
  renamingId.value = null
  renameDraft.value = ''
}

function onDoubleClick(event: MouseEvent, node: TreeNode<TMeta>) {
  if (!props.isRenamable?.(node)) return
  event.preventDefault()
  event.stopPropagation()
  startRename(node)
}

function onPanelKeydown(event: KeyboardEvent) {
  if (event.key !== 'F2' || !props.selectedId) return
  const node = findNodeById(props.nodes, props.selectedId)
  if (!node || !props.isRenamable?.(node)) return
  event.preventDefault()
  startRename(node)
}

/* Pointer marquee stays independent from optional HTML5 drag reorder. */
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
  if (!props.multiSelect || props.draggable || event.button !== 0) return
  const target = event.target as HTMLElement
  if (target.closest('.tree-list-node__row') || target.closest('.tree-list-node__toggle')) return

  marqueeActive = true
  marqueeStartX = event.clientX
  marqueeStartY = event.clientY
  marqueeRect.value = { left: event.clientX, top: event.clientY, width: 0, height: 0 }
  marqueeBaseIds.value = event.ctrlKey || event.metaKey
    ? new Set(selectedIdSet.value)
    : new Set()
  if (!(event.ctrlKey || event.metaKey)) emit('update:selectedIds', [])
  if (!marqueeListenersAttached) {
    marqueeListenersAttached = true
    window.addEventListener('mousemove', onMarqueeMove)
    window.addEventListener('mouseup', onMarqueeEnd)
  }
  event.preventDefault()
}

defineExpose({ startRename })

onBeforeUnmount(() => {
  onMarqueeEnd()
  document.removeEventListener('click', closeContextMenu)
  document.removeEventListener('keydown', closeContextMenuOnEscape)
})
</script>

<template>
  <div
    ref="panelEl"
    class="tree-list-panel"
    :class="{ 'tree-list-panel--multi': multiSelect, 'tree-list-panel--draggable': draggable }"
    role="tree"
    tabindex="0"
    @mousedown="onPanelMouseDown"
    @contextmenu="onPanelContextMenu"
    @keydown="onPanelKeydown"
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
        :expanded-ids="expandedIdSet"
        :is-selectable="isNodeSelectable"
        :get-node-description="getNodeDescription"
        :node-aria-label="getNodeAriaLabel"
        :allow-drag="draggable"
        :can-drag="canDrag"
        :dragging-id="draggingId"
        :drop-target-id="dropTargetId"
        :drop-position="dropPosition"
        :renaming-id="renamingId"
        :rename-draft="renameDraft"
        @toggle="onToggle"
        @select="onSelect"
        @context-menu="openContextMenu"
        @drag-start="onDragStart"
        @drag-over="onDragOver"
        @drop="onDrop"
        @drag-end="clearDragState"
        @dblclick="onDoubleClick"
        @update:rename-draft="renameDraft = $event"
        @commit-rename="commitRename"
        @cancel-rename="cancelRename"
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
    <Teleport to="body">
      <div
        v-if="contextMenu.visible"
        ref="contextMenuRef"
        class="tree-list-panel__context-menu"
        role="menu"
        :style="{ left: `${contextMenuPosition.left}px`, top: `${contextMenuPosition.top}px` }"
        @mousedown.stop
        @click.stop
        @contextmenu.prevent.stop
      >
        <button
          v-for="item in contextMenu.items"
          :key="item.id"
          type="button"
          class="tree-list-panel__context-item"
          :class="{ 'tree-list-panel__context-item--danger': item.danger }"
          role="menuitem"
          :disabled="item.disabled"
          @click="onContextMenuItem(item, $event)"
        >
          {{ item.label }}
        </button>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.tree-list-panel {
  position: relative;
  min-width: 0;
  min-height: 120px;
  outline: none;
}

.tree-list-panel--multi,
.tree-list-panel--draggable {
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

<style>
/* Teleported to body: must remain unscoped. */
.tree-list-panel__context-menu {
  position: fixed;
  z-index: 3200;
  min-width: 132px;
  padding: 4px;
  border: 1px solid #e4e7ec;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.16);
  box-sizing: border-box;
}

.tree-list-panel__context-item {
  display: block;
  width: 100%;
  padding: 7px 10px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: #344054;
  font-size: 13px;
  line-height: 1.4;
  text-align: left;
  cursor: pointer;
}

.tree-list-panel__context-item:hover:not(:disabled) {
  background: #f2f4f7;
}

.tree-list-panel__context-item--danger {
  color: #b42318;
}

.tree-list-panel__context-item--danger:hover:not(:disabled) {
  background: #fef3f2;
}

.tree-list-panel__context-item:disabled {
  color: #98a2b3;
  cursor: default;
}
</style>

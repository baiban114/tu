<script setup lang="ts" generic="TMeta = unknown">
import { nextTick, ref, watch } from 'vue'
import type { TreeNode } from '@/utils/tree'

const props = defineProps<{
  node: TreeNode<TMeta>
  depth: number
  indentPx: number
  selectedId?: string | null
  selectedIds?: ReadonlySet<string>
  expandedIds: Set<string>
  isSelectable: (node: TreeNode<TMeta>) => boolean
  getNodeDescription?: (node: TreeNode<TMeta>) => string
  nodeAriaLabel?: (node: TreeNode<TMeta>) => string
  allowDrag?: boolean
  canDrag?: (node: TreeNode<TMeta>) => boolean
  draggingId?: string | null
  dropTargetId?: string | null
  dropPosition?: 'before' | 'after' | 'inside' | null
  renamingId?: string | null
  renameDraft?: string
}>()

const emit = defineEmits<{
  toggle: [event: MouseEvent, node: TreeNode<TMeta>]
  select: [event: MouseEvent, node: TreeNode<TMeta>]
  dblclick: [event: MouseEvent, node: TreeNode<TMeta>]
  'context-menu': [event: MouseEvent, node: TreeNode<TMeta>]
  'drag-start': [event: DragEvent, node: TreeNode<TMeta>]
  'drag-over': [event: DragEvent, node: TreeNode<TMeta>]
  drop: [event: DragEvent, node: TreeNode<TMeta>]
  'drag-end': [event: DragEvent, node: TreeNode<TMeta>]
  'update:rename-draft': [value: string]
  'commit-rename': [node: TreeNode<TMeta>]
  'cancel-rename': []
}>()

const renameInputEl = ref<HTMLInputElement | null>(null)
let suppressRenameBlur = false

function hasChildren(node: TreeNode<TMeta>) {
  return Boolean(node.children?.length)
}

function isExpanded(node: TreeNode<TMeta>, expandedIds: Set<string>) {
  return expandedIds.has(node.id)
}

function isSelected(
  node: TreeNode<TMeta>,
  selectedId: string | null | undefined,
  selectedIds: ReadonlySet<string> | undefined,
) {
  if (selectedIds && selectedIds.size > 0) return selectedIds.has(node.id)
  return selectedId === node.id
}

function isDraggable(node: TreeNode<TMeta>) {
  return Boolean(props.allowDrag && (props.canDrag ? props.canDrag(node) : true))
}

function isRenaming(node: TreeNode<TMeta>) {
  return props.renamingId === node.id
}

function commitRename(node: TreeNode<TMeta>) {
  if (!isRenaming(node)) return
  suppressRenameBlur = true
  emit('commit-rename', node)
  nextTick(() => {
    suppressRenameBlur = false
  })
}

function cancelRename() {
  if (!props.renamingId) return
  suppressRenameBlur = true
  emit('cancel-rename')
  nextTick(() => {
    suppressRenameBlur = false
  })
}

function onRenameBlur(node: TreeNode<TMeta>) {
  if (suppressRenameBlur) return
  commitRename(node)
}

watch(
  () => props.renamingId === props.node.id,
  (renaming) => {
    if (!renaming) return
    void nextTick().then(() => {
      renameInputEl.value?.focus()
      renameInputEl.value?.select()
    })
  },
  { immediate: true },
)
</script>

<template>
  <li class="tree-list-node" role="treeitem" :data-tree-node-id="node.id">
    <div
      class="tree-list-node__row"
      :class="{
        'tree-list-node__row--selected': isSelected(node, selectedId, selectedIds),
        'tree-list-node__row--disabled': !isSelectable(node),
        'tree-list-node__row--draggable': isDraggable(node),
        'tree-list-node__row--dragging': draggingId === node.id,
        'tree-list-node__row--drop-before': dropTargetId === node.id && dropPosition === 'before',
        'tree-list-node__row--drop-after': dropTargetId === node.id && dropPosition === 'after',
        'tree-list-node__row--drop-inside': dropTargetId === node.id && dropPosition === 'inside',
      }"
      :style="{ paddingLeft: `${depth * indentPx + 8}px` }"
      :data-tree-node-id="node.id"
      :aria-label="nodeAriaLabel?.(node)"
      :draggable="isDraggable(node) && !isRenaming(node)"
      data-node-view-no-drag
      @mousedown.stop
      @click="isSelectable(node) && emit('select', $event, node)"
      @dblclick="emit('dblclick', $event, node)"
      @contextmenu.prevent="emit('context-menu', $event, node)"
      @dragstart.stop="emit('drag-start', $event, node)"
      @dragover="emit('drag-over', $event, node)"
      @drop="emit('drop', $event, node)"
      @dragend="emit('drag-end', $event, node)"
    >
      <button
        type="button"
        class="tree-list-node__toggle"
        :class="{ 'tree-list-node__toggle--placeholder': !hasChildren(node) }"
        :aria-label="isExpanded(node, expandedIds) ? '收起' : '展开'"
        @click="emit('toggle', $event, node)"
      >
        <template v-if="hasChildren(node)">
          {{ isExpanded(node, expandedIds) ? '▼' : '▶' }}
        </template>
      </button>
      <input
        v-if="isRenaming(node)"
        ref="renameInputEl"
        class="tree-list-node__rename-input"
        :value="renameDraft ?? node.label"
        maxlength="120"
        data-tree-node-rename-input
        @click.stop
        @mousedown.stop
        @dblclick.stop
        @input="emit('update:rename-draft', ($event.target as HTMLInputElement).value)"
        @blur="onRenameBlur(node)"
        @keydown.enter.prevent.stop="commitRename(node)"
        @keydown.esc.prevent.stop="cancelRename"
      />
      <span v-else class="tree-list-node__label">{{ node.label }}</span>
      <span
        v-if="getNodeDescription?.(node)"
        class="tree-list-node__description"
      >
        {{ getNodeDescription(node) }}
      </span>
    </div>
    <ul
      v-if="hasChildren(node) && isExpanded(node, expandedIds)"
      class="tree-list-node__children"
    >
      <TreeListNode
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :depth="depth + 1"
        :indent-px="indentPx"
        :selected-id="selectedId"
        :selected-ids="selectedIds"
        :expanded-ids="expandedIds"
        :is-selectable="isSelectable"
        :get-node-description="getNodeDescription"
        :node-aria-label="nodeAriaLabel"
        :allow-drag="allowDrag"
        :can-drag="canDrag"
        :dragging-id="draggingId"
        :drop-target-id="dropTargetId"
        :drop-position="dropPosition"
        :renaming-id="renamingId"
        :rename-draft="renameDraft"
        @toggle="(event, n) => emit('toggle', event, n)"
        @select="(event, n) => emit('select', event, n)"
        @dblclick="(event, n) => emit('dblclick', event, n)"
        @context-menu="(event, n) => emit('context-menu', event, n)"
        @drag-start="(event, n) => emit('drag-start', event, n)"
        @drag-over="(event, n) => emit('drag-over', event, n)"
        @drop="(event, n) => emit('drop', event, n)"
        @drag-end="(event, n) => emit('drag-end', event, n)"
        @update:rename-draft="emit('update:rename-draft', $event)"
        @commit-rename="(n) => emit('commit-rename', n)"
        @cancel-rename="emit('cancel-rename')"
      />
    </ul>
  </li>
</template>

<style scoped>
.tree-list-node {
  list-style: none;
  margin: 0;
  padding: 0;
}

.tree-list-node__children {
  list-style: none;
  margin: 0;
  padding: 0;
}

.tree-list-node__row {
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 32px;
  padding: 4px 8px 4px 0;
  border-radius: 6px;
  cursor: pointer;
  user-select: none;
  line-height: 1.4;
}

.tree-list-node__row--draggable {
  cursor: grab;
}

.tree-list-node__row--draggable:active {
  cursor: grabbing;
}

.tree-list-node__row--dragging {
  opacity: 0.55;
}

.tree-list-node__row:hover {
  background: #f2f4f7;
}

.tree-list-node__row--selected {
  background: #ecf5ff;
  color: #175cd3;
}

.tree-list-node__row--disabled {
  cursor: default;
  color: #667085;
}

.tree-list-node__row--disabled:hover {
  background: transparent;
}

.tree-list-node__row--drop-before {
  box-shadow: inset 0 2px 0 #1677ff;
}

.tree-list-node__row--drop-after {
  box-shadow: inset 0 -2px 0 #1677ff;
}

.tree-list-node__row--drop-inside {
  outline: 1px solid #1677ff;
  outline-offset: -1px;
  background: #eff6ff;
}

.tree-list-node__toggle {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  background: transparent;
  color: #667085;
  font-size: 10px;
  line-height: 20px;
  cursor: pointer;
}

.tree-list-node__toggle--placeholder {
  visibility: hidden;
  pointer-events: none;
}

.tree-list-node__label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}

.tree-list-node__rename-input {
  flex: 1;
  min-width: 0;
  height: 24px;
  padding: 1px 6px;
  border: 1px solid #1677ff;
  border-radius: 4px;
  outline: none;
  background: #fff;
  color: #1e293b;
  font: inherit;
  box-sizing: border-box;
}

.tree-list-node__description {
  flex-shrink: 0;
  color: #667085;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
</style>

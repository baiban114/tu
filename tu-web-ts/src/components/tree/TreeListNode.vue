<script setup lang="ts">
import type { TreeNode } from '@/utils/tree';

defineProps<{
  node: TreeNode;
  depth: number;
  indentPx: number;
  selectedId?: string | null;
  expandedIds: Set<string>;
  isSelectable: (node: TreeNode) => boolean;
}>();

const emit = defineEmits<{
  toggle: [event: MouseEvent, node: TreeNode];
  select: [node: TreeNode];
}>();

function hasChildren(node: TreeNode) {
  return Boolean(node.children?.length);
}

function isExpanded(node: TreeNode, expandedIds: Set<string>) {
  return expandedIds.has(node.id);
}
</script>

<template>
  <li class="tree-list-node" role="treeitem">
    <div
      class="tree-list-node__row"
      :class="{
        'tree-list-node__row--selected': selectedId === node.id,
        'tree-list-node__row--disabled': !isSelectable(node),
      }"
      :style="{ paddingLeft: `${depth * indentPx + 8}px` }"
      @click="isSelectable(node) && emit('select', node)"
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
      <span class="tree-list-node__label">{{ node.label }}</span>
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
        :expanded-ids="expandedIds"
        :is-selectable="isSelectable"
        @toggle="(event, n) => emit('toggle', event, n)"
        @select="(n) => emit('select', n)"
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
</style>

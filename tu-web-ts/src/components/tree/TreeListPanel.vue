<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { TreeNode } from '@/utils/tree';
import TreeListNode from './TreeListNode.vue';

const props = withDefaults(defineProps<{
  nodes: TreeNode[];
  selectedId?: string | null;
  defaultExpandDepth?: number;
  indentPx?: number;
  emptyText?: string;
  isSelectable?: (node: TreeNode) => boolean;
}>(), {
  selectedId: null,
  defaultExpandDepth: 1,
  indentPx: 16,
  emptyText: '暂无数据',
});

const emit = defineEmits<{
  select: [node: TreeNode];
  toggle: [node: TreeNode, expanded: boolean];
}>();

const expandedIds = ref<Set<string>>(new Set());

function collectExpandableIds(nodes: TreeNode[], depth: number, acc: Set<string>) {
  for (const node of nodes) {
    if (node.children?.length && depth < props.defaultExpandDepth) {
      acc.add(node.id);
      collectExpandableIds(node.children, depth + 1, acc);
    }
  }
}

function resetExpandedFromDepth() {
  const next = new Set<string>();
  collectExpandableIds(props.nodes, 0, next);
  expandedIds.value = next;
}

watch(
  () => [props.nodes, props.defaultExpandDepth] as const,
  () => resetExpandedFromDepth(),
  { immediate: true, deep: true },
);

watch(
  () => props.selectedId,
  (selectedId) => {
    if (!selectedId) return;
    const expandPath = (nodes: TreeNode[], path: string[] = []): boolean => {
      for (const node of nodes) {
        if (node.id === selectedId) {
          for (const id of path) expandedIds.value.add(id);
          return true;
        }
        if (node.children?.length && expandPath(node.children, [...path, node.id])) {
          expandedIds.value.add(node.id);
          return true;
        }
      }
      return false;
    };
    expandPath(props.nodes);
  },
);

const hasNodes = computed(() => props.nodes.length > 0);

function isNodeSelectable(node: TreeNode): boolean {
  return props.isSelectable ? props.isSelectable(node) : true;
}

function onToggle(event: MouseEvent, node: TreeNode) {
  event.stopPropagation();
  if (!node.children?.length) return;
  const next = new Set(expandedIds.value);
  if (next.has(node.id)) {
    next.delete(node.id);
    emit('toggle', node, false);
  } else {
    next.add(node.id);
    emit('toggle', node, true);
  }
  expandedIds.value = next;
}

function onSelect(node: TreeNode) {
  emit('select', node);
}
</script>

<template>
  <div class="tree-list-panel" role="tree">
    <p v-if="!hasNodes" class="tree-list-panel__empty">{{ emptyText }}</p>
    <ul v-else class="tree-list-panel__list">
      <TreeListNode
        v-for="node in nodes"
        :key="node.id"
        :node="node"
        :depth="0"
        :indent-px="indentPx"
        :selected-id="selectedId"
        :expanded-ids="expandedIds"
        :is-selectable="isNodeSelectable"
        @toggle="onToggle"
        @select="onSelect"
      />
    </ul>
  </div>
</template>

<style scoped>
.tree-list-panel {
  min-width: 0;
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
</style>

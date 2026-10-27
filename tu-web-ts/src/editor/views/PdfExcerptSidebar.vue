<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import type { TreeContextMenuItem, TreeNode } from '@/utils/tree'
import TreeListPanel from '@/components/tree/TreeListPanel.vue'
import {
  pdfSidebarNodesToTreeNodes,
  resolveSidebarNodePage,
  type PdfSidebarNode,
  type PdfSidebarTreeMeta,
} from '@/utils/pdfOutline'

const props = defineProps<{
  nodes: PdfSidebarNode[]
  startPage: number
  endPage: number
  activeNodeId: string | null
  expandedNodeIds: ReadonlySet<string>
}>()

interface PdfSidebarPresentationMeta extends PdfSidebarTreeMeta {
  source: PdfSidebarNode
  pageNumber: number | null
}

type PdfSidebarTreeNode = TreeNode<PdfSidebarPresentationMeta>

const emit = defineEmits<{
  navigate: [payload: { nodeId: string; pageNumber: number }]
  'toggle-expand': [nodeId: string]
  'rename-bookmark': [payload: { nodeId: string; title: string }]
  'delete-bookmark': [nodeId: string]
  'reorder-bookmarks': [payload: {
    draggedId: string
    targetId: string
    position: 'before' | 'after' | 'inside'
  }]
}>()

const treeRef = ref<{
  startRename: (node: PdfSidebarTreeNode) => void
} | null>(null)

const treeNodes = computed<PdfSidebarTreeNode[]>(() => {
  return pdfSidebarNodesToTreeNodes(props.nodes, (node) => ({
    pageNumber: resolveSidebarNodePage(node, props.startPage, props.endPage),
    custom: Boolean(node.custom),
    source: node,
  }))
})

const expandedIds = computed(() => [...props.expandedNodeIds])
const defaultExpandDepth = computed(() => 1_000_000)

function isCustomBookmark(node: PdfSidebarTreeNode) {
  return Boolean(node.meta?.custom)
}

function nodeDescription(node: PdfSidebarTreeNode) {
  const pageNumber = node.meta?.pageNumber
  return pageNumber == null ? '' : String(pageNumber)
}

function nodeAriaLabel(node: PdfSidebarTreeNode) {
  const pageNumber = node.meta?.pageNumber
  return `${node.label}${pageNumber == null ? '' : `，第 ${pageNumber} 页`}`
}

function canReorderBookmarks(dragged: PdfSidebarTreeNode, target: PdfSidebarTreeNode) {
  return isCustomBookmark(dragged) && isCustomBookmark(target)
}

function contextMenuItems(node: PdfSidebarTreeNode): TreeContextMenuItem[] {
  if (!isCustomBookmark(node)) return []
  return [
    { id: 'rename', label: '重命名' },
    { id: 'delete', label: '删除', danger: true },
  ]
}

function onContextMenu(payload: {
  node: PdfSidebarTreeNode
  item: TreeContextMenuItem
}) {
  if (payload.item.id === 'rename') {
    treeRef.value?.startRename(payload.node)
    return
  }
  if (payload.item.id === 'delete') emit('delete-bookmark', payload.node.id)
}

function onSelect(node: PdfSidebarTreeNode) {
  const pageNumber = node.meta?.pageNumber
  if (pageNumber != null) emit('navigate', { nodeId: node.id, pageNumber })
}

function onToggle(node: PdfSidebarTreeNode) {
  emit('toggle-expand', node.id)
}

function onRename(payload: { node: PdfSidebarTreeNode; label: string }) {
  emit('rename-bookmark', { nodeId: payload.node.id, title: payload.label })
}

function onReorder(payload: {
  dragged: PdfSidebarTreeNode
  target: PdfSidebarTreeNode
  position: 'before' | 'after' | 'inside'
}) {
  void nextTick().then(() => {
    emit('reorder-bookmarks', {
      draggedId: payload.dragged.id,
      targetId: payload.target.id,
      position: payload.position,
    })
  })
}
</script>

<template>
  <TreeListPanel
    ref="treeRef"
    class="pdf-excerpt-sidebar-tree"
    :nodes="treeNodes"
    :selected-id="activeNodeId"
    :expanded-ids="expandedIds"
    :default-expand-depth="defaultExpandDepth"
    :draggable="true"
    :can-drag="isCustomBookmark"
    :can-drop="canReorderBookmarks"
    :allow-drop-inside="true"
    :context-menu-items="contextMenuItems"
    :is-renamable="isCustomBookmark"
    :get-node-description="nodeDescription"
    :get-node-aria-label="nodeAriaLabel"
    empty-text="暂无书签"
    @select="onSelect"
    @toggle="onToggle"
    @menu-action="onContextMenu"
    @rename="onRename"
    @reorder="onReorder"
  />
</template>

<style scoped>
.pdf-excerpt-sidebar-tree {
  min-height: 0;
  font-size: 12px;
}

.pdf-excerpt-sidebar-tree :deep(.tree-list-node__row) {
  min-height: 28px;
  padding-top: 3px;
  padding-bottom: 3px;
}

.pdf-excerpt-sidebar-tree :deep(.tree-list-node__row:hover) {
  background: #e2e8f0;
}

.pdf-excerpt-sidebar-tree :deep(.tree-list-node__row--selected) {
  background: #dbeafe;
  color: #1d4ed8;
}

.pdf-excerpt-sidebar-tree :deep(.tree-list-node__label) {
  font-size: 12px;
}
</style>

<script setup lang="ts">
import type { PdfSidebarNode } from '@/utils/pdfOutline'
import { resolveSidebarNodePage } from '@/utils/pdfOutline'
import PdfExcerptSidebar from './PdfExcerptSidebar.vue'

const props = defineProps<{
  nodes: PdfSidebarNode[]
  startPage: number
  endPage: number
  activeNodeId: string | null
  expandedNodeIds: ReadonlySet<string>
  depth?: number
}>()

const emit = defineEmits<{
  navigate: [payload: { nodeId: string; pageNumber: number }]
  'toggle-expand': [nodeId: string]
}>()

function navigablePage(node: PdfSidebarNode): number | null {
  return resolveSidebarNodePage(node, props.startPage, props.endPage)
}

function isExpanded(nodeId: string): boolean {
  return props.expandedNodeIds.has(nodeId)
}

function onToggleExpand(nodeId: string, event: MouseEvent) {
  event.preventDefault()
  event.stopPropagation()
  emit('toggle-expand', nodeId)
}

function onClick(node: PdfSidebarNode, event: MouseEvent) {
  event.preventDefault()
  event.stopPropagation()
  const pageNumber = navigablePage(node)
  if (pageNumber != null) {
    emit('navigate', { nodeId: node.id, pageNumber })
  }
}
</script>

<template>
  <ul
    class="pdf-excerpt-sidebar__list"
    :class="{ 'pdf-excerpt-sidebar__list--nested': (depth ?? 0) > 0 }"
  >
    <li v-for="node in nodes" :key="node.id" class="pdf-excerpt-sidebar__item">
      <div
        class="pdf-excerpt-sidebar__row"
        :style="{ paddingLeft: `${4 + (depth ?? 0) * 3}px` }"
      >
        <button
          v-if="node.children.length > 0"
          type="button"
          class="pdf-excerpt-sidebar__toggle"
          :title="isExpanded(node.id) ? '收起' : '展开'"
          :aria-label="isExpanded(node.id) ? '收起' : '展开'"
          :aria-expanded="isExpanded(node.id)"
          data-node-view-no-drag
          @mousedown.stop
          @click="onToggleExpand(node.id, $event)"
        >
          <svg
            class="pdf-excerpt-sidebar__toggle-icon"
            :class="{ 'pdf-excerpt-sidebar__toggle-icon--expanded': isExpanded(node.id) }"
            viewBox="0 0 12 12"
            aria-hidden="true"
          >
            <path
              d="M4.5 2.5 8 6l-3.5 3.5"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
        <span v-else class="pdf-excerpt-sidebar__toggle-spacer" aria-hidden="true" />
        <button
          type="button"
          class="pdf-excerpt-sidebar__link"
          :class="{
            'pdf-excerpt-sidebar__link--active': node.id === activeNodeId,
            'pdf-excerpt-sidebar__link--disabled': navigablePage(node) == null,
          }"
          @mousedown.stop
          @click="onClick(node, $event)"
        >
          <span class="pdf-excerpt-sidebar__title" :title="node.title">{{ node.title }}</span>
          <span v-if="navigablePage(node)" class="pdf-excerpt-sidebar__page">
            {{ navigablePage(node) }}
          </span>
        </button>
      </div>
      <PdfExcerptSidebar
        v-if="node.children.length > 0 && isExpanded(node.id)"
        :nodes="node.children"
        :start-page="startPage"
        :end-page="endPage"
        :active-node-id="activeNodeId"
        :expanded-node-ids="expandedNodeIds"
        :depth="(depth ?? 0) + 1"
        @navigate="emit('navigate', $event)"
        @toggle-expand="emit('toggle-expand', $event)"
      />
    </li>
  </ul>
</template>

<style scoped>
.pdf-excerpt-sidebar__list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.pdf-excerpt-sidebar__list--nested {
  margin-left: 0;
}

.pdf-excerpt-sidebar__item {
  margin: 0;
}

.pdf-excerpt-sidebar__row {
  display: flex;
  align-items: flex-start;
  gap: 2px;
  min-width: 0;
}

.pdf-excerpt-sidebar__toggle {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 28px;
  margin: 0;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #64748b;
  cursor: pointer;
}

.pdf-excerpt-sidebar__toggle:hover {
  background: #e2e8f0;
  color: #334155;
}

.pdf-excerpt-sidebar__toggle-icon {
  width: 10px;
  height: 10px;
  transition: transform 0.15s ease;
}

.pdf-excerpt-sidebar__toggle-icon--expanded {
  transform: rotate(90deg);
}

.pdf-excerpt-sidebar__toggle-spacer {
  flex-shrink: 0;
  width: 16px;
  height: 28px;
}

.pdf-excerpt-sidebar__link {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 6px 6px 2px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #334155;
  font-size: 12px;
  line-height: 1.35;
  text-align: left;
  cursor: pointer;
  box-sizing: border-box;
}

.pdf-excerpt-sidebar__link:hover:not(.pdf-excerpt-sidebar__link--disabled) {
  background: #e2e8f0;
}

.pdf-excerpt-sidebar__link--active {
  background: #dbeafe;
  color: #1d4ed8;
}

.pdf-excerpt-sidebar__link--disabled {
  color: #94a3b8;
  cursor: default;
}

.pdf-excerpt-sidebar__title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pdf-excerpt-sidebar__page {
  flex-shrink: 0;
  font-size: 11px;
  color: #64748b;
}

.pdf-excerpt-sidebar__link--active .pdf-excerpt-sidebar__page {
  color: #1d4ed8;
}
</style>

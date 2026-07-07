<script setup lang="ts">
import type { PdfSidebarNode } from '@/utils/pdfOutline'
import { resolveSidebarNodePage } from '@/utils/pdfOutline'
import PdfExcerptSidebar from './PdfExcerptSidebar.vue'

const props = defineProps<{
  nodes: PdfSidebarNode[]
  startPage: number
  endPage: number
  activeNodeId: string | null
  depth?: number
}>()

const emit = defineEmits<{
  navigate: [payload: { nodeId: string; pageNumber: number }]
}>()

function navigablePage(node: PdfSidebarNode): number | null {
  return resolveSidebarNodePage(node, props.startPage, props.endPage)
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
      <button
        type="button"
        class="pdf-excerpt-sidebar__link"
        :class="{
          'pdf-excerpt-sidebar__link--active': node.id === activeNodeId,
          'pdf-excerpt-sidebar__link--disabled': navigablePage(node) == null,
        }"
        :style="{ paddingLeft: `${4 + (depth ?? 0) * 3}px` }"
        @mousedown.stop
        @click="onClick(node, $event)"
      >
        <span class="pdf-excerpt-sidebar__title" :title="node.title">{{ node.title }}</span>
        <span v-if="navigablePage(node)" class="pdf-excerpt-sidebar__page">
          {{ navigablePage(node) }}
        </span>
      </button>
      <PdfExcerptSidebar
        v-if="node.children.length"
        :nodes="node.children"
        :start-page="startPage"
        :end-page="endPage"
        :active-node-id="activeNodeId"
        :depth="(depth ?? 0) + 1"
        @navigate="emit('navigate', $event)"
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

.pdf-excerpt-sidebar__link {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  padding: 6px 6px 6px 4px;
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

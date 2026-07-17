<script setup lang="ts">
import TuEditor from './TuEditor.vue';
import Line from './line.vue';
import TableBlock from './TableBlock.vue';
import MultiTableBlock from './MultiTableBlock.vue';
import X6Component from './X6Component.vue';
import ExternalResourceExcerptMeta from './ExternalResourceExcerptMeta.vue';
import type { Block, MultiTableData, TableBlockData } from '@/api/types';
import { computed, ref } from 'vue';
import { useRefGutterForwarding } from '@/composables/useRefGutterForwarding';

type ResizeEdge = 'right' | 'bottom' | 'corner';

interface ResizeState {
  childIndex: number;
  edge: ResizeEdge;
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
  maxWidth: number;
}

const props = withDefaults(defineProps<{
  block?: Block;
  editable?: boolean;
}>(), {
  editable: true,
});

const {
  nestedEditorRef,
  hasRefGutterHost,
  forwardLineAnnotate,
  forwardMarkExcerpt,
  forwardSetBasis,
  forwardCreateKnowledgeRelation,
} = useRefGutterForwarding();

const lineGutterActions = computed(() => props.editable || hasRefGutterHost)

const emit = defineEmits<{
  (e: 'update-block', block: Block): void;
}>();

const MIN_CHILD_WIDTH = 220;
const MIN_CHILD_HEIGHT = 80;
const activeChildIndex = ref(-1);
const resizingChild = ref<ResizeState | null>(null);
const childShellRefs = ref<Record<number, HTMLElement>>({});

const isRichTextBlock = (block: Block | undefined): boolean => {
  return Boolean(block && (block.type === 'richtext' || block.type === 'richText'));
};

const getExternalResourceExcerptBlocks = (block: Block): Block[] | null => {
  const excerptText = block.externalResource?.snapshot?.excerptText?.trim();
  if (block.type !== 'externalResource' || !excerptText) return null;
  return [{ id: block.id, type: 'richtext', content: excerptText }];
};

const renderFallbackText = (block: Block): string => {
  if (block.type === 'x6') return block.title?.trim() || '画板';
  if (block.type === 'table') return block.title?.trim() || '表格';
  if (block.type === 'multiTable') return block.title?.trim() || '多维表格';
  if (block.type === 'line') return block.title?.trim() || '时间轴';
  if (block.type === 'externalResource') {
    return block.externalResource?.snapshot?.excerptTitle
      || block.externalResource?.snapshot?.resourceTitle
      || block.title?.trim()
      || '外部资源';
  }
  if (block.type === 'container') return block.title?.trim() || '组合单元';
  return block.content ?? '';
};

const updateBlock = (patch: Partial<Block>) => {
  if (!props.block) return;
  emit('update-block', { ...props.block, ...patch });
};

const updateChildBlock = (childIndex: number, child: Block) => {
  if (!props.block?.children) return;
  const children = [...props.block.children];
  children[childIndex] = child;
  updateBlock({ children });
};

const updateChildBlockPatch = (childIndex: number, patch: Partial<Block>) => {
  const child = props.block?.children?.[childIndex];
  if (!child) return;
  updateChildBlock(childIndex, { ...child, ...patch });
};

const normalizeBlockWidth = (value: unknown): string | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `${Math.max(MIN_CHILD_WIDTH, Math.round(value))}px`;
  }
  if (typeof value !== 'string') return undefined;

  const trimmed = value.trim();
  if (!trimmed || trimmed === 'auto') return undefined;
  if (/^\d+(\.\d+)?px$/.test(trimmed)) {
    return `${Math.max(MIN_CHILD_WIDTH, Math.round(Number.parseFloat(trimmed)))}px`;
  }
  if (/^\d+(\.\d+)?%$/.test(trimmed)) {
    const percent = Math.max(20, Math.min(100, Number.parseFloat(trimmed)));
    return `${percent.toFixed(2).replace(/\.00$/, '')}%`;
  }
  return undefined;
};

const getReferencedChildStyle = (child: Block) => ({
  width: normalizeBlockWidth(child.width) || '100%',
  minHeight: typeof child.blockHeight === 'number'
    ? `${Math.max(MIN_CHILD_HEIGHT, child.blockHeight)}px`
    : undefined,
});

const setChildShellRef = (el: Element | null, childIndex: number) => {
  if (el instanceof HTMLElement) {
    childShellRefs.value[childIndex] = el;
  } else {
    delete childShellRefs.value[childIndex];
  }
};

const commitChildResize = (state: ResizeState, widthPx?: number, heightPx?: number) => {
  const updates: Partial<Block> = {};
  if (typeof widthPx === 'number') {
    const width = Math.max(MIN_CHILD_WIDTH, Math.min(state.maxWidth, widthPx));
    updates.width = `${Math.round(width)}px`;
  }
  if (typeof heightPx === 'number') {
    updates.blockHeight = Math.max(MIN_CHILD_HEIGHT, Math.round(heightPx));
  }
  updateChildBlockPatch(state.childIndex, updates);
};

const handleChildResizeMove = (event: MouseEvent) => {
  const state = resizingChild.value;
  if (!state) return;

  const nextWidth = state.edge === 'right' || state.edge === 'corner'
    ? state.startWidth + event.clientX - state.startX
    : undefined;
  const nextHeight = state.edge === 'bottom' || state.edge === 'corner'
    ? state.startHeight + event.clientY - state.startY
    : undefined;

  commitChildResize(state, nextWidth, nextHeight);
};

const stopChildResize = () => {
  if (!resizingChild.value) return;
  resizingChild.value = null;
  document.body.classList.remove('tu-referenced-block-resizing');
  document.removeEventListener('mousemove', handleChildResizeMove);
  document.removeEventListener('mouseup', stopChildResize);
};

const startChildResize = (event: MouseEvent, childIndex: number, edge: ResizeEdge) => {
  if (!props.editable) return;
  const shell = childShellRefs.value[childIndex];
  if (!shell) return;

  event.preventDefault();
  event.stopPropagation();
  activeChildIndex.value = childIndex;

  const rect = shell.getBoundingClientRect();
  const containerRect = shell.parentElement?.getBoundingClientRect();
  resizingChild.value = {
    childIndex,
    edge,
    startX: event.clientX,
    startY: event.clientY,
    startWidth: rect.width,
    startHeight: rect.height,
    maxWidth: Math.max(MIN_CHILD_WIDTH, containerRect?.width ?? rect.width),
  };

  document.body.classList.add('tu-referenced-block-resizing');
  document.addEventListener('mousemove', handleChildResizeMove);
  document.addEventListener('mouseup', stopChildResize);
};
</script>

<template>
  <div v-if="block" class="referenced-block-renderer">
    <TuEditor
      v-if="isRichTextBlock(block)"
      :key="`ref-richtext-${block.id}`"
      ref="nestedEditorRef"
      :blocks="[block]"
      :editable="editable"
      :line-gutter-actions="lineGutterActions"
      class="block-content"
      @update:blocks="([updated]: Block[]) => updateBlock({ content: updated.content })"
      @line-annotate="forwardLineAnnotate"
      @mark-block-excerpt="forwardMarkExcerpt"
      @set-block-basis="forwardSetBasis"
      @line-create-knowledge-relation="forwardCreateKnowledgeRelation"
    />
    <X6Component
      v-else-if="block.type === 'x6'"
      :key="`ref-x6-${block.id}`"
      :graphData="block.graphData"
      :editable="editable"
      :block-actions-enabled="false"
      class="block-content board-content"
      @graph-data-change="(graphData: any) => updateBlock({ graphData })"
    />
    <TableBlock
      v-else-if="block.type === 'table'"
      :key="`ref-table-${block.id}`"
      :data="block.tableData"
      :editable="editable"
      class="block-content"
      @change="(tableData: TableBlockData) => updateBlock({ tableData })"
    />
    <MultiTableBlock
      v-else-if="block.type === 'multiTable'"
      :key="`ref-multi-table-${block.id}`"
      :data="block.multiTableData"
      :editable="editable"
      class="block-content"
      @change="(multiTableData: MultiTableData) => updateBlock({ multiTableData })"
    />
    <Line
      v-else-if="block.type === 'line'"
      :key="`ref-line-${block.id}`"
      :timelineData="block.timelineData"
      class="block-content board-content"
    />
    <ExternalResourceExcerptMeta
      v-else-if="block.type === 'externalResource' && block.externalResource"
      :key="`ref-external-resource-${block.id}`"
      :external-resource="block.externalResource"
      :body-block-id="block.id"
      show-body
      compact
      :line-gutter-actions="lineGutterActions"
      class="referenced-external-resource"
      @line-annotate="forwardLineAnnotate"
      @mark-block-excerpt="forwardMarkExcerpt"
      @set-block-basis="forwardSetBasis"
      @line-create-knowledge-relation="forwardCreateKnowledgeRelation"
    />
    <div
      v-else-if="block.type === 'container'"
      :key="`ref-container-${block.id}`"
      class="referenced-container"
    >
      <div
        v-for="(child, childIndex) in block.children ?? []"
        :key="child.id"
        class="referenced-container__child-shell"
        :class="{ 'referenced-container__child-shell--active': activeChildIndex === childIndex }"
        :style="getReferencedChildStyle(child)"
        :ref="(el) => setChildShellRef(el as Element | null, childIndex)"
        :tabindex="editable ? 0 : -1"
        @click.stop="activeChildIndex = childIndex"
        @focus="activeChildIndex = childIndex"
      >
        <ReferencedBlockRenderer
          :block="child"
          :editable="editable"
          class="referenced-container__child"
          @update-block="(updatedChild: Block) => updateChildBlock(childIndex, updatedChild)"
        />
        <template v-if="editable && activeChildIndex === childIndex">
          <button
            type="button"
            class="referenced-resize-handle referenced-resize-handle--right"
            aria-label="调整引用单元内块宽度"
            @mousedown="startChildResize($event, childIndex, 'right')"
          />
          <button
            type="button"
            class="referenced-resize-handle referenced-resize-handle--bottom"
            aria-label="调整引用单元内块高度"
            @mousedown="startChildResize($event, childIndex, 'bottom')"
          />
          <button
            type="button"
            class="referenced-resize-handle referenced-resize-handle--corner"
            aria-label="调整引用单元内块尺寸"
            @mousedown="startChildResize($event, childIndex, 'corner')"
          />
        </template>
      </div>
    </div>
    <div v-else-if="block.type !== 'ref'" class="referenced-block-renderer__fallback">
      {{ renderFallbackText(block) }}
    </div>
  </div>
  <div v-else class="referenced-block-renderer__fallback">引用内容未加载</div>
</template>

<style scoped>
.referenced-block-renderer {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.referenced-excerpt-editor :deep(.tu-editor-content) {
  padding: 0 !important;
}

.referenced-external-resource {
  min-width: 0;
}

.referenced-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid #d6e4ff;
  border-radius: 6px;
  background: #fff;
}

.referenced-container__child-shell {
  position: relative;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  border: 1px solid transparent;
  border-radius: 6px;
  outline: none;
}

.referenced-container__child-shell--active {
  border-color: #1677ff;
}

.referenced-container__child {
  min-width: 0;
  height: 100%;
}

.referenced-resize-handle {
  position: absolute;
  z-index: 20;
  border: 1px solid #1677ff;
  border-radius: 4px;
  background: #fff;
  box-shadow: 0 2px 8px rgba(22, 119, 255, 0.18);
  opacity: 0.92;
}

.referenced-resize-handle--right {
  top: 50%;
  right: -6px;
  width: 10px;
  height: 36px;
  cursor: ew-resize;
  transform: translateY(-50%);
}

.referenced-resize-handle--bottom {
  bottom: -6px;
  left: 50%;
  width: 44px;
  height: 10px;
  cursor: ns-resize;
  transform: translateX(-50%);
}

.referenced-resize-handle--corner {
  right: -7px;
  bottom: -7px;
  width: 14px;
  height: 14px;
  cursor: nwse-resize;
}

:global(.tu-referenced-block-resizing) {
  cursor: nwse-resize;
  user-select: none;
}

.referenced-block-renderer__fallback {
  padding: 10px 12px;
  border-radius: 6px;
  background: #fff;
  color: #595959;
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>

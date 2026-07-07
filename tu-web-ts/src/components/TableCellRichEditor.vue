<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Editor } from '@tiptap/core';
import type { Block } from '@/api/types';
import TuEditor from './TuEditor.vue';

const props = withDefaults(defineProps<{
  cellId: string;
  content: string;
  editable?: boolean;
}>(), {
  editable: true,
});

const emit = defineEmits<{
  (e: 'change', value: string): void;
  (e: 'active'): void;
  (e: 'blur'): void;
}>();

const tuEditorRef = ref<InstanceType<typeof TuEditor> | null>(null);

const blocks = computed<Block[]>(() => [{
  id: props.cellId,
  type: 'richtext',
  content: props.content,
}]);

function handleBlocksUpdate(nextBlocks: Block[]) {
  const rich = nextBlocks.find((block) => block.type === 'richtext' || block.type === 'richText');
  emit('change', rich?.content ?? '');
}

function insertMarkdownLink(label: string, url: string, _display: 'link' | 'image' = 'link'): boolean {
  const ed = tuEditorRef.value?.editor;
  if (!ed) return false;
  ed.chain().focus().insertContent(label).setLink({ href: url }).run();
  return true;
}

function getMarkdownLinkAnchor(): { top: number; left: number } | undefined {
  const ed = tuEditorRef.value?.editor;
  if (!ed) return undefined;
  const { from } = ed.state.selection;
  const coords = ed.view.coordsAtPos(from);
  return coords ? { top: coords.top, left: coords.left } : undefined;
}

function updateInsertedLinkDisplay(_display: 'link' | 'image'): boolean {
  return false;
}

function updateInsertedImageWidth(_widthPercent: number): boolean {
  return false;
}

defineExpose({
  getEditor: (): Editor | null => tuEditorRef.value?.editor ?? null,
  getMarkdownLinkAnchor,
  insertMarkdownLink,
  updateInsertedLinkDisplay,
  updateInsertedImageWidth,
});
</script>

<template>
  <div
    class="table-cell-rich-editor"
    @focusin="emit('active')"
    @focusout="emit('blur')"
    @mousedown.stop
    @click.stop
  >
    <TuEditor
      ref="tuEditorRef"
      :blocks="blocks"
      :editable="editable"
      :hover-handle="false"
      class="table-cell-rich-editor__tu"
      @update:blocks="handleBlocksUpdate"
    />
  </div>
</template>

<style scoped>
.table-cell-rich-editor {
  min-height: 38px;
  height: 100%;
  overflow: visible;
}

.table-cell-rich-editor__tu {
  min-height: 38px;
  height: 100%;
}

.table-cell-rich-editor__tu :deep(.tu-editor-content) {
  min-height: 38px;
  padding: 9px 10px;
  line-height: 1.45;
  overflow-wrap: anywhere;
  --tiptap-handle-gutter: 0;
}

.table-cell-rich-editor__tu :deep(.tu-editor-content p) {
  margin: 0;
}

.table-cell-rich-editor__tu :deep(.tu-editor-content p + p) {
  margin-top: 6px;
}

.table-cell-rich-editor__tu :deep(.tu-editor-content h1),
.table-cell-rich-editor__tu :deep(.tu-editor-content h2),
.table-cell-rich-editor__tu :deep(.tu-editor-content h3),
.table-cell-rich-editor__tu :deep(.tu-editor-content h4),
.table-cell-rich-editor__tu :deep(.tu-editor-content h5),
.table-cell-rich-editor__tu :deep(.tu-editor-content h6) {
  margin: 0 0 4px;
  font-size: inherit;
  line-height: 1.35;
}

.table-cell-rich-editor__tu :deep(.tu-editor-content ul),
.table-cell-rich-editor__tu :deep(.tu-editor-content ol) {
  margin: 0;
  padding-left: 18px;
}

.table-cell-rich-editor__tu :deep(.tu-editor-content img) {
  max-width: 100%;
  height: auto;
}
</style>

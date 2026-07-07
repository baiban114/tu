<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import type { Block } from '@/api/types';
import TuEditor from './TuEditor.vue';

interface Props {
  nodeId: string;
  styleProps: Record<string, string>;
  textMode: 'plain' | 'rich';
  label: string;
  richContent: string;
  isEditing: boolean;
  isEditable: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'commit-plain', text: string): void;
  (e: 'cancel'): void;
  (e: 'rich-change', markdown: string): void;
}>();

const plainText = ref(props.label);
const textareaRef = ref<HTMLTextAreaElement | null>(null);
const tuEditorRef = ref<InstanceType<typeof TuEditor> | null>(null);

const INLINE_BLOCK_ID = 'x6-node-inline-editor';

const richBlocks = computed<Block[]>(() => [{
  id: INLINE_BLOCK_ID,
  type: 'richtext',
  content: props.richContent,
}]);

const richOverlayStyle = computed<Record<string, string>>(() => ({
  ...props.styleProps,
  zIndex: props.isEditing && props.textMode === 'rich'
    ? '1001'
    : (props.styleProps.zIndex ?? '1000'),
}));

watch(() => props.label, (value) => {
  plainText.value = value;
});

watch(
  () => props.isEditing,
  (editing) => {
    if (editing && props.textMode === 'plain') {
      plainText.value = props.label;
      nextTick(() => {
        textareaRef.value?.focus();
        textareaRef.value?.select();
      });
    }
  },
);

function handlePlainKeydown(event: KeyboardEvent) {
  event.stopPropagation();
  if (event.key === 'Escape') {
    event.preventDefault();
    emit('cancel');
  } else if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
    event.preventDefault();
    emit('commit-plain', plainText.value);
  }
}

function handlePlainBlur() {
  if (props.isEditing && props.textMode === 'plain') {
    emit('commit-plain', plainText.value);
  }
}

function handleBlocksUpdate(blocks: Block[]) {
  const rich = blocks.find(
    (b) => b.type === 'richtext' || b.type === 'richText',
  );
  emit('rich-change', rich?.content ?? '');
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
  getMarkdownLinkAnchor,
  insertMarkdownLink,
  updateInsertedLinkDisplay,
  updateInsertedImageWidth,
});
</script>

<template>
  <div
    v-if="textMode === 'rich'"
    class="x6-node-overlay"
    :class="isEditing ? 'x6-node-overlay--rich-edit' : 'x6-node-overlay--rich-preview'"
    :style="richOverlayStyle"
  >
    <TuEditor
      ref="tuEditorRef"
      :blocks="richBlocks"
      :editable="isEditable"
      :hover-handle="false"
      class="x6-node-tu-editor"
      @update:blocks="handleBlocksUpdate"
    />
  </div>

  <div
    v-else-if="isEditing && textMode === 'plain'"
    class="x6-node-overlay x6-node-overlay--plain-edit"
    :style="styleProps"
    @mousedown.stop
    @click.stop
    @dblclick.stop
    @keydown.stop
  >
    <textarea
      ref="textareaRef"
      v-model="plainText"
      class="x6-node-plain-input"
      @keydown="handlePlainKeydown"
      @blur="handlePlainBlur"
    />
  </div>
</template>

<style scoped>
.x6-node-overlay {
  pointer-events: none;
}

.x6-node-overlay--rich-preview {
  position: absolute;
  overflow: visible;
  border-radius: 4px;
  pointer-events: none;
  z-index: 10;
}

.x6-node-overlay--rich-edit {
  position: absolute;
  pointer-events: auto;
  overflow: visible;
  z-index: 1001;
  border: 2px solid #1677ff;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.96);
}

.x6-node-tu-editor {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
}

.x6-node-tu-editor :deep(.tu-editor-content) {
  min-height: 0;
  height: auto;
  padding: 8px 10px;
  font-size: 12px;
  line-height: 1.3;
  word-break: break-word;
  --tiptap-handle-gutter: 0;
}

.x6-node-tu-editor :deep(.tu-editor-content p) {
  margin: 0;
}

.x6-node-tu-editor :deep(.tu-editor-content h1),
.x6-node-tu-editor :deep(.tu-editor-content h2),
.x6-node-tu-editor :deep(.tu-editor-content h3) {
  margin: 0 0 2px;
  font-size: 14px;
}

.x6-node-tu-editor :deep(.tu-editor-content ul),
.x6-node-tu-editor :deep(.tu-editor-content ol) {
  margin: 0;
  padding-left: 16px;
}

.x6-node-overlay--plain-edit {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
}

.x6-node-plain-input {
  width: 100%;
  height: 100%;
  border: 2px solid #1677ff;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.96);
  font-weight: 600;
  text-align: center;
  resize: none;
  outline: none;
  padding: 4px 8px;
  box-sizing: border-box;
  font-family: inherit;
  font-size: inherit;
  line-height: 1.4;
}
</style>

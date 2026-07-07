<script setup lang="ts">
import { ref, watch } from 'vue'
import ResizableBlockWrapper from '@/editor/components/ResizableBlockWrapper.vue'

interface CompoundBadge {
  annotationId: string
  color: string
}

interface ResizableAxes {
  width?: boolean
  height?: boolean
}

const props = withDefaults(
  defineProps<{
    mode: 'embedded' | 'page'
    selected?: boolean
    resizableAxes?: ResizableAxes
    minWidth?: number
    minHeight?: number
    blockTypeLabel?: string
    blockId?: string
    blockType?: string
    compoundBadges?: CompoundBadge[]
    headingLevel?: number
    headingText?: string
    pageTitleEditable?: boolean
  }>(),
  {
    selected: false,
    resizableAxes: () => ({ width: true, height: true }),
    minWidth: 200,
    minHeight: 150,
    blockTypeLabel: '',
    blockId: '',
    blockType: '',
    compoundBadges: () => [],
    headingLevel: 0,
    headingText: '',
    pageTitleEditable: false,
  },
)

const emit = defineEmits<{
  resize: [width: number | null, height: number | null]
  'compound-badge-click': [blockId: string, annotationId: string, event: MouseEvent]
  'page-title-change': [title: string]
}>()

const titleDraft = ref(props.headingText)

watch(
  () => props.headingText,
  (value) => {
    titleDraft.value = value
  },
)

function commitPageTitle() {
  const trimmed = titleDraft.value.trim()
  if (!trimmed || trimmed === props.headingText) return
  emit('page-title-change', trimmed)
}

function onTitleKeyup(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    commitPageTitle()
    ;(event.target as HTMLInputElement).blur()
  }
}
</script>

<template>
  <ResizableBlockWrapper
    v-if="mode === 'embedded'"
    :selected="selected"
    :resizable-axes="resizableAxes"
    :min-width="minWidth"
    :min-height="minHeight"
    :block-type-label="blockTypeLabel"
    :block-id="blockId"
    :block-type="blockType"
    :compound-badges="compoundBadges"
    :heading-level="headingLevel"
    :heading-text="headingText"
    @resize="(width, height) => emit('resize', width, height)"
    @compound-badge-click="(bid, annotationId, event) => emit('compound-badge-click', bid, annotationId, event)"
  >
    <slot />
  </ResizableBlockWrapper>

  <div v-else class="board-canvas-shell board-canvas-shell--page">
    <div class="board-canvas-shell__header">
      <input
        v-if="pageTitleEditable"
        v-model="titleDraft"
        class="board-canvas-shell__title-input"
        type="text"
        placeholder="未命名思维导图"
        @blur="commitPageTitle"
        @keyup="onTitleKeyup"
      />
      <h1 v-else-if="headingLevel > 0 && headingText" class="board-canvas-shell__title">
        {{ headingText }}
      </h1>
    </div>
    <div class="board-canvas-shell__body">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.board-canvas-shell--page {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.board-canvas-shell__header {
  flex-shrink: 0;
  padding: 16px 24px 8px;
}

.board-canvas-shell__title-input {
  width: 100%;
  max-width: 720px;
  border: none;
  outline: none;
  background: transparent;
  font-size: 28px;
  font-weight: 600;
  line-height: 1.3;
  color: #1f2933;
}

.board-canvas-shell__title {
  margin: 0;
  font-size: 28px;
  font-weight: 600;
  line-height: 1.3;
  color: #1f2933;
}

.board-canvas-shell__body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
</style>

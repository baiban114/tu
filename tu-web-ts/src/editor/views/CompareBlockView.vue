<script setup lang="ts">
import { computed, inject, unref, type Ref } from 'vue'
import { nodeViewProps, NodeViewWrapper } from '@tiptap/vue-3'
import type { ExternalResourceEmbedData } from '@/api/types'
import type { CompareSide } from '@/utils/compareBlock'
import { COMPARE_BLOCK_DEFAULT_HEIGHT } from '@/utils/compareBlock'
import ResizableBlockWrapper from '../components/ResizableBlockWrapper.vue'
import CompareSidePane from './CompareSidePane.vue'

const props = defineProps(nodeViewProps)

interface CompoundBadge {
  annotationId: string
  color: string
}

const compoundAnnotationBadges = inject<Record<string, CompoundBadge[]> | Ref<Record<string, CompoundBadge[]>>>('compoundAnnotationBadges', {})
const onCompoundBadgeClick = inject<((blockId: string, annotationId: string, event: MouseEvent) => void)>('onCompoundBadgeClick', () => {})
const onBindCompareSide = inject<((blockId: string, side: CompareSide) => void) | undefined>(
  'onBindCompareSide',
  undefined,
)

const blockId = computed(() => String(props.node.attrs.blockId || ''))
const compoundBadges = computed(() => unref(compoundAnnotationBadges)[blockId.value] || [])
const headingLevel = computed(() => Number(props.node.attrs.headingLevel || 0))
const title = computed(() => String(props.node.attrs.title || ''))
const headingText = computed(() => title.value || '文本比较')
const paneHeight = computed(() => {
  const h = Number(props.node.attrs.height)
  return Number.isFinite(h) && h > 120 ? h : COMPARE_BLOCK_DEFAULT_HEIGHT
})
const middleText = computed(() => String(props.node.attrs.middleText || ''))
const leftSide = computed<ExternalResourceEmbedData | null>(() => props.node.attrs.leftSide || null)
const rightSide = computed<ExternalResourceEmbedData | null>(() => props.node.attrs.rightSide || null)

function onMiddleInput(event: Event) {
  const target = event.target as HTMLTextAreaElement
  props.updateAttributes({ middleText: target.value })
}

function onResize(_width: number | null, height: number | null) {
  if (height == null) return
  props.updateAttributes({ height: Math.min(720, Math.max(160, height)) })
}

function onTitleChange(next: string) {
  props.updateAttributes({ title: next || '文本比较' })
}

function handleBadgeClick(bid: string, annotationId: string, event: MouseEvent) {
  onCompoundBadgeClick(bid, annotationId, event)
}

function bindSide(side: CompareSide) {
  if (!blockId.value || !onBindCompareSide) return
  onBindCompareSide(blockId.value, side)
}
</script>

<template>
  <node-view-wrapper class="compare-block-view">
    <ResizableBlockWrapper
      :selected="selected"
      :resizable-axes="{ width: false, height: true }"
      :min-height="160"
      :max-height="720"
      block-type-label="文本比较"
      :title="headingText"
      title-editable
      title-placeholder="文本比较"
      :block-id="blockId"
      block-type="compare"
      :compound-badges="compoundBadges"
      :heading-level="headingLevel"
      :heading-text="headingText"
      @resize="onResize"
      @title-change="onTitleChange"
      @compound-badge-click="handleBadgeClick"
    >
      <div class="compare-block-view__grid">
        <CompareSidePane
          side-label="左侧"
          :binding="leftSide"
          :pane-height="paneHeight"
          @bind="bindSide('left')"
        />
        <section class="compare-middle">
          <header class="compare-middle__header">
            <span class="compare-middle__label">中间</span>
            <span class="compare-middle__hint">可编辑纯文本</span>
          </header>
          <textarea
            class="compare-middle__textarea"
            :style="{ height: `${paneHeight}px` }"
            :value="middleText"
            placeholder="在此编辑综合文本…"
            spellcheck="false"
            @input="onMiddleInput"
          />
        </section>
        <CompareSidePane
          side-label="右侧"
          :binding="rightSide"
          :pane-height="paneHeight"
          @bind="bindSide('right')"
        />
      </div>
    </ResizableBlockWrapper>
  </node-view-wrapper>
</template>

<style scoped>
.compare-block-view__grid {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) minmax(180px, 1fr) minmax(180px, 1fr);
  gap: 8px;
  padding: 10px;
  overflow-x: auto;
  box-sizing: border-box;
}

.compare-middle {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  border: 1px solid #c7d2fe;
  border-radius: 8px;
  background: #fff;
  overflow: hidden;
}

.compare-middle__header {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  min-height: 36px;
  padding: 6px 8px;
  border-bottom: 1px solid #e0e7ff;
  background: #eef2ff;
}

.compare-middle__label {
  padding: 1px 8px;
  border-radius: 999px;
  background: #c7d2fe;
  color: #3730a3;
  font-size: 11px;
  font-weight: 600;
}

.compare-middle__hint {
  color: #64748b;
  font-size: 11px;
}

.compare-middle__textarea {
  display: block;
  width: 100%;
  box-sizing: border-box;
  margin: 0;
  padding: 10px 12px;
  border: 0;
  resize: none;
  outline: none;
  background: #fff;
  color: #111827;
  font: inherit;
  font-size: 13px;
  line-height: 1.55;
  overflow: auto;
}
</style>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import X6Component from '@/components/X6Component.vue'
import type { GraphData } from '@/api/types'
import type { TocTreeItem } from '@/utils/toc/headings'
import { buildMindmapGraphFromToc } from '@/utils/toc/mindmapFromToc'

const props = defineProps<{
  modelValue: boolean
  pageTitle: string
  tocItems: TocTreeItem[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const canvasHostRef = ref<HTMLElement | null>(null)
const canvasWidth = ref(720)
const canvasHeight = ref(420)

const graphData = computed<GraphData>(() => buildMindmapGraphFromToc({
  rootTitle: props.pageTitle,
  toc: props.tocItems,
}))

const hasOutline = computed(() => props.tocItems.length > 0)

function close() {
  emit('update:modelValue', false)
}

function measureCanvas() {
  const el = canvasHostRef.value
  if (!el) return
  canvasWidth.value = Math.max(320, el.clientWidth)
  canvasHeight.value = Math.max(240, el.clientHeight)
}

watch(
  () => props.modelValue,
  async (visible) => {
    if (!visible) return
    await nextTick()
    measureCanvas()
  },
)
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    class="tu-dialog-viewport document-outline-mindmap-dialog"
    title="目录思维导图"
    width="min(960px, 96vw)"
    align-center
    destroy-on-close
    @update:model-value="emit('update:modelValue', $event)"
    @closed="close"
  >
    <div class="document-outline-mindmap-dialog__body">
      <p class="document-outline-mindmap-dialog__hint">
        由当前文档目录结构生成的只读预览（根节点为页面标题）。
      </p>
      <div
        v-if="!hasOutline"
        class="document-outline-mindmap-dialog__empty"
      >
        当前文档暂无目录标题，仅显示页面根节点。
      </div>
      <div
        ref="canvasHostRef"
        class="document-outline-mindmap-dialog__canvas"
      >
        <X6Component
          :key="`${pageTitle}-${tocItems.length}-${canvasWidth}x${canvasHeight}`"
          :graph-data="graphData"
          :editable="false"
          :block-actions-enabled="false"
          layout-mode="fill"
          :width="canvasWidth"
          :height="canvasHeight"
        />
      </div>
    </div>
  </el-dialog>
</template>

<style scoped>
/* No footer: body fills the dialog below the title bar. */
.document-outline-mindmap-dialog :deep(.el-dialog__body) {
  padding: 12px 16px 16px;
  display: flex;
  flex-direction: column;
}

.document-outline-mindmap-dialog__body {
  display: flex;
  flex-direction: column;
  flex: 1;
  height: min(560px, calc(100dvh - 120px));
  min-height: 360px;
  gap: 10px;
  box-sizing: border-box;
}

.document-outline-mindmap-dialog__hint,
.document-outline-mindmap-dialog__empty {
  flex-shrink: 0;
  margin: 0;
  font-size: 13px;
  color: #64748b;
  line-height: 1.5;
}

.document-outline-mindmap-dialog__canvas {
  flex: 1;
  min-height: 0;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  overflow: hidden;
  background: #f8fafc;
}
</style>

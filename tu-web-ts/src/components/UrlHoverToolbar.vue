<script setup lang="ts">
import type { Editor } from '@tiptap/core'
import { computed, nextTick, ref, watch } from 'vue'
import { ElInputNumber } from 'element-plus'
import { useAnchoredFloating } from '@/composables/useAnchoredFloating'
import LinkPresentationModeBar from './LinkPresentationModeBar.vue'
import type { UrlHoverTarget } from '@/editor/urlHoverTarget'
import { resolveUrlHoverTargetAnchorRect } from '@/editor/urlHoverTarget'
import {
  URL_EMBED_MAX_HEIGHT,
  URL_EMBED_MIN_HEIGHT,
  type UrlDisplayMode,
} from '@/utils/urlDisplay'

interface Props {
  visible: boolean
  target: UrlHoverTarget | null
  editor?: Editor | null
  suppressed?: boolean
  pinning?: boolean
  loadingMode?: UrlDisplayMode | null
}

const props = withDefaults(defineProps<Props>(), {
  suppressed: false,
  pinning: false,
  loadingMode: null,
})

const emit = defineEmits<{
  (e: 'select-mode', mode: UrlDisplayMode): void
  (e: 'height-change', height: number): void
  (e: 'mouseenter'): void
  (e: 'mouseleave'): void
}>()

const toolbarRef = ref<HTMLElement | null>(null)
const measuredSize = ref({ width: 280, height: 96 })

const toolbarVisible = computed(() => props.visible && !props.suppressed && Boolean(props.target))

const getAnchorRect = () => resolveUrlHoverTargetAnchorRect(props.editor, props.target)

const getScrollRoots = () => {
  const editorDom = props.editor?.view.dom
  const scrollRoot = editorDom?.closest('.content-scroll') as HTMLElement | null
  return scrollRoot ? [scrollRoot] : []
}

const { position, updatePosition } = useAnchoredFloating({
  visible: toolbarVisible,
  getAnchorRect,
  getScrollRoots,
  placement: 'top',
  offset: 8,
  zIndex: 26,
  floatingWidth: computed(() => measuredSize.value.width),
  floatingHeight: computed(() => measuredSize.value.height),
})

const measureToolbar = () => {
  const el = toolbarRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  if (rect.width > 0 && rect.height > 0) {
    measuredSize.value = {
      width: Math.ceil(rect.width),
      height: Math.ceil(rect.height),
    }
  }
  updatePosition()
}

watch(
  () => props.target,
  () => {
    nextTick(() => {
      measureToolbar()
    })
  },
  { deep: true },
)

watch(toolbarVisible, (visible) => {
  if (!visible) return
  nextTick(() => {
    measureToolbar()
  })
})

watch(measuredSize, () => {
  updatePosition()
}, { deep: true })

const displayUrl = computed(() => props.target?.url || '')
const currentMode = computed(() => props.target?.displayMode || 'link')
const href = computed(() => props.target?.url || '')
const showIframeHeight = computed(() => props.target?.kind === 'iframe' && props.target.displayMode === 'iframe')
const iframeHeight = computed(() => props.target?.iframeHeight ?? URL_EMBED_MIN_HEIGHT)

function emitHeightChange(value: number | undefined) {
  if (value == null || Number.isNaN(value)) return
  emit('height-change', value)
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="toolbarVisible && target"
      ref="toolbarRef"
      class="url-hover-toolbar"
      :style="{ top: `${position.top}px`, left: `${position.left}px`, zIndex: position.zIndex }"
      @mousedown.prevent.stop
      @click.stop
      @mouseenter="emit('mouseenter')"
      @mouseleave="emit('mouseleave')"
    >
      <div class="url-hover-toolbar__url" :title="displayUrl">
        {{ displayUrl }}
      </div>
      <LinkPresentationModeBar
        :href="href"
        :current-mode="currentMode"
        :loading-mode="loadingMode"
        @select-mode="emit('select-mode', $event)"
      />
      <div v-if="showIframeHeight" class="url-hover-toolbar__height">
        <span class="url-hover-toolbar__height-label">高度</span>
        <ElInputNumber
          :model-value="iframeHeight"
          :min="URL_EMBED_MIN_HEIGHT"
          :max="URL_EMBED_MAX_HEIGHT"
          :step="40"
          size="small"
          controls-position="right"
          class="url-hover-toolbar__height-input"
          @mousedown.prevent.stop
          @update:model-value="emitHeightChange"
        />
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.url-hover-toolbar {
  position: fixed;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 200px;
  max-width: min(420px, calc(100vw - 24px));
  padding: 4px 6px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 3px;
  background: var(--el-bg-color);
  box-shadow: var(--el-box-shadow-light);
}

.url-hover-toolbar__url {
  font-size: 11px;
  color: #6b7280;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.3;
}

.url-hover-toolbar__height {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 2px;
}

.url-hover-toolbar__height-label {
  flex: 0 0 auto;
  font-size: 11px;
  color: #6b7280;
}

.url-hover-toolbar__height-input {
  flex: 1;
  min-width: 0;
}

.url-hover-toolbar__height-input :deep(.el-input__wrapper) {
  padding-left: 8px;
  padding-right: 28px;
}
</style>

<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount, toRef } from 'vue'
import type { Editor } from '@tiptap/core'
import { BubbleMenu } from '@tiptap/vue-3/menus'
import { ElButton, ElDivider } from 'element-plus'
import { getSelectionToolbarActions, shouldShowSelectionBubbleMenu } from '@/editor/selectionToolbar'

interface Props {
  editor: Editor | null | undefined
  suppressed?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  suppressed: false,
})

const emit = defineEmits<{
  (e: 'add-note'): void
  (e: 'mark-resource-excerpt'): void
  (e: 'set-excerpt-basis'): void
  (e: 'create-knowledge-relation'): void
}>()

const menuRoot = ref<HTMLElement | null>(null)
const selectionRevision = ref(0)
const isMouseSelecting = ref(false)
const suppressedRef = toRef(props, 'suppressed')
let detachEditorListeners: (() => void) | null = null
let pointerDown = false

function isEditorViewReady(editor: Editor | null | undefined): editor is Editor {
  return Boolean(editor && !editor.isDestroyed && editor.view?.dom)
}

/** BubbleMenu only re-runs shouldShow when selection/doc changes; mimic its focus handler after drag. */
function requestBubbleMenuUpdate(editor: Editor) {
  selectionRevision.value += 1
  window.setTimeout(() => {
    if (!isEditorViewReady(editor)) return
    editor.emit('focus', {
      editor,
      event: new FocusEvent('focus'),
      transaction: editor.state.tr,
    })
  }, 0)
}

watch(
  () => props.editor,
  (editor, _prev, onCleanup) => {
    detachEditorListeners?.()
    detachEditorListeners = null
    isMouseSelecting.value = false
    pointerDown = false
    if (!editor) return
    if (!isEditorViewReady(editor)) return

    const editorDom = editor.view.dom

    const bump = () => {
      selectionRevision.value += 1
    }
    editor.on('selectionUpdate', bump)
    editor.on('transaction', bump)

    const onMouseDown = (event: MouseEvent) => {
      if (event.button !== 0) return
      pointerDown = true
    }

    const onMouseMove = (event: MouseEvent) => {
      if (!pointerDown || (event.buttons & 1) === 0) return
      if (isMouseSelecting.value) return
      if (!isEditorViewReady(editor)) return
      isMouseSelecting.value = true
      editor.view.dispatch(editor.state.tr.setMeta('bubbleMenu', 'hide'))
    }

    const onMouseUp = (event: MouseEvent) => {
      if (event.button !== 0) return
      const wasDraggingSelection = isMouseSelecting.value
      pointerDown = false
      isMouseSelecting.value = false
      if (wasDraggingSelection && isEditorViewReady(editor)) {
        requestBubbleMenuUpdate(editor)
      }
    }

    editorDom.addEventListener('mousedown', onMouseDown)
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)

    detachEditorListeners = () => {
      if (!editor.isDestroyed) {
        editor.off('selectionUpdate', bump)
        editor.off('transaction', bump)
      }
      editorDom.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
    onCleanup(() => {
      detachEditorListeners?.()
      detachEditorListeners = null
      isMouseSelecting.value = false
      pointerDown = false
    })
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  detachEditorListeners?.()
})

watch(suppressedRef, () => {
  selectionRevision.value += 1
  const editor = props.editor
  if (!isEditorViewReady(editor)) return
  requestBubbleMenuUpdate(editor)
})

const actions = computed(() => {
  selectionRevision.value
  const editor = props.editor
  if (!editor) {
    return {
      canAddNote: false,
      canMarkResourceExcerpt: false,
      canSetExcerptBasis: false,
      canCreateKnowledgeRelation: false,
      canShow: false,
    }
  }
  const { from, to } = editor.state.selection
  return getSelectionToolbarActions(editor, from, to)
})

const bubbleShouldShow = (ctx: {
  editor: Editor
  view: Editor['view']
  state: Editor['state']
  from: number
  to: number
}) => {
  selectionRevision.value
  return shouldShowSelectionBubbleMenu(
    ctx.editor,
    ctx.view,
    ctx.state,
    ctx.from,
    ctx.to,
    suppressedRef.value,
    isMouseSelecting.value,
    menuRoot.value,
  )
}

/** Anchor bubble menu inside the editor surface so it scrolls with content (not viewport-fixed). */
const appendToEditorSurface = (): HTMLElement => {
  const editor = props.editor
  if (!isEditorViewReady(editor)) return document.body
  return (
    (editor.view.dom.closest('.tu-editor-wrapper') as HTMLElement | null)
    ?? editor.view.dom.parentElement
    ?? document.body
  )
}

const bubbleFloatingOptions = computed(() => {
  const editor = props.editor
  const scrollTarget = isEditorViewReady(editor)
    ? ((editor.view.dom.closest('.content-scroll') as HTMLElement | null) ?? window)
    : window
  return {
    strategy: 'absolute' as const,
    placement: 'top' as const,
    offset: 8,
    flip: true,
    shift: { padding: 8 },
    inline: true,
    scrollTarget,
  }
})
</script>

<template>
  <BubbleMenu
    v-if="editor && !editor.isDestroyed"
    class="selection-toolbar-host"
    :editor="editor"
    :update-delay="120"
    :append-to="appendToEditorSurface"
    :should-show="bubbleShouldShow"
    :options="bubbleFloatingOptions"
  >
    <div
      ref="menuRoot"
      class="selection-toolbar"
      @mousedown.prevent.stop
      @click.stop
    >
      <div class="selection-toolbar__group">
        <ElButton
          v-if="actions.canAddNote"
          size="small"
          text
          class="selection-toolbar__btn"
          @mousedown.prevent.stop
          @click="emit('add-note')"
        >
          标注
        </ElButton>
        <template v-if="actions.canMarkResourceExcerpt">
          <ElDivider v-if="actions.canAddNote" direction="vertical" class="selection-toolbar__divider" />
          <ElButton
            size="small"
            text
            type="primary"
            class="selection-toolbar__btn"
            @mousedown.prevent.stop
            @click="emit('mark-resource-excerpt')"
          >
            标记节选
          </ElButton>
        </template>
        <template v-if="actions.canSetExcerptBasis">
          <ElDivider
            v-if="actions.canAddNote || actions.canMarkResourceExcerpt"
            direction="vertical"
            class="selection-toolbar__divider"
          />
          <ElButton
            size="small"
            text
            type="success"
            class="selection-toolbar__btn"
            @mousedown.prevent.stop
            @click="emit('set-excerpt-basis')"
          >
            设置依据
          </ElButton>
        </template>
        <template v-if="actions.canCreateKnowledgeRelation">
          <ElDivider
            v-if="actions.canAddNote || actions.canMarkResourceExcerpt || actions.canSetExcerptBasis"
            direction="vertical"
            class="selection-toolbar__divider"
          />
          <ElButton
            size="small"
            text
            type="primary"
            class="selection-toolbar__btn"
            @mousedown.prevent.stop
            @click="emit('create-knowledge-relation')"
          >
            建立关联
          </ElButton>
        </template>
      </div>
    </div>
  </BubbleMenu>
</template>

<style scoped>
.selection-toolbar-host {
  z-index: 50;
}

.selection-toolbar {
  display: flex;
  align-items: center;
  padding: 1px 2px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 3px;
  background: var(--el-bg-color);
  box-shadow: var(--el-box-shadow-light);
}

.selection-toolbar__group {
  display: flex;
  align-items: center;
  gap: 0;
}

.selection-toolbar__btn {
  margin: 0;
  height: 24px;
  padding: 0 6px;
  font-size: 12px;
  font-weight: 500;
  border-radius: 2px;
}

.selection-toolbar__divider {
  height: 14px;
  margin: 0 1px;
}
</style>

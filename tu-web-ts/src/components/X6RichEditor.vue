<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import type { Editor } from '@tiptap/core'
import { parseInlineMarkdown, tipTapNodesToMarkdown } from '@/editor/converters'

const props = defineProps({
  content: { type: String, default: '' },
  editable: { type: Boolean, default: false },
  autoFocus: { type: Boolean, default: false },
})

const emit = defineEmits<{
  'content-change': [value: string]
  blur: []
}>()

const editorEl = ref<HTMLDivElement | null>(null)

function setContent(ed: Editor, markdown: string) {
  const nodes = parseInlineMarkdown(markdown || '')
  const content = nodes.length ? [{ type: 'paragraph', content: nodes }] : []
  ed.commands.setContent({
    type: 'doc',
    content,
  })
}

const editor = useEditor({
  editable: props.editable,
  extensions: [
    StarterKit.configure({
      heading: false,
      codeBlock: false,
      blockquote: false,
      horizontalRule: false,
      bulletList: false,
      orderedList: false,
      code: false,
    }),
    Underline,
    Link.configure({ openOnClick: false }),
  ],
  onUpdate: ({ editor: ed }) => {
    const json = ed.getJSON()
    const markdown = tipTapNodesToMarkdown(json.content || [])
    emit('content-change', markdown)
  },
  onBlur: () => {
    emit('blur')
  },
  onCreate: ({ editor: ed }) => {
    setContent(ed, props.content)
  },
})

defineExpose({ editor })

watch(() => props.content, (val) => {
  if (editor.value) {
    setContent(editor.value, val)
  }
})

watch(() => props.editable, (val) => {
  editor.value?.setEditable(val)
})

watch(() => props.autoFocus, async (val) => {
  if (val && editor.value) {
    await nextTick()
    editor.value.commands.focus()
  }
})
</script>

<template>
  <editor-content
    ref="editorEl"
    :editor="editor"
    class="x6-rich-editor"
  />
</template>

<style scoped>
.x6-rich-editor {
  width: 100%;
  height: 100%;
  overflow-y: auto;
  line-height: 1.5;
  font-size: inherit;
  color: inherit;
}

.x6-rich-editor :deep(.ProseMirror) {
  height: 100%;
  outline: none;
  padding: 6px 8px;
  box-sizing: border-box;
  word-break: break-word;
}

.x6-rich-editor :deep(.ProseMirror p) {
  margin: 0;
}
</style>

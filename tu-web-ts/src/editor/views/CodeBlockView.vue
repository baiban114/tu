<script setup lang="ts">
import { computed } from 'vue'
import { nodeViewProps, NodeViewWrapper } from '@tiptap/vue-3'
import { TextSelection } from '@tiptap/pm/state'
import { ElOption, ElSelect } from 'element-plus'
import TuBlockChromeHeader from '../components/TuBlockChromeHeader.vue'
import {
  CODE_BLOCK_LANGUAGE_OPTIONS,
  codeBlockLanguageFromSelect,
  codeBlockSelectValue,
  normalizeCodeBlockLanguage,
} from '../codeBlockLanguages'

const props = defineProps(nodeViewProps)

const currentLanguage = computed(() => codeBlockSelectValue(props.node.attrs.language))

const title = computed(() => String(props.node.attrs.title || ''))

function onTitleChange(next: string) {
  props.updateAttributes({ title: next.trim() })
}

const codeLanguageClass = computed(() => {
  const lang = normalizeCodeBlockLanguage(props.node.attrs.language)
  return lang ? `language-${lang}` : ''
})

/** Insert an empty paragraph before the code block and focus it. */
function insertParagraphBefore() {
  const pos = props.getPos()
  if (pos == null) return
  const tr = props.editor.state.tr.insert(pos, props.editor.state.schema.nodes.paragraph.create())
  tr.setSelection(TextSelection.create(tr.doc, pos + 1))
  props.editor.view.dispatch(tr)
  props.editor.view.focus()
}

/** Move cursor to the first position inside the code block content. */
function focusCodeBlockStart() {
  const pos = props.getPos()
  if (pos == null) return
  const tr = props.editor.state.tr.setSelection(TextSelection.create(props.editor.state.doc, pos + 1))
  props.editor.view.dispatch(tr)
  props.editor.view.focus()
}

/**
 * The title input lives outside ProseMirror's contenteditable, so bridge its
 * Enter/ArrowDown keys explicitly. Code-content keys are handled by the
 * extension shortcuts because their DOM event target is the ProseMirror root.
 */
function onKeydownCapture(event: KeyboardEvent) {
  if (event.target instanceof HTMLInputElement) {
    // Title input — intercept Enter and ArrowDown.
    if (event.key === 'Enter') {
      event.preventDefault()
      event.stopPropagation()
      const input = event.target
      const next = input.value.trim()
      if (next !== title.value.trim()) onTitleChange(next)
      input.blur()
      insertParagraphBefore()
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      event.stopPropagation()
      event.target.blur()
      focusCodeBlockStart()
      return
    }
    return
  }
}
</script>

<template>
  <node-view-wrapper
    class="tu-code-block-view"
    :class="{ 'tu-code-block-view--selected': selected }"
    @keydown.capture="onKeydownCapture"
  >
    <div class="tu-code-block-view__shell">
      <TuBlockChromeHeader
        :title="title"
        title-editable
        title-placeholder="代码块名称"
        @title-change="onTitleChange"
      >
        <template #trailing>
          <ElSelect
            :model-value="currentLanguage"
            class="tu-code-block-view__language-select"
            size="small"
            :disabled="!editor.isEditable"
            teleported
            @update:model-value="(value) => updateAttributes({ language: codeBlockLanguageFromSelect(value) })"
          >
            <ElOption
              v-for="option in CODE_BLOCK_LANGUAGE_OPTIONS"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </ElSelect>
        </template>
      </TuBlockChromeHeader>
      <pre
        data-node-view-content
        spellcheck="false"
        class="tu-code-block-view__pre"
        :class="codeLanguageClass"
      />
    </div>
  </node-view-wrapper>
</template>

<style scoped>
.tu-code-block-view {
  margin: 0.5em 0;
}

.tu-code-block-view__shell {
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: #fff;
  overflow: hidden;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.tu-code-block-view--selected .tu-code-block-view__shell {
  border-color: #1677ff;
  box-shadow: 0 0 0 2px rgba(22, 119, 255, 0.14);
}

.tu-code-block-view__language-select {
  width: 132px;
}

.tu-code-block-view__pre {
  margin: 0;
  padding: 0.75em 1em;
  background: #f5f5f5;
  overflow-x: auto;
  white-space: pre;
  tab-size: 4;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 0.9em;
  line-height: 1.5;
}
</style>

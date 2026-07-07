import CodeBlock from '@tiptap/extension-code-block'
import { VueNodeViewRenderer } from '@tiptap/vue-3'
import { codeBlockLowlight } from '../codeBlockLowlight'
import CodeBlockView from '../views/CodeBlockView.vue'
import { createConditionalLowlightPlugin } from './conditionalLowlightPlugin'
import {
  createCodeBlockBoundaryShortcuts,
  createCodeBlockEmptyPlaceholderPlugin,
  createCodeBlockNormalizePlugin,
  createCodeBlockSelectionPlugin,
  shouldIgnoreCodeBlockContentMutation,
} from './codeBlockPlugins'

function shouldStopCodeBlockChromeEvent(event: Event): boolean {
  const target = event.target
  if (!(target instanceof Element)) return false
  return Boolean(target.closest(
    '.tu-block-chrome-header, .tu-code-block-view__language-select, .el-select, .el-select-dropdown, .el-popper',
  ))
}

export const CodeBlockNode = CodeBlock.extend({
  name: 'codeBlock',

  addNodeView() {
    return VueNodeViewRenderer(CodeBlockView, {
      stopEvent: ({ event }) => shouldStopCodeBlockChromeEvent(event),
      update: ({ oldNode, newNode, updateProps }) => {
        if (!oldNode.sameMarkup(newNode)) return false
        if (oldNode.attrs.language !== newNode.attrs.language) {
          updateProps()
        }
        return true
      },
      ignoreMutation: ({ mutation }) => {
        if (shouldIgnoreCodeBlockContentMutation(mutation)) return true
        if (mutation.type === 'selection') return false

        const target = mutation.target
        const element = target instanceof Element
          ? target
          : target.parentElement
        const contentEl = element?.closest('[data-node-view-content]')
        if (!contentEl) return true

        if (mutation.type === 'attributes' && mutation.target === contentEl) return true
        if (contentEl.contains(target)) return false
        return true
      },
    })
  },

  addProseMirrorPlugins() {
    const parentPlugins = this.parent?.() ?? []
    return [
      ...parentPlugins,
      createConditionalLowlightPlugin({
        name: this.name,
        lowlight: codeBlockLowlight,
        defaultLanguage: this.options.defaultLanguage,
      }),
      createCodeBlockNormalizePlugin(this.name),
      createCodeBlockEmptyPlaceholderPlugin(this.name),
      createCodeBlockSelectionPlugin(),
    ]
  },

  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      ...createCodeBlockBoundaryShortcuts(this.name),
    }
  },
}).configure({
  enableTabIndentation: true,
})

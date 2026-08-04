<script setup lang="ts">
import type { JSONContent } from '@tiptap/core'
import TuEditor from '@/components/TuEditor.vue'

/**
 * Enlarged document window shared by the X6 cell content panel and the
 * resource crawled-document viewer. Structure mirrors the former inline
 * `x6-cell-content-dialog` inside X6CellContentPanel.vue: banner with title
 * + pill tags, fixed-height internal scroll area, embedded TuEditor that
 * consumes TipTap JSONContent directly.
 */
withDefaults(defineProps<{
  visible: boolean
  /** Banner title shown inside the dialog body. */
  title: string
  /** Optional el-dialog header title; falls back to `title`. */
  dialogTitle?: string
  /** Banner pill tags, e.g. 「只读」「网络内容」. */
  tags?: string[]
  document: JSONContent | null
  editable?: boolean
  loading?: boolean
  error?: string
  width?: string
  /** Key forwarded to TuEditor to force remount on source switch. */
  editorKey?: string
}>(), {
  dialogTitle: '',
  tags: () => [],
  editable: false,
  loading: false,
  error: '',
  width: 'min(920px, 92vw)',
  editorKey: 'expanded-document',
})

const emit = defineEmits<{
  'update:visible': [visible: boolean]
  'content-change': [document: JSONContent]
}>()

function onModelUpdate(value: boolean) {
  emit('update:visible', value)
}

function onContentChange(document: JSONContent) {
  emit('content-change', document)
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    class="tu-dialog-viewport expanded-document-dialog"
    :width="width"
    :title="dialogTitle || title"
    append-to-body
    destroy-on-close
    @update:model-value="onModelUpdate"
  >
    <div class="expanded-document-dialog__body">
      <div class="expanded-document-dialog__banner">
        <span class="expanded-document-dialog__banner-title">{{ title }}</span>
        <span
          v-for="tag in tags"
          :key="tag"
          class="expanded-document-dialog__banner-tag"
        >{{ tag }}</span>
        <slot name="banner-extra" />
      </div>
      <div class="expanded-document-dialog__scroll">
        <div
          v-if="loading"
          class="expanded-document-dialog__placeholder"
        >
          加载中…
        </div>
        <div
          v-else-if="error"
          class="expanded-document-dialog__placeholder expanded-document-dialog__placeholder--error"
        >
          {{ error }}
        </div>
        <div
          v-else-if="!document"
          class="expanded-document-dialog__placeholder"
        >
          暂无文档内容
        </div>
        <TuEditor
          v-else
          :key="editorKey"
          class="expanded-document-dialog__editor"
          :document="document"
          :editable="editable"
          @content-change="onContentChange"
        />
      </div>
    </div>
  </el-dialog>
</template>

<style scoped>
.expanded-document-dialog__body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: min(72dvh, 760px);
  min-height: 320px;
}

.expanded-document-dialog__banner {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
}

.expanded-document-dialog__banner-title {
  font-size: 14px;
  font-weight: 600;
  color: #1f2933;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.expanded-document-dialog__banner-tag {
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: #64748b;
  background: #e2e8f0;
}

.expanded-document-dialog__placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  font-size: 12px;
  color: #64748b;
  text-align: center;
}

.expanded-document-dialog__placeholder--error {
  color: #b91c1c;
}

.expanded-document-dialog__scroll {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  scrollbar-gutter: stable;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #fff;
  padding: 8px 32px 32px;
}

.expanded-document-dialog__editor {
  flex: 1;
  min-height: 0;
}

.expanded-document-dialog__editor :deep(.tu-editor-wrapper) {
  max-width: 860px;
  margin: 0 auto;
  width: 100%;
}
</style>

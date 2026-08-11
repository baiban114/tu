<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { JSONContent } from '@tiptap/core'
import { ElMessage } from 'element-plus'
import TuEditor from '@/components/TuEditor.vue'
import ExpandedDocumentDialog from '@/components/ExpandedDocumentDialog.vue'
import BlockPicker from '@/components/BlockPicker.vue'
import type { ReferenceTarget } from '@/components/BlockPicker.vue'
import type { PageContent, PageItem, TextAnnotation } from '@/api/types'
import { getPageContent, savePageContent } from '@/api/page'
import { resolvePageDocument, toV2PageContent } from '@/editor/pageDocument'
import { useWorkspaceStore } from '@/stores/workspace'
import {
  emptyCellContentDocument,
  isCellContentBound,
  type CellContentBinding,
} from '@/utils/cellContent'

const props = withDefaults(defineProps<{
  cellId: string
  /** Inspector context — affects hint copy only. */
  cellKind?: 'node' | 'edge'
  binding: CellContentBinding
  editable?: boolean
  pages?: PageItem[]
  currentPageId?: string | null
  /** Cell label / edge text — used as the preferred title when creating a new document. */
  cellLabel?: string
}>(), {
  cellKind: 'edge',
  editable: true,
  pages: () => [],
  currentPageId: null,
  cellLabel: '',
})

const emit = defineEmits<{
  'update:binding': [binding: CellContentBinding]
}>()

const workspaceStore = useWorkspaceStore()
const showPagePicker = ref(false)
const loading = ref(false)
const loadError = ref('')
const editorDocument = ref<JSONContent>(emptyCellContentDocument())
const boundPageSnapshot = ref<PageContent | null>(null)
let saveTimer: number | null = null
let loadToken = 0

const bound = computed(() => isCellContentBound(props.binding))
const subjectNoun = computed(() => (props.cellKind === 'node' ? '节点' : '连线'))
const boundLabel = computed(() => {
  if (!bound.value) return '未绑定（抽象文档）'
  return props.binding.boundPageTitle?.trim()
    || props.binding.boundPageId
    || '已绑定文档'
})

const showExpandedDialog = ref(false)
/** Enlarged dialog banner title — mirrors the resource-document window banner. */
const expandedTitle = computed(() => (bound.value
  ? (props.binding.boundPageTitle?.trim() || props.binding.boundPageId || '已绑定文档')
  : `${subjectNoun.value}内容`))
/**
 * Expanded dialog banner tags.
 * 编辑状态下不显示任何标签（保持界面简洁）；
 * 只读状态下仅显示「只读」标签，提示当前为只读视图。
 */
const dialogTags = computed<string[]>(() => {
  if (props.editable) return []
  return ['只读']
})

function openExpandedDialog() {
  if (loading.value || loadError.value) return
  showExpandedDialog.value = true
}

function clearSaveTimer() {
  if (saveTimer != null) {
    window.clearTimeout(saveTimer)
    saveTimer = null
  }
}

function findPageTitle(pageId: string): string {
  const walk = (nodes: PageItem[]): string | null => {
    for (const node of nodes) {
      if (node.id === pageId) return node.title?.trim() || null
      if (node.children?.length) {
        const nested = walk(node.children)
        if (nested) return nested
      }
    }
    return null
  }
  return walk(props.pages)?.trim() || pageId
}

async function loadEditorContent() {
  const token = ++loadToken
  clearSaveTimer()
  loadError.value = ''
  loading.value = true
  boundPageSnapshot.value = null

  try {
    if (bound.value && props.binding.boundPageId) {
      const pageId = props.binding.boundPageId
      if (pageId === workspaceStore.currentPageId && workspaceStore.pageContent) {
        if (token !== loadToken) return
        boundPageSnapshot.value = workspaceStore.pageContent
        editorDocument.value = resolvePageDocument(workspaceStore.pageContent)
      } else {
        const pc = await getPageContent(pageId)
        if (token !== loadToken) return
        boundPageSnapshot.value = pc
        editorDocument.value = resolvePageDocument(pc)
      }
    } else {
      editorDocument.value = props.binding.contentDocument?.type === 'doc'
        ? props.binding.contentDocument
        : emptyCellContentDocument()
    }
  } catch (error) {
    if (token !== loadToken) return
    loadError.value = error instanceof Error ? error.message : '加载文档内容失败'
    editorDocument.value = emptyCellContentDocument()
    ElMessage.error(loadError.value)
  } finally {
    if (token === loadToken) loading.value = false
  }
}

async function persistBoundDocument(document: JSONContent) {
  const pageId = props.binding.boundPageId?.trim()
  if (!pageId) return

  const prev = boundPageSnapshot.value
  const annotations = (prev?.annotations ?? []) as TextAnnotation[]
  const metadata = prev?.metadata
  const next = toV2PageContent(document, annotations, metadata)
  boundPageSnapshot.value = next

  if (pageId === workspaceStore.currentPageId) {
    await workspaceStore.saveCurrentPage(next)
  } else {
    await savePageContent(pageId, next)
  }
}

function persistAbstractDocument(document: JSONContent) {
  emit('update:binding', {
    ...props.binding,
    boundPageId: null,
    contentDocument: document,
  })
}

function schedulePersist(document: JSONContent) {
  if (!props.editable) return
  clearSaveTimer()
  saveTimer = window.setTimeout(() => {
    saveTimer = null
    void (async () => {
      try {
        if (bound.value) {
          await persistBoundDocument(document)
        } else {
          persistAbstractDocument(document)
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : `保存${subjectNoun.value}内容失败`
        ElMessage.error(message)
      }
    })()
  }, 400)
}

function onDocumentChange(document: JSONContent) {
  editorDocument.value = document
  schedulePersist(document)
}

function openPagePicker() {
  if (!props.editable) return
  showPagePicker.value = true
}

function onPagePickerSelect(target: ReferenceTarget) {
  if (target.type !== 'page') {
    ElMessage.warning('请选择文档页面进行绑定')
    return
  }
  showPagePicker.value = false
  const title = findPageTitle(target.id)
  emit('update:binding', {
    ...props.binding,
    boundPageId: target.id,
    boundPageTitle: title,
  })
}

function unbindPage() {
  if (!props.editable || !bound.value) return
  clearSaveTimer()
  emit('update:binding', {
    boundPageId: null,
    boundPageTitle: null,
    contentDocument: editorDocument.value?.type === 'doc'
      ? editorDocument.value
      : emptyCellContentDocument(),
  })
}

const creating = ref(false)

/** Walk a TipTap JSON node tree and collect visible text. */
function collectDocumentText(node: JSONContent | null | undefined): string {
  if (!node) return ''
  if (typeof node.text === 'string') return node.text
  return (node.content ?? []).map(collectDocumentText).join('')
}

/**
 * Derive a document title for the “create new document” action.
 * Priority: cell label → first non-empty line of the cell content → fallback.
 */
function deriveNewDocumentTitle(): string {
  const label = props.cellLabel?.trim()
  if (label) return label
  const text = collectDocumentText(editorDocument.value).trim()
  const firstLine = text.split('\n').map((line) => line.trim()).find(Boolean)
  return firstLine || '新文档'
}

/**
 * 将当前节点/连线创建为新文档：在当前画板所在页的同级别正下方新建一篇文档，
 * 以当前内容作为初始正文，并自动绑定。绑定后两侧内容同源、皆可编辑。
 */
async function createNewDocument() {
  if (!props.editable || creating.value) return
  const sourcePageId = props.currentPageId || workspaceStore.currentPageId
  if (!sourcePageId) {
    ElMessage.warning('未找到当前画板所在页面')
    return
  }
  creating.value = true
  try {
    const title = deriveNewDocumentTitle()
    const document = editorDocument.value?.type === 'doc'
      ? editorDocument.value
      : emptyCellContentDocument()
    const initialContent = toV2PageContent(document, [], undefined)
    const page = await workspaceStore.createSiblingDocumentBelow(
      sourcePageId,
      title,
      initialContent,
    )
    emit('update:binding', {
      ...props.binding,
      boundPageId: page.id,
      boundPageTitle: page.title,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : `创建${subjectNoun.value}文档失败`
    ElMessage.error(message)
  } finally {
    creating.value = false
  }
}

watch(
  () => [props.cellId, props.binding.boundPageId] as const,
  () => {
    void loadEditorContent()
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  clearSaveTimer()
  loadToken += 1
})
</script>

<template>
  <div class="x6-cell-content">
    <div class="x6-cell-content__bind">
      <span class="x6-cell-content__bind-label">绑定文档</span>
      <div class="x6-cell-content__bind-row">
        <input
          class="x6-cell-content__bind-input"
          type="text"
          :value="boundLabel"
          readonly
          tabindex="-1"
          :title="bound ? (binding.boundPageId || '') : `未绑定：内容为${subjectNoun}自带的抽象文档`"
        >
        <button
          type="button"
          class="x6-cell-content__bind-btn"
          :disabled="!editable"
          @click="openPagePicker"
        >
          {{ bound ? '更换' : '选择' }}
        </button>
        <button
          v-if="!bound"
          type="button"
          class="x6-cell-content__bind-btn"
          :disabled="!editable || creating"
          :title="`将当前${cellKind === 'node' ? '节点' : '连线'}创建为新文档：在画板所在页同级正下方新建并自动绑定`"
          @click="createNewDocument"
        >
          {{ creating ? '创建中…' : '新建' }}
        </button>
        <button
          v-if="bound"
          type="button"
          class="x6-cell-content__bind-btn x6-cell-content__bind-btn--muted"
          :disabled="!editable"
          @click="unbindPage"
        >
          解除
        </button>
      </div>
      <p class="x6-cell-content__hint">
        {{ bound
          ? '已绑定：下方编辑器直接读写该文档正文（与页面同一份内容）。'
          : `未绑定：下方为${subjectNoun}自带的抽象文档，仅保存在画板${cellKind === 'node' ? '节点' : '连线'}数据中。可「选择」已有文档或「新建」一篇文档并自动关联。` }}
      </p>
    </div>

    <div class="x6-cell-content__pane-toolbar">
      <span class="x6-cell-content__pane-label">内容</span>
      <button
        type="button"
        class="x6-cell-content__bind-btn"
        :disabled="loading || !!loadError"
        title="以文档大窗口展示该内容"
        @click="openExpandedDialog"
      >
        放大
      </button>
    </div>

    <div class="x6-cell-content__editor-pane">
      <div
        v-if="loading"
        class="x6-cell-content__placeholder"
      >
        加载中…
      </div>
      <div
        v-else-if="loadError"
        class="x6-cell-content__placeholder x6-cell-content__placeholder--error"
      >
        {{ loadError }}
      </div>
      <div
        v-else-if="showExpandedDialog"
        class="x6-cell-content__placeholder x6-cell-content__placeholder--column"
      >
        <span>已在放大窗口中展示</span>
        <button
          type="button"
          class="x6-cell-content__bind-btn"
          @click="showExpandedDialog = false"
        >
          返回小窗
        </button>
      </div>
      <TuEditor
        v-else
        :key="`${cellId}:${binding.boundPageId || 'abstract'}`"
        class="x6-cell-content__editor"
        :document="editorDocument"
        :editable="editable"
        :hover-handle="false"
        @content-change="onDocumentChange"
      />
    </div>

    <BlockPicker
      :visible="showPagePicker"
      :pages="pages"
      :current-page-id="currentPageId"
      @update:visible="showPagePicker = $event"
      @select="onPagePickerSelect"
    />

    <ExpandedDocumentDialog
      v-model:visible="showExpandedDialog"
      :title="expandedTitle"
      :dialog-title="`${subjectNoun}内容`"
      :tags="dialogTags"
      :document="editorDocument"
      :editable="editable"
      :loading="loading"
      :error="loadError"
      :editor-key="`expanded:${cellId}:${binding.boundPageId || 'abstract'}`"
      @content-change="onDocumentChange"
    />
  </div>
</template>

<style scoped>
.x6-cell-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
}

.x6-cell-content__bind-label {
  display: block;
  margin-bottom: 4px;
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
}

.x6-cell-content__bind-row {
  display: flex;
  align-items: stretch;
  gap: 6px;
}

.x6-cell-content__bind-input {
  flex: 1;
  min-width: 0;
  border: 1px solid #d2d8e2;
  border-radius: 8px;
  padding: 6px 8px;
  font-size: 12px;
  color: #213547;
  background: #f8fafc;
  box-sizing: border-box;
}

.x6-cell-content__bind-btn {
  flex: 0 0 auto;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #fff;
  color: #334155;
  padding: 0 10px;
  font-size: 12px;
  cursor: pointer;
}

.x6-cell-content__bind-btn:hover:not(:disabled) {
  border-color: #94a3b8;
  background: #f8fafc;
}

.x6-cell-content__bind-btn--muted {
  color: #64748b;
}

.x6-cell-content__bind-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.x6-cell-content__hint {
  margin: 6px 0 0;
  font-size: 11px;
  line-height: 1.4;
  color: #94a3b8;
}

.x6-cell-content__pane-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.x6-cell-content__pane-label {
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
}

.x6-cell-content__editor-pane {
  height: 220px;
  min-height: 220px;
  max-height: 220px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  overflow: hidden;
  background: #fff;
  display: flex;
  flex-direction: column;
}

.x6-cell-content__placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  font-size: 12px;
  color: #64748b;
  text-align: center;
}

.x6-cell-content__placeholder--error {
  color: #b91c1c;
}

.x6-cell-content__placeholder--column {
  flex-direction: column;
  gap: 8px;
}

.x6-cell-content__editor {
  flex: 1;
  min-height: 0;
  height: 100%;
  overflow: auto;
}

.x6-cell-content__editor :deep(.tu-editor-wrapper) {
  min-height: 100%;
  padding: 8px 10px;
}
</style>

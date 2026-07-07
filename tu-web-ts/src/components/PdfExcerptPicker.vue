<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElButton, ElDialog, ElInputNumber, ElMessage, ElRadioButton, ElRadioGroup } from 'element-plus'
import { buildFileUrl, uploadPdfFile } from '@/api/fileStorage'
import {
  PDF_EXCERPT_DEFAULT_HEIGHT,
  PDF_EXCERPT_LARGE_DOC_PAGES,
  normalizePdfPageRange,
  type PdfExcerptViewMode,
} from '@/utils/pdfExcerpt'
import { loadPdfPageCount } from '@/utils/pdfDocumentCache'

export interface PdfExcerptSelection {
  fileId: string
  fileName: string
  viewMode: PdfExcerptViewMode
  startPage: number
  endPage: number
  height: number
}

export type PdfExcerptPickerMode = 'insert' | 'edit'

const props = defineProps<{
  visible: boolean
  mode?: PdfExcerptPickerMode
  initial?: PdfExcerptSelection | null
}>()

const emit = defineEmits<{
  'update:visible': [visible: boolean]
  confirm: [selection: PdfExcerptSelection]
}>()

const inputRef = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
const inspecting = ref(false)
const fileId = ref('')
const fileName = ref('')
const totalPages = ref(1)
const viewMode = ref<PdfExcerptViewMode>('excerpt')
const startPage = ref(1)
const endPage = ref(1)
const height = ref(PDF_EXCERPT_DEFAULT_HEIGHT)

const dialogVisible = computed({
  get: () => props.visible,
  set: (value: boolean) => emit('update:visible', value),
})

const isExcerptMode = computed(() => viewMode.value === 'excerpt')
const isEditMode = computed(() => props.mode === 'edit')
const dialogTitle = computed(() => (isEditMode.value ? '更改 PDF 来源' : '插入 PDF'))
const confirmLabel = computed(() => {
  if (isEditMode.value) return '保存'
  return isExcerptMode.value ? '插入摘页' : '插入全文'
})
const isLargeDocument = computed(() => totalPages.value > PDF_EXCERPT_LARGE_DOC_PAGES)
const canConfirm = computed(() => {
  if (!fileId.value) return false
  if (viewMode.value === 'full') return totalPages.value >= 1
  return startPage.value <= endPage.value
})

function resetState() {
  uploading.value = false
  inspecting.value = false
  fileId.value = ''
  fileName.value = ''
  totalPages.value = 1
  viewMode.value = 'excerpt'
  startPage.value = 1
  endPage.value = 1
  height.value = PDF_EXCERPT_DEFAULT_HEIGHT
}

async function applyInitial(initial: PdfExcerptSelection) {
  uploading.value = false
  fileId.value = initial.fileId
  fileName.value = initial.fileName
  viewMode.value = initial.viewMode
  startPage.value = initial.startPage
  endPage.value = initial.endPage
  height.value = initial.height
  inspecting.value = true
  try {
    if (initial.fileId) {
      totalPages.value = await loadPdfPageCount(buildFileUrl(initial.fileId))
      if (initial.viewMode === 'excerpt') {
        const normalized = normalizePdfPageRange(startPage.value, endPage.value, totalPages.value)
        startPage.value = normalized.startPage
        endPage.value = normalized.endPage
      } else {
        startPage.value = 1
        endPage.value = totalPages.value
      }
    } else {
      totalPages.value = Math.max(initial.endPage, 1)
    }
  } catch {
    totalPages.value = Math.max(initial.endPage, initial.startPage, 1)
  } finally {
    inspecting.value = false
  }
}

watch(() => props.visible, async (visible) => {
  if (!visible) {
    resetState()
    return
  }
  if (props.mode === 'edit' && props.initial) {
    await applyInitial(props.initial)
    return
  }
  resetState()
})

function openFilePicker() {
  inputRef.value?.click()
}

async function handleFileChange(event: Event) {
  const target = event.target as HTMLInputElement | null
  const file = target?.files?.[0]
  if (target) target.value = ''
  if (!file) return

  uploading.value = true
  inspecting.value = true
  try {
    const uploaded = await uploadPdfFile(file)
    fileId.value = uploaded.id
    fileName.value = file.name
    const url = uploaded.url || buildFileUrl(uploaded.id)
    const pages = await loadPdfPageCount(url)
    totalPages.value = pages
    startPage.value = 1
    endPage.value = pages >= 1 ? 1 : 1
  } catch (error) {
    const message = error instanceof Error ? error.message : 'PDF 上传失败'
    ElMessage.error(message)
    resetState()
  } finally {
    uploading.value = false
    inspecting.value = false
  }
}

function clampRange() {
  const normalized = normalizePdfPageRange(startPage.value, endPage.value, totalPages.value)
  startPage.value = normalized.startPage
  endPage.value = normalized.endPage
}

function onConfirm() {
  if (!canConfirm.value || !fileId.value) return
  if (viewMode.value === 'excerpt') {
    clampRange()
  }
  emit('confirm', {
    fileId: fileId.value,
    fileName: fileName.value,
    viewMode: viewMode.value,
    startPage: viewMode.value === 'full' ? 1 : startPage.value,
    endPage: viewMode.value === 'full' ? totalPages.value : endPage.value,
    height: height.value,
  })
  dialogVisible.value = false
}
</script>

<template>
  <el-dialog
    v-model="dialogVisible"
    class="tu-dialog-viewport"
    :title="dialogTitle"
    width="520px"
    @click.stop
  >
    <input
      ref="inputRef"
      class="pdf-excerpt-picker__input"
      type="file"
      accept="application/pdf,.pdf"
      @change="handleFileChange"
    >

    <div class="pdf-excerpt-picker">
      <p class="pdf-excerpt-picker__hint">
        上传 PDF 正本后嵌入页面。摘页仅显示所选页码；全文在块内滚动浏览，按页按需加载，不会切割原文件。
      </p>

      <div class="pdf-excerpt-picker__file-row">
        <el-button :loading="uploading" @click="openFilePicker">
          {{ fileId ? '重新选择 PDF' : '选择 PDF 文件' }}
        </el-button>
        <span v-if="fileName" class="pdf-excerpt-picker__file-name" :title="fileName">
          {{ fileName }}
        </span>
      </div>

      <div v-if="fileId" class="pdf-excerpt-picker__mode">
        <span class="pdf-excerpt-picker__mode-label">嵌入模式</span>
        <el-radio-group v-model="viewMode">
          <el-radio-button value="excerpt">摘页</el-radio-button>
          <el-radio-button value="full">全文</el-radio-button>
        </el-radio-group>
      </div>

      <div v-if="fileId && isLargeDocument" class="pdf-excerpt-picker__warn">
        该 PDF 共 {{ totalPages }} 页，页数较多。全文模式将创建全部页占位并在滚动时加载；若只需少量页面，建议使用摘页。
      </div>

      <div v-if="fileId" class="pdf-excerpt-picker__range">
        <div class="pdf-excerpt-picker__field">
          <span>总页数</span>
          <strong>{{ inspecting ? '…' : totalPages }}</strong>
        </div>
        <template v-if="isExcerptMode">
          <div class="pdf-excerpt-picker__field">
            <span>起始页</span>
            <el-input-number
              v-model="startPage"
              :min="1"
              :max="totalPages"
              :disabled="inspecting"
              @change="clampRange"
            />
          </div>
          <div class="pdf-excerpt-picker__field">
            <span>结束页</span>
            <el-input-number
              v-model="endPage"
              :min="startPage"
              :max="totalPages"
              :disabled="inspecting"
              @change="clampRange"
            />
          </div>
        </template>
        <div v-else class="pdf-excerpt-picker__field pdf-excerpt-picker__field--full">
          <span>页码范围</span>
          <strong>第 1–{{ totalPages }} 页（全文）</strong>
        </div>
        <div class="pdf-excerpt-picker__field">
          <span>块高度</span>
          <el-input-number v-model="height" :min="160" :max="2000" :step="40" />
        </div>
      </div>
    </div>

    <template #footer>
      <el-button @click="dialogVisible = false">取消</el-button>
      <el-button type="primary" :disabled="!canConfirm || uploading || inspecting" @click="onConfirm">
        {{ confirmLabel }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.pdf-excerpt-picker__input {
  display: none;
}

.pdf-excerpt-picker {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.pdf-excerpt-picker__hint {
  margin: 0;
  font-size: 13px;
  color: #64748b;
  line-height: 1.5;
}

.pdf-excerpt-picker__file-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.pdf-excerpt-picker__file-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  color: #334155;
}

.pdf-excerpt-picker__mode {
  display: flex;
  align-items: center;
  gap: 12px;
}

.pdf-excerpt-picker__mode-label {
  font-size: 12px;
  color: #64748b;
}

.pdf-excerpt-picker__warn {
  padding: 10px 12px;
  border-radius: 8px;
  background: #fffbeb;
  border: 1px solid #fde68a;
  font-size: 12px;
  color: #92400e;
  line-height: 1.5;
}

.pdf-excerpt-picker__range {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.pdf-excerpt-picker__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: #64748b;
}

.pdf-excerpt-picker__field--full {
  grid-column: 1 / -1;
}
</style>

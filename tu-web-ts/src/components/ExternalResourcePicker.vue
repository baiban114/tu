<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElDialog, ElEmpty, ElInput, ElScrollbar } from 'element-plus'
import {
  createResourceExcerpt,
  createResourceItem,
  listResourceExcerpts,
  listResourceChapters,
  listResourceItems,
  listResourceTypes,
  supportsResourceExcerpts,
  supportsBookChapters,
  type ResourceChapter,
  type ResourceExcerpt,
  type ResourceItem,
  type ResourceType,
} from '@/api/externalResource'
import { MAX_PAGE_SIZE } from '@/constants/pagination'
import { buildTreeFromFlat } from '@/utils/tree'
import type { Block, ExternalResourceEmbedData, HeadingSourceBinding } from '@/api/types'
import { bindingFromExternalResource, basisBindingFromExternalResource } from '@/utils/headingSource'
import TuEditor from './TuEditor.vue'
import ResourcePositionLocatorField from './ResourcePositionLocatorField.vue'
import { normalizeResourcePositionLocator, resourcePositionDisplay } from '@/utils/resourcePositionLocator'

export interface ExternalResourcePickerSelection {
  title: string
  externalResource: ExternalResourceEmbedData
}

export interface ExternalResourcePickerExcerptCreated {
  item: ResourceItem
  excerpt: ResourceExcerpt
}

export interface ExternalResourcePickerBindSourcePayload {
  binding: HeadingSourceBinding
}

const props = defineProps<{
  visible: boolean
  mode?: 'insert' | 'markExcerpt' | 'bindSource' | 'setBasis'
  initialExcerptText?: string
  initialExcerptTitle?: string
}>()

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void
  (e: 'select', selection: ExternalResourcePickerSelection): void
  (e: 'excerpt-created', payload: ExternalResourcePickerExcerptCreated): void
  (e: 'bind-source', payload: ExternalResourcePickerBindSourcePayload): void
}>()

const loading = ref(false)
const excerptLoading = ref(false)
const creatingResource = ref(false)
const error = ref('')
const keyword = ref('')
const types = ref<ResourceType[]>([])
const items = ref<ResourceItem[]>([])
const excerpts = ref<ResourceExcerpt[]>([])
const excerptIndex = ref<Record<string, ResourceExcerpt[]>>({})
const chapters = ref<ResourceChapter[]>([])
const selectedItemId = ref('')
const createResourceVisible = ref(false)
const EXCERPT_EDITOR_BLOCK_ID = 'resource-picker-excerpt-editor'

const resourceForm = reactive({
  typeId: '',
  title: '',
  identityValue: '',
  sourceUrl: '',
  edition: '',
  note: '',
})

const excerptForm = reactive({
  title: '',
  chapterId: '' as string | null,
  locator: '',
  excerptText: '',
  note: '',
})

const typeById = computed(() => new Map(types.value.map((type) => [type.id, type])))
const creatableTypes = computed(() => types.value.filter((type) => (
  type.code !== 'web-link'
)))
const resourceFormType = computed(() => typeById.value.get(resourceForm.typeId) || null)
const selectedItem = computed(() => items.value.find((item) => item.id === selectedItemId.value) || null)
const selectedItemType = computed(() => selectedItem.value ? typeById.value.get(selectedItem.value.typeId) : null)
const selectedSupportsExcerpts = computed(() => supportsResourceExcerpts(selectedItemType.value?.code))
const selectedSupportsBookChapters = computed(() => supportsBookChapters(selectedItemType.value?.code))
const isMarkExcerptMode = computed(() => props.mode === 'markExcerpt')
const isBindSourceMode = computed(() => props.mode === 'bindSource')
const isSetBasisMode = computed(() => props.mode === 'setBasis')
const isBindLikeMode = computed(() => isBindSourceMode.value || isSetBasisMode.value)
const isExcerptOnlyMode = computed(() => isMarkExcerptMode.value || isBindLikeMode.value)
const dialogTitle = computed(() => {
  if (isSetBasisMode.value) return '设置依据'
  if (isBindSourceMode.value) return '标记标题来源'
  if (isMarkExcerptMode.value) return '标记外部资源节选'
  return '插入外部资源'
})
const excerptChapterTreeOptions = computed(() => {
  type TreeSelectOption = { value: string; label: string; children?: TreeSelectOption[] };
  const flat = chapters.value.map((chapter) => ({
    id: chapter.id,
    parentId: chapter.parentId ?? null,
    label: chapter.title,
    order: chapter.sortOrder,
  }));
  const toTreeSelect = (nodes: ReturnType<typeof buildTreeFromFlat>): TreeSelectOption[] => (
    nodes.map((node) => ({
      value: node.id,
      label: node.label,
      ...(node.children?.length ? { children: toTreeSelect(node.children) } : {}),
    }))
  );
  return toTreeSelect(buildTreeFromFlat(flat));
})
const excerptEditorBlocks = computed<Block[]>(() => [{
  id: EXCERPT_EDITOR_BLOCK_ID,
  type: 'richtext',
  content: excerptForm.excerptText,
}])

const getItemSearchText = (item: ResourceItem): string => [
  item.title,
  item.typeName,
  item.workTitle,
  item.identityValue,
  item.sourceUrl,
].filter(Boolean).join(' ')

const getExcerptSearchText = (excerpt: ResourceExcerpt): string => {
  const plainExcerpt = (excerpt.excerptText ?? '').replace(/[#*`>\-_\[\]]/g, ' ').trim()
  return [
    excerpt.title,
    excerpt.chapterTitle,
    excerpt.locator,
    plainExcerpt,
    excerpt.note,
  ].filter(Boolean).join(' ')
}

const excerptMatchesKeyword = (excerpt: ResourceExcerpt, keywordText: string): boolean => (
  getExcerptSearchText(excerpt).toLowerCase().includes(keywordText)
)

const itemMatchesKeyword = (item: ResourceItem, keywordText: string): boolean => (
  getItemSearchText(item).toLowerCase().includes(keywordText)
)

const filteredItems = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  const sourceItems = items.value
  if (!q) return sourceItems
  return sourceItems.filter((item) => {
    if (itemMatchesKeyword(item, q)) return true
    const indexedExcerpts = excerptIndex.value[item.id] ?? []
    return indexedExcerpts.some((excerpt) => excerptMatchesKeyword(excerpt, q))
  })
})

const filteredExcerpts = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  if (!q) return excerpts.value
  return excerpts.value.filter((excerpt) => excerptMatchesKeyword(excerpt, q))
})

const resetExcerptForm = () => {
  excerptForm.title = props.initialExcerptTitle || ''
  excerptForm.chapterId = ''
  excerptForm.locator = ''
  excerptForm.excerptText = props.initialExcerptText || ''
  excerptForm.note = ''
}

const resetResourceForm = () => {
  resourceForm.typeId = creatableTypes.value[0]?.id || ''
  resourceForm.title = ''
  resourceForm.identityValue = ''
  resourceForm.sourceUrl = ''
  resourceForm.edition = ''
  resourceForm.note = ''
}

const handleExcerptEditorUpdate = (blocks: Block[]) => {
  const richTextBlock = blocks.find((block) => block.type === 'richtext' || block.type === 'richText')
  excerptForm.excerptText = richTextBlock?.content ?? ''
}

const loadExcerptIndex = async () => {
  const excerptItems = items.value.filter((item) => {
    const type = typeById.value.get(item.typeId)
    return supportsResourceExcerpts(type?.code)
  })
  if (excerptItems.length === 0) {
    excerptIndex.value = {}
    return
  }

  const entries = await Promise.all(
    excerptItems.map(async (item) => {
      try {
        const result = await listResourceExcerpts(item.id, { page: 0, pageSize: MAX_PAGE_SIZE })
        return [item.id, result.items] as const
      } catch {
        return [item.id, []] as const
      }
    }),
  )
  excerptIndex.value = Object.fromEntries(entries)
}

const loadResources = async () => {
  loading.value = true
  error.value = ''
  try {
    const [nextTypes, nextItems] = await Promise.all([
      listResourceTypes({ page: 0, pageSize: MAX_PAGE_SIZE }),
      listResourceItems({ page: 0, pageSize: MAX_PAGE_SIZE }),
    ])
    types.value = nextTypes.items
    items.value = nextItems.items
    if (!resourceForm.typeId || !nextTypes.items.some((type) => type.id === resourceForm.typeId && type.code !== 'web-link')) {
      resourceForm.typeId = nextTypes.items.find((type) => type.code !== 'web-link')?.id || ''
    }
    const firstAvailableItem = nextItems.items[0]
    const selectedStillUsable = nextItems.items.some((item) => (
      item.id === selectedItemId.value
    ))
    if (!selectedItemId.value || !selectedStillUsable) {
      selectedItemId.value = firstAvailableItem?.id || ''
    }
    await loadExcerptIndex()
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载外部资源失败'
  } finally {
    loading.value = false
  }
}

const openCreateResource = () => {
  createResourceVisible.value = true
  resetResourceForm()
}

const cancelCreateResource = () => {
  createResourceVisible.value = false
  resetResourceForm()
}

const createAndSelectResource = async () => {
  if (!resourceForm.typeId || !resourceForm.title.trim()) return
  creatingResource.value = true
  error.value = ''
  try {
    const item = await createResourceItem({
      typeId: resourceForm.typeId,
      title: resourceForm.title.trim(),
      identityValue: resourceForm.identityValue.trim() || undefined,
      sourceUrl: resourceForm.sourceUrl.trim() || undefined,
      edition: resourceForm.edition.trim() || undefined,
      note: resourceForm.note.trim() || undefined,
      titleSource: 'manual',
      workIdSource: 'auto',
    })
    items.value = [item, ...items.value.filter((entry) => entry.id !== item.id)]
    keyword.value = ''
    selectedItemId.value = item.id
    createResourceVisible.value = false
    resetResourceForm()
  } catch (err) {
    error.value = err instanceof Error ? err.message : '创建资源实体失败'
  } finally {
    creatingResource.value = false
  }
}

const loadExcerpts = async () => {
  excerpts.value = []
  chapters.value = []
  resetExcerptForm()
  if (!selectedItem.value || !selectedSupportsExcerpts.value) return
  excerptLoading.value = true
  error.value = ''
  try {
    const [result, chapterList] = await Promise.all([
      listResourceExcerpts(selectedItem.value.id, { page: 0, pageSize: MAX_PAGE_SIZE }),
      selectedSupportsBookChapters.value
        ? listResourceChapters(selectedItem.value.id)
        : Promise.resolve([]),
    ])
    excerpts.value = result.items
    chapters.value = chapterList
    excerptIndex.value = {
      ...excerptIndex.value,
      [selectedItem.value.id]: result.items,
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载节选失败'
  } finally {
    excerptLoading.value = false
  }
}

const snapshotFor = (item: ResourceItem, excerpt?: ResourceExcerpt) => ({
  resourceTitle: item.title,
  resourceTypeName: item.typeName,
  workTitle: item.workTitle || undefined,
  identityFieldLabel: item.identityFieldLabel,
  identityValue: item.identityValue || undefined,
  sourceUrl: item.sourceUrl,
  edition: item.edition,
  note: item.note,
  excerptTitle: excerpt?.title,
  chapterTitle: excerpt?.chapterTitle || undefined,
  excerptLocator: excerpt?.locator,
  excerptText: excerpt?.excerptText,
  excerptNote: excerpt?.note,
})

const selectResource = (item: ResourceItem) => {
  emit('select', {
    title: item.title,
    externalResource: {
      resourceItemId: item.id,
      resourceExcerptId: null,
      mode: 'resource',
      snapshot: snapshotFor(item),
    },
  })
  emit('update:visible', false)
}

const emitBindLike = (externalResource: ExternalResourceEmbedData) => {
  const binding = isSetBasisMode.value
    ? basisBindingFromExternalResource(externalResource)
    : bindingFromExternalResource(externalResource)
  if (!binding) return
  emit('bind-source', { binding })
  emit('update:visible', false)
}

const selectResourceForBasis = (item: ResourceItem) => {
  emitBindLike({
    resourceItemId: item.id,
    resourceExcerptId: null,
    mode: 'resource',
    snapshot: snapshotFor(item),
  })
}

const selectExcerpt = (excerpt: ResourceExcerpt) => {
  const item = selectedItem.value
  if (!item) return
  const externalResource: ExternalResourceEmbedData = {
    resourceItemId: item.id,
    resourceExcerptId: excerpt.id,
    mode: 'excerpt',
    snapshot: snapshotFor(item, excerpt),
  }
  if (isBindLikeMode.value) {
    emitBindLike(externalResource)
    return
  }
  emit('select', {
    title: excerpt.title || item.title,
    externalResource,
  })
  emit('update:visible', false)
}

const createAndInsertExcerpt = async () => {
  const item = selectedItem.value
  if (!item || !selectedSupportsExcerpts.value || !excerptForm.title.trim()) return
  error.value = ''
  try {
    const excerpt = await createResourceExcerpt(item.id, {
      title: excerptForm.title.trim(),
      chapterId: excerptForm.chapterId?.trim() || undefined,
      locator: normalizeResourcePositionLocator(excerptForm.locator.trim()) || undefined,
      excerptText: excerptForm.excerptText.trim() || undefined,
      note: excerptForm.note.trim(),
      sortOrder: excerpts.value.length,
    })
    excerpts.value = [...excerpts.value, excerpt]
    excerptIndex.value = {
      ...excerptIndex.value,
      [item.id]: [...(excerptIndex.value[item.id] ?? []), excerpt],
    }
    if (isMarkExcerptMode.value) {
      emit('excerpt-created', { item, excerpt })
      emit('update:visible', false)
      return
    }
    if (isBindLikeMode.value) {
      emitBindLike({
        resourceItemId: item.id,
        resourceExcerptId: excerpt.id,
        mode: 'excerpt',
        snapshot: snapshotFor(item, excerpt),
      })
      return
    }
    selectExcerpt(excerpt)
  } catch (err) {
    error.value = err instanceof Error ? err.message : '创建节选失败'
  }
}

watch(() => props.visible, (visible) => {
  if (!visible) return
  keyword.value = ''
  createResourceVisible.value = false
  resetExcerptForm()
  resetResourceForm()
  void loadResources()
})

watch(() => [props.initialExcerptText, props.initialExcerptTitle, props.mode], () => {
  if (props.visible) resetExcerptForm()
})

watch(selectedItemId, () => {
  void loadExcerpts()
})
</script>

<template>
  <el-dialog
    :model-value="visible"
    :title="dialogTitle"
    class="tu-dialog-viewport resource-picker-dialog"
    width="min(760px, calc(100vw - 48px))"
    align-center
    destroy-on-close
    @update:model-value="emit('update:visible', $event)"
  >
    <div class="resource-picker">
      <el-input
        v-model="keyword"
        class="resource-picker__search"
        placeholder="搜索资源标题、类型、归类、标识或节选"
        clearable
      />
      <p v-if="error" class="resource-picker__error">{{ error }}</p>
      <div class="resource-picker__layout">
        <section class="resource-picker__list">
          <div class="resource-picker__list-header">
            <div class="resource-picker__section-title">资源实体</div>
            <button type="button" class="resource-picker__secondary" @click="openCreateResource">新增实体</button>
          </div>
          <div class="resource-picker__list-scroll">
            <el-scrollbar>
              <button
                v-for="item in filteredItems"
                :key="item.id"
                type="button"
                class="resource-picker__item"
                :class="{ 'resource-picker__item--active': selectedItemId === item.id }"
                @click="selectedItemId = item.id"
              >
                <span>{{ item.title }}</span>
                <small>{{ item.typeName }} · {{ item.workTitle || '未归类' }} · {{ item.identityFieldLabel }}: {{ item.identityValue || '未填写' }}</small>
              </button>
              <el-empty
                v-if="!loading && filteredItems.length === 0"
                description="没有找到外部资源"
                :image-size="64"
              />
            </el-scrollbar>
          </div>
        </section>

        <section class="resource-picker__detail">
          <div class="resource-picker__detail-scroll">
          <form v-if="createResourceVisible" class="resource-picker__create-form" @submit.prevent="createAndSelectResource">
            <div class="resource-picker__section-title">新增资源实体</div>
            <label>
              类型
              <select v-model="resourceForm.typeId" required>
                <option v-for="type in creatableTypes" :key="type.id" :value="type.id">
                  {{ type.name }}
                </option>
              </select>
            </label>
            <label>
              标题
              <input v-model.trim="resourceForm.title" required maxlength="255" placeholder="资源标题" />
            </label>
            <label>
              {{ resourceFormType?.identityFieldLabel || '唯一标识' }}
              <input
                v-model.trim="resourceForm.identityValue"
                maxlength="512"
                :placeholder="resourceFormType?.identityFieldKey || 'identity'"
              />
            </label>
            <label>
              来源 URL
              <input v-model.trim="resourceForm.sourceUrl" maxlength="1024" placeholder="https://..." />
            </label>
            <label>
              版本/ edition
              <input v-model.trim="resourceForm.edition" maxlength="128" placeholder="可选" />
            </label>
            <label>
              备注
              <textarea v-model.trim="resourceForm.note" rows="3" maxlength="1024" placeholder="可选" />
            </label>
            <div class="resource-picker__create-actions">
              <button type="button" @click="cancelCreateResource">取消</button>
              <button type="submit" :disabled="creatingResource || !resourceForm.typeId || !resourceForm.title.trim()">
                {{ creatingResource ? '创建中...' : '创建并选中' }}
              </button>
            </div>
          </form>
          <template v-else-if="selectedItem">
            <div class="resource-picker__section-title">{{ isSetBasisMode ? '选择依据资料' : isBindSourceMode ? '绑定来源' : '插入' }}</div>
            <h3>{{ selectedItem.title }}</h3>
            <p>{{ selectedItem.typeName }} · {{ selectedItem.workTitle || '未归类' }}</p>
            <p>{{ selectedItem.identityFieldLabel }}: {{ selectedItem.identityValue || '未填写' }}</p>
            <a v-if="selectedItem.sourceUrl" :href="selectedItem.sourceUrl" target="_blank" rel="noreferrer">{{ selectedItem.sourceUrl }}</a>
            <button
              v-if="isSetBasisMode"
              type="button"
              class="resource-picker__primary"
              @click="selectResourceForBasis(selectedItem)"
            >
              挂靠此资源实体
            </button>
            <button
              v-else-if="!isExcerptOnlyMode"
              type="button"
              class="resource-picker__primary"
              @click="selectResource(selectedItem)"
            >
              插入整个资源
            </button>

            <div v-if="selectedSupportsExcerpts" class="resource-picker__excerpts">
              <div class="resource-picker__section-title">{{ isSetBasisMode ? '可选：具体节选' : '资源节选' }}</div>
              <button
                v-for="excerpt in filteredExcerpts"
                :key="excerpt.id"
                type="button"
                class="resource-picker__excerpt"
                @click="selectExcerpt(excerpt)"
              >
                <span>{{ excerpt.title }}</span>
                <small v-if="excerpt.chapterTitle">章节：{{ excerpt.chapterTitle }}</small>
                <small v-if="excerpt.locator">{{ resourcePositionDisplay(excerpt.locator) }}</small>
                <em>{{ excerpt.excerptText }}</em>
              </button>
              <p v-if="!excerptLoading && filteredExcerpts.length === 0 && !isSetBasisMode" class="resource-picker__empty">
                {{ keyword.trim() ? '没有匹配的节选' : '暂无节选' }}
              </p>
              <p v-else-if="!excerptLoading && filteredExcerpts.length === 0 && isSetBasisMode" class="resource-picker__empty">
                该资源暂无节选，可直接挂靠上方资源实体。
              </p>

              <form v-if="!isSetBasisMode" class="resource-picker__form" @submit.prevent="createAndInsertExcerpt">
                <div class="resource-picker__form-fields">
                  <input v-model.trim="excerptForm.title" placeholder="节选标题" required maxlength="255" />
                  <el-tree-select
                    v-if="selectedSupportsBookChapters && excerptChapterTreeOptions.length"
                    v-model="excerptForm.chapterId"
                    :data="excerptChapterTreeOptions"
                    check-strictly
                    clearable
                    filterable
                    placeholder="所属章节（可选）"
                    style="width: 100%"
                  />
                  <label class="resource-picker__field-label">资源定位</label>
                  <ResourcePositionLocatorField
                    v-model="excerptForm.locator"
                    :resource-type-code="selectedItemType?.code"
                  />
                  <div
                    class="resource-picker__rich-editor"
                    @mousedown.stop
                    @click.stop
                    @keydown.stop
                  >
                    <TuEditor
                      :blocks="excerptEditorBlocks"
                      :hover-handle="false"
                      class="resource-picker__tu-editor"
                      @update:blocks="handleExcerptEditorUpdate"
                    />
                  </div>
                  <textarea v-model.trim="excerptForm.note" placeholder="备注，可选" rows="2" maxlength="1024" />
                </div>
                <div class="resource-picker__form-actions">
                  <button type="submit" :disabled="!excerptForm.title.trim()">
                    {{ isBindSourceMode ? '创建并绑定' : isMarkExcerptMode ? '创建节选' : '创建并插入节选' }}
                  </button>
                </div>
              </form>
            </div>
            <p v-else-if="isBindSourceMode" class="resource-picker__empty">
              当前资源类型暂不支持创建节选，请选择支持节选的资源实体。
            </p>
          </template>
          <el-empty v-else description="请选择外部资源" :image-size="64" />
          </div>
        </section>
      </div>
    </div>
  </el-dialog>
</template>

<style scoped>
.resource-picker-dialog :deep(.el-dialog__body) {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding-top: 8px;
}

.resource-picker {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
  min-height: 0;
  max-height: calc(100dvh - 120px);
}

.resource-picker__search {
  flex-shrink: 0;
}

.resource-picker__layout {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(240px, 1fr) minmax(280px, 1.1fr);
  gap: 14px;
}

.resource-picker__list,
.resource-picker__detail {
  min-width: 0;
  min-height: 0;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.resource-picker__list-scroll,
.resource-picker__detail-scroll {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.resource-picker__list-scroll :deep(.el-scrollbar) {
  height: 100%;
}

.resource-picker__detail-scroll {
  overflow-y: auto;
}

.resource-picker__section-title {
  margin-bottom: 8px;
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
}

.resource-picker__list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
  flex-shrink: 0;
}

.resource-picker__list-header .resource-picker__section-title {
  margin-bottom: 0;
}

.resource-picker__item,
.resource-picker__excerpt {
  display: grid;
  gap: 4px;
  width: 100%;
  border: 0;
  border-bottom: 1px solid #f1f5f9;
  padding: 10px;
  background: transparent;
  color: #1f2937;
  text-align: left;
  cursor: pointer;
}

.resource-picker__item:hover,
.resource-picker__item--active,
.resource-picker__excerpt:hover {
  background: #eff6ff;
}

.resource-picker__item small,
.resource-picker__excerpt small,
.resource-picker__detail p,
.resource-picker__empty {
  margin: 0;
  color: #64748b;
  font-size: 12px;
}

.resource-picker__detail h3 {
  margin: 0 0 8px;
}

.resource-picker__detail a {
  display: block;
  margin-top: 8px;
  color: #1677ff;
  overflow-wrap: anywhere;
}

.resource-picker__primary,
.resource-picker__create-actions button[type='submit'],
.resource-picker__form button {
  border: 1px solid #1677ff;
  border-radius: 6px;
  padding: 8px 12px;
  background: #1677ff;
  color: #fff;
  cursor: pointer;
}

.resource-picker__secondary,
.resource-picker__create-actions button[type='button'] {
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 7px 10px;
  background: #fff;
  color: #334155;
  cursor: pointer;
}

.resource-picker__secondary {
  flex-shrink: 0;
  font-size: 12px;
}

.resource-picker__primary {
  margin-top: 12px;
}

.resource-picker__excerpts {
  display: grid;
  gap: 8px;
  margin-top: 16px;
}

.resource-picker__excerpt em {
  color: #334155;
  font-size: 12px;
  font-style: normal;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.resource-picker__field-label {
  color: #475569;
  font-size: 12px;
  font-weight: 600;
}

.resource-picker__form {
  display: flex;
  flex-direction: column;
  gap: 0;
  margin-top: 8px;
  min-height: 0;
}

.resource-picker__form-fields {
  display: grid;
  gap: 8px;
}

.resource-picker__form-actions {
  flex-shrink: 0;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #e5e7eb;
  background: #fff;
  position: sticky;
  bottom: 0;
}

.resource-picker__form-actions button {
  width: 100%;
}

.resource-picker__create-form {
  display: grid;
  gap: 10px;
}

.resource-picker__create-form label {
  display: grid;
  gap: 5px;
  color: #475569;
  font-size: 12px;
  font-weight: 600;
}

.resource-picker__create-form input,
.resource-picker__create-form select,
.resource-picker__create-form textarea,
.resource-picker__form input,
.resource-picker__form textarea {
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 8px 10px;
  font: inherit;
}

.resource-picker__create-form input,
.resource-picker__create-form select,
.resource-picker__create-form textarea {
  color: #1f2937;
  font-size: 14px;
  font-weight: 400;
}

.resource-picker__create-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 2px;
}

.resource-picker__rich-editor {
  min-height: 96px;
  max-height: min(180px, 24dvh);
  overflow-y: auto;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #fff;
}

.resource-picker__tu-editor {
  min-height: 96px;
}

.resource-picker__tu-editor :deep(.tu-editor-wrapper) {
  min-height: 96px;
  --tiptap-handle-gutter: 0;
}

.resource-picker__tu-editor :deep(.tu-editor-content) {
  min-height: 96px;
  padding: 8px 10px;
  line-height: 1.55;
  font-size: 14px;
  overflow-wrap: anywhere;
}

.resource-picker__tu-editor :deep(.tu-editor-content p) {
  margin: 0;
}

.resource-picker__tu-editor :deep(.tu-editor-content p + p) {
  margin-top: 6px;
}

.resource-picker__tu-editor :deep(.tu-editor-content h1),
.resource-picker__tu-editor :deep(.tu-editor-content h2),
.resource-picker__tu-editor :deep(.tu-editor-content h3),
.resource-picker__tu-editor :deep(.tu-editor-content h4),
.resource-picker__tu-editor :deep(.tu-editor-content h5),
.resource-picker__tu-editor :deep(.tu-editor-content h6) {
  margin: 0 0 6px;
  font-size: 15px;
  line-height: 1.35;
}

.resource-picker__tu-editor :deep(.tu-editor-content ul),
.resource-picker__tu-editor :deep(.tu-editor-content ol) {
  margin: 0;
  padding-left: 18px;
}

.resource-picker__create-actions button:disabled,
.resource-picker__form button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.resource-picker__error {
  margin: 0;
  flex-shrink: 0;
  color: #b91c1c;
  font-size: 13px;
}

@media (max-width: 720px) {
  .resource-picker__layout {
    grid-template-columns: 1fr;
  }
}
</style>

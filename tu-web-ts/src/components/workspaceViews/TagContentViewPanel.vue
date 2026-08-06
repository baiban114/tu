<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElPagination, ElScrollbar, ElTooltip } from 'element-plus'
import type { PageContent } from '@/api/types'
import { getPageContent } from '@/api/page'
import { fetchKbTags, searchTaggedContent, type TaggedContentItem } from '@/api/taggedContent'
import type { BlockTag } from '@/api/types'
import { DEFAULT_PAGE_SIZE } from '@/constants/pagination'
import { useWorkspaceStore } from '@/stores/workspace'
import { useWorkspaceViewsStore } from '@/stores/workspaceViews'
import { fetchKbTagPool } from '@/utils/tagPool'
import TaggedContentExpander from './TaggedContentExpander.vue'

const LAST_TAG_KEY = 'tu:tag-content-view:last-tag'

function readLastTagLabel(kbId: string): string {
  try {
    const raw = localStorage.getItem(LAST_TAG_KEY)
    if (!raw) return ''
    const map = JSON.parse(raw) as Record<string, string>
    return typeof map[kbId] === 'string' ? map[kbId] : ''
  } catch {
    return ''
  }
}

function persistLastTagLabel(kbId: string, label: string) {
  try {
    const raw = localStorage.getItem(LAST_TAG_KEY)
    const map = raw ? JSON.parse(raw) as Record<string, string> : {}
    if (label) map[kbId] = label
    else delete map[kbId]
    localStorage.setItem(LAST_TAG_KEY, JSON.stringify(map))
  } catch {
    // ignore
  }
}

const workspace = useWorkspaceStore()
const viewsStore = useWorkspaceViewsStore()
const router = useRouter()

const tagPool = ref<BlockTag[]>([])
const poolLoading = ref(false)
const selectedTagLabel = ref('')
const items = ref<TaggedContentItem[]>([])
const total = ref(0)
const page = ref(0)
const pageSize = ref(DEFAULT_PAGE_SIZE)
const loading = ref(false)
const contentCache = ref<Record<string, PageContent | null>>({})
const contentLoading = ref<Record<string, boolean>>({})

const kbName = computed(() => (
  workspace.kbList.find((kb) => kb.id === workspace.currentKbId)?.name ?? '未选择'
))

const kbId = computed(() => workspace.currentKbId ?? '')
const scopeLabels: Record<TaggedContentItem['scope'], string> = {
  section: '章节',
  block: '块',
  text: '文字',
}

async function loadTagPool() {
  if (!kbId.value) {
    tagPool.value = []
    return
  }
  poolLoading.value = true
  try {
    tagPool.value = await fetchKbTagPool(kbId.value)
    restoreLastTag()
  } catch {
    tagPool.value = []
  } finally {
    poolLoading.value = false
  }
}

function restoreLastTag() {
  if (selectedTagLabel.value) return
  const cached = readLastTagLabel(kbId.value)
  if (!cached) return
  const exists = tagPool.value.some((tag) => tag.label.toLowerCase() === cached.toLowerCase())
  if (!exists) return
  selectedTagLabel.value = cached
  page.value = 0
  void loadResults()
}

async function loadResults() {
  if (!kbId.value || !selectedTagLabel.value) {
    items.value = []
    total.value = 0
    return
  }
  loading.value = true
  try {
    const result = await searchTaggedContent(kbId.value, {
      tagLabel: selectedTagLabel.value,
      page: page.value,
      pageSize: pageSize.value,
    })
    items.value = result.items
    total.value = result.total
  } catch {
    items.value = []
    total.value = 0
    ElMessage.error('标签检索失败')
  } finally {
    loading.value = false
  }
}

async function onTagChange(label: string) {
  selectedTagLabel.value = label
  page.value = 0
  persistLastTagLabel(kbId.value, label)
  await loadResults()
}

function onPageChange(p: number) {
  page.value = p - 1
  void loadResults()
}

async function loadContent(pageId: string) {
  if (contentCache.value[pageId] !== undefined) return
  contentLoading.value = { ...contentLoading.value, [pageId]: true }
  try {
    const content = await getPageContent(pageId)
    contentCache.value = { ...contentCache.value, [pageId]: content }
  } catch {
    contentCache.value = { ...contentCache.value, [pageId]: null }
  } finally {
    contentLoading.value = { ...contentLoading.value, [pageId]: false }
  }
}

function openPage(item: TaggedContentItem) {
  viewsStore.setSidebarSource('knowledgeBase')
  void workspace.selectPage(item.pageId)
  void router.replace({ path: '/', query: { pageId: item.pageId } })
}

function formatUpdatedAt(iso: string): string {
  if (!iso) return '—'
  return iso.slice(0, 16).replace('T', ' ')
}

watch(kbId, () => {
  selectedTagLabel.value = ''
  page.value = 0
  items.value = []
  total.value = 0
  contentCache.value = {}
  contentLoading.value = {}
  void loadTagPool()
})

watch(
  () => [viewsStore.isViewsMode, viewsStore.isTagContentView] as const,
  ([isViews, isTag]) => {
    if (isViews && isTag) void loadTagPool()
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  contentCache.value = {}
  contentLoading.value = {}
})
</script>

<template>
  <div class="tag-content-view">
    <div class="tag-content-view__toolbar">
      <div class="tag-content-view__selector">
        <span class="tag-content-view__label">标签</span>
        <el-select
          v-model="selectedTagLabel"
          class="tag-content-view__select"
          filterable
          clearable
          placeholder="选择标签"
          :loading="poolLoading"
          :disabled="!kbId"
          @change="onTagChange"
        >
          <el-option
            v-for="tag in tagPool"
            :key="tag.id"
            :label="tag.label"
            :value="tag.label"
          >
            <span class="tag-option">
              <span
                class="tag-option__dot"
                :style="{ backgroundColor: tag.color || '#909399' }"
              />
              <span class="tag-option__label">{{ tag.label }}</span>
            </span>
          </el-option>
        </el-select>
      </div>
      <div class="tag-content-view__meta">
        数据源：{{ kbName }}
        <template v-if="selectedTagLabel"> · 命中 {{ total }} 项</template>
      </div>
    </div>

    <div class="tag-content-view__host">
      <ElScrollbar class="tag-content-view__scroll">
        <template v-if="!kbId">
          <div class="tag-content-view__empty">请先在左侧选择一个知识库作为数据源。</div>
        </template>
        <template v-else-if="!selectedTagLabel">
          <div class="tag-content-view__empty">选择标签后检索被标记的块（nodeView）与文档单元（章节）。</div>
        </template>
        <template v-else>
          <el-table
            v-loading="loading"
            class="tag-content-view__table"
            :data="items"
            row-key="id"
            empty-text="该标签暂无匹配内容"
          >
            <el-table-column type="expand">
              <template #default="{ row }">
                <TaggedContentExpander
                  :item="row"
                  :content="contentCache[row.pageId]"
                  :loading="Boolean(contentLoading[row.pageId])"
                  @load="loadContent(row.pageId)"
                />
              </template>
            </el-table-column>
            <el-table-column label="类型" width="70">
              <template #default="{ row }">
                <span
                  class="scope-chip"
                  :class="`scope-chip--${row.scope}`"
                >
                  {{ scopeLabels[row.scope as TaggedContentItem['scope']] }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="标题" min-width="220" show-overflow-tooltip>
              <template #default="{ row }">
                <span class="title-cell__title">{{ row.title }}</span>
              </template>
            </el-table-column>
            <el-table-column label="所属页面" min-width="160" show-overflow-tooltip>
              <template #default="{ row }">
                <span class="page-cell">{{ row.pageTitle }}</span>
              </template>
            </el-table-column>
            <el-table-column label="标签" width="180">
              <template #default="{ row }">
                <div class="tag-chips">
                  <span
                    v-for="tag in row.matchedTags"
                    :key="tag.id"
                    class="tag-chip"
                    :style="{ borderColor: tag.color || '#909399', color: tag.color || '#606266' }"
                  >
                    {{ tag.label }}
                  </span>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="更新时间" width="130">
              <template #default="{ row }">
                <ElTooltip :content="row.updatedAt" placement="top" :show-after="400">
                  <span class="time-cell">{{ formatUpdatedAt(row.updatedAt) }}</span>
                </ElTooltip>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="80">
              <template #default="{ row }">
                <el-button link size="small" @click.stop="openPage(row)">打开页面</el-button>
              </template>
            </el-table-column>
          </el-table>
        </template>
      </ElScrollbar>
    </div>

    <div class="tag-content-view__pager">
      <ElPagination
        v-if="selectedTagLabel && total > 0"
        small
        layout="prev, pager, next, total"
        :total="total"
        :page-size="pageSize"
        :current-page="page + 1"
        @current-change="onPageChange"
      />
    </div>
  </div>
</template>

<style scoped>
.tag-content-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  box-sizing: border-box;
}

.tag-content-view__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-shrink: 0;
  padding: 10px 16px;
  border-bottom: 1px solid #ebeef5;
}

.tag-content-view__selector {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.tag-content-view__label {
  flex-shrink: 0;
  font-size: 12px;
  color: #606266;
}

.tag-content-view__select {
  width: 220px;
}

.tag-content-view__meta {
  flex-shrink: 0;
  font-size: 12px;
  color: #909399;
}

.tag-content-view__host {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.tag-content-view__scroll {
  flex: 1;
  min-height: 0;
  height: 100%;
}

.tag-content-view__table {
  width: 100%;
}

.tag-content-view__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  padding: 24px;
  text-align: center;
  font-size: 13px;
  color: #909399;
}

.tag-content-view__pager {
  flex-shrink: 0;
  display: flex;
  justify-content: center;
  padding: 8px 0;
  min-height: 32px;
}

.tag-option {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.tag-option__dot {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.tag-option__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.scope-chip {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11px;
}

.scope-chip--section {
  background: #fdf6ec;
  color: #e6a23c;
}

.scope-chip--block {
  background: #ecf5ff;
  color: #409eff;
}

.scope-chip--text {
  background: #f0f9eb;
  color: #529b2e;
}

.tag-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.tag-chip {
  display: inline-block;
  max-width: 100%;
  padding: 0 6px;
  border: 1px solid;
  border-radius: 4px;
  font-size: 11px;
  line-height: 18px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  background: #fff;
}

.page-cell,
.time-cell {
  color: #606266;
}

.title-cell__title {
  color: #303133;
  font-weight: 500;
}
</style>

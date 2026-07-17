<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  ElButton,
  ElCheckbox,
  ElDialog,
  ElMessage,
  ElPagination,
  ElRadio,
  ElRadioGroup,
  ElTable,
  ElTableColumn,
  ElTree,
} from 'element-plus';
import type { KnowledgePointGenerationPreviewItem, PageItem } from '@/api/types';
import type { CheckboxValueType } from 'element-plus';
import { generateKnowledgePoints, previewKnowledgePoints } from '@/api/knowledgePoint';
import { getPageTree } from '@/api/page';
import { DEFAULT_PAGE_SIZE } from '@/constants/pagination';
import { paginateSlice } from '@/utils/clientPagination';

type PageScope = 'all' | 'current' | 'selected';

/** 预览时列出范围内全部可定位项；用户于 Step 2 勾选决定生成哪些 */
const ALL_LOCATOR_SOURCES = ['page', 'heading', 'section', 'block'] as const;

const props = defineProps<{
  visible: boolean;
  kbId: string;
  currentPageId?: string | null;
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
  completed: [];
}>();

const step = ref<1 | 2>(1);
const pageScope = ref<PageScope>('all');
const selectedPageIds = ref<string[]>([]);
const pageTree = ref<PageItem[]>([]);
const pageTreeLoading = ref(false);
const previewItems = ref<KnowledgePointGenerationPreviewItem[]>([]);
const selectedLocators = ref<Set<string>>(new Set());
const previewing = ref(false);
const generating = ref(false);
const previewPage = ref(0);

const pageTreeProps = { label: 'title', children: 'children' };

const kindLabel: Record<string, string> = {
  page: '页面',
  heading: '标题',
  section: '节',
  block: '块',
};

const statusLabel: Record<string, string> = {
  would_create: '将新建',
  would_skip: '将跳过',
};

const selectedSources = computed(() => [...ALL_LOCATOR_SOURCES]);

const canPreview = computed(() => {
  if (pageScope.value === 'current' && !props.currentPageId) return false;
  if (pageScope.value === 'selected' && selectedPageIds.value.length === 0) return false;
  return true;
});

const resolvedPageIds = computed<string[] | undefined>(() => {
  if (pageScope.value === 'all') return undefined;
  if (pageScope.value === 'current') return props.currentPageId ? [props.currentPageId] : undefined;
  return selectedPageIds.value.length ? [...selectedPageIds.value] : undefined;
});

const pagedPreviewItems = computed(() => paginateSlice(
  previewItems.value,
  previewPage.value,
  DEFAULT_PAGE_SIZE,
));

const selectedCount = computed(() => selectedLocators.value.size);

function resetState() {
  step.value = 1;
  pageScope.value = props.currentPageId ? 'current' : 'all';
  selectedPageIds.value = [];
  previewItems.value = [];
  selectedLocators.value = new Set();
  previewPage.value = 0;
}

async function loadPageTree() {
  pageTreeLoading.value = true;
  try {
    pageTree.value = await getPageTree(props.kbId);
  } finally {
    pageTreeLoading.value = false;
  }
}

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return;
    resetState();
    void loadPageTree();
  },
);

function closeDialog() {
  emit('update:visible', false);
}

function onPageTreeCheck(_data: PageItem, checked: { checkedKeys: Array<string | number> }) {
  selectedPageIds.value = checked.checkedKeys.map((key) => String(key));
}

async function handlePreview() {
  if (!canPreview.value || previewing.value) return;
  previewing.value = true;
  try {
    const result = await previewKnowledgePoints(props.kbId, {
      sources: selectedSources.value,
      pageIds: resolvedPageIds.value,
    });
    previewItems.value = result.items;
    selectedLocators.value = new Set(
      result.items.filter((item) => item.status === 'would_create').map((item) => item.locator),
    );
    previewPage.value = 0;
    step.value = 2;
    if (!result.items.length) {
      ElMessage.info('没有匹配的候选定位');
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '预览失败');
  } finally {
    previewing.value = false;
  }
}

function toggleRowSelection(locator: string, checked: boolean) {
  const next = new Set(selectedLocators.value);
  if (checked) next.add(locator);
  else next.delete(locator);
  selectedLocators.value = next;
}

function selectAllCreate() {
  selectedLocators.value = new Set(
    previewItems.value.filter((item) => item.status === 'would_create').map((item) => item.locator),
  );
}

function invertSelection() {
  const next = new Set<string>();
  for (const item of previewItems.value) {
    if (!selectedLocators.value.has(item.locator)) {
      next.add(item.locator);
    }
  }
  selectedLocators.value = next;
}

async function handleConfirmGenerate() {
  const locators = [...selectedLocators.value];
  if (!locators.length || generating.value) return;
  generating.value = true;
  try {
    const result = await generateKnowledgePoints(props.kbId, { locators });
    closeDialog();
    ElMessage.success(`生成完成：新建 ${result.created}，跳过 ${result.skipped}，失败 ${result.failed}`);
    emit('completed');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '生成失败');
  } finally {
    generating.value = false;
  }
}
</script>

<template>
  <ElDialog
    :model-value="visible"
    title="从定位系统生成知识点"
    width="720px"
    class="tu-dialog-viewport kpg-dialog"
    @update:model-value="emit('update:visible', $event)"
  >
    <div class="kpg-body">
      <template v-if="step === 1">
        <p class="kpg-hint">
          选定页面范围后预览全部可定位项（页面 / 标题 / 节 / 块）；勾选哪条就生成哪条，扁平建立 primary 锚点。
        </p>

        <section class="kpg-section">
          <div class="kpg-section__title">页面范围</div>
          <ElRadioGroup v-model="pageScope" class="kpg-radio-group">
            <ElRadio value="all">整个知识库</ElRadio>
            <ElRadio value="current" :disabled="!currentPageId">当前工作区页面</ElRadio>
            <ElRadio value="selected">自选页面</ElRadio>
          </ElRadioGroup>
          <p v-if="pageScope === 'current' && !currentPageId" class="kpg-note kpg-note--warn">
            请先在编辑区选中一个页面。
          </p>
          <div v-if="pageScope === 'selected'" class="kpg-page-tree">
            <ElTree
              v-loading="pageTreeLoading"
              :data="pageTree"
              node-key="id"
              show-checkbox
              check-strictly
              default-expand-all
              :props="pageTreeProps"
              @check="onPageTreeCheck"
            />
          </div>
        </section>
      </template>

      <template v-else>
        <div class="kpg-preview-toolbar">
          <span>共 {{ previewItems.length }} 条候选，已选 {{ selectedCount }} 条</span>
          <div class="kpg-preview-toolbar__actions">
            <ElButton size="small" @click="selectAllCreate">全选将新建</ElButton>
            <ElButton size="small" @click="invertSelection">反选</ElButton>
          </div>
        </div>
        <div class="kpg-table-wrap">
          <ElTable :data="pagedPreviewItems.items" size="small" height="100%">
            <ElTableColumn width="48">
              <template #default="{ row }">
                <ElCheckbox
                  :model-value="selectedLocators.has(row.locator)"
                  @update:model-value="(checked: CheckboxValueType) => toggleRowSelection(row.locator, checked === true)"
                />
              </template>
            </ElTableColumn>
            <ElTableColumn label="类型" width="72">
              <template #default="{ row }">{{ kindLabel[row.kind] || row.kind }}</template>
            </ElTableColumn>
            <ElTableColumn prop="title" label="标题" min-width="120" show-overflow-tooltip />
            <ElTableColumn prop="pageTitle" label="所属页面" min-width="100" show-overflow-tooltip />
            <ElTableColumn prop="locator" label="locator" min-width="180" show-overflow-tooltip />
            <ElTableColumn label="状态" width="88">
              <template #default="{ row }">{{ statusLabel[row.status] || row.status }}</template>
            </ElTableColumn>
          </ElTable>
        </div>
        <ElPagination
          v-if="previewItems.length > DEFAULT_PAGE_SIZE"
          small
          layout="total, prev, pager, next"
          :total="previewItems.length"
          :page-size="DEFAULT_PAGE_SIZE"
          :current-page="previewPage + 1"
          class="kpg-pagination"
          @current-change="(page: number) => { previewPage = page - 1 }"
        />
      </template>
    </div>

    <template #footer>
      <template v-if="step === 1">
        <ElButton @click="closeDialog">取消</ElButton>
        <ElButton type="primary" :loading="previewing" :disabled="!canPreview" @click="handlePreview">
          预览
        </ElButton>
      </template>
      <template v-else>
        <ElButton @click="step = 1">返回</ElButton>
        <ElButton @click="closeDialog">取消</ElButton>
        <ElButton
          type="primary"
          :loading="generating"
          :disabled="selectedCount === 0"
          @click="handleConfirmGenerate"
        >
          确认生成 {{ selectedCount }} 条
        </ElButton>
      </template>
    </template>
  </ElDialog>
</template>

<style scoped>
.kpg-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
  flex: 1;
  overflow: hidden;
}

.kpg-hint {
  margin: 0;
  font-size: 13px;
  color: #595959;
}

.kpg-section__title {
  font-size: 12px;
  color: #8c8c8c;
  margin-bottom: 8px;
}

.kpg-radio-group {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}

.kpg-page-tree {
  margin-top: 8px;
  max-height: 220px;
  overflow: auto;
  border: 1px solid #f0f0f0;
  border-radius: 6px;
  padding: 8px;
}

.kpg-note {
  margin: 8px 0 0;
  font-size: 12px;
}

.kpg-note--warn {
  color: #d48806;
}

.kpg-preview-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
  flex-shrink: 0;
}

.kpg-preview-toolbar__actions {
  display: flex;
  gap: 8px;
}

.kpg-table-wrap {
  flex: 1;
  min-height: 240px;
  max-height: min(52vh, 420px);
  overflow: hidden;
}

.kpg-pagination {
  justify-content: flex-end;
  flex-shrink: 0;
}
</style>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElButton, ElDialog, ElOption, ElPagination, ElSelect, ElTabPane, ElTabs, ElTree } from 'element-plus';
import type { KnowledgeAnchor, PageItem, RelationTypeDef } from '@/api/types';
import { DEFAULT_PAGE_SIZE } from '@/constants/pagination';
import { createKnowledgeRelation, listRelationTypes } from '@/api/knowledgeRelation';
import { listResourceExcerpts, listResourceItems } from '@/api/externalResource';
import type { ResourceExcerpt, ResourceItem } from '@/api/externalResource';
import { anchorLabel, pageAnchor, resourceExcerptAnchor, resourceItemAnchor } from '@/utils/knowledgeAnchor';
import { paginateSlice } from '@/utils/clientPagination';
import { createKnowledgePoint, listKnowledgePointsByLocator } from '@/api/knowledgePoint';

const props = defineProps<{
  visible: boolean;
  kbId: string;
  sourceAnchor: KnowledgeAnchor | null;
  pageTree: PageItem[];
}>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'created'): void;
}>();

const activeTab = ref('pages');
const relationTypes = ref<RelationTypeDef[]>([]);
const selectedTypeKey = ref('case');
const selectedTarget = ref<KnowledgeAnchor | null>(null);
const saving = ref(false);

const pageTreeProps = { label: 'title', children: 'children' };

const resourceItems = ref<ResourceItem[]>([]);
const resourcePage = ref(0);
const resourceTotal = ref(0);
const excerptsByItem = ref<Record<string, ResourceExcerpt[]>>({});
const expandedItemId = ref<string | null>(null);

const pagedResourceItems = computed(() => paginateSlice(
  resourceItems.value,
  resourcePage.value,
  DEFAULT_PAGE_SIZE,
));

watch(
  () => props.visible,
  async (visible) => {
    if (!visible) {
      selectedTarget.value = null;
      selectedTypeKey.value = 'case';
      activeTab.value = 'pages';
      resourcePage.value = 0;
      return;
    }
    relationTypes.value = await listRelationTypes(props.kbId);
    if (!relationTypes.value.some((item) => item.typeKey === selectedTypeKey.value)) {
      selectedTypeKey.value = relationTypes.value[0]?.typeKey ?? 'case';
    }
    await loadResourceItems();
  },
);

async function loadResourceItems() {
  const result = await listResourceItems({ page: resourcePage.value, pageSize: DEFAULT_PAGE_SIZE });
  resourceItems.value = result.items;
  resourceTotal.value = result.total;
}

async function loadExcerpts(itemId: string) {
  if (excerptsByItem.value[itemId]) return;
  const result = await listResourceExcerpts(itemId, { page: 0, pageSize: 50 });
  excerptsByItem.value = { ...excerptsByItem.value, [itemId]: result.items };
}

function handlePageNodeClick(data: PageItem) {
  selectedTarget.value = pageAnchor(data.id, data.title);
}

function selectResourceItem(item: ResourceItem) {
  selectedTarget.value = resourceItemAnchor(item.id, item.title);
}

function selectExcerpt(item: ResourceItem, excerpt: ResourceExcerpt) {
  selectedTarget.value = resourceExcerptAnchor(item.id, excerpt.id, excerpt.title || excerpt.excerptText?.slice(0, 80));
}

async function toggleItemExpand(item: ResourceItem) {
  if (expandedItemId.value === item.id) {
    expandedItemId.value = null;
    return;
  }
  expandedItemId.value = item.id;
  await loadExcerpts(item.id);
}

function close() {
  emit('update:visible', false);
}

async function ensurePointForAnchor(anchor: KnowledgeAnchor): Promise<string> {
  const existing = await listKnowledgePointsByLocator(props.kbId, anchor.locator);
  if (existing[0]) return existing[0].id;
  const created = await createKnowledgePoint(props.kbId, {
    title: anchorLabel(anchor),
    sourceAnchor: anchor,
  });
  return created.id;
}

async function handleSave() {
  if (!props.sourceAnchor || !selectedTarget.value || saving.value) return;
  saving.value = true;
  try {
    const fromPointId = await ensurePointForAnchor(props.sourceAnchor);
    const toPointId = await ensurePointForAnchor(selectedTarget.value);
    await createKnowledgeRelation(props.kbId, {
      relationTypeKey: selectedTypeKey.value,
      fromPointId,
      toPointId,
      from: props.sourceAnchor,
      to: selectedTarget.value,
    });
    emit('created');
    close();
  } finally {
    saving.value = false;
  }
}

async function onResourcePageChange(page: number) {
  resourcePage.value = Math.max(0, page - 1);
  await loadResourceItems();
}
</script>

<template>
  <ElDialog
    :model-value="visible"
    title="建立知识关联"
    width="min(520px, calc(100vw - 48px))"
    class="tu-dialog-viewport"
    destroy-on-close
    @update:model-value="(value: boolean) => emit('update:visible', value)"
  >
    <div class="kap-body">
      <div v-if="sourceAnchor" class="kap-source">
        <span class="kap-source-label">从</span>
        <span class="kap-source-value">{{ anchorLabel(sourceAnchor) }}</span>
      </div>

      <label class="kap-field-label">关系类型</label>
      <ElSelect v-model="selectedTypeKey" class="kap-type-select">
        <ElOption
          v-for="type in relationTypes"
          :key="type.typeKey"
          :label="type.label"
          :value="type.typeKey"
        />
      </ElSelect>

      <ElTabs v-model="activeTab" class="kap-tabs">
        <ElTabPane label="页面" name="pages">
          <div class="kap-scroll">
            <ElTree
              :data="pageTree"
              node-key="id"
              :props="pageTreeProps"
              highlight-current
              @node-click="handlePageNodeClick"
            />
          </div>
        </ElTabPane>
        <ElTabPane label="资源" name="resources">
          <div class="kap-scroll">
            <div
              v-for="item in pagedResourceItems.items"
              :key="item.id"
              class="kap-resource-item"
            >
              <button type="button" class="kap-resource-row" @click="selectResourceItem(item)">
                {{ item.title }}
              </button>
              <button type="button" class="kap-resource-expand" @click="toggleItemExpand(item)">
                {{ expandedItemId === item.id ? '收起节选' : '节选' }}
              </button>
              <div v-if="expandedItemId === item.id" class="kap-excerpt-list">
                <button
                  v-for="excerpt in excerptsByItem[item.id] ?? []"
                  :key="excerpt.id"
                  type="button"
                  class="kap-excerpt-row"
                  @click="selectExcerpt(item, excerpt)"
                >
                  {{ excerpt.title || excerpt.excerptText?.slice(0, 60) || excerpt.id }}
                </button>
                <div v-if="!(excerptsByItem[item.id]?.length)" class="kap-empty">暂无节选</div>
              </div>
            </div>
          </div>
          <ElPagination
            v-if="resourceTotal > DEFAULT_PAGE_SIZE"
            small
            layout="prev, pager, next"
            :total="resourceTotal"
            :page-size="DEFAULT_PAGE_SIZE"
            :current-page="resourcePage + 1"
            @current-change="onResourcePageChange"
          />
        </ElTabPane>
      </ElTabs>

      <div v-if="selectedTarget" class="kap-target">
        <span class="kap-source-label">到</span>
        <span class="kap-source-value">{{ anchorLabel(selectedTarget) }}</span>
      </div>
    </div>

    <template #footer>
      <ElButton @click="close">取消</ElButton>
      <ElButton type="primary" :disabled="!sourceAnchor || !selectedTarget" :loading="saving" @click="handleSave">
        建立关联
      </ElButton>
    </template>
  </ElDialog>
</template>

<style scoped>
.kap-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
}

.kap-source,
.kap-target {
  display: flex;
  gap: 8px;
  align-items: baseline;
  font-size: 13px;
}

.kap-source-label {
  color: #8c8c8c;
  flex-shrink: 0;
}

.kap-source-value {
  color: #1f1f1f;
  word-break: break-word;
}

.kap-field-label {
  font-size: 13px;
  color: #595959;
}

.kap-type-select {
  width: 100%;
}

.kap-tabs {
  flex: 1;
  min-height: 0;
}

.kap-scroll {
  max-height: 280px;
  overflow-y: auto;
  border: 1px solid #f0f0f0;
  border-radius: 8px;
  padding: 8px;
}

.kap-resource-item {
  border-bottom: 1px solid #f5f5f5;
  padding: 6px 0;
}

.kap-resource-row {
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 6px 8px;
  border-radius: 6px;
  font-size: 13px;
}

.kap-resource-row:hover,
.kap-excerpt-row:hover {
  background: #f5f7fa;
}

.kap-resource-expand {
  margin-left: 8px;
  border: none;
  background: transparent;
  color: #1677ff;
  cursor: pointer;
  font-size: 12px;
}

.kap-excerpt-list {
  margin-top: 4px;
  padding-left: 12px;
}

.kap-excerpt-row {
  display: block;
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 5px 8px;
  font-size: 12px;
  color: #595959;
}

.kap-empty {
  color: #bfbfbf;
  font-size: 12px;
  padding: 4px 8px;
}
</style>

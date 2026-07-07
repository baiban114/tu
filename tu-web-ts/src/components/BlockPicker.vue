<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElDialog, ElEmpty, ElInput, ElScrollbar } from 'element-plus';
import { useBlockRegistryStore } from '@/stores/blockRegistry';
import type { Block, BlockWithMeta, PageItem } from '@/api/page';

type BlockFilterType = 'all' | 'text' | 'x6';
type PickerItem =
  | { kind: 'page'; page: PageItem; depth: number }
  | { kind: 'block'; blockItem: BlockWithMeta };

export interface ReferenceTarget {
  type: 'block' | 'page';
  id: string;
}

const props = withDefaults(defineProps<{
  visible: boolean;
  initialTypeFilter?: BlockFilterType;
  pages?: PageItem[];
  currentPageId?: string | null;
}>(), {
  initialTypeFilter: 'all',
  pages: () => [],
  currentPageId: null,
});

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void;
  (e: 'select', target: ReferenceTarget): void;
}>();

const registryStore = useBlockRegistryStore();
const searchText = ref('');
const typeFilter = ref<BlockFilterType>(props.initialTypeFilter);

const filterOptions: Array<{ key: BlockFilterType; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'text', label: '文本' },
  { key: 'x6', label: '画板' },
];

const isTextBlock = (block: Block) => {
  return block.type === 'richtext' || block.type === 'richText';
};

const flattenPages = (nodes: PageItem[], depth = 0): Array<{ page: PageItem; depth: number }> => {
  return nodes.flatMap((page) => [
    { page, depth },
    ...flattenPages(page.children ?? [], depth + 1),
  ]);
};

const getBlockTypeLabel = (block: Block) => {
  if (block.type === 'container') return block.metadata?.autoReferenceUnit ? '组合单元' : '容器';
  if (block.type === 'x6') return '画板';
  if (block.type === 'table') return '表格';
  if (block.type === 'line') return '时间轴';
  if (isTextBlock(block)) return '文本';
  return block.type;
};

const getTypeLabel = (item: PickerItem) => {
  if (item.kind === 'page') return '页面';
  return getBlockTypeLabel(item.blockItem.block);
};

const matchesTypeFilter = (item: BlockWithMeta) => {
  if (typeFilter.value === 'all') return true;
  if (typeFilter.value === 'text') return isTextBlock(item.block);
  if (typeFilter.value === 'x6') return item.block.type === 'x6';
  return true;
};

const pageItems = computed<PickerItem[]>(() => {
  if (typeFilter.value !== 'all') return [];
  return flattenPages(props.pages)
    .filter(({ page }) => page.id !== props.currentPageId)
    .map(({ page, depth }) => ({ kind: 'page', page, depth }));
});

watch(
  () => props.visible,
  async (visible) => {
    if (!visible) return;
    searchText.value = '';
    typeFilter.value = props.initialTypeFilter;
    await registryStore.loadAll();
  },
);

const getBlockSearchText = (block: Block): string => {
  const childText = (block.children ?? []).map(getBlockSearchText).join(' ');
  return [
    block.title,
    block.content,
    getBlockTypeLabel(block),
    childText,
  ].filter(Boolean).join(' ');
};

const filteredItems = computed<PickerItem[]>(() => {
  const keyword = searchText.value.trim().toLowerCase();
  const items: PickerItem[] = [
    ...pageItems.value,
    ...registryStore.getAllBlocks().filter(matchesTypeFilter).map((blockItem) => ({
      kind: 'block',
      blockItem,
    }) satisfies PickerItem),
  ];

  if (!keyword) return items;

  return items.filter((item) => {
    if (item.kind === 'page') {
      return item.page.title.toLowerCase().includes(keyword)
        || getTypeLabel(item).toLowerCase().includes(keyword);
    }

    const { block, pageTitle } = item.blockItem;
    return getBlockSearchText(block).toLowerCase().includes(keyword)
      || pageTitle.toLowerCase().includes(keyword);
  });
});

function getItemKey(item: PickerItem): string {
  return item.kind === 'page' ? `page-${item.page.id}` : `block-${item.blockItem.block.id}`;
}

function onSelect(item: PickerItem) {
  emit('select', item.kind === 'page'
    ? { type: 'page', id: item.page.id }
    : { type: 'block', id: item.blockItem.block.id });
  emit('update:visible', false);
}

function blockPreview(block: Block): string {
  if (block.type === 'container') {
    const childPreview = (block.children ?? []).map(blockPreview).filter(Boolean).join(' / ');
    return childPreview || block.title?.trim() || getBlockTypeLabel(block);
  }
  if (block.type === 'x6' || block.type === 'table' || block.type === 'line') {
    return block.title?.trim() || getBlockTypeLabel(block);
  }

  const plain = (block.content ?? '').replace(/[#*`>\-_\[\]]/g, '').trim();
  if (!plain) return block.title?.trim() || '空内容';
  return plain.length > 80 ? `${plain.slice(0, 80)}...` : plain;
}

function preview(item: PickerItem): string {
  if (item.kind === 'page') {
    return `${'  '.repeat(item.depth)}${item.page.title}`;
  }
  return blockPreview(item.blockItem.block);
}

function sourceText(item: PickerItem): string {
  if (item.kind === 'page') return '页面引用';
  return `来自：${item.blockItem.pageTitle}`;
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    title="选择引用目标"
    width="520px"
    @update:model-value="emit('update:visible', $event)"
  >
    <div class="picker-body">
      <el-input
        v-model="searchText"
        placeholder="搜索块内容、标题或页面名"
        clearable
        class="picker-search"
      />

      <div class="picker-filters">
        <button
          v-for="option in filterOptions"
          :key="option.key"
          type="button"
          class="picker-filter"
          :class="{ 'picker-filter--active': typeFilter === option.key }"
          @click="typeFilter = option.key"
        >
          {{ option.label }}
        </button>
      </div>

      <el-scrollbar height="340px" class="picker-list-wrap">
        <div v-if="filteredItems.length === 0" class="picker-empty">
          <el-empty description="没有找到可引用的内容" :image-size="60" />
        </div>

        <div
          v-for="item in filteredItems"
          :key="getItemKey(item)"
          class="picker-item"
          @click="onSelect(item)"
        >
          <div class="picker-item__preview">{{ preview(item) }}</div>
          <div class="picker-item__meta">
            <span class="picker-item__type" :class="{ 'picker-item__type--page': item.kind === 'page' }">
              {{ getTypeLabel(item) }}
            </span>
            <span class="picker-item__page">{{ sourceText(item) }}</span>
          </div>
        </div>
      </el-scrollbar>
    </div>
  </el-dialog>
</template>

<style scoped>
.picker-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.picker-search {
  width: 100%;
}

.picker-filters {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.picker-filter {
  border: 1px solid #d9d9d9;
  background: #fff;
  color: #595959;
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.picker-filter:hover {
  border-color: #91caff;
  color: #1677ff;
}

.picker-filter--active {
  border-color: #1677ff;
  background: #e6f4ff;
  color: #1677ff;
}

.picker-list-wrap {
  border: 1px solid #f0f0f0;
  border-radius: 6px;
}

.picker-empty {
  display: flex;
  justify-content: center;
  padding: 32px 0;
}

.picker-item {
  padding: 10px 14px;
  cursor: pointer;
  border-bottom: 1px solid #f5f5f5;
  transition: background 0.12s;
}

.picker-item:last-child {
  border-bottom: none;
}

.picker-item:hover {
  background: #f0f7ff;
}

.picker-item__preview {
  font-size: 13px;
  color: #333;
  line-height: 1.5;
  margin-bottom: 4px;
  word-break: break-all;
}

.picker-item__meta {
  display: flex;
  gap: 10px;
  align-items: center;
}

.picker-item__type {
  font-size: 11px;
  color: #fff;
  background: #1677ff;
  padding: 1px 6px;
  border-radius: 8px;
}

.picker-item__type--page {
  background: #13a8a8;
}

.picker-item__page {
  font-size: 11px;
  color: #999;
}
</style>

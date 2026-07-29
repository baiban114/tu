<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElButton, ElDialog, ElPagination, ElTooltip } from 'element-plus';
import type { BlockTag, KnowledgePoint } from '@/api/types';
import { getPageKnowledgeContext } from '@/api/knowledgePoint';
import { DEFAULT_PAGE_SIZE } from '@/constants/pagination';
import { clampPage, paginateSlice } from '@/utils/clientPagination';
import {
  navigateKnowledgePoint,
  type KnowledgeAnchorNavigateHandlers,
} from '@/utils/knowledgeAnchor';
import PageTagsBar from '@/components/PageTagsBar.vue';

const PREVIEW_LIMIT = 5;

const props = withDefaults(defineProps<{
  kbId?: string;
  pageId: string;
  navigate: KnowledgeAnchorNavigateHandlers;
  refreshKey?: number;
  editable?: boolean;
  tags?: BlockTag[];
  filterTags?: BlockTag[];
  activeFilter?: BlockTag | null;
}>(), {
  kbId: '',
  refreshKey: 0,
  editable: false,
  tags: () => [],
  filterTags: () => [],
  activeFilter: null,
});

const emit = defineEmits<{
  associate: [];
  'edit-tags': [];
  'remove-tag': [tag: BlockTag];
  'select-filter': [tag: BlockTag];
  'clear-filter': [];
  'open-prerequisite': [point: KnowledgePoint];
}>();

const loading = ref(false);
const expanded = ref(false);
const pagePoints = ref<KnowledgePoint[]>([]);
const prerequisites = ref<KnowledgePoint[]>([]);
const successors = ref<KnowledgePoint[]>([]);
const allPrerequisitesVisible = ref(false);
const prerequisitesPage = ref(0);

const hasKnowledgeContent = computed(() =>
  pagePoints.value.length > 0
  || prerequisites.value.length > 0
  || successors.value.length > 0,
);

const hasTags = computed(() =>
  props.tags.length > 0 || props.filterTags.length > 0,
);

const hasContent = computed(() => hasKnowledgeContent.value || hasTags.value);

const showBar = computed(() =>
  hasContent.value || loading.value || props.editable,
);

const showKnowledgeGroups = computed(() =>
  Boolean(props.kbId) && (hasKnowledgeContent.value || props.editable),
);

const visiblePrerequisites = computed(() => prerequisites.value.slice(0, PREVIEW_LIMIT));
const hasMorePrerequisites = computed(() => prerequisites.value.length > PREVIEW_LIMIT);
const prerequisitesPageData = computed(() => paginateSlice(
  prerequisites.value,
  prerequisitesPage.value,
  DEFAULT_PAGE_SIZE,
));

async function refresh() {
  if (!props.kbId || !props.pageId) {
    pagePoints.value = [];
    prerequisites.value = [];
    successors.value = [];
    return;
  }
  loading.value = true;
  try {
    const context = await getPageKnowledgeContext(props.kbId, props.pageId);
    pagePoints.value = context.pagePoints;
    prerequisites.value = context.prerequisites;
    successors.value = context.successors;
    prerequisitesPage.value = clampPage(
      prerequisitesPage.value,
      context.prerequisites.length,
      DEFAULT_PAGE_SIZE,
    );
  } finally {
    loading.value = false;
  }
}

function onNavigate(pointId: string) {
  void navigateKnowledgePoint(pointId, props.navigate);
}

function onOpenPrerequisite(point: KnowledgePoint) {
  allPrerequisitesVisible.value = false;
  emit('open-prerequisite', point);
}

function openAllPrerequisites() {
  prerequisitesPage.value = 0;
  allPrerequisitesVisible.value = true;
}

function onPrerequisitesPageChange(page: number) {
  prerequisitesPage.value = Math.max(0, page - 1);
}

function expand() {
  expanded.value = true;
}

function toggleExpanded() {
  expanded.value = !expanded.value;
}

function editPrerequisites() {
  if (!props.editable || !props.kbId) return;
  emit('associate');
}

function onPrerequisiteGroupClick() {
  editPrerequisites();
}

watch(
  () => props.pageId,
  () => {
    expanded.value = false;
  },
);

watch(
  () => [props.kbId, props.pageId, props.refreshKey] as const,
  () => { void refresh(); },
  { immediate: true },
);

defineExpose({ refresh });
</script>

<template>
  <section
    v-if="showBar"
    v-loading="loading"
    class="page-knowledge-context-bar"
    :class="{
      'page-knowledge-context-bar--collapsed': !expanded,
      'page-knowledge-context-bar--expanded': expanded,
    }"
    aria-label="文档元数据"
  >
    <ElTooltip
      v-if="!expanded"
      content="点击展开文档元数据"
      placement="top"
      effect="dark"
      :show-after="120"
      :hide-after="0"
      :offset="10"
      popper-class="page-knowledge-context-bar__tooltip"
    >
      <div
        class="page-knowledge-context-bar__collapsed"
        role="button"
        tabindex="0"
        :aria-expanded="false"
        aria-label="展开文档元数据"
        @click="expand"
        @keydown.enter.prevent="expand"
        @keydown.space.prevent="expand"
      >
        <span class="page-knowledge-context-bar__rail" aria-hidden="true" />
      </div>
    </ElTooltip>

    <template v-else>
      <div class="page-knowledge-context-bar__header">
        <button
          type="button"
          class="page-knowledge-context-bar__toggle"
          :aria-expanded="true"
          aria-label="收起文档元数据"
          @click="toggleExpanded"
        >
          <span class="page-knowledge-context-bar__title">文档元数据</span>
          <span class="page-knowledge-context-bar__collapse-hint">收起</span>
        </button>
        <ElButton
          v-if="editable && kbId"
          type="primary"
          link
          size="small"
          @click="editPrerequisites"
        >
          编辑前置
        </ElButton>
      </div>

      <div class="page-knowledge-context-bar__body">
        <div
          v-if="editable || hasTags"
          class="page-knowledge-context-bar__group page-knowledge-context-bar__group--tags"
        >
          <span class="page-knowledge-context-bar__label">标签</span>
          <PageTagsBar
            class="page-knowledge-context-bar__tags"
            :tags="tags"
            :filter-tags="filterTags"
            :active-filter="activeFilter"
            :editable="editable"
            @edit="emit('edit-tags')"
            @remove="emit('remove-tag', $event)"
            @select-filter="emit('select-filter', $event)"
            @clear-filter="emit('clear-filter')"
          />
        </div>

        <template v-if="showKnowledgeGroups">
          <div v-if="pagePoints.length" class="page-knowledge-context-bar__group">
            <span class="page-knowledge-context-bar__label">本页知识点</span>
            <button
              v-for="point in pagePoints"
              :key="point.id"
              type="button"
              class="knowledge-chip knowledge-chip--page"
              @click="onNavigate(point.id)"
            >
              {{ point.title }}
            </button>
          </div>

          <div
            v-if="prerequisites.length || editable"
            class="page-knowledge-context-bar__group"
            :class="{ 'page-knowledge-context-bar__group--editable': editable }"
            :role="editable ? 'button' : undefined"
            :tabindex="editable ? 0 : undefined"
            :aria-label="editable ? '点击编辑前置' : undefined"
            @click="onPrerequisiteGroupClick"
            @keydown.enter.prevent="onPrerequisiteGroupClick"
            @keydown.space.prevent="onPrerequisiteGroupClick"
          >
            <span class="page-knowledge-context-bar__label">前置</span>
            <template v-if="prerequisites.length">
              <button
                v-for="point in visiblePrerequisites"
                :key="point.id"
                type="button"
                class="knowledge-chip knowledge-chip--prerequisite"
                @click.stop="onOpenPrerequisite(point)"
              >
                {{ point.title }}
              </button>
              <button
                v-if="hasMorePrerequisites"
                type="button"
                class="knowledge-chip knowledge-chip--more"
                :aria-label="`查看全部前置（共 ${prerequisites.length} 个）`"
                @click.stop="openAllPrerequisites"
              >
                …
              </button>
            </template>
            <span v-else class="page-knowledge-context-bar__empty">
              {{ editable ? '点击编辑前置' : '暂无前置' }}
            </span>
          </div>

          <div v-if="successors.length" class="page-knowledge-context-bar__group">
            <span class="page-knowledge-context-bar__label">后继</span>
            <button
              v-for="point in successors"
              :key="point.id"
              type="button"
              class="knowledge-chip knowledge-chip--successor"
              @click="onNavigate(point.id)"
            >
              {{ point.title }}
            </button>
          </div>
        </template>
      </div>
    </template>

    <ElDialog
      v-model="allPrerequisitesVisible"
      title="全部前置"
      width="min(480px, calc(100vw - 48px))"
      class="tu-dialog-viewport page-knowledge-prerequisites-dialog"
      append-to-body
      destroy-on-close
    >
      <div class="prerequisites-dialog">
        <div class="prerequisites-dialog__list">
          <button
            v-for="point in prerequisitesPageData.items"
            :key="point.id"
            type="button"
            class="prerequisites-dialog__item"
            @click="onOpenPrerequisite(point)"
          >
            {{ point.title }}
          </button>
          <div
            v-if="prerequisitesPageData.items.length === 0"
            class="prerequisites-dialog__empty"
          >
            暂无前置
          </div>
        </div>
        <div class="prerequisites-dialog__pagination">
          <ElPagination
            v-if="prerequisitesPageData.total > DEFAULT_PAGE_SIZE"
            small
            layout="prev, pager, next"
            :total="prerequisitesPageData.total"
            :page-size="DEFAULT_PAGE_SIZE"
            :current-page="prerequisitesPageData.page + 1"
            @current-change="onPrerequisitesPageChange"
          />
        </div>
      </div>
    </ElDialog>
  </section>
</template>

<style scoped>
.page-knowledge-context-bar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0 0 12px;
  min-height: 0;
}

.page-knowledge-context-bar--collapsed {
  gap: 0;
}

.page-knowledge-context-bar--collapsed :deep(.el-tooltip__trigger) {
  display: block;
  width: 100%;
}

.page-knowledge-context-bar__collapsed {
  position: relative;
  display: block;
  width: 100%;
  height: 16px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  box-sizing: border-box;
}

.page-knowledge-context-bar__rail {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 2px;
  border-radius: 999px;
  background: #e8e8e8;
  transform: translateY(-50%);
  pointer-events: none;
  transition: background-color 0.15s ease, box-shadow 0.15s ease;
}

.page-knowledge-context-bar__collapsed:hover .page-knowledge-context-bar__rail,
.page-knowledge-context-bar__collapsed:focus-visible .page-knowledge-context-bar__rail {
  background: #91caff;
  box-shadow: 0 0 0 1px color-mix(in srgb, #91caff 35%, transparent);
}

.page-knowledge-context-bar__collapsed:focus-visible {
  outline: 2px solid #91caff;
  outline-offset: 2px;
}

.page-knowledge-context-bar__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.page-knowledge-context-bar__toggle {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  border: none;
  background: transparent;
  padding: 0;
  cursor: pointer;
}

.page-knowledge-context-bar__title {
  font-size: 13px;
  font-weight: 600;
  color: #595959;
  flex-shrink: 0;
}

.page-knowledge-context-bar__collapse-hint {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, #1677ff 35%, white);
  background: color-mix(in srgb, #1677ff 10%, white);
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  color: #1677ff;
}

.page-knowledge-context-bar__toggle:hover .page-knowledge-context-bar__collapse-hint,
.page-knowledge-context-bar__toggle:focus-visible .page-knowledge-context-bar__collapse-hint {
  border-color: #1677ff;
  background: color-mix(in srgb, #1677ff 16%, white);
}

.page-knowledge-context-bar__body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
}

.page-knowledge-context-bar__group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.page-knowledge-context-bar__group--tags {
  align-items: flex-start;
}

.page-knowledge-context-bar__group--editable {
  cursor: pointer;
  border-radius: 8px;
  padding: 4px 6px;
  margin: -4px -6px;
}

.page-knowledge-context-bar__group--editable:hover {
  background: color-mix(in srgb, #fa8c16 8%, white);
}

.page-knowledge-context-bar__label {
  flex-shrink: 0;
  font-size: 12px;
  color: #8c8c8c;
  min-width: 72px;
  line-height: 28px;
}

.page-knowledge-context-bar__tags {
  flex: 1;
  min-width: 0;
}

.page-knowledge-context-bar__empty {
  font-size: 12px;
  color: #bfbfbf;
}

.knowledge-chip {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  border: 1px solid transparent;
  padding: 4px 10px;
  font-size: 12px;
  line-height: 1.4;
  cursor: pointer;
  background: transparent;
}

.knowledge-chip--page {
  --chip-color: #1677ff;
  border-color: color-mix(in srgb, var(--chip-color) 30%, white);
  background: color-mix(in srgb, var(--chip-color) 12%, white);
  color: color-mix(in srgb, var(--chip-color) 85%, black);
}

.knowledge-chip--prerequisite,
.knowledge-chip--successor {
  --chip-color: #fa8c16;
  border-color: color-mix(in srgb, var(--chip-color) 30%, white);
  background: color-mix(in srgb, var(--chip-color) 12%, white);
  color: color-mix(in srgb, var(--chip-color) 85%, black);
}

.knowledge-chip--more {
  --chip-color: #8c8c8c;
  min-width: 32px;
  justify-content: center;
  border-color: color-mix(in srgb, var(--chip-color) 30%, white);
  background: color-mix(in srgb, var(--chip-color) 10%, white);
  color: #595959;
  letter-spacing: 1px;
}

.knowledge-chip:hover {
  filter: brightness(0.97);
}

.prerequisites-dialog {
  display: flex;
  flex-direction: column;
  height: min(360px, calc(100dvh - 180px));
  min-height: 0;
  box-sizing: border-box;
}

.prerequisites-dialog__list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.prerequisites-dialog__item {
  display: block;
  width: 100%;
  text-align: left;
  border: 1px solid #f0f0f0;
  border-radius: 8px;
  background: #fff;
  padding: 10px 12px;
  font-size: 13px;
  color: #1f1f1f;
  cursor: pointer;
}

.prerequisites-dialog__item:hover {
  border-color: #ffd591;
  background: #fff7e6;
}

.prerequisites-dialog__empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #8c8c8c;
  font-size: 13px;
}

.prerequisites-dialog__pagination {
  flex-shrink: 0;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  min-height: 32px;
  margin-top: 8px;
}
</style>

<style>
.page-knowledge-context-bar__tooltip.el-popper {
  font-size: 13px;
  font-weight: 500;
  padding: 8px 12px;
  max-width: 280px;
  line-height: 1.4;
}

.page-knowledge-prerequisites-dialog.tu-dialog-viewport {
  max-height: calc(100dvh - 32px);
}

.page-knowledge-prerequisites-dialog.el-dialog .el-dialog__body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
</style>

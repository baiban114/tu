<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ElEmpty } from 'element-plus';
import { useRoute, useRouter } from 'vue-router';
import DevModePanel from '@/components/DevModePanel.vue';
import LeftPanel from '@/components/LeftPanel.vue';
import CanvasPage from '@/components/CanvasPage.vue';
import TuEditorPage from '@/components/TuEditorPage.vue';
import type { PageContent } from '@/api/types';
import { useWorkspaceStore } from '@/stores/workspace';

const store = useWorkspaceStore();
const route = useRoute();
const router = useRouter();

onMounted(() => {
  void initializeWorkspace();
});

async function initializeWorkspace() {
  await store.reloadWorkspace();
  await applyRouteSelection();
}

async function applyRouteSelection() {
  const pageId = typeof route.query.pageId === 'string' ? route.query.pageId : '';
  if (!pageId) return;
  await store.selectPage(pageId);
}

const leftWidth = ref(240);
const leftCollapsed = ref(false);
const savedLeftWidth = ref(240);
const MIN_WIDTH = 160;
const MAX_WIDTH = 480;
let dragging = false;
let startX = 0;
let startWidth = 0;

const canvasPageType = computed(() => (
  store.currentPageType === 'x6board' ? 'x6board' : 'mindmap'
));

const localFileStatusText = computed(() => {
  const binding = store.currentLocalFileBinding;
  if (!binding) return '';

  switch (binding.status) {
    case 'pending':
      return '检测到改动，等待自动保存。';
    case 'saving':
      return '正在保存到本地文件。';
    case 'saved':
      return binding.lastSavedAt
        ? `已保存到本地文件 ${new Date(binding.lastSavedAt).toLocaleTimeString()}`
        : '已保存到本地文件';
    case 'error':
      return binding.error || '本地文件保存失败';
    case 'unsupported':
      return binding.error || '当前浏览器不支持自动保存回原始本地文件';
    default:
      return '已绑定本地文件';
  }
});

function onResizerMousedown(e: MouseEvent) {
  dragging = true;
  startX = e.clientX;
  startWidth = leftWidth.value;
  document.addEventListener('mousemove', onMousemove);
  document.addEventListener('mouseup', onMouseup);
}

function onMousemove(e: MouseEvent) {
  if (!dragging) return;
  const delta = e.clientX - startX;
  leftWidth.value = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + delta));
}

function onMouseup() {
  dragging = false;
  document.removeEventListener('mousemove', onMousemove);
  document.removeEventListener('mouseup', onMouseup);
}

function toggleLeftSidebar() {
  if (leftCollapsed.value) {
    leftCollapsed.value = false;
    leftWidth.value = savedLeftWidth.value;
    return;
  }
  savedLeftWidth.value = leftWidth.value;
  leftCollapsed.value = true;
}

onBeforeUnmount(() => {
  document.removeEventListener('mousemove', onMousemove);
  document.removeEventListener('mouseup', onMouseup);
});

function onContentChange(content: PageContent) {
  void store.saveCurrentPage(content);
}

function onPageTitleChange(title: string) {
  if (!store.currentPageId) return;
  void store.renameCurrentPage(store.currentPageId, title);
}

watch(
  () => route.query.pageId,
  async (nextPageId) => {
    if (typeof nextPageId !== 'string' || !nextPageId) return;
    if (store.currentPageId === nextPageId) return;
    await store.selectPage(nextPageId);
  },
);
</script>

<template>
  <div class="workspace">
    <div
      class="workspace__left-column"
      :class="{ 'workspace__left-column--collapsed': leftCollapsed }"
    >
      <div
        class="workspace__left"
        :style="{ width: leftCollapsed ? '0px' : `${leftWidth}px` }"
      >
        <LeftPanel />
      </div>

      <div class="workspace__left-edge">
        <button
          type="button"
          class="workspace__sidebar-toggle"
          :title="leftCollapsed ? '展开边栏' : '收起边栏'"
          :aria-label="leftCollapsed ? '展开边栏' : '收起边栏'"
          :aria-expanded="!leftCollapsed"
          @click="toggleLeftSidebar"
        >
          <svg
            class="workspace__sidebar-toggle-icon"
            :class="{ 'workspace__sidebar-toggle-icon--collapsed': leftCollapsed }"
            viewBox="0 0 12 12"
            aria-hidden="true"
          >
            <path d="M7.5 2 4 6l3.5 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
        <div
          v-show="!leftCollapsed"
          class="workspace__resizer"
          @mousedown.prevent="onResizerMousedown"
        />
      </div>
    </div>

    <div class="workspace__right">
      <div class="workspace-topbar">
        <RouterLink class="workspace-topbar__link" to="/tasks">任务管理</RouterLink>
        <RouterLink class="workspace-topbar__link" to="/resources">引用与资源</RouterLink>
        <RouterLink class="workspace-topbar__link" :to="{ path: '/resources', query: { tab: 'objects' } }">对象管理</RouterLink>
        <RouterLink class="workspace-topbar__link" to="/settings">系统配置</RouterLink>
        <button
          v-if="route.query.pageId"
          class="workspace-topbar__link workspace-topbar__link--button"
          type="button"
          @click="router.replace({ path: '/', query: {} })"
        >
          清除定位
        </button>
      </div>
      <div
        v-if="store.currentPageId && store.isCanvasPage && store.pageContent"
        :key="store.currentPageId"
        class="content-canvas"
      >
        <CanvasPage
          :page-type="canvasPageType"
          :content="store.pageContent"
          :page-title="store.currentPageTitle"
          @page-title-change="onPageTitleChange"
          @content-change="onContentChange"
        />
      </div>

      <div
        v-else-if="store.currentPageId && store.pageContent"
        class="content-scroll"
      >
        <div
          v-if="store.currentLocalFileBinding"
          class="local-file-status"
          :class="`local-file-status--${store.currentLocalFileBinding.status}`"
        >
          <div class="local-file-status__title">
            <span class="local-file-status__name">{{ store.currentLocalFileBinding.fileName }}</span>
            <span class="local-file-status__tag">LOCAL FILE</span>
          </div>
          <div class="local-file-status__message">{{ localFileStatusText }}</div>
        </div>

        <TuEditorPage
          :key="store.currentPageId"
          :contentList="store.pageContent"
          :page-title="store.currentPageTitle"
          :editable="true"
          @page-title-change="onPageTitleChange"
          @content-change="onContentChange"
        />
      </div>

      <div v-else class="content-placeholder">
        <el-empty description="请在左侧选择或新建一个页面" :image-size="80" />
      </div>
    </div>

    <DevModePanel />
  </div>
</template>

<style scoped>
.workspace {
  display: flex;
  height: 100vh;
  overflow: hidden;
  background: #fff;
}

.workspace__left-column {
  display: flex;
  flex-shrink: 0;
  height: 100%;
  min-width: 0;
}

.workspace__left-column--collapsed {
  min-width: 0;
}

.workspace__left {
  flex-shrink: 0;
  overflow: hidden;
  background: #f7f8fa;
  transition: width 0.2s ease;
}

.workspace__left-edge {
  position: relative;
  flex-shrink: 0;
  width: 4px;
  height: 100%;
  border-right: 1px solid #e4e4e4;
  background: #f7f8fa;
}

.workspace__left-column--collapsed .workspace__left-edge {
  width: 0;
}

.workspace__sidebar-toggle {
  position: absolute;
  top: 50%;
  left: 0;
  z-index: 21;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 12px;
  height: 48px;
  padding: 0;
  border: 1px solid #d0d7de;
  border-radius: 8px;
  background: #fff;
  color: #595959;
  cursor: pointer;
  box-shadow: 0 1px 4px rgba(15, 23, 42, 0.08);
  transform: translate(-50%, -50%);
  transition: border-color 0.15s, color 0.15s, box-shadow 0.15s;
}

.workspace__sidebar-toggle:hover {
  border-color: #1677ff;
  color: #1677ff;
  box-shadow: 0 2px 8px rgba(22, 119, 255, 0.16);
}

.workspace__sidebar-toggle-icon {
  width: 8px;
  height: 8px;
  flex-shrink: 0;
  transition: transform 0.2s ease;
}

.workspace__sidebar-toggle-icon--collapsed {
  transform: rotate(180deg);
}

.workspace__resizer {
  position: absolute;
  inset: 0;
  width: 100%;
  flex-shrink: 0;
  cursor: col-resize;
  background: transparent;
  transition: background 0.15s;
  z-index: 10;
}

.workspace__resizer:hover,
.workspace__resizer:active {
  background: #1677ff40;
}

.workspace__right {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.workspace-topbar {
  position: relative;
  z-index: 30;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex-shrink: 0;
  padding: 10px 18px;
  border-bottom: 1px solid #edf0f5;
  background: #fff;
}

.workspace-topbar__link {
  padding: 6px 10px;
  border: 1px solid #d0d7de;
  border-radius: 6px;
  color: #1f2933;
  text-decoration: none;
  font-size: 13px;
  background: #fff;
}

.workspace-topbar__link--button {
  font: inherit;
  cursor: pointer;
}

.content-canvas {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.content-scroll {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  scrollbar-gutter: stable;
  padding: 0 48px 32px;
}

.local-file-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
  margin-bottom: 20px;
  border-radius: 10px;
  border: 1px solid #d9e8ff;
  background:
    linear-gradient(135deg, rgba(9, 105, 218, 0.08), rgba(9, 105, 218, 0.02)),
    #f8fbff;
}

.local-file-status--saving,
.local-file-status--pending {
  border-color: #91caff;
  background:
    linear-gradient(135deg, rgba(22, 119, 255, 0.12), rgba(22, 119, 255, 0.03)),
    #f8fbff;
}

.local-file-status--saved {
  border-color: #b7eb8f;
  background:
    linear-gradient(135deg, rgba(82, 196, 26, 0.12), rgba(82, 196, 26, 0.02)),
    #fbfff8;
}

.local-file-status--error,
.local-file-status--unsupported {
  border-color: #ffccc7;
  background:
    linear-gradient(135deg, rgba(245, 34, 45, 0.1), rgba(245, 34, 45, 0.02)),
    #fff8f8;
}

.local-file-status__title {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.local-file-status__name {
  font-size: 14px;
  font-weight: 600;
  color: #1f1f1f;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.local-file-status__tag {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: #0958d9;
}

.local-file-status__message {
  flex-shrink: 0;
  font-size: 12px;
  color: #595959;
  text-align: right;
}

.content-placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #bbb;
  font-size: 14px;
}

@media (max-width: 960px) {
  .content-scroll {
    padding: 0 18px 24px;
  }

  .local-file-status {
    flex-direction: column;
    align-items: flex-start;
  }

  .local-file-status__message {
    text-align: left;
  }
}
</style>

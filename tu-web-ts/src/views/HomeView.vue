<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ElEmpty } from 'element-plus';
import { useRoute, useRouter } from 'vue-router';
import AppHelpButton from '@/components/AppHelpButton.vue';
import DevModePanel from '@/components/DevModePanel.vue';
import LeftPanel from '@/components/LeftPanel.vue';
import CanvasPage from '@/components/CanvasPage.vue';
import TuEditorPage from '@/components/TuEditorPage.vue';
import KnowledgePointReadingPreview from '@/components/KnowledgePointReadingPreview.vue';
import TagContentViewPanel from '@/components/workspaceViews/TagContentViewPanel.vue';
import LocalFileViewer from '@/components/LocalFileViewer.vue';
import type { PageContent, PageType } from '@/api/types';
import { useWorkspaceStore } from '@/stores/workspace';
import { useWorkspaceViewsStore } from '@/stores/workspaceViews';
import { useLocalFileStore } from '@/stores/localFile';
import {
  loadWorkspaceScrollTop,
  saveWorkspaceScrollTop,
} from '@/utils/workspaceScroll';
import type { KnowledgeAnchorNavigateHandlers } from '@/utils/knowledgeAnchor';
import { getInitialOpenFile, onOpenLocalFile } from '@/desktop/tauriBridge';

const store = useWorkspaceStore();
const viewsStore = useWorkspaceViewsStore();
const localFileStore = useLocalFileStore();
const route = useRoute();
const router = useRouter();

const kpNavigateHandlers = computed<KnowledgeAnchorNavigateHandlers>(() => ({
  router,
  selectPage: (pageId) => store.selectPage(pageId),
  currentPageId: store.currentPageId,
}));

const showLearningPlanPointPreview = computed(() => (
  viewsStore.isViewsMode
  && viewsStore.isLearningPlanView
  && Boolean(store.currentKbId && viewsStore.selectedPointId)
));

const showTagContentView = computed(() => (
  viewsStore.isViewsMode
  && viewsStore.isTagContentView
));

function closeLearningPlanPointPreview() {
  viewsStore.selectPoint(null);
}

/** Document / resource-document scroll container (`.content-scroll`). */
const contentScrollEl = ref<HTMLElement | null>(null);
let scrollSaveTimer: ReturnType<typeof setTimeout> | null = null;
let scrollRestoreToken = 0;
/** Ignore scroll events while programmatically restoring after refresh. */
let skipScrollPersistUntil = 0;
/** Non-zero target last restored — ignore ephemeral 0 writes that would wipe storage. */
let lastRestoredScrollTop = 0;
let protectRestoredScrollUntil = 0;

onMounted(() => {
  void initializeWorkspace();
});

let unsubscribeOpenLocalFile: (() => void) | null = null;

async function initializeWorkspace() {
  // 优先初始化 Tauri 本地文件桥接（不依赖后端，确保双击 md 能立即响应）
  await initLocalFileBridge();

  // 再初始化 workspace（可能因后端不可达而失败，不影响本地文件查看）
  try {
    await store.reloadWorkspace();
    await applyRouteSelection();
  } catch (error) {
    console.warn('[HomeView] Workspace initialization failed, continuing:', error);
  }

  await nextTick();
  void restoreContentScroll();
}

/** Tauri 桌面端：监听双击 .md 文件打开事件，并拾取启动时的初始文件参数。 */
async function initLocalFileBridge() {
  // 监听单实例转发的文件打开事件（应用已运行时再次双击 .md）
  unsubscribeOpenLocalFile = onOpenLocalFile((filePath) => {
    void localFileStore.openFile(filePath).then(() => {
      leftCollapsed.value = true;
    });
  });

  // 拾取启动时的初始文件参数（应用通过文件关联启动）
  try {
    const initialFile = await getInitialOpenFile();
    if (initialFile) {
      await localFileStore.openFile(initialFile);
      leftCollapsed.value = true;
    }
  } catch (error) {
    console.warn('[HomeView] Failed to pick up initial local file:', error);
  }
}

async function applyRouteSelection() {
  const pageId = typeof route.query.pageId === 'string' ? route.query.pageId : '';
  if (!pageId) return;
  await store.selectPage(pageId);
}

function onContentScroll() {
  if (Date.now() < skipScrollPersistUntil) return;
  const el = contentScrollEl.value;
  const viewKey = store.currentViewKey;
  if (!el || !viewKey) return;
  // After restore, focus-follow / layout can briefly clamp scrollTop to 0 before
  // content height settles — do not persist that wipe over the saved position.
  if (
    Date.now() < protectRestoredScrollUntil
    && lastRestoredScrollTop > 0
    && el.scrollTop < 8
  ) {
    return;
  }
  if (scrollSaveTimer) clearTimeout(scrollSaveTimer);
  scrollSaveTimer = setTimeout(() => {
    scrollSaveTimer = null;
    if (contentScrollEl.value !== el) return;
    saveWorkspaceScrollTop(viewKey, el.scrollTop);
  }, 200);
}

async function restoreContentScroll() {
  const viewKey = store.currentViewKey;
  if (!viewKey) return;
  // Excerpt deep-focus owns scroll; do not fight it.
  if (store.pendingResourceExcerptFocusId) return;
  // Canvas pages use `.content-canvas`, not `.content-scroll`.
  if (showCanvasPage.value) return;
  if (!(showDocumentPage.value || showResourceDocument.value)) return;

  const target = loadWorkspaceScrollTop(viewKey);
  if (target <= 0) {
    lastRestoredScrollTop = 0;
    return;
  }

  const token = ++scrollRestoreToken;
  skipScrollPersistUntil = Date.now() + 2500;
  protectRestoredScrollUntil = Date.now() + 4000;
  lastRestoredScrollTop = target;

  for (const delay of [0, 50, 150, 400, 800, 1600]) {
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    if (token !== scrollRestoreToken) return;
    await nextTick();
    const el = contentScrollEl.value;
    if (!el) continue;
    el.scrollTop = target;
    // Stop early once layout is tall enough to hold the target.
    if (el.scrollHeight >= target + el.clientHeight - 8) {
      // Re-apply once more after sticky TOC / embeds settle.
      await nextTick();
      if (token === scrollRestoreToken && contentScrollEl.value === el) {
        el.scrollTop = target;
      }
      break;
    }
  }
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

/** Page type for context-aware help; null when no page/resource selected. */
const helpPageType = computed<PageType | null>(() => {
  if (store.isResourceDocumentView) return 'document';
  if (!store.currentPageId) return null;
  return store.currentPageType ?? 'document';
});

const showResourceDocument = computed(() => (
  store.isResourceDocumentView && !!store.currentViewKey && !!store.pageContent
));

const showCanvasPage = computed(() => (
  !store.isResourceDocumentView && !!store.currentPageId && store.isCanvasPage && !!store.pageContent
));

const showDocumentPage = computed(() => (
  !store.isResourceDocumentView && !!store.currentPageId && !!store.pageContent
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
  if (scrollSaveTimer) {
    clearTimeout(scrollSaveTimer);
    scrollSaveTimer = null;
  }
  if (unsubscribeOpenLocalFile) {
    unsubscribeOpenLocalFile();
    unsubscribeOpenLocalFile = null;
  }
});

function onContentChange(content: PageContent) {
  void store.saveCurrentPage(content);
}

function onCanvasContentChange(pageId: string, content: PageContent) {
  void store.savePage(pageId, content);
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

watch(
  () => [store.currentViewKey, store.pageContent, showDocumentPage.value, showResourceDocument.value] as const,
  () => {
    if (!(showDocumentPage.value || showResourceDocument.value)) return;
    void nextTick(() => restoreContentScroll());
  },
);

/**
 * 用户在左侧栏主动切换知识库页面时，关闭本地文件视图并冲刷未保存内容。
 * oldId === null 表示是初始化期间的首次赋值，不视为用户主动切换。
 */
watch(
  () => store.currentPageId,
  (newId, oldId) => {
    if (!localFileStore.isActive) return;
    if (!newId || newId === oldId) return;
    if (oldId === null) return; // 初始化期间不关闭
    void localFileStore.flushSave().finally(() => {
      localFileStore.closeFile();
    });
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
        <RouterLink class="workspace-topbar__link" to="/settings">系统设置</RouterLink>
        <button
          v-if="route.query.pageId"
          class="workspace-topbar__link workspace-topbar__link--button"
          type="button"
          @click="router.replace({ path: '/', query: {} })"
        >
          清除定位
        </button>
        <AppHelpButton variant="topbar" :page-type="helpPageType" />
      </div>
      <LocalFileViewer
        v-if="localFileStore.isActive"
        class="content-scroll"
      />
      <div
        v-else-if="showTagContentView"
        class="content-tag-view"
      >
        <TagContentViewPanel />
      </div>

      <div
        v-else-if="showLearningPlanPointPreview"
        class="content-scroll content-scroll--view-preview"
      >
        <KnowledgePointReadingPreview
          :kb-id="store.currentKbId!"
          :point-id="viewsStore.selectedPointId!"
          :navigate="kpNavigateHandlers"
          @close="closeLearningPlanPointPreview"
        />
      </div>

      <div
        v-else-if="showCanvasPage"
        :key="store.currentPageId!"
        class="content-canvas"
      >
        <CanvasPage
          :page-id="store.currentPageId!"
          :page-type="canvasPageType"
          :content="store.pageContent!"
          :page-title="store.currentPageTitle"
          @page-title-change="onPageTitleChange"
          @content-change="onCanvasContentChange"
        />
      </div>

      <div
        v-else-if="showResourceDocument"
        ref="contentScrollEl"
        class="content-scroll"
        @scroll.passive="onContentScroll"
      >
        <div class="resource-document-banner">
          <span class="resource-document-banner__title">{{ store.currentPageTitle }}</span>
          <span class="resource-document-banner__tag">只读</span>
        </div>
        <TuEditorPage
          :key="store.currentViewKey!"
          :contentList="store.pageContent!"
          :page-title="store.currentPageTitle"
          :editable="false"
        />
      </div>

      <div
        v-else-if="showDocumentPage"
        ref="contentScrollEl"
        class="content-scroll"
        @scroll.passive="onContentScroll"
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
          :key="store.currentPageId!"
          :contentList="store.pageContent!"
          :page-title="store.currentPageTitle"
          :editable="true"
          @page-title-change="onPageTitleChange"
          @content-change="onContentChange"
        />
      </div>

      <div v-else class="content-placeholder">
        <el-empty
          :description="viewsStore.isViewsMode
            ? '在学习计划中选择一个知识点查看解析'
            : '请在左侧选择或新建一个页面'"
          :image-size="80"
        />
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

.content-tag-view {
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
  /* Left gutter: handle (~28) + tight fold chevron (~14); was 48 when fold was 28. */
  padding: 0 48px 32px 36px;
}

.content-scroll--view-preview {
  padding: 16px 24px 32px;
  min-height: 0;
}

.resource-document-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  margin: 16px 0 8px;
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
}

.resource-document-banner__title {
  font-size: 14px;
  font-weight: 600;
  color: #1f2933;
}

.resource-document-banner__tag {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: #64748b;
  background: #e2e8f0;
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

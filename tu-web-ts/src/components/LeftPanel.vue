<script setup lang="ts">
import { ref, nextTick, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import {
  ElScrollbar,
  ElTree,
  ElButton,
  ElInput,
  ElDialog,
  ElMessageBox,
  ElMessage,
  ElDropdown,
  ElDropdownMenu,
  ElDropdownItem,
  ElTooltip,
} from 'element-plus';
import { useViewportClampedFixedPanel } from '@/utils/viewportPanel';
import { useWorkspaceStore } from '@/stores/workspace';
import { useOutlineCacheStore } from '@/stores/outlineCache';
import type { PageItem } from '@/api/page';
import type { KnowledgeBase, PageType } from '@/api/types';
import {
  isDocumentPage,
  isOutlineTreeNode,
  isResourceDocumentTreeNode,
  isVirtualPageTreeExtra,
  mergeDocumentOutlinesIntoPageTree,
  mergeResourceDocumentsIntoPageTree,
  type PageTreeDisplayItem,
} from '@/utils/tree';
import { canDropOnNode, computeTreeDropTarget, normalizeDropType, type TreeDropType } from '@/utils/tree/drag';
import {
  loadPageTreePreferences,
  savePageTreePreferences,
} from '@/utils/pageTreePreferences';
import AuthPanel from './AuthPanel.vue';
import GlobalSearchBox from './GlobalSearchBox.vue';
import MarkdownImportButton from './MarkdownImportButton.vue';
import RoadmapImportButton from './RoadmapImportButton.vue';
import ExternalResourcePicker from './ExternalResourcePicker.vue';
import { createKbResourceLink, deleteKbResourceLink } from '@/api/kbResourceLink';
import type { ResourceItem } from '@/api/externalResource';
import { parseResourceDocumentTreeId } from '@/utils/resourceDocumentContent';

type LinkDocumentAttachTarget =
  | { kind: 'kb' }
  | { kind: 'page'; pageId: string; pageTitle: string };

const store = useWorkspaceStore();
const outlineCacheStore = useOutlineCacheStore();

const treeRef = ref<InstanceType<typeof ElTree>>()
const pageTreeFocusRef = ref<HTMLElement | null>(null)
const allTreeExpanded = ref(false)
const expandedNodeIds = ref<Set<string>>(new Set())
const expandedOutlinePageIds = ref<Set<string>>(new Set())
const outlineLoadingPageIds = ref<Set<string>>(new Set())
const pageTreePrefsReady = ref(false)

const selectedPageIds = ref<Set<string>>(new Set())
const selectionAnchorId = ref<string | null>(null)

const showAddKbDialog = ref(false);
const newKbName = ref('');
const renamingId = ref<string | null>(null);
const renameValue = ref('');
const renameInputRef = ref<InstanceType<typeof ElInput> | null>(null);

function findPageInTree(nodes: PageItem[], pageId: string): PageItem | null {
  for (const node of nodes) {
    if (node.id === pageId) return node;
    if (node.children?.length) {
      const found = findPageInTree(node.children, pageId);
      if (found) return found;
    }
  }
  return null;
}

function findPageById(pageId: string): PageItem | null {
  return findPageInTree(store.pageTree, pageId);
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}

function isPageSelected(pageId: string): boolean {
  return selectedPageIds.value.has(pageId);
}

function setSingleSelection(pageId: string) {
  selectedPageIds.value = new Set([pageId]);
  selectionAnchorId.value = pageId;
}

function togglePageSelection(pageId: string) {
  const next = new Set(selectedPageIds.value);
  if (next.has(pageId)) {
    next.delete(pageId);
  } else {
    next.add(pageId);
  }
  selectedPageIds.value = next;
}

function getVisiblePageOrder(): PageItem[] {
  const tree = treeRef.value;
  if (!tree) return [];

  const result: PageItem[] = [];
  const visit = (node: { data: PageTreeDisplayItem; expanded: boolean; childNodes: Array<{ data: PageTreeDisplayItem; expanded: boolean; childNodes: unknown[] }> }) => {
    if (!isVirtualPageTreeExtra(node.data)) {
      result.push(node.data);
    }
    if (node.expanded) {
      node.childNodes.forEach((child) => visit(child as typeof node));
    }
  };

  tree.store.root.childNodes.forEach((node) => visit(node as Parameters<typeof visit>[0]));
  return result;
}

function selectVisibleRange(fromId: string, toId: string) {
  const order = getVisiblePageOrder();
  const fromIdx = order.findIndex((page) => page.id === fromId);
  const toIdx = order.findIndex((page) => page.id === toId);
  if (fromIdx < 0 || toIdx < 0) return;

  const [start, end] = fromIdx <= toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
  const next = new Set(selectedPageIds.value);
  for (let i = start; i <= end; i += 1) {
    next.add(order[i].id);
  }
  selectedPageIds.value = next;
}

function isDescendantOf(pageId: string, ancestorId: string): boolean {
  let parentId = findPageById(pageId)?.parentId ?? null;
  while (parentId) {
    if (parentId === ancestorId) return true;
    parentId = findPageById(parentId)?.parentId ?? null;
  }
  return false;
}

function getTopLevelSelectedIds(ids: Set<string>): string[] {
  return [...ids].filter((id) => (
    ![...ids].some((other) => other !== id && isDescendantOf(id, other))
  ));
}

function getPagesToDelete(): PageItem[] {
  const ids = selectedPageIds.value.size > 0
    ? selectedPageIds.value
    : store.currentPageId
      ? new Set([store.currentPageId])
      : new Set<string>();

  return getTopLevelSelectedIds(ids)
    .filter((id) => !id.startsWith('ri:'))
    .map((id) => findPageById(id))
    .filter((page): page is PageItem => page != null);
}

function focusPageTree() {
  pageTreeFocusRef.value?.focus();
}

function buildDeleteConfirmMessage(pages: PageItem[]): string {
  if (pages.length === 1) {
    return `确认删除“${pages[0].title}”及其所有子页面？`;
  }
  return `确认删除选中的 ${pages.length} 个页面及其所有子页面？`;
}

async function confirmPageDelete(pages: PageItem[]): Promise<boolean> {
  let keyHandler: ((event: KeyboardEvent) => void) | null = null;

  const confirmPromise = ElMessageBox.confirm(
    buildDeleteConfirmMessage(pages),
    '删除确认',
    {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
      distinguishCancelAndClose: true,
    },
  );

  await nextTick();
  keyHandler = (event: KeyboardEvent) => {
    if (event.key !== 'Delete') return;
    if (isTypingTarget(event.target)) return;
    const messageBox = document.querySelector('.el-message-box');
    if (!messageBox) return;
    event.preventDefault();
    event.stopPropagation();
    const confirmBtn = messageBox.querySelector('.el-message-box__btns .el-button--primary') as HTMLButtonElement | null;
    confirmBtn?.click();
  };
  document.addEventListener('keydown', keyHandler, true);

  try {
    await confirmPromise;
    return true;
  } catch {
    return false;
  } finally {
    if (keyHandler) {
      document.removeEventListener('keydown', keyHandler, true);
    }
  }
}

async function deleteSelectedPages(pages: PageItem[]) {
  if (pages.length === 0) return;
  const confirmed = await confirmPageDelete(pages);
  if (!confirmed) return;

  for (let i = 0; i < pages.length; i += 1) {
    await store.removePage(pages[i].id, { refreshTree: i === pages.length - 1 });
  }
  selectedPageIds.value = new Set();
  selectionAnchorId.value = null;
  ElMessage.success(pages.length === 1 ? '已删除' : `已删除 ${pages.length} 个页面`);
}

function shouldHandlePageDeleteKey(event: KeyboardEvent): boolean {
  if (event.key !== 'Delete') return false;
  if (isTypingTarget(event.target)) return false;
  if (renamingId.value) return false;
  if (showAddKbDialog.value) return false;
  if (document.querySelector('.el-message-box')) return false;

  const inLeftPanel = (event.target as HTMLElement | null)?.closest('.left-panel');
  if (selectedPageIds.value.size <= 1 && !inLeftPanel) return false;

  return getPagesToDelete().length > 0;
}

function handlePageDeleteKeydown(event: KeyboardEvent) {
  if (!shouldHandlePageDeleteKey(event)) return;
  event.preventDefault();
  void deleteSelectedPages(getPagesToDelete());
}

watch(
  () => store.currentViewKey,
  (viewKey) => {
    if (selectedPageIds.value.size <= 1) {
      selectedPageIds.value = viewKey ? new Set([viewKey]) : new Set();
      if (viewKey) selectionAnchorId.value = viewKey;
    }
  },
);

watch(
  () => store.currentKbId,
  (kbId) => {
    selectedPageIds.value = new Set();
    selectionAnchorId.value = null;
    loadPrefsForKb(kbId);
  },
  { immediate: true },
);

onMounted(() => {
  document.addEventListener('keydown', handlePageDeleteKeydown, true);
});

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handlePageDeleteKeydown, true);
  document.removeEventListener('pointerdown', onPageMenuOutsidePointerDown, true);
  document.removeEventListener('keydown', closeContextMenuOnEscape);
  document.removeEventListener('pointerdown', onDocumentClickCloseKbMenu, true);
  document.removeEventListener('keydown', closeKbContextMenuOnEscape);
});

async function onSelectKb(kbId: string) {
  closeContextMenu();
  closeKbContextMenu();
  if (store.currentKbId === kbId) return;
  await store.selectKb(kbId);
}

async function onAddKb() {
  const name = newKbName.value.trim();
  if (!name) return;
  await store.addKb(name);
  newKbName.value = '';
  showAddKbDialog.value = false;
  ElMessage.success('知识库已创建');
}

async function onDeleteKb(id: string, name: string) {
  try {
    await ElMessageBox.confirm(
      `确认删除知识库“${name}”？此操作不可撤销。`,
      '删除确认',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
      },
    );
    await store.removeKb(id);
    ElMessage.success('已删除');
  } catch {
    // ignore cancel
  }
}

// 知识库右键菜单
function onKbContextMenu(event: MouseEvent, kb: KnowledgeBase) {
  event.preventDefault();
  event.stopPropagation();
  closeContextMenu();
  kbContextMenu.value = { visible: true, x: event.clientX, y: event.clientY, kb };
}

function closeKbContextMenu() {
  if (!kbContextMenu.value.visible && !kbContextMenu.value.kb) return;
  kbContextMenu.value = { visible: false, x: 0, y: 0, kb: null };
}

function closeKbContextMenuOnEscape(event: KeyboardEvent) {
  if (event.key === 'Escape') closeKbContextMenu();
}

function onStartKbRename(kb: KnowledgeBase) {
  closeKbContextMenu();
  renamingKbId.value = kb.id;
  renamingKbValue.value = kb.name;
  nextTick(() => {
    renamingKbInputRef.value?.focus();
    renamingKbInputRef.value?.select();
  });
}

async function onFinishKbRename(kb: KnowledgeBase) {
  const name = renamingKbValue.value.trim();
  if (!name) {
    ElMessage.warning('知识库名称不能为空');
    return;
  }
  if (name === kb.name) {
    renamingKbId.value = null;
    return;
  }
  try {
    await store.renameKb(kb.id, name);
    ElMessage.success('已重命名');
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '重命名失败');
  } finally {
    renamingKbId.value = null;
  }
}

function onCancelKbRename() {
  renamingKbId.value = null;
  renamingKbValue.value = '';
}

const selectedPageCount = computed(() => selectedPageIds.value.size);

const treeProps = {
  label: 'title',
  children: 'children',
};

const displayPageTree = computed(() => {
  const withOutlines = mergeDocumentOutlinesIntoPageTree(store.pageTree as PageTreeDisplayItem[], {
    isOutlineExpanded: (pageId) => expandedOutlinePageIds.value.has(pageId),
    getOutlineNodes: (pageId) => (
      outlineCacheStore.pages.has(pageId)
        ? outlineCacheStore.getPageNodes(pageId) ?? []
        : undefined
    ),
    isOutlineLoading: (pageId) => outlineLoadingPageIds.value.has(pageId),
  });
  return mergeResourceDocumentsIntoPageTree(withOutlines, store.linkedResourceDocuments);
});

function isPageOutlineExpanded(pageId: string): boolean {
  return expandedOutlinePageIds.value.has(pageId);
}

function getElTreeNode(pageId: string) {
  return treeRef.value?.store?.nodesMap?.[pageId] ?? null;
}

function outlineLevelLabel(level: number | null | undefined): string {
  if (level != null && level >= 1 && level <= 6) return `H${level}`;
  return '§';
}

async function loadPageOutline(pageId: string) {
  if (outlineLoadingPageIds.value.has(pageId)) return;
  const next = new Set(outlineLoadingPageIds.value);
  next.add(pageId);
  outlineLoadingPageIds.value = next;
  try {
    await outlineCacheStore.ensurePageOutline(pageId);
  } finally {
    const done = new Set(outlineLoadingPageIds.value);
    done.delete(pageId);
    outlineLoadingPageIds.value = done;
  }
}

function isPersistableExpandedNode(data: PageTreeDisplayItem): boolean {
  return !isOutlineTreeNode(data) && data.nodeKind !== 'outline-placeholder';
}

function persistPageTreePrefs() {
  const kbId = store.currentKbId;
  if (!pageTreePrefsReady.value || !kbId) return;
  savePageTreePreferences(kbId, {
    expandedNodeIds: [...expandedNodeIds.value],
    expandedOutlinePageIds: [...expandedOutlinePageIds.value],
  });
}

function rememberExpandedNode(nodeId: string) {
  if (!nodeId) return;
  if (expandedNodeIds.value.has(nodeId)) return;
  expandedNodeIds.value = new Set([...expandedNodeIds.value, nodeId]);
  persistPageTreePrefs();
}

function forgetExpandedNode(nodeId: string) {
  if (!nodeId || !expandedNodeIds.value.has(nodeId)) return;
  const next = new Set(expandedNodeIds.value);
  next.delete(nodeId);
  expandedNodeIds.value = next;
  persistPageTreePrefs();
}

function captureExpandedNodeIds(): string[] {
  const nodesMap = treeRef.value?.store?.nodesMap;
  if (!nodesMap) return [...expandedNodeIds.value];
  return Object.keys(nodesMap).filter((key) => {
    const node = nodesMap[key];
    if (!node?.expanded || node.isLeaf) return false;
    return isPersistableExpandedNode(node.data as PageTreeDisplayItem);
  });
}

function syncExpandedNodeIdsFromTree() {
  expandedNodeIds.value = new Set(captureExpandedNodeIds());
  persistPageTreePrefs();
}

function loadPrefsForKb(kbId: string | null) {
  pageTreePrefsReady.value = false;
  if (!kbId) {
    expandedNodeIds.value = new Set();
    expandedOutlinePageIds.value = new Set();
    allTreeExpanded.value = false;
    return;
  }
  const prefs = loadPageTreePreferences(kbId);
  expandedNodeIds.value = new Set(prefs.expandedNodeIds);
  expandedOutlinePageIds.value = new Set(prefs.expandedOutlinePageIds);
  allTreeExpanded.value = false;
  pageTreePrefsReady.value = true;
}

async function restoreExpandedNodes() {
  const nodeIds = [...expandedNodeIds.value];
  const outlineIds = [...expandedOutlinePageIds.value];
  if (!nodeIds.length && !outlineIds.length) return;

  for (const pageId of outlineIds) {
    await loadPageOutline(pageId);
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await nextTick();
    if (!treeRef.value) return;
    let restored = 0;
    for (const nodeId of nodeIds) {
      const node = treeRef.value.getNode(nodeId);
      if (node && !node.isLeaf) {
        node.expand();
        restored += 1;
      }
    }
    if (restored > 0 || attempt === 2) return;
  }
}

watch(
  displayPageTree,
  () => {
    void restoreExpandedNodes();
  },
  { flush: 'post' },
);

async function expandPageOutlineInTree(pageId: string) {
  closeContextMenu();
  const next = new Set(expandedOutlinePageIds.value);
  next.add(pageId);
  expandedOutlinePageIds.value = next;
  persistPageTreePrefs();
  await loadPageOutline(pageId);
  await nextTick();
  getElTreeNode(pageId)?.expand();
  rememberExpandedNode(pageId);
}

function collapsePageOutlineInTree(pageId: string) {
  closeContextMenu();
  const next = new Set(expandedOutlinePageIds.value);
  next.delete(pageId);
  expandedOutlinePageIds.value = next;
  persistPageTreePrefs();
  getElTreeNode(pageId)?.collapse();
  forgetExpandedNode(pageId);
}

async function onTogglePageOutlineFromContextMenu() {
  const node = contextMenu.value.node;
  if (!node || !isDocumentPage(node)) return;
  if (isPageOutlineExpanded(node.id)) {
    collapsePageOutlineInTree(node.id);
    return;
  }
  await expandPageOutlineInTree(node.id);
}

async function onPageTreeNodeExpand(data: PageTreeDisplayItem) {
  if (isPersistableExpandedNode(data)) {
    rememberExpandedNode(data.id);
  }
  if (isVirtualPageTreeExtra(data) || !isDocumentPage(data)) return;
  if (!isPageOutlineExpanded(data.id)) return;
  await loadPageOutline(data.id);
}

function onPageTreeNodeCollapse(data: PageTreeDisplayItem) {
  if (!isPersistableExpandedNode(data)) return;
  forgetExpandedNode(data.id);
}

function allowDrag(node: any) {
  return !isVirtualPageTreeExtra(node.data as PageTreeDisplayItem);
}

const contextMenu = ref({ visible: false, x: 0, y: 0, node: null as PageTreeDisplayItem | null });
const showLinkDocumentPicker = ref(false);
const linkDocumentAttachTarget = ref<LinkDocumentAttachTarget>({ kind: 'kb' });

const linkDocumentAttachTargetProp = computed(() => (
  linkDocumentAttachTarget.value.kind === 'page' ? 'page' : 'kb'
));
const linkDocumentAttachTargetName = computed(() => (
  linkDocumentAttachTarget.value.kind === 'page'
    ? linkDocumentAttachTarget.value.pageTitle
    : undefined
));

// 知识库右键菜单：单独维护，避免与页面菜单混淆
const kbContextMenu = ref({ visible: false, x: 0, y: 0, kb: null as KnowledgeBase | null });
const kbContextMenuSourcePoint = computed(() =>
  kbContextMenu.value.visible ? { x: kbContextMenu.value.x, y: kbContextMenu.value.y } : null,
);
const { panelRef: kbContextMenuRef, position: kbContextMenuPosition } = useViewportClampedFixedPanel({
  visible: computed(() => kbContextMenu.value.visible),
  getSourcePoint: () => kbContextMenuSourcePoint.value,
});

function onDocumentClickCloseKbMenu(event: Event) {
  const target = event.target;
  if (target instanceof Element && target.closest('[data-kb-context-menu]')) return;
  closeKbContextMenu();
}

// 知识库内联重命名状态（与页面重命名状态 renamingId 区分）
const renamingKbId = ref<string | null>(null);
const renamingKbValue = ref('');
const renamingKbInputRef = ref<InstanceType<typeof ElInput> | null>(null);

// 注意：watch 必须在 kbContextMenu / closeKbContextMenu 等标识符声明之后注册，
// 否则 setup 顶部立即执行 getter 时会触发 ReferenceError（temporal dead zone）。
watch(
  () => kbContextMenu.value.visible,
  (visible) => {
    if (visible) {
      void nextTick(() => {
        if (!kbContextMenu.value.visible) return;
        document.addEventListener('pointerdown', onDocumentClickCloseKbMenu, true);
        document.addEventListener('keydown', closeKbContextMenuOnEscape);
      });
    } else {
      document.removeEventListener('pointerdown', onDocumentClickCloseKbMenu, true);
      document.removeEventListener('keydown', closeKbContextMenuOnEscape);
    }
  },
);

const contextMenuSourcePoint = computed(() =>
  contextMenu.value.visible ? { x: contextMenu.value.x, y: contextMenu.value.y } : null,
);
const { panelRef: contextMenuRef, position: contextMenuPosition } = useViewportClampedFixedPanel({
  visible: computed(() => contextMenu.value.visible),
  getSourcePoint: () => contextMenuSourcePoint.value,
});

function onNodeContextMenu(event: Event, data: unknown) {
  (event as MouseEvent).preventDefault();
  const e = event as MouseEvent;
  const node = data as PageTreeDisplayItem;
  if (isOutlineTreeNode(node) || node.nodeKind === 'outline-placeholder') return;
  closeKbContextMenu();
  if (!isPageSelected(node.id) && !(e.ctrlKey || e.metaKey || e.shiftKey)) {
    setSingleSelection(node.id);
  }
  contextMenu.value = { visible: true, x: e.clientX, y: e.clientY, node };
}

function closeContextMenu() {
  if (!contextMenu.value.visible && !contextMenu.value.node) return;
  contextMenu.value = { visible: false, x: 0, y: 0, node: null };
}

function closeContextMenuOnEscape(event: KeyboardEvent) {
  if (event.key === 'Escape') closeContextMenu();
}

/** 捕获阶段关闭：el-tree 节点 @click.stop，冒泡阶段收不到 click。 */
function onPageMenuOutsidePointerDown(event: Event) {
  const target = event.target;
  if (target instanceof Element && target.closest('[data-page-tree-context-menu]')) return;
  closeContextMenu();
}

watch(
  () => contextMenu.value.visible,
  (visible) => {
    if (visible) {
      // nextTick：避开打开菜单的同一轮指针事件误关
      void nextTick(() => {
        if (!contextMenu.value.visible) return;
        document.addEventListener('pointerdown', onPageMenuOutsidePointerDown, true);
        document.addEventListener('keydown', closeContextMenuOnEscape);
      });
    } else {
      document.removeEventListener('pointerdown', onPageMenuOutsidePointerDown, true);
      document.removeEventListener('keydown', closeContextMenuOnEscape);
    }
  },
);

function onNodeClick(data: PageTreeDisplayItem, _node: unknown, _instance: unknown, event: MouseEvent) {
  closeContextMenu();
  closeKbContextMenu();

  if (isResourceDocumentTreeNode(data)) {
    const resourceItemId = data.resourceMeta?.resourceItemId;
    if (!resourceItemId) return;
    setSingleSelection(data.id);
    void store.selectKbLinkedResource(resourceItemId);
    focusPageTree();
    return;
  }

  const pageId = isVirtualPageTreeExtra(data)
    ? (data.outlineMeta?.pageId || data.parentId || undefined)
    : data.id;
  if (!pageId) return;

  const multi = event.ctrlKey || event.metaKey;
  const range = event.shiftKey;

  if (range) {
    const anchor = selectionAnchorId.value ?? store.currentViewKey ?? pageId;
    selectionAnchorId.value = anchor;
    selectVisibleRange(anchor, pageId);
    void store.selectPage(pageId);
    focusPageTree();
    return;
  }

  if (multi) {
    togglePageSelection(pageId);
    selectionAnchorId.value = pageId;
    void store.selectPage(pageId);
    focusPageTree();
    return;
  }

  setSingleSelection(pageId);
  void store.selectPage(pageId);
  focusPageTree();
}

/** 左键点页面树任意处（含选中其他页）时关掉右键菜单；右键留给 contextmenu。 */
function onPageTreeHostPointerDown(event: PointerEvent) {
  if (event.button !== 0) return;
  closeContextMenu();
  closeKbContextMenu();
}

async function onCreateChild(parentId: string, pageType: PageType = 'document') {
  closeContextMenu();
  await store.addPage(parentId, undefined, pageType);
  ElMessage.success(createSuccessMessage(pageType));
}

async function onCreateRootPage(pageType: PageType) {
  await store.addPage(null, undefined, pageType);
  ElMessage.success(createSuccessMessage(pageType));
}

function createSuccessMessage(pageType: PageType): string {
  if (pageType === 'mindmap') return '思维导图已创建';
  if (pageType === 'x6board') return '画板已创建';
  return '页面已创建';
}

function onCreateRootCommand(command: string | number | object) {
  if (command === 'link-document') {
    openLinkDocumentPickerToKb();
    return;
  }
  const pageType = command === 'mindmap'
    ? 'mindmap'
    : command === 'x6board'
      ? 'x6board'
      : 'document';
  void onCreateRootPage(pageType);
}

function openLinkDocumentPickerToKb() {
  closeContextMenu();
  if (!store.currentKbId) {
    ElMessage.warning('请先选择知识库');
    return;
  }
  linkDocumentAttachTarget.value = { kind: 'kb' };
  showLinkDocumentPicker.value = true;
}

function openLinkDocumentPickerToPage(page: PageTreeDisplayItem) {
  closeContextMenu();
  if (!store.currentKbId) {
    ElMessage.warning('请先选择知识库');
    return;
  }
  if (!isDocumentPage(page)) {
    ElMessage.warning('仅文档页支持挂接资源到正文');
    return;
  }
  linkDocumentAttachTarget.value = {
    kind: 'page',
    pageId: page.id,
    pageTitle: page.title || '未命名页面',
  };
  showLinkDocumentPicker.value = true;
}

async function onLinkDocumentResource(item: ResourceItem) {
  const kbId = store.currentKbId;
  if (!kbId) {
    ElMessage.warning('请先选择知识库');
    return;
  }
  const target = linkDocumentAttachTarget.value;
  try {
    await createKbResourceLink(kbId, {
      resourceItemId: item.id,
      parentPageId: target.kind === 'page' ? target.pageId : null,
    });
    await store.refreshLinkedResourceDocuments();
    if (target.kind === 'page') {
      ElMessage.success(`已将「${item.title}」挂接到「${target.pageTitle}」下`);
    } else {
      ElMessage.success(`已将「${item.title}」加入当前知识库`);
    }
    await store.selectKbLinkedResource(item.id);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '挂接文档资源失败');
  }
}

async function onUnlinkDocumentResource(node: PageTreeDisplayItem) {
  closeContextMenu();
  const kbId = store.currentKbId;
  const resourceItemId = node.resourceMeta?.resourceItemId
    ?? parseResourceDocumentTreeId(node.id);
  if (!kbId || !resourceItemId) return;
  try {
    await deleteKbResourceLink(kbId, resourceItemId);
    await store.refreshLinkedResourceDocuments();
    ElMessage.success(`已将「${node.title}」从当前知识库移除`);
    if (store.currentResourceItemId === resourceItemId) {
      const firstPage = store.pageTree[0];
      if (firstPage) await store.selectPage(firstPage.id);
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '移出文档资源失败');
  }
}

async function onDeletePage(node: PageItem) {
  closeContextMenu();
  if (selectedPageIds.value.size > 1 && isPageSelected(node.id)) {
    await deleteSelectedPages(getPagesToDelete());
    return;
  }
  await deleteSelectedPages([node]);
}

async function onDeleteSelectedPages() {
  closeContextMenu();
  await deleteSelectedPages(getPagesToDelete());
}

function onStartRename(node: PageItem) {
  closeContextMenu();
  renamingId.value = node.id;
  renameValue.value = node.title;
  nextTick(() => {
    renameInputRef.value?.focus();
  });
}

async function onFinishRename(node: PageItem) {
  const title = renameValue.value.trim();
  if (title && title !== node.title) {
    await store.renameCurrentPage(node.id, title);
    ElMessage.success('已重命名');
  }
  renamingId.value = null;
}

function flattenPages(nodes: PageItem[]): PageItem[] {
  const result: PageItem[] = [];
  const walk = (list: PageItem[]) => {
    for (const node of list) {
      result.push(node);
      if (node.children?.length) walk(node.children);
    }
  };
  walk(nodes);
  return result;
}

function allowDrop(draggingNode: any, dropNode: any, dropType: TreeDropType) {
  if (isVirtualPageTreeExtra(draggingNode.data) || isVirtualPageTreeExtra(dropNode.data)) return false;
  const flat = flattenPages(store.pageTree).map((page) => ({
    id: page.id,
    parentId: page.parentId,
    sortOrder: page.order,
  }));
  return canDropOnNode(draggingNode.data.id, dropNode.data.id, dropType, flat);
}

async function onNodeDrop(draggingNode: any, dropNode: any, dropType: TreeDropType) {
  if (isVirtualPageTreeExtra(draggingNode.data) || isVirtualPageTreeExtra(dropNode.data)) return;
  const dragging = draggingNode.data as PageItem;
  const drop = dropNode.data as PageItem;
  const flat = flattenPages(store.pageTree).map((page) => ({
    id: page.id,
    parentId: page.parentId,
    sortOrder: page.order,
  }));
  const target = computeTreeDropTarget(
    { id: dragging.id, parentId: dragging.parentId, sortOrder: dragging.order },
    { id: drop.id, parentId: drop.parentId, sortOrder: drop.order },
    normalizeDropType(dropType),
    flat,
  );
  await store.reorderPage(dragging.id, target.parentId, target.sortOrder);
}

function expandAllTree() {
  const nodesMap = treeRef.value?.store?.nodesMap
  if (!nodesMap) return
  for (const key of Object.keys(nodesMap)) {
    const node = nodesMap[key]
    if (!node.isLeaf) {
      node.expanded = true
    }
  }
  allTreeExpanded.value = true
  syncExpandedNodeIdsFromTree()
}

function collapseAllTree() {
  const nodesMap = treeRef.value?.store?.nodesMap
  if (!nodesMap) return
  for (const key of Object.keys(nodesMap)) {
    const node = nodesMap[key]
    if (!node.isLeaf) {
      node.expanded = false
    }
  }
  allTreeExpanded.value = false
  expandedNodeIds.value = new Set()
  persistPageTreePrefs()
}
</script>

<template>
  <div class="left-panel">
    <AuthPanel />

    <div class="search-section">
      <GlobalSearchBox />
    </div>

    <div class="section">
      <div class="section-header">
        <span class="section-title">知识库</span>
        <div class="section-actions">
          <RoadmapImportButton />
          <el-button
            link
            size="small"
            title="新建知识库"
            @click.stop="showAddKbDialog = true"
          >
            +
          </el-button>
        </div>
      </div>

      <el-scrollbar class="kb-list">
        <div
          v-for="kb in store.kbList"
          :key="kb.id"
          class="kb-item"
          :class="{ 'kb-item--active': store.currentKbId === kb.id }"
          @click.stop="onSelectKb(kb.id)"
          @contextmenu="onKbContextMenu($event, kb)"
        >
          <span class="kb-icon">{{ kb.icon ?? '📚' }}</span>
          <template v-if="renamingKbId === kb.id">
            <el-input
              ref="renamingKbInputRef"
              v-model="renamingKbValue"
              size="small"
              class="rename-input kb-rename-input"
              @keyup.enter="onFinishKbRename(kb)"
              @keyup.escape="onCancelKbRename"
              @blur="onFinishKbRename(kb)"
              @click.stop
            />
          </template>
          <template v-else>
            <span class="kb-name">{{ kb.name }}</span>
            <el-button
              class="kb-delete"
              link
              size="small"
              title="删除知识库"
              @click.stop="onDeleteKb(kb.id, kb.name)"
            >
              ×
            </el-button>
          </template>
        </div>

        <div v-if="store.kbList.length === 0" class="empty-hint">
          暂无知识库
        </div>
      </el-scrollbar>
    </div>

    <div class="divider" />

    <div class="section section--grow">
      <div class="section-header">
        <span class="section-title">页面</span>
        <div class="section-actions">
          <button
            v-if="store.pageTree.length > 0"
            type="button"
            class="tree-action-btn"
            :title="allTreeExpanded ? '全部收起' : '全部展开'"
            @click.stop="allTreeExpanded ? collapseAllTree() : expandAllTree()"
          >
            {{ allTreeExpanded ? '收起' : '展开' }}
          </button>
          <MarkdownImportButton />
          <el-dropdown
            trigger="click"
            :disabled="!store.currentKbId"
            @command="onCreateRootCommand"
          >
            <el-button
              link
              size="small"
              title="新建页面"
              :disabled="!store.currentKbId"
              @click.stop
            >
              +
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="document">文档</el-dropdown-item>
                <el-dropdown-item command="mindmap">思维导图</el-dropdown-item>
                <el-dropdown-item command="x6board">画板</el-dropdown-item>
                <el-dropdown-item divided command="link-document">挂接到知识库</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>

      <div
        ref="pageTreeFocusRef"
        class="page-tree-scroll-host"
        tabindex="-1"
        @pointerdown="onPageTreeHostPointerDown"
      >
      <el-scrollbar class="page-tree-scroll">
        <el-tree
          ref="treeRef"
          v-if="displayPageTree.length > 0"
          :data="displayPageTree"
          :props="treeProps"
          node-key="id"
          draggable
          :allow-drag="allowDrag"
          :allow-drop="allowDrop"
          :highlight-current="true"
          :current-node-key="store.currentViewKey ?? undefined"
          @node-click="onNodeClick"
          @node-expand="onPageTreeNodeExpand"
          @node-collapse="onPageTreeNodeCollapse"
          @node-contextmenu="onNodeContextMenu"
          @node-drop="onNodeDrop"
          class="page-tree"
        >
          <template #default="{ node, data }">
            <span
              class="tree-node"
              :class="{
                'tree-node--selected': (
                  isResourceDocumentTreeNode(data) || !isVirtualPageTreeExtra(data)
                ) && isPageSelected(data.id),
                'tree-node--outline': isOutlineTreeNode(data),
                'tree-node--outline-placeholder': data.nodeKind === 'outline-placeholder',
                'tree-node--resource-document': isResourceDocumentTreeNode(data),
              }"
            >
              <span
                class="node-icon"
                aria-hidden="true"
              >
                <span
                  v-if="isOutlineTreeNode(data)"
                  class="node-icon__outline"
                  :title="outlineLevelLabel(data.outlineMeta?.level)"
                >{{ outlineLevelLabel(data.outlineMeta?.level) }}</span>
                <svg
                  v-else-if="isResourceDocumentTreeNode(data)"
                  class="node-icon__resource"
                  viewBox="0 0 12 12"
                  fill="none"
                >
                  <path
                    d="M3 1.5h4.5L10.5 4.5V10.5H3V1.5Z"
                    stroke="currentColor"
                    stroke-width="1.2"
                    stroke-linejoin="round"
                  />
                  <path d="M7.5 1.5V4.5H10.5" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" />
                  <path d="M5 7h2.5M5 9h2.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
                </svg>
                <svg
                  v-else-if="data.pageType === 'mindmap'"
                  class="node-icon__mindmap"
                  viewBox="0 0 12 12"
                  fill="none"
                >
                  <path
                    d="M6 1.5v3.5M6 5H2.5M6 5h3.5M2.5 5v4.5M9.5 5v4.5"
                    stroke="currentColor"
                    stroke-width="1.2"
                    stroke-linecap="round"
                  />
                </svg>
                <svg
                  v-else-if="data.pageType === 'x6board'"
                  class="node-icon__x6board"
                  viewBox="0 0 12 12"
                  fill="none"
                >
                  <rect x="1.5" y="1.5" width="9" height="9" rx="1.5" stroke="currentColor" stroke-width="1.2" />
                  <path d="M4 8V4h4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
                </svg>
                <span v-else class="node-icon__doc">📄</span>
              </span>
              <el-input
                v-if="!isVirtualPageTreeExtra(data) && renamingId === data.id"
                ref="renameInputRef"
                v-model="renameValue"
                size="small"
                class="rename-input"
                @blur="onFinishRename(data)"
                @keyup.enter="onFinishRename(data)"
                @keyup.esc="renamingId = null"
                @click.stop
              />
              <ElTooltip
                v-else
                :content="node.label"
                placement="right"
                :show-after="400"
              >
                <span class="node-label">{{ node.label }}</span>
              </ElTooltip>
              <span
                v-if="!isVirtualPageTreeExtra(data) && isDocumentPage(data) && isPageOutlineExpanded(data.id) && outlineLoadingPageIds.has(data.id)"
                class="node-outline-loading"
              >…</span>
            </span>
          </template>
        </el-tree>

        <div v-else-if="store.currentKbId" class="empty-hint">
          暂无页面，点击上方按钮新建或导入 Markdown
        </div>
        <div v-else class="empty-hint">
          请先选择知识库
        </div>
      </el-scrollbar>
      </div>
    </div>

    <Teleport to="body">
      <div
        v-if="contextMenu.visible && contextMenu.node"
        ref="contextMenuRef"
        data-page-tree-context-menu
        class="context-menu"
        :style="{ left: `${contextMenuPosition.left}px`, top: `${contextMenuPosition.top}px` }"
        @pointerdown.stop
        @mousedown.stop
        @click.stop
      >
        <template v-if="isResourceDocumentTreeNode(contextMenu.node)">
          <div
            class="context-menu-item context-menu-item--danger"
            @click="onUnlinkDocumentResource(contextMenu.node!)"
          >
            移出当前知识库
          </div>
        </template>
        <template v-else>
          <div class="context-menu-item" @click="onCreateChild(contextMenu.node!.id, 'document')">
            文档
          </div>
          <div class="context-menu-item" @click="onCreateChild(contextMenu.node!.id, 'mindmap')">
            思维导图
          </div>
          <div class="context-menu-item" @click="onCreateChild(contextMenu.node!.id, 'x6board')">
            画板
          </div>
          <div
            v-if="isDocumentPage(contextMenu.node)"
            class="context-menu-item"
            @click="openLinkDocumentPickerToPage(contextMenu.node!)"
          >
            挂接文档资源
          </div>
          <div class="context-menu-item" @click="onStartRename(contextMenu.node!)">
            重命名
          </div>
          <template v-if="contextMenu.node && isDocumentPage(contextMenu.node)">
            <div class="context-menu-divider" />
            <div class="context-menu-item" @click="onTogglePageOutlineFromContextMenu">
              {{ isPageOutlineExpanded(contextMenu.node.id) ? '收起目录' : '展开目录' }}
            </div>
          </template>
          <div class="context-menu-divider" />
          <div
            class="context-menu-item context-menu-item--danger"
            @click="selectedPageCount > 1 && contextMenu.node && isPageSelected(contextMenu.node.id) ? onDeleteSelectedPages() : onDeletePage(contextMenu.node!)"
          >
            {{ selectedPageCount > 1 && contextMenu.node && isPageSelected(contextMenu.node.id) ? `删除 ${selectedPageCount} 个页面` : '删除' }}
          </div>
        </template>
      </div>
    </Teleport>

    <Teleport to="body">
      <div
        v-if="kbContextMenu.visible && kbContextMenu.kb"
        ref="kbContextMenuRef"
        data-kb-context-menu
        class="context-menu"
        :style="{ left: `${kbContextMenuPosition.left}px`, top: `${kbContextMenuPosition.top}px` }"
        @pointerdown.stop
        @mousedown.stop
        @click.stop
      >
        <div class="context-menu-item" @click="kbContextMenu.kb && onStartKbRename(kbContextMenu.kb)">
          重命名
        </div>
        <div class="context-menu-divider" />
        <div
          class="context-menu-item context-menu-item--danger"
          @click="kbContextMenu.kb && onDeleteKb(kbContextMenu.kb.id, kbContextMenu.kb.name)"
        >
          删除
        </div>
      </div>
    </Teleport>

    <el-dialog v-model="showAddKbDialog" title="新建知识库" width="360px" @click.stop>
      <el-input
        v-model="newKbName"
        placeholder="请输入知识库名称"
        @keyup.enter="onAddKb"
        autofocus
      />
      <template #footer>
        <el-button @click="showAddKbDialog = false">取消</el-button>
        <el-button type="primary" :disabled="!newKbName.trim()" @click="onAddKb">
          创建
        </el-button>
      </template>
    </el-dialog>

    <ExternalResourcePicker
      :visible="showLinkDocumentPicker"
      mode="linkDocument"
      :attach-target="linkDocumentAttachTargetProp"
      :attach-target-name="linkDocumentAttachTargetName"
      @update:visible="showLinkDocumentPicker = $event"
      @link-item="onLinkDocumentResource"
    />
  </div>
</template>

<style scoped>
.left-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #f7f8fa;
  overflow: hidden;
  user-select: none;
}

.search-section {
  padding: 8px 12px;
  flex-shrink: 0;
}

.section {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.section--grow {
  flex: 1;
  overflow: hidden;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px 6px;
  flex-shrink: 0;
}

.section-title {
  font-size: 11px;
  font-weight: 600;
  color: #8c8c8c;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.section-actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.tree-action-btn {
  border: 0;
  background: transparent;
  color: #1677ff;
  font-size: 11px;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  transition: background 0.15s;
}

.tree-action-btn:hover {
  background: rgba(22, 119, 255, 0.08);
}

.kb-list {
  max-height: 180px;
  padding: 0 8px 8px;
}

.kb-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
}

.kb-item:hover {
  background: #ebebeb;
}

.kb-item--active {
  background: #e6f4ff;
  color: #1677ff;
}

.kb-icon {
  font-size: 16px;
  flex-shrink: 0;
}

.kb-name {
  flex: 1;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.kb-delete {
  opacity: 0;
  transition: opacity 0.15s;
  color: #999;
  font-size: 16px !important;
  padding: 0 !important;
}

.kb-item:hover .kb-delete {
  opacity: 1;
}

.divider {
  height: 1px;
  background: #e4e4e4;
  margin: 4px 0;
  flex-shrink: 0;
}

.page-tree-scroll-host {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  outline: none;
}

.page-tree-scroll-host:focus-visible {
  box-shadow: inset 0 0 0 2px rgba(22, 119, 255, 0.25);
  border-radius: 6px;
}

.page-tree-scroll {
  flex: 1;
  min-height: 0;
  height: 0;
  padding: 0 4px 8px;
}

.page-tree-scroll :deep(.el-scrollbar) {
  height: 100%;
}

.page-tree {
  background: transparent;
}

.tree-node--outline .node-label {
  color: #64748b;
  font-size: 12px;
}

.tree-node--outline-placeholder .node-label {
  color: #94a3b8;
  font-size: 11px;
  font-style: italic;
}

.node-icon__outline {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  font-size: 10px;
  font-weight: 600;
  color: #94a3b8;
}

.node-icon__resource {
  display: block;
  width: 14px;
  height: 14px;
  color: #64748b;
}

.tree-node--resource-document .node-label {
  color: #475569;
}

.node-outline-loading {
  flex: 0 0 auto;
  margin-left: 4px;
  color: #94a3b8;
  font-size: 12px;
}

.page-tree :deep(.el-tree-node__content) {
  height: 32px;
  border-radius: 6px;
  padding-right: 4px;
  overflow: hidden;
  min-width: 0;
}

.page-tree :deep(.el-tree-node__content:hover) {
  background: #ebebeb;
}

.page-tree :deep(.el-tree-node.is-current > .el-tree-node__content) {
  background: #e6f4ff;
  color: #1677ff;
}

.page-tree :deep(.el-tree-node__content:has(.tree-node--selected)) {
  background: #d6eaff;
}

.page-tree :deep(.el-tree-node.is-current > .el-tree-node__content:has(.tree-node--selected)) {
  background: #bae0ff;
  color: #1677ff;
}

.tree-node {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  gap: 4px;
}

.tree-node :deep(.el-tooltip__trigger) {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.node-icon {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  line-height: 1;
}

.node-icon__doc {
  font-size: 12px;
}

.node-icon__mindmap,
.node-icon__x6board {
  width: 12px;
  height: 12px;
  color: #6b7280;
}

.node-label {
  display: block;
  flex: 1;
  min-width: 0;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rename-input {
  flex: 1;
  font-size: 13px;
}

.kb-rename-input {
  /* 内联重命名时让输入框紧贴图标右侧、占据剩余空间 */
  margin-left: 4px;
}

.context-menu {
  position: fixed;
  z-index: 9999;
  background: #fff;
  border: 1px solid #e4e4e4;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  padding: 4px 0;
  min-width: 140px;
  /* 空白区域穿透，避免挡住下方页面节点导致无法点选/关菜单 */
  pointer-events: none;
}

.context-menu-item {
  padding: 7px 14px;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.12s;
  pointer-events: auto;
}

.context-menu-item:hover {
  background: #f5f5f5;
}

.context-menu-item--danger {
  color: #ff4d4f;
}

.context-menu-divider {
  height: 1px;
  background: #f0f0f0;
  margin: 4px 0;
  pointer-events: none;
}

.empty-hint {
  padding: 16px 12px;
  font-size: 12px;
  color: #bbb;
  text-align: center;
}
</style>

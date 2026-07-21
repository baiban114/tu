import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import {
  listKnowledgeBases,
  createKnowledgeBase,
  deleteKnowledgeBase,
  renameKnowledgeBase,
  importRoadmap,
  type KnowledgeBase,
} from '@/api/knowledge';
import {
  getPageTree,
  getPageContent,
  savePageContent,
  createPage,
  deletePage,
  movePage,
  renamePage,
} from '@/api/page';
import { getResourceItem, listResourceExcerpts, type ResourceExcerpt } from '@/api/externalResource';
import { listKbResourceLinks, type KbResourceLink } from '@/api/kbResourceLink';
import type { Block, GraphData, PageContent, PageItem, PageType } from '@/api/types';
import { MAX_PAGE_SIZE } from '@/constants/pagination';
import {
  createInitialPageContent,
  createPageContentFromEmbed,
  defaultTitleForPageType,
  inferPageTypeFromContent,
  inferPageTypeFromEmbed,
  normalizePageType,
  removeEmbedFromPageContent,
} from '@/utils/boardPageContent';
import {
  synthesizeResourceDocumentContent,
  resourceDocumentTreeId,
  parseResourceDocumentTreeId,
  isResourceDocumentTreeId,
} from '@/utils/resourceDocumentContent';
import type { ImportRoadmapPayload } from '@/api/types';
import { useBlockRegistryStore } from '@/stores/blockRegistry';
import { blockSyncManager } from '@/utils/blockSyncManager';
import { flushPageIndex } from '@/api/pageIndex';
import {
  deriveMarkdownPageTitle,
  parseMarkdownToPageContent,
  serializePageContentToMarkdown,
} from '@/utils/markdownImport';
import { parseGraphToSourcePatch } from '@/utils/graphSources';

type WorkspaceViewMode = 'page' | 'resource-document';

type LocalFileSaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error' | 'unsupported';

interface LocalFileBinding {
  fileName: string;
  fileHandle: FileSystemFileHandle | null;
  directSaveSupported: boolean;
  status: LocalFileSaveStatus;
  error: string | null;
  lastSavedAt: number | null;
  lastSavedContent: string;
  pendingContent: string | null;
  saveTimer: number | null;
  isWriting: boolean;
}

interface ImportMarkdownFileOptions {
  fileHandle?: FileSystemFileHandle | null;
  directSaveSupported?: boolean;
}

const LOCAL_FILE_SAVE_DELAY = 800;
const UNSUPPORTED_SAVE_MESSAGE = 'Current browser can import the file, but it cannot auto-save changes back to the original local file.';
const UNTITLED_PAGE_TITLE = '未命名页面';
const WORKSPACE_SELECTION_STORAGE_KEY = 'tu:workspace-selection';

interface WorkspaceSelection {
  kbId: string;
  pageId: string;
}

function readPersistedSelection(): WorkspaceSelection | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(WORKSPACE_SELECTION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WorkspaceSelection>;
    if (typeof parsed.kbId === 'string' && typeof parsed.pageId === 'string') {
      return { kbId: parsed.kbId, pageId: parsed.pageId };
    }
  } catch {
    // ignore corrupt storage
  }
  return null;
}

function persistSelection(kbId: string | null, pageId: string | null) {
  if (typeof window === 'undefined') return;
  if (!kbId || !pageId) {
    window.localStorage.removeItem(WORKSPACE_SELECTION_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(
    WORKSPACE_SELECTION_STORAGE_KEY,
    JSON.stringify({ kbId, pageId } satisfies WorkspaceSelection),
  );
}

export const useWorkspaceStore = defineStore('workspace', () => {
  const kbList = ref<KnowledgeBase[]>([]);
  const currentKbId = ref<string | null>(null);
  const pageTree = ref<PageItem[]>([]);
  const linkedResourceDocuments = ref<KbResourceLink[]>([]);
  const currentPageId = ref<string | null>(null);
  const currentResourceItemId = ref<string | null>(null);
  const viewMode = ref<WorkspaceViewMode>('page');
  const pageContent = ref<PageContent | null>(null);
  const currentPageTitleOverride = ref<string | null>(null);
  const loading = ref(false);
  const localFileBindings = ref<Record<string, LocalFileBinding>>({});
  const registryStore = useBlockRegistryStore();

  const isResourceDocumentView = computed(() => viewMode.value === 'resource-document');

  const currentLocalFileBinding = computed(() => {
    if (isResourceDocumentView.value) return null;
    const pageId = currentPageId.value;
    if (!pageId) return null;
    return localFileBindings.value[pageId] ?? null;
  });

  const currentPageTitle = computed(() => {
    if (isResourceDocumentView.value) {
      return (currentPageTitleOverride.value ?? '').trim() || '未命名文档资源';
    }
    const pageId = currentPageId.value;
    if (!pageId) return '';
    return (currentPageTitleOverride.value ?? findPageTitle(pageId)).trim() || UNTITLED_PAGE_TITLE;
  });

  const currentViewKey = computed(() => {
    if (isResourceDocumentView.value && currentResourceItemId.value) {
      return resourceDocumentTreeId(currentResourceItemId.value);
    }
    return currentPageId.value;
  });

  function clearBindingTimer(binding: LocalFileBinding | undefined) {
    if (!binding?.saveTimer) return;
    window.clearTimeout(binding.saveTimer);
    binding.saveTimer = null;
  }

  function clearLocalFileBinding(pageId: string) {
    const binding = localFileBindings.value[pageId];
    clearBindingTimer(binding);
    if (!binding) return;

    const nextBindings = { ...localFileBindings.value };
    delete nextBindings[pageId];
    localFileBindings.value = nextBindings;
  }

  function resetWorkspaceState() {
    currentKbId.value = null;
    currentPageId.value = null;
    currentResourceItemId.value = null;
    viewMode.value = 'page';
    currentPageTitleOverride.value = null;
    pageTree.value = [];
    linkedResourceDocuments.value = [];
    pageContent.value = null;
    blockSyncManager.setPageId(null);
    registryStore.clear();
  }

  async function loadLinkedResourceDocuments(kbId: string) {
    try {
      linkedResourceDocuments.value = await listKbResourceLinks(kbId);
    } catch (error) {
      console.warn('Failed to load KB resource links', error);
      linkedResourceDocuments.value = [];
    }
  }

  async function fetchAllResourceExcerpts(resourceItemId: string): Promise<ResourceExcerpt[]> {
    const all: ResourceExcerpt[] = [];
    let page = 0;
    for (;;) {
      const result = await listResourceExcerpts(resourceItemId, { page, pageSize: MAX_PAGE_SIZE });
      all.push(...result.items);
      if (all.length >= result.total || result.items.length === 0) break;
      page += 1;
      if (page > 100) break;
    }
    return all;
  }

  async function loadKbList() {
    kbList.value = await listKnowledgeBases();
    if (kbList.value.length === 0) {
      resetWorkspaceState();
      persistSelection(null, null);
      return;
    }

    const persisted = readPersistedSelection();
    const nextKbId = currentKbId.value && kbList.value.some((kb) => kb.id === currentKbId.value)
      ? currentKbId.value
      : persisted?.kbId && kbList.value.some((kb) => kb.id === persisted.kbId)
        ? persisted.kbId
        : kbList.value[0].id;

    if (nextKbId) {
      const preferredPageId = persisted?.kbId === nextKbId ? persisted.pageId : null;
      await selectKb(nextKbId, { preferredPageId });
    }
  }

  function findFirstPage(nodes: PageItem[]): PageItem | undefined {
    if (!nodes || nodes.length === 0) return undefined;
    return nodes[0];
  }

  async function flushCurrentPageIndexBestEffort() {
    if (viewMode.value === 'resource-document') return;
    const pageId = currentPageId.value;
    if (!pageId || isResourceDocumentTreeId(pageId)) return;
    try {
      await flushPageIndex(pageId);
    } catch (error) {
      console.warn('Failed to flush page index', error);
    }
  }

  async function selectKb(kbId: string, options?: { preferredPageId?: string | null }) {
    await flushCurrentPageIndexBestEffort();
    currentKbId.value = kbId;
    currentPageId.value = null;
    currentResourceItemId.value = null;
    viewMode.value = 'page';
    currentPageTitleOverride.value = null;
    blockSyncManager.setPageId(null);
    pageContent.value = null;
    registryStore.clear();
    const [tree] = await Promise.all([
      getPageTree(kbId),
      loadLinkedResourceDocuments(kbId),
    ]);
    pageTree.value = tree;

    const preferredPageId = options?.preferredPageId;
    if (preferredPageId && parseResourceDocumentTreeId(preferredPageId)) {
      const resourceItemId = parseResourceDocumentTreeId(preferredPageId)!;
      if (linkedResourceDocuments.value.some((link) => link.resourceItemId === resourceItemId)) {
        await selectKbLinkedResource(resourceItemId);
        return;
      }
    }
    const restoredPageId = preferredPageId && findPageInTree(pageTree.value, preferredPageId)
      ? preferredPageId
      : null;
    const pageToSelect = restoredPageId ?? findFirstPage(pageTree.value)?.id;
    if (pageToSelect) {
      await selectPage(pageToSelect);
    }
  }

  async function selectPage(pageId: string) {
    if (isResourceDocumentTreeId(pageId)) {
      const resourceItemId = parseResourceDocumentTreeId(pageId);
      if (resourceItemId) await selectKbLinkedResource(resourceItemId);
      return;
    }
    if (currentPageId.value && currentPageId.value !== pageId) {
      await flushCurrentPageIndexBestEffort();
    }
    viewMode.value = 'page';
    currentResourceItemId.value = null;
    currentPageId.value = pageId;
    currentPageTitleOverride.value = null;
    blockSyncManager.setPageId(pageId);
    loading.value = true;
    try {
      const data = await getPageContent(pageId);
      pageContent.value = data;
      currentPageTitleOverride.value = resolvePageTitle(pageId, data);
      registryStore.registerPageContent(data, pageId, currentPageTitle.value);
      if (currentKbId.value) {
        persistSelection(currentKbId.value, pageId);
      }
    } finally {
      loading.value = false;
    }
  }

  async function selectKbLinkedResource(resourceItemId: string) {
    await flushCurrentPageIndexBestEffort();
    viewMode.value = 'resource-document';
    currentResourceItemId.value = resourceItemId;
    currentPageId.value = null;
    blockSyncManager.setPageId(null);
    loading.value = true;
    try {
      const [item, excerpts] = await Promise.all([
        getResourceItem(resourceItemId),
        fetchAllResourceExcerpts(resourceItemId),
      ]);
      const content = synthesizeResourceDocumentContent(item, excerpts);
      pageContent.value = content;
      currentPageTitleOverride.value = item.title;
      registryStore.clear();
      if (currentKbId.value) {
        persistSelection(currentKbId.value, resourceDocumentTreeId(resourceItemId));
      }
    } finally {
      loading.value = false;
    }
  }

  async function refreshLinkedResourceDocuments() {
    if (!currentKbId.value) return;
    await loadLinkedResourceDocuments(currentKbId.value);
  }

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

  function findPageTitle(pageId: string): string {
    return findPageInTree(pageTree.value, pageId)?.title ?? UNTITLED_PAGE_TITLE;
  }

  const currentPageItem = computed(() => {
    const pageId = currentPageId.value;
    if (!pageId) return null;
    return findPageInTree(pageTree.value, pageId);
  });

  const currentPageType = computed<PageType>(() => {
    const fromTree = currentPageItem.value?.pageType;
    if (fromTree === 'mindmap' || fromTree === 'x6board') return fromTree;
    const inferred = inferPageTypeFromContent(pageContent.value);
    if (inferred) return inferred;
    return normalizePageType(fromTree);
  });

  const isMindmapPage = computed(() => currentPageType.value === 'mindmap');

  const isX6BoardPage = computed(() => currentPageType.value === 'x6board');

  const isCanvasPage = computed(() => isMindmapPage.value || isX6BoardPage.value);

  function syncPrimaryEmbedTitle(content: PageContent, title: string): PageContent {
    const primaryId = content.metadata?.primaryEmbedId;
    const embedIndex = content.embeds.findIndex((embed) => (
      typeof primaryId === 'string' ? embed.id === primaryId : embed.type === 'x6'
    ));
    if (embedIndex < 0) return content;
    const nextEmbeds = [...content.embeds];
    nextEmbeds[embedIndex] = { ...nextEmbeds[embedIndex], title };
    return { ...content, embeds: nextEmbeds };
  }

  function extractTitleFromContent(content: string): string {
    const match = content.replace(/\r\n/g, '\n').match(/^\s*#\s+(.+?)\s*#*\s*(?:\n|$)/m);
    return match?.[1]?.trim() ?? '';
  }

  function resolvePageTitle(pageId: string, pc: PageContent): string {
    const treeTitle = findPageTitle(pageId);
    if (treeTitle && treeTitle !== pageId) return treeTitle;
    return extractTitleFromContent(pc.content);
  }

  function flattenPages(nodes: PageItem[]): PageItem[] {
    const result: PageItem[] = [];
    const visit = (items: PageItem[]) => {
      items.forEach((item) => {
        result.push(item);
        if (item.children?.length) visit(item.children);
      });
    };
    visit(nodes);
    return result;
  }

  function bindLocalFileToPage(
    pageId: string,
    fileName: string,
    initialMarkdown: string,
    options?: ImportMarkdownFileOptions,
  ) {
    const directSaveSupported = options?.directSaveSupported ?? Boolean(options?.fileHandle);

    localFileBindings.value = {
      ...localFileBindings.value,
      [pageId]: {
        fileName,
        fileHandle: options?.fileHandle ?? null,
        directSaveSupported,
        status: directSaveSupported ? 'saved' : 'unsupported',
        error: directSaveSupported ? null : UNSUPPORTED_SAVE_MESSAGE,
        lastSavedAt: directSaveSupported ? Date.now() : null,
        lastSavedContent: initialMarkdown,
        pendingContent: null,
        saveTimer: null,
        isWriting: false,
      },
    };
  }

  async function ensureReadWritePermission(fileHandle: FileSystemFileHandle) {
    const descriptor = { mode: 'readwrite' as const };
    const currentPermission = await fileHandle.queryPermission?.(descriptor);
    if (currentPermission === 'granted') return;

    const requestedPermission = await fileHandle.requestPermission?.(descriptor);
    if (requestedPermission === 'granted') return;

    throw new Error('Local file write permission was not granted.');
  }

  async function flushLocalFileSave(pageId: string) {
    const binding = localFileBindings.value[pageId];
    if (!binding || binding.isWriting) return;

    const nextContent = binding.pendingContent;
    if (nextContent == null || nextContent === binding.lastSavedContent) {
      binding.pendingContent = null;
      if (binding.directSaveSupported) {
        binding.status = binding.lastSavedAt ? 'saved' : 'idle';
      }
      return;
    }

    if (!binding.directSaveSupported || !binding.fileHandle) {
      binding.status = 'unsupported';
      binding.error = UNSUPPORTED_SAVE_MESSAGE;
      return;
    }

    binding.isWriting = true;
    binding.status = 'saving';
    binding.error = null;

    try {
      await ensureReadWritePermission(binding.fileHandle);
      const writable = await binding.fileHandle.createWritable();
      await writable.write(nextContent);
      await writable.close();

      binding.lastSavedContent = nextContent;
      binding.pendingContent = null;
      binding.lastSavedAt = Date.now();
      binding.status = 'saved';
    } catch (error) {
      binding.status = 'error';
      binding.error = error instanceof Error ? error.message : 'Failed to save local file.';
    } finally {
      binding.isWriting = false;
      if (binding.pendingContent && binding.pendingContent !== binding.lastSavedContent) {
        clearBindingTimer(binding);
        binding.status = 'pending';
        binding.saveTimer = window.setTimeout(() => {
          binding.saveTimer = null;
          void flushLocalFileSave(pageId);
        }, LOCAL_FILE_SAVE_DELAY);
      }
    }
  }

  function scheduleLocalFileSave(pageId: string, pc: PageContent) {
    const binding = localFileBindings.value[pageId];
    if (!binding) return;

    const markdown = serializePageContentToMarkdown(pc);
    binding.pendingContent = markdown;

    if (!binding.directSaveSupported || !binding.fileHandle) {
      binding.status = 'unsupported';
      binding.error = UNSUPPORTED_SAVE_MESSAGE;
      return;
    }

    if (markdown === binding.lastSavedContent) {
      binding.pendingContent = null;
      binding.status = binding.lastSavedAt ? 'saved' : 'idle';
      return;
    }

    if (binding.isWriting) {
      binding.status = 'pending';
      return;
    }

    clearBindingTimer(binding);
    binding.status = 'pending';
    binding.saveTimer = window.setTimeout(() => {
      binding.saveTimer = null;
      void flushLocalFileSave(pageId);
    }, LOCAL_FILE_SAVE_DELAY);
  }

  async function saveCurrentPage(content: PageContent) {
    if (viewMode.value === 'resource-document') return;
    if (!currentPageId.value) return;

    const pageId = currentPageId.value;
    pageContent.value = content;

    try {
      await savePageContent(pageId, content);
    } finally {
      scheduleLocalFileSave(pageId, content);
    }
  }

  async function reloadWorkspace() {
    resetWorkspaceState();
    await loadKbList();
  }

  async function addKb(name: string) {
    const kb = await createKnowledgeBase(name);
    kbList.value.push(kb);
    return kb;
  }

  async function removeKb(id: string) {
    await deleteKnowledgeBase(id);
    kbList.value = kbList.value.filter((kb) => kb.id !== id);
    if (currentKbId.value === id) {
      if (kbList.value.length > 0) {
        await selectKb(kbList.value[0].id);
      } else {
        resetWorkspaceState();
      }
    }
  }

  async function renameKb(id: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('知识库名称不能为空');
    const updated = await renameKnowledgeBase(id, trimmed);
    const idx = kbList.value.findIndex((kb) => kb.id === id);
    if (idx >= 0) {
      // 保留列表顺序，仅更新字段
      kbList.value[idx] = { ...kbList.value[idx], ...updated };
    }
    return updated;
  }

  async function addPage(parentId: string | null, title?: string, pageType?: PageType) {
    if (!currentKbId.value) return;
    const defaultTitle = defaultTitleForPageType(pageType);
    const page = await createPage(currentKbId.value, parentId, title ?? defaultTitle, pageType);
    const resolvedType = page.pageType ?? pageType ?? 'document';
    const initialContent = createInitialPageContent(resolvedType, page.title);
    if (initialContent) {
      await savePageContent(page.id, initialContent);
    }
    pageTree.value = await getPageTree(currentKbId.value);
    await selectPage(page.id);
  }

  async function promoteEmbedToPage(sourcePageId: string, embedId: string) {
    if (!currentKbId.value) return;

    const sourcePage = findPageInTree(pageTree.value, sourcePageId);
    if (!sourcePage) {
      throw new Error('Source page not found.');
    }

    const sourceContent = sourcePageId === currentPageId.value && pageContent.value
      ? pageContent.value
      : await getPageContent(sourcePageId);

    const embed = sourceContent.embeds.find((item) => item.id === embedId);
    if (!embed || embed.type !== 'x6') {
      throw new Error('Embed not found.');
    }

    const pageType = inferPageTypeFromEmbed(embed);
    const pageTitle = embed.title?.trim() || defaultTitleForPageType(pageType);
    const page = await createPage(
      currentKbId.value,
      sourcePage.parentId,
      pageTitle,
      pageType,
    );
    await savePageContent(page.id, createPageContentFromEmbed(embed));

    const strippedContent = removeEmbedFromPageContent(sourceContent, embedId);
    await savePageContent(sourcePageId, strippedContent);

    if (sourcePageId === currentPageId.value) {
      pageContent.value = strippedContent;
    }

    pageTree.value = await getPageTree(currentKbId.value);
    await selectPage(page.id);
    return page;
  }

  async function importMarkdownFile(file: File, options?: ImportMarkdownFileOptions) {
    if (!currentKbId.value) {
      throw new Error('Please select a knowledge base first.');
    }

    const markdown = await file.text();
    const pageTitle = deriveMarkdownPageTitle(file.name);
    const page = await createPage(currentKbId.value, null, pageTitle);
    const pc = parseMarkdownToPageContent(markdown);

    await savePageContent(page.id, pc);
    bindLocalFileToPage(page.id, file.name, markdown, options);
    pageTree.value = await getPageTree(currentKbId.value);
    await selectPage(page.id);
  }

  async function importRoadmapJson(payload: ImportRoadmapPayload) {
    const result = await importRoadmap(payload);
    kbList.value = await listKnowledgeBases();
    if (!kbList.value.some((kb) => kb.id === result.knowledgeBase.id)) {
      kbList.value.push(result.knowledgeBase);
    }
    await selectKb(result.knowledgeBase.id);
    return result;
  }

  async function syncKnowledgeRoadmapToSource(graphData: GraphData) {
    if (!currentKbId.value) {
      throw new Error('Please select a knowledge base first.');
    }

    const parsed = parseGraphToSourcePatch('knowledge-base-pages', graphData);
    const pageById = new Map(flattenPages(pageTree.value).map((page) => [page.id, page]));
    const createdPageIdByNodeId = new Map<string, string>();

    for (const node of parsed.nodes) {
      if (node.pageId) continue;
      const parentId = node.parentNodeId
        ? createdPageIdByNodeId.get(node.parentNodeId) ?? node.parentPageId
        : null;
      const page = await createPage(currentKbId.value, parentId, node.title);
      createdPageIdByNodeId.set(node.nodeId, page.id);
    }

    for (const node of parsed.nodes) {
      const pageId = node.pageId ?? createdPageIdByNodeId.get(node.nodeId);
      if (!pageId) continue;
      const existing = pageById.get(pageId);
      if (existing && existing.title !== node.title) {
        await renamePage(pageId, node.title);
      }
    }

    for (const node of parsed.nodes) {
      const pageId = node.pageId ?? createdPageIdByNodeId.get(node.nodeId);
      if (!pageId) continue;
      const parentId = node.parentNodeId
        ? createdPageIdByNodeId.get(node.parentNodeId) ?? node.parentPageId
        : null;
      await movePage(pageId, parentId, node.order);
    }

    pageTree.value = await getPageTree(currentKbId.value);
    return {
      createdCount: createdPageIdByNodeId.size,
      changedCount: parsed.nodes.length,
      warnings: parsed.warnings,
    };
  }

  async function removePage(id: string, options?: { refreshTree?: boolean }) {
    await deletePage(id);
    clearLocalFileBinding(id);
    if (options?.refreshTree !== false && currentKbId.value) {
      pageTree.value = await getPageTree(currentKbId.value);
    }
    if (currentPageId.value === id) {
      currentPageId.value = null;
      currentPageTitleOverride.value = null;
      blockSyncManager.setPageId(null);
      pageContent.value = null;
      const fallbackPage = findFirstPage(pageTree.value);
      if (fallbackPage) {
        await selectPage(fallbackPage.id);
      } else {
        persistSelection(currentKbId.value, null);
      }
    }
  }

  async function removePages(ids: string[]) {
    const uniqueIds = [...new Set(ids)];
    for (const id of uniqueIds) {
      await removePage(id, { refreshTree: false });
    }
    if (currentKbId.value) {
      pageTree.value = await getPageTree(currentKbId.value);
    }
  }

  async function reorderPage(
    id: string,
    newParentId: string | null,
    newOrder: number,
  ) {
    await movePage(id, newParentId, newOrder);
    if (currentKbId.value) {
      pageTree.value = await getPageTree(currentKbId.value);
    }
  }

  async function renameCurrentPage(id: string, title: string) {
    await renamePage(id, title);
    if (currentKbId.value) {
      pageTree.value = await getPageTree(currentKbId.value);
    }
    if (currentPageId.value === id) {
      currentPageTitleOverride.value = title;
      const page = findPageInTree(pageTree.value, id);
      if ((page?.pageType === 'mindmap' || page?.pageType === 'x6board') && pageContent.value) {
        const nextContent = syncPrimaryEmbedTitle(pageContent.value, title);
        if (nextContent !== pageContent.value) {
          pageContent.value = nextContent;
          await savePageContent(id, nextContent);
        }
      }
      if (pageContent.value) {
        registryStore.registerPageContent(pageContent.value, id, title);
      }
    }
  }

  return {
    kbList,
    currentKbId,
    pageTree,
    linkedResourceDocuments,
    currentPageId,
    currentResourceItemId,
    currentViewKey,
    viewMode,
    isResourceDocumentView,
    pageContent,
    currentPageTitle,
    currentPageType,
    isMindmapPage,
    isX6BoardPage,
    isCanvasPage,
    loading,
    currentLocalFileBinding,
    loadKbList,
    reloadWorkspace,
    selectKb,
    selectPage,
    selectKbLinkedResource,
    refreshLinkedResourceDocuments,
    saveCurrentPage,
    addKb,
    removeKb,
    renameKb,
    addPage,
    importMarkdownFile,
    importRoadmapJson,
    syncKnowledgeRoadmapToSource,
    removePage,
    removePages,
    reorderPage,
    renameCurrentPage,
    promoteEmbedToPage,
  };
});

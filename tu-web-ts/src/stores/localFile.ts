/**
 * 本地文件查看器 store
 *
 * 用于桌面端"双击 .md 文件用本应用打开"场景：在主内容区显示一个
 * 独立于知识库的本地 markdown 文档，可编辑并自动保存回原文件。
 *
 * 与 workspace store 的 LocalFileBinding 不同（后者依赖浏览器 File System
 * Access API 的 FileSystemFileHandle，仅适用于 web 端 showOpenFilePicker），
 * 这里通过 Tauri Rust 命令直接按路径读写文件。
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { PageContent } from '@/api/types';
import {
  parseMarkdownToPageContent,
  serializePageContentToMarkdown,
  deriveMarkdownPageTitle,
} from '@/utils/markdownImport';
import {
  isTauri,
  readLocalTextFile,
  writeLocalTextFile,
} from '@/desktop/tauriBridge';

export type LocalFileStatus =
  | 'idle'
  | 'loading'
  | 'saving'
  | 'saved'
  | 'error'
  | 'unsupported';

const SAVE_DEBOUNCE_MS = 800;

export const useLocalFileStore = defineStore('localFile', () => {
  /** 当前打开的本地文件绝对路径，null 表示未打开本地文件 */
  const filePath = ref<string | null>(null);
  /** 文件名（不含目录），用于显示 */
  const fileName = ref<string>('');
  /** 解析后的页面内容（供 TuEditorPage 渲染） */
  const pageContent = ref<PageContent | null>(null);
  /** 上次保存到磁盘的 markdown 文本，用于检测是否有未保存修改 */
  const lastSavedContent = ref<string>('');
  /** 当前状态 */
  const status = ref<LocalFileStatus>('idle');
  /** 错误信息（status 为 'error' 时有效） */
  const error = ref<string | null>(null);

  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let isWriting = false;
  /** 待写入的下一个内容；非 null 表示有未落盘的修改 */
  let pendingContent: string | null = null;

  /** 是否正在查看本地文件（用于 HomeView 切换主内容区）。即使读取失败也保持 active，以显示错误状态 */
  const isActive = computed(() => filePath.value !== null);

  /** 是否有未保存的修改 */
  const isDirty = computed(() => pendingContent !== null && pendingContent !== lastSavedContent.value);

  /** 状态文案（复用 HomeView 中 LocalFileBinding 的展示风格） */
  const statusText = computed(() => {
    switch (status.value) {
      case 'loading':
        return '正在加载本地文件…';
      case 'saving':
        return '正在保存到本地文件…';
      case 'saved':
        return lastSavedContent.value
          ? '已保存到本地文件'
          : '已绑定本地文件';
      case 'error':
        return error.value || '本地文件保存失败';
      case 'unsupported':
        return '当前环境不支持保存回本地文件（仅 Tauri 桌面端可用）';
      default:
        return '已绑定本地文件';
    }
  });

  function clearSaveTimer() {
    if (saveTimer !== null) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
  }

  /**
   * 打开一个本地 .md 文件：读取 → 解析为 PageContent → 设置状态。
   * 失败时设置 error 状态并抛出。
   */
  async function openFile(path: string): Promise<void> {
    if (!isTauri()) {
      status.value = 'unsupported';
      error.value = '当前环境不支持打开本地文件（仅 Tauri 桌面端可用）';
      console.warn('[localFile] Not in Tauri environment, cannot open:', path);
      return;
    }

    // 切换文件前先冲刷当前文件的待保存内容
    if (filePath.value && isDirty.value) {
      await flushSave();
    }

    clearSaveTimer();
    filePath.value = path;
    console.log('[localFile] Opening file:', path);
    // 从路径中提取文件名（兼容正反斜杠）
    const sep = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
    fileName.value = sep >= 0 ? path.slice(sep + 1) : path;
    status.value = 'loading';
    error.value = null;
    pendingContent = null;

    try {
      const markdown = await readLocalTextFile(path);
      if (markdown === null) {
        status.value = 'unsupported';
        error.value = '无法读取本地文件（Tauri API 不可用）';
        console.warn('[localFile] readLocalTextFile returned null for:', path);
        return;
      }
      pageContent.value = parseMarkdownToPageContent(markdown);
      lastSavedContent.value = markdown;
      status.value = 'saved';
      console.log('[localFile] File loaded successfully, content length:', markdown.length);
    } catch (e) {
      status.value = 'error';
      error.value = e instanceof Error ? e.message : '读取本地文件失败';
      // 保留 filePath 让 LocalFileViewer 能渲染错误状态（用户可见）
      // 只清空 pageContent 避免显示陈旧内容
      pageContent.value = null;
      console.error('[localFile] Failed to open file:', path, e);
    }
  }

  /** 关闭本地文件视图，清空所有状态 */
  function closeFile(): void {
    clearSaveTimer();
    filePath.value = null;
    fileName.value = '';
    pageContent.value = null;
    lastSavedContent.value = '';
    pendingContent = null;
    status.value = 'idle';
    error.value = null;
  }

  /**
   * 编辑器内容变化时调用：序列化为 markdown，debounce 后写回原文件。
   * 与 workspace store 的 scheduleLocalFileSave 行为一致。
   */
  function scheduleSave(content: PageContent): void {
    if (!filePath.value) return;

    // 同步更新内存中的 pageContent，让 UI 立即反映编辑
    pageContent.value = content;

    const markdown = serializePageContentToMarkdown(content);
    pendingContent = markdown;

    if (!isTauri()) {
      status.value = 'unsupported';
      error.value = '当前环境不支持保存回本地文件';
      return;
    }

    if (markdown === lastSavedContent.value) {
      pendingContent = null;
      status.value = 'saved';
      return;
    }

    if (isWriting) {
      status.value = 'saving';
      return;
    }

    clearSaveTimer();
    status.value = 'saving';
    saveTimer = setTimeout(() => {
      saveTimer = null;
      void flushSave();
    }, SAVE_DEBOUNCE_MS);
  }

  /** 立即冲刷待保存内容到磁盘（如切换页面前） */
  async function flushSave(): Promise<void> {
    if (!filePath.value || isWriting) return;
    if (pendingContent === null || pendingContent === lastSavedContent.value) {
      return;
    }

    const next = pendingContent;
    isWriting = true;
    status.value = 'saving';
    error.value = null;

    try {
      const ok = await writeLocalTextFile(filePath.value, next);
      if (!ok) {
        status.value = 'error';
        error.value = '写入本地文件失败';
        return;
      }
      lastSavedContent.value = next;
      pendingContent = null;
      status.value = 'saved';
    } catch (e) {
      status.value = 'error';
      error.value = e instanceof Error ? e.message : '本地文件保存失败';
    } finally {
      isWriting = false;
      // 期间又有新改动 → 重新排一次
      if (pendingContent !== null && pendingContent !== lastSavedContent.value) {
        clearSaveTimer();
        saveTimer = setTimeout(() => {
          saveTimer = null;
          void flushSave();
        }, SAVE_DEBOUNCE_MS);
      }
    }
  }

  /** 派生页面标题（从文件名） */
  const pageTitle = computed(() => {
    if (!fileName.value) return '';
    return deriveMarkdownPageTitle(fileName.value);
  });

  return {
    // state
    filePath,
    fileName,
    pageContent,
    status,
    error,
    // computed
    isActive,
    isDirty,
    statusText,
    pageTitle,
    // actions
    openFile,
    closeFile,
    scheduleSave,
    flushSave,
  };
});

<script setup lang="ts">
import { computed, ref } from 'vue';
import { ElButton, ElMessage, ElMessageBox } from 'element-plus';
import { useWorkspaceStore } from '@/stores/workspace';

const store = useWorkspaceStore();
const inputRef = ref<HTMLInputElement | null>(null);
const importing = ref(false);

const supportsLocalFileWrite = computed(() => {
  return typeof window !== 'undefined' && typeof window.showOpenFilePicker === 'function';
});

const pickerOptions: OpenFilePickerOptions = {
  multiple: false,
  excludeAcceptAllOption: false,
  types: [
    {
      description: 'Markdown',
      accept: {
        'text/markdown': ['.md', '.markdown'],
        'text/plain': ['.md', '.markdown'],
      },
    },
  ],
};

function openFallbackInput() {
  inputRef.value?.click();
}

async function importFromFile(file: File, fileHandle?: FileSystemFileHandle | null) {
  importing.value = true;
  try {
    await store.importMarkdownFile(file, {
      fileHandle: fileHandle ?? null,
      directSaveSupported: Boolean(fileHandle),
    });

    if (fileHandle) {
      ElMessage.success(`已导入并绑定本地文件：${file.name}`);
    } else {
      ElMessage.success(`已导入 ${file.name}`);
      ElMessage.warning('当前浏览器不支持自动保存回原文件，只能在应用内编辑。');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '导入 Markdown 失败';
    ElMessage.error(message);
  } finally {
    importing.value = false;
  }
}

async function openPicker() {
  if (importing.value) return;

  if (supportsLocalFileWrite.value) {
    importing.value = true;
    try {
      const [fileHandle] = await window.showOpenFilePicker?.(pickerOptions) ?? [];
      if (!fileHandle) return;
      const file = await fileHandle.getFile();
      await importFromFile(file, fileHandle);
    } catch (error) {
      const name = error instanceof DOMException ? error.name : '';
      if (name === 'AbortError') return;
      const message = error instanceof Error ? error.message : '打开本地文件失败';
      ElMessage.error(message);
    } finally {
      importing.value = false;
    }
    return;
  }

  try {
    await ElMessageBox.confirm(
      '当前浏览器不支持直接保存回原本地文件。继续后仍可导入并编辑 Markdown，但变更不会自动回写到原文件。',
      '浏览器能力提示',
      {
        confirmButtonText: '继续导入',
        cancelButtonText: '取消',
        type: 'warning',
      },
    );
    openFallbackInput();
  } catch {
    // ignore cancel
  }
}

async function onFileChange(event: Event) {
  const target = event.target as HTMLInputElement | null;
  const file = target?.files?.[0];
  if (!file) return;

  await importFromFile(file);

  if (target) {
    target.value = '';
  }
}
</script>

<template>
  <div class="markdown-import">
    <input
      ref="inputRef"
      class="markdown-import__input"
      type="file"
      accept=".md,.markdown,text/markdown"
      @change="onFileChange"
    >
    <el-button
      link
      size="small"
      title="导入本地 Markdown"
      :disabled="!store.currentKbId || importing"
      @click.stop="openPicker"
    >
      导入
    </el-button>
  </div>
</template>

<style scoped>
.markdown-import {
  display: inline-flex;
}

.markdown-import__input {
  display: none;
}
</style>

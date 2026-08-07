<script setup lang="ts">
/**
 * 本地文件查看器
 *
 * 在桌面端双击 .md 文件后，主内容区切换到本组件渲染该本地文档：
 * - 复用 TuEditorPage 进行编辑（与知识库页面一致的富文本体验）
 * - 编辑后 debounce 自动写回原文件（通过 Tauri Rust 命令）
 * - 顶部状态条显示文件名、保存状态、关闭按钮
 *
 * 不依赖知识库：用户可在侧栏照常浏览/选择知识库页面，本地文件视图独立。
 */
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { ElButton, ElTooltip } from 'element-plus';
import TuEditorPage from '@/components/TuEditorPage.vue';
import { useLocalFileStore } from '@/stores/localFile';
import type { PageContent } from '@/api/types';

const localFileStore = useLocalFileStore();
const router = useRouter();

const pageTitle = computed(() => localFileStore.pageTitle);

function onContentChange(content: PageContent) {
  localFileStore.scheduleSave(content);
}

function onClose() {
  // 关闭前冲刷未保存内容
  void localFileStore.flushSave().finally(() => {
    localFileStore.closeFile();
    // 清除路由中可能残留的 pageId 定位，避免误以为在查看知识库页面
    if (router.currentRoute.value.query.pageId) {
      void router.replace({ path: '/', query: {} });
    }
  });
}

// 标题变更：本地文件场景下，标题就是文件名，不允许重命名页面（避免污染知识库）
function onPageTitleChange(_title: string) {
  // no-op: 本地文件的标题来自文件名，不写入任何知识库
}
</script>

<template>
  <div class="local-file-viewer">
    <div
      class="local-file-viewer__status"
      :class="`local-file-viewer__status--${localFileStore.status}`"
    >
      <div class="local-file-viewer__status-main">
        <ElTooltip
          :content="localFileStore.filePath ?? ''"
          placement="bottom"
          :show-after="300"
          :hide-after="0"
        >
          <span class="local-file-viewer__name">{{ localFileStore.fileName }}</span>
        </ElTooltip>
        <span class="local-file-viewer__tag">LOCAL FILE</span>
      </div>
      <div class="local-file-viewer__status-side">
        <span class="local-file-viewer__message">{{ localFileStore.statusText }}</span>
        <ElButton
          link
          size="small"
          type="primary"
          :disabled="localFileStore.status === 'saving'"
          @click="onClose"
        >
          关闭本地文件
        </ElButton>
      </div>
    </div>

    <TuEditorPage
      v-if="localFileStore.pageContent"
      :key="localFileStore.filePath!"
      :contentList="localFileStore.pageContent"
      :page-title="pageTitle"
      :editable="true"
      @page-title-change="onPageTitleChange"
      @content-change="onContentChange"
    />

    <!-- 加载中 / 错误状态（pageContent 为 null 时显示） -->
    <div v-else class="local-file-viewer__placeholder">
      <div v-if="localFileStore.status === 'loading'" class="local-file-viewer__hint">
        正在加载文件…
      </div>
      <div v-else-if="localFileStore.status === 'error'" class="local-file-viewer__hint local-file-viewer__hint--error">
        <div class="local-file-viewer__hint-title">无法打开本地文件</div>
        <div class="local-file-viewer__hint-detail">{{ localFileStore.error }}</div>
        <div class="local-file-viewer__hint-path">路径：{{ localFileStore.filePath }}</div>
      </div>
      <div v-else-if="localFileStore.status === 'unsupported'" class="local-file-viewer__hint local-file-viewer__hint--error">
        <div class="local-file-viewer__hint-title">当前环境不支持</div>
        <div class="local-file-viewer__hint-detail">{{ localFileStore.error }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.local-file-viewer {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  overflow-y: auto;
  box-sizing: border-box;
}

.local-file-viewer__status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 14px;
  margin-bottom: 8px;
  border-radius: 6px;
  background: #f5f7fa;
  border: 1px solid #e4e7ed;
  font-size: 12px;
  flex-shrink: 0;
}

.local-file-viewer__status--saving {
  background: #ecf5ff;
  border-color: #b3d8ff;
}

.local-file-viewer__status--error {
  background: #fef0f0;
  border-color: #fbc4c4;
}

.local-file-viewer__status--saved {
  background: #f0f9eb;
  border-color: #c2e7b0;
}

.local-file-viewer__status-main {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.local-file-viewer__name {
  font-weight: 600;
  color: #303133;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 360px;
}

.local-file-viewer__tag {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  border-radius: 3px;
  background: #67c23a;
  color: #fff;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.5px;
  flex-shrink: 0;
}

.local-file-viewer__status-side {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.local-file-viewer__message {
  color: #606266;
}

.local-file-viewer__placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  min-height: 200px;
  padding: 24px;
}

.local-file-viewer__hint {
  font-size: 14px;
  color: #909399;
  text-align: center;
}

.local-file-viewer__hint--error {
  color: #f56c6c;
}

.local-file-viewer__hint-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 8px;
}

.local-file-viewer__hint-detail {
  font-size: 13px;
  color: #606266;
  margin-bottom: 6px;
}

.local-file-viewer__hint-path {
  font-size: 12px;
  color: #909399;
  word-break: break-all;
}
</style>

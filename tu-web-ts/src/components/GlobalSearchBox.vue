<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue';
import { ElInput } from 'element-plus';
import { Search } from '@element-plus/icons-vue';
import { searchPages, type SearchHit } from '@/api/search';
import { useWorkspaceStore } from '@/stores/workspace';

const store = useWorkspaceStore();

const query = ref('');
const hits = ref<SearchHit[]>([]);
const loading = ref(false);
const open = ref(false);
const message = ref<string | null>(null);
const enabled = ref(true);

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let requestSeq = 0;

async function runSearch(text: string) {
  const trimmed = text.trim();
  if (trimmed.length < 2) {
    hits.value = [];
    message.value = null;
    open.value = false;
    return;
  }

  const seq = ++requestSeq;
  loading.value = true;
  open.value = true;
  try {
    const response = await searchPages(trimmed, 20);
    if (seq !== requestSeq) return;
    hits.value = response.hits;
    enabled.value = response.enabled;
    message.value = response.message;
  } catch {
    if (seq !== requestSeq) return;
    hits.value = [];
    message.value = '搜索失败，请稍后重试';
  } finally {
    if (seq === requestSeq) {
      loading.value = false;
    }
  }
}

watch(query, (value) => {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void runSearch(value);
  }, 300);
});

onBeforeUnmount(() => {
  if (debounceTimer) clearTimeout(debounceTimer);
});

function onFocus() {
  if (query.value.trim().length >= 2) {
    open.value = true;
  }
}

async function onSelectHit(hit: SearchHit) {
  open.value = false;
  query.value = '';
  hits.value = [];

  if (store.currentKbId !== hit.kbId) {
    await store.selectKb(hit.kbId);
  }
  await store.selectPage(hit.pageId);
}

function onBlur() {
  window.setTimeout(() => {
    open.value = false;
  }, 150);
}
</script>

<template>
  <div class="global-search">
    <el-input
      v-model="query"
      class="global-search__input"
      placeholder="搜索全部知识库页面..."
      clearable
      :prefix-icon="Search"
      @focus="onFocus"
      @blur="onBlur"
    />

    <div v-if="open" class="global-search__panel">
      <div v-if="loading" class="global-search__hint">搜索中…</div>
      <div v-else-if="!enabled || message" class="global-search__hint">
        {{ message || '搜索不可用' }}
      </div>
      <div v-else-if="hits.length === 0" class="global-search__hint">无匹配结果</div>
      <button
        v-for="hit in hits"
        :key="`${hit.pageId}-${hit.blockId || hit.title}`"
        type="button"
        class="global-search__hit"
        @mousedown.prevent="onSelectHit(hit)"
      >
        <span class="global-search__hit-title">{{ hit.pageTitle }}</span>
        <span class="global-search__hit-meta">
          {{ hit.kbName }} · <span v-html="hit.snippet" />
        </span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.global-search {
  position: relative;
}

.global-search__input :deep(.el-input__wrapper) {
  border-radius: 6px;
}

.global-search__panel {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 20;
  max-height: 320px;
  overflow-y: auto;
  background: #fff;
  border: 1px solid #e8e8e8;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.global-search__hint {
  padding: 10px 12px;
  font-size: 12px;
  color: #8c8c8c;
}

.global-search__hit {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  width: 100%;
  padding: 8px 12px;
  border: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.global-search__hit:hover {
  background: #f5f7fa;
}

.global-search__hit-title {
  font-size: 13px;
  font-weight: 500;
  color: #262626;
  line-height: 1.4;
}

.global-search__hit-meta {
  font-size: 11px;
  color: #8c8c8c;
  line-height: 1.4;
  word-break: break-word;
}

.global-search__hit-meta :deep(em) {
  font-style: normal;
  color: #1677ff;
  font-weight: 500;
}
</style>

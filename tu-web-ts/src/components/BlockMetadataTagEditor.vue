<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { ElPagination } from 'element-plus';
import type { BlockTag } from '@/api/types';
import { DEFAULT_PAGE_SIZE } from '@/constants/pagination';
import { createTagColor, normalizeBlockTag, normalizeTagLabel } from '@/utils/blockMetadata';
import { clampPage, paginateSlice } from '@/utils/clientPagination';
import { resolveTagEditorEnterAction } from '@/utils/tagEditorEnter';

interface Props {
  visible: boolean;
  selectedTags: BlockTag[];
  availableTags: BlockTag[];
  title?: string;
  top?: number;
  left?: number;
}

const props = withDefaults(defineProps<Props>(), {
  title: '编辑标签',
  top: 0,
  left: 0,
});

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'update:selectedTags', tags: BlockTag[]): void;
}>();

const inputRef = ref<HTMLInputElement | null>(null);
const query = ref('');
const candidatePage = ref(0);

const normalizedQuery = computed(() => normalizeTagLabel(query.value).toLowerCase());
const selectedKeys = computed(() => new Set(props.selectedTags.map((tag) => tag.label.toLowerCase())));

const filteredCandidates = computed(() => {
  const keyword = normalizedQuery.value;
  return props.availableTags.filter((tag) => {
    if (selectedKeys.value.has(tag.label.toLowerCase())) return false;
    if (!keyword) return true;
    return tag.label.toLowerCase().includes(keyword);
  });
});

const candidatePageData = computed(() => paginateSlice(
  filteredCandidates.value,
  candidatePage.value,
  DEFAULT_PAGE_SIZE,
));

const pagedCandidates = computed(() => candidatePageData.value.items);

watch(filteredCandidates, (list) => {
  candidatePage.value = clampPage(candidatePage.value, list.length, DEFAULT_PAGE_SIZE);
});

const canCreateTag = computed(() => {
  const normalized = normalizeTagLabel(query.value);
  if (!normalized) return false;
  return !props.availableTags.some((tag) => tag.label.toLowerCase() === normalized.toLowerCase())
    && !selectedKeys.value.has(normalized.toLowerCase());
});

const createTagFromQuery = (): BlockTag | null => {
  const normalized = normalizeBlockTag({
    label: query.value,
    color: createTagColor(query.value),
  });
  if (!normalized) return null;
  return normalized;
};

const applyTags = (tags: BlockTag[]) => {
  emit('update:selectedTags', tags);
};

const addTag = (tag: BlockTag) => {
  if (selectedKeys.value.has(tag.label.toLowerCase())) return;
  applyTags([...props.selectedTags, tag]);
  query.value = '';
  void nextTick(() => inputRef.value?.focus());
};

const removeTag = (tagId: string) => {
  applyTags(props.selectedTags.filter((tag) => tag.id !== tagId));
};

const createAndAddTag = () => {
  const newTag = createTagFromQuery();
  if (newTag) addTag(newTag);
};

const handleEnter = () => {
  switch (resolveTagEditorEnterAction(canCreateTag.value, filteredCandidates.value.length)) {
    case 'create':
      createAndAddTag();
      break;
    case 'pick-first':
      addTag(filteredCandidates.value[0]);
      break;
    default:
      break;
  }
};

const handleInputKeyDown = (event: KeyboardEvent) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    handleEnter();
    return;
  }

  if (event.key === 'Backspace' && !query.value && props.selectedTags.length > 0) {
    event.preventDefault();
    removeTag(props.selectedTags[props.selectedTags.length - 1].id);
    return;
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    emit('close');
  }
};

watch(
  () => props.visible,
  (visible) => {
    if (!visible) {
      query.value = '';
      candidatePage.value = 0;
      return;
    }

    candidatePage.value = 0;
    void nextTick(() => inputRef.value?.focus());
  },
);

watch(query, () => {
  candidatePage.value = 0;
});

const handleCandidatePageChange = (page: number) => {
  candidatePage.value = Math.max(0, page - 1);
};
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="tag-editor-mask" @mousedown.self="emit('close')">
      <div
        class="tag-editor-popover tu-dialog-viewport-panel"
        :style="{
          top: `${top}px`,
          left: `${left}px`,
        }"
        @mousedown.stop
      >
        <div class="tag-editor-header">
          <span class="tag-editor-title">{{ title }}</span>
          <button class="tag-editor-close" type="button" @click="emit('close')">关闭</button>
        </div>

        <div class="tag-editor-body">
          <div v-if="selectedTags.length > 0" class="tag-editor-selected">
            <span
              v-for="tag in selectedTags"
              :key="tag.id"
              class="tag-chip tag-chip--selected"
              :style="{ '--tag-chip-color': tag.color || '#1677ff' }"
            >
              <span class="tag-chip__label">{{ tag.label }}</span>
              <button
                type="button"
                class="tag-chip__remove"
                :title="`删除标签「${tag.label}」`"
                :aria-label="`删除标签 ${tag.label}`"
                @click="removeTag(tag.id)"
              >
                ×
              </button>
            </span>
          </div>

          <input
            ref="inputRef"
            v-model="query"
            class="tag-editor-input"
            type="text"
            placeholder="搜索或新建标签"
            @keydown="handleInputKeyDown"
          />

          <div class="tag-editor-section">
            <button
              v-if="canCreateTag"
              type="button"
              class="tag-editor-option tag-editor-option--create"
              @click="createAndAddTag"
            >
              新建标签 “{{ normalizeTagLabel(query) }}”
            </button>

            <template v-if="pagedCandidates.length > 0">
              <button
                v-for="tag in pagedCandidates"
                :key="tag.id"
                type="button"
                class="tag-editor-option"
                @click="addTag(tag)"
              >
                <span class="tag-chip tag-chip--preview" :style="{ '--tag-chip-color': tag.color || '#1677ff' }">
                  {{ tag.label }}
                </span>
              </button>
            </template>

            <div v-else-if="!canCreateTag" class="tag-editor-empty">
              没有更多可选标签
            </div>
          </div>

          <ElPagination
            v-if="candidatePageData.total > DEFAULT_PAGE_SIZE"
            class="tag-editor-pagination"
            layout="prev, pager, next, total"
            small
            :total="candidatePageData.total"
            :page-size="DEFAULT_PAGE_SIZE"
            :current-page="candidatePageData.page + 1"
            @current-change="handleCandidatePageChange"
          />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.tag-editor-mask {
  position: fixed;
  inset: 0;
  z-index: 1400;
}

.tag-editor-popover {
  position: fixed;
  width: min(320px, calc(100vw - 24px));
  background: #fff;
  border: 1px solid #e8e8e8;
  border-radius: 10px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.15);
  padding: 12px;
}

.tag-editor-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.tag-editor-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.tag-editor-title {
  font-size: 14px;
  font-weight: 600;
  color: #1f1f1f;
}

.tag-editor-close {
  border: none;
  background: transparent;
  color: #8c8c8c;
  cursor: pointer;
  font-size: 12px;
}

.tag-editor-selected {
  flex-shrink: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 10px 8px;
  max-height: 88px;
  overflow-y: auto;
  margin-bottom: 10px;
  padding: 6px 4px 2px;
}

.tag-editor-input {
  flex-shrink: 0;
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #d9d9d9;
  border-radius: 8px;
  padding: 9px 12px;
  font-size: 14px;
  outline: none;
}

.tag-editor-input:focus {
  border-color: #1677ff;
  box-shadow: 0 0 0 2px rgba(22, 119, 255, 0.12);
}

.tag-editor-section {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 10px;
  overflow-y: auto;
}

.tag-editor-pagination {
  flex-shrink: 0;
  margin-top: 8px;
  justify-content: flex-end;
}

.tag-editor-option {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  width: 100%;
  border: none;
  border-radius: 8px;
  background: #fff;
  padding: 8px;
  cursor: pointer;
  text-align: left;
}

.tag-editor-option:hover {
  background: #f5f7fa;
}

.tag-editor-option--create {
  color: #1677ff;
  font-weight: 500;
}

.tag-editor-empty {
  color: #8c8c8c;
  font-size: 13px;
  padding: 8px 4px;
}

.tag-chip {
  --tag-chip-color: #1677ff;
  position: relative;
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--tag-chip-color) 30%, white);
  background: color-mix(in srgb, var(--tag-chip-color) 12%, white);
  color: color-mix(in srgb, var(--tag-chip-color) 85%, black);
  padding: 4px 14px 4px 10px;
  font-size: 12px;
  line-height: 1.4;
}

.tag-chip--selected {
  background: color-mix(in srgb, var(--tag-chip-color) 16%, white);
}

.tag-chip--preview {
  pointer-events: none;
  padding: 4px 10px;
}

.tag-chip__remove {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 16px;
  height: 16px;
  padding: 0;
  border: 1px solid #e8e8e8;
  border-radius: 999px;
  background: #fff;
  color: #8c8c8c;
  font-size: 12px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
}

.tag-chip__remove:hover {
  color: #ff4d4f;
  border-color: #ffccc7;
  background: #fff1f0;
}
</style>

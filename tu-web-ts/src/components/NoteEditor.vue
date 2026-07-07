<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { ElPagination } from 'element-plus';
import type { BlockTag, TextAnnotation } from '@/api/types';
import { DEFAULT_PAGE_SIZE } from '@/constants/pagination';
import { createTagColor, normalizeBlockTag, normalizeTagLabel } from '@/utils/blockMetadata';
import { clampPage, paginateSlice } from '@/utils/clientPagination';
import { resolveTagEditorEnterAction } from '@/utils/tagEditorEnter';

interface Props {
  visible: boolean;
  annotation?: TextAnnotation | null;
  selectedTags?: BlockTag[];
  availableTags?: BlockTag[];
}

const props = withDefaults(defineProps<Props>(), {
  selectedTags: () => [],
  availableTags: () => [],
});

const emit = defineEmits<{
  (e: 'save', payload: { note: string; tags: BlockTag[] }): void;
  (e: 'cancel'): void;
}>();

const noteText = ref('');
const tags = ref<BlockTag[]>([]);
const tagQuery = ref('');
const candidatePage = ref(0);
const textareaRef = ref<HTMLTextAreaElement | null>(null);
const tagInputRef = ref<HTMLInputElement | null>(null);

const normalizedQuery = computed(() => normalizeTagLabel(tagQuery.value).toLowerCase());
const selectedKeys = computed(() => new Set(tags.value.map((tag) => tag.label.toLowerCase())));

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
  const normalized = normalizeTagLabel(tagQuery.value);
  if (!normalized) return false;
  return !props.availableTags.some((tag) => tag.label.toLowerCase() === normalized.toLowerCase())
    && !selectedKeys.value.has(normalized.toLowerCase());
});

const canSave = computed(() => noteText.value.trim().length > 0 || tags.value.length > 0);

const editorTitle = computed(() => (props.annotation ? '编辑标注' : '添加标注'));

watch(
  () => props.visible,
  (visible) => {
    if (!visible) {
      noteText.value = '';
      tags.value = [];
      tagQuery.value = '';
      candidatePage.value = 0;
      return;
    }
    noteText.value = props.annotation?.note ?? '';
    tags.value = [...props.selectedTags];
    candidatePage.value = 0;
    void nextTick(() => {
      textareaRef.value?.focus();
    });
  },
);

watch(tagQuery, () => {
  candidatePage.value = 0;
});

const addTag = (tag: BlockTag) => {
  if (selectedKeys.value.has(tag.label.toLowerCase())) return;
  tags.value = [...tags.value, tag];
  tagQuery.value = '';
  void nextTick(() => tagInputRef.value?.focus());
};

const removeTag = (tagId: string) => {
  tags.value = tags.value.filter((tag) => tag.id !== tagId);
};

const createTagFromQuery = (): BlockTag | null => {
  const normalized = normalizeBlockTag({
    label: tagQuery.value,
    color: createTagColor(tagQuery.value),
  });
  return normalized;
};

const createAndAddTag = () => {
  const newTag = createTagFromQuery();
  if (newTag) addTag(newTag);
};

const handleTagEnter = () => {
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

const handleTagKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    handleTagEnter();
    return;
  }
  if (event.key === 'Backspace' && !tagQuery.value && tags.value.length > 0) {
    event.preventDefault();
    removeTag(tags.value[tags.value.length - 1].id);
    return;
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    emit('cancel');
  }
};

const handleSave = () => {
  if (!canSave.value) return;
  emit('save', {
    note: noteText.value.trim(),
    tags: [...tags.value],
  });
};

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    handleSave();
    return;
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    emit('cancel');
  }
};

const handleCandidatePageChange = (page: number) => {
  candidatePage.value = Math.max(0, page - 1);
};
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="note-editor-mask" @mousedown.self="emit('cancel')">
      <div class="note-editor-popover tu-dialog-viewport-panel" @mousedown.stop>
        <div class="note-editor-header">
          <span class="note-editor-title">{{ editorTitle }}</span>
          <button type="button" class="note-editor-close" @click="emit('cancel')">关闭</button>
        </div>

        <div class="note-editor-body">
          <label class="note-editor-label">笔记（可选）</label>
          <textarea
            ref="textareaRef"
            v-model="noteText"
            class="note-editor-textarea"
            placeholder="输入笔记内容..."
            @keydown="handleKeydown"
          />

          <label class="note-editor-label">文字标签（可选）</label>
          <div v-if="tags.length > 0" class="note-editor-tags">
            <button
              v-for="tag in tags"
              :key="tag.id"
              type="button"
              class="tag-chip tag-chip--selected"
              :style="{ '--tag-chip-color': tag.color || '#1677ff' }"
              @click="removeTag(tag.id)"
            >
              <span>{{ tag.label }}</span>
              <span class="tag-chip-remove">×</span>
            </button>
          </div>

          <input
            ref="tagInputRef"
            v-model="tagQuery"
            class="note-editor-tag-input"
            type="text"
            placeholder="搜索或新建标签"
            @keydown="handleTagKeydown"
          />

          <div class="note-editor-tag-section">
            <button
              v-if="canCreateTag"
              type="button"
              class="note-editor-tag-option note-editor-tag-option--create"
              @click="createAndAddTag"
            >
              新建标签 “{{ normalizeTagLabel(tagQuery) }}”
            </button>
            <template v-if="pagedCandidates.length > 0">
              <button
                v-for="tag in pagedCandidates"
                :key="tag.id"
                type="button"
                class="note-editor-tag-option"
                @click="addTag(tag)"
              >
                <span class="tag-chip tag-chip--preview" :style="{ '--tag-chip-color': tag.color || '#1677ff' }">
                  {{ tag.label }}
                </span>
              </button>
            </template>
            <div
              v-else-if="!canCreateTag"
              class="note-editor-tag-empty"
            >
              没有更多可选标签
            </div>
          </div>

          <ElPagination
            v-if="candidatePageData.total > DEFAULT_PAGE_SIZE"
            class="note-editor-tag-pagination"
            layout="prev, pager, next, total"
            small
            :total="candidatePageData.total"
            :page-size="DEFAULT_PAGE_SIZE"
            :current-page="candidatePageData.page + 1"
            @current-change="handleCandidatePageChange"
          />
        </div>

        <div class="note-editor-footer">
          <button type="button" class="note-editor-cancel-btn" @click="emit('cancel')">取消</button>
          <button
            type="button"
            class="note-editor-save-btn"
            :disabled="!canSave"
            @click="handleSave"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.note-editor-mask {
  position: fixed;
  inset: 0;
  z-index: 1000002;
}

.note-editor-popover {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: min(420px, calc(100vw - 48px));
  max-height: min(560px, calc(100dvh - 48px));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #fff;
  border: 1px solid #e8e8e8;
  border-radius: 12px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.18);
  padding: 16px;
  box-sizing: border-box;
}

.note-editor-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.note-editor-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.note-editor-title {
  font-size: 15px;
  font-weight: 600;
  color: #1f1f1f;
}

.note-editor-close {
  border: none;
  background: transparent;
  color: #8c8c8c;
  cursor: pointer;
  font-size: 13px;
}

.note-editor-label {
  display: block;
  flex-shrink: 0;
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 500;
  color: #595959;
}

.note-editor-textarea {
  width: 100%;
  box-sizing: border-box;
  flex-shrink: 0;
  min-height: 100px;
  max-height: 160px;
  padding: 10px 12px;
  border: 1px solid #d9d9d9;
  border-radius: 8px;
  font-size: 14px;
  font-family: inherit;
  line-height: 1.6;
  resize: vertical;
  outline: none;
  margin-bottom: 14px;
}

.note-editor-textarea:focus {
  border-color: #1677ff;
  box-shadow: 0 0 0 2px rgba(22, 119, 255, 0.12);
}

.note-editor-tags {
  flex-shrink: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  max-height: 88px;
  overflow-y: auto;
  margin-bottom: 8px;
}

.note-editor-tag-input {
  flex-shrink: 0;
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #d9d9d9;
  border-radius: 8px;
  padding: 9px 12px;
  font-size: 14px;
  outline: none;
}

.note-editor-tag-input:focus {
  border-color: #1677ff;
  box-shadow: 0 0 0 2px rgba(22, 119, 255, 0.12);
}

.note-editor-tag-section {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 10px;
  overflow-y: auto;
}

.note-editor-tag-option {
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

.note-editor-tag-option:hover {
  background: #f5f7fa;
}

.note-editor-tag-option--create {
  color: #1677ff;
  font-weight: 500;
}

.note-editor-tag-empty {
  color: #8c8c8c;
  font-size: 13px;
  padding: 8px 4px;
}

.note-editor-tag-pagination {
  flex-shrink: 0;
  margin-top: 8px;
  justify-content: flex-end;
}

.note-editor-footer {
  flex-shrink: 0;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #f0f0f0;
}

.note-editor-cancel-btn {
  padding: 6px 14px;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  background: #fff;
  color: #595959;
  cursor: pointer;
  font-size: 13px;
}

.note-editor-save-btn {
  padding: 6px 14px;
  border: 1px solid #1677ff;
  border-radius: 6px;
  background: #1677ff;
  color: #fff;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
}

.note-editor-save-btn:disabled {
  border-color: #d9d9d9;
  background: #f5f5f5;
  color: #bfbfbf;
  cursor: not-allowed;
}

.tag-chip {
  --tag-chip-color: #1677ff;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--tag-chip-color) 30%, white);
  background: color-mix(in srgb, var(--tag-chip-color) 12%, white);
  color: color-mix(in srgb, var(--tag-chip-color) 85%, black);
  padding: 4px 10px;
  font-size: 12px;
  line-height: 1.4;
}

.tag-chip--selected {
  cursor: pointer;
  background: color-mix(in srgb, var(--tag-chip-color) 16%, white);
}

.tag-chip--preview {
  pointer-events: none;
}

.tag-chip-remove {
  font-size: 13px;
}
</style>

<script setup lang="ts">
import { computed, provide, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  createContentComment,
  deleteContentComment,
  listContentCommentReplies,
  listContentComments,
  type ContentComment,
} from '@/api/comment'
import { DEFAULT_PAGE_SIZE } from '@/constants/pagination'
import { useAuthStore } from '@/stores/auth'
import CommentThreadNode from './CommentThreadNode.vue'

const props = withDefaults(
  defineProps<{
    pageId: string
    annotationId?: string | null
    compact?: boolean
  }>(),
  {
    annotationId: null,
    compact: false,
  },
)

const authStore = useAuthStore()

const loading = ref(false)
const submitting = ref(false)
const roots = ref<ContentComment[]>([])
const total = ref(0)
const page = ref(0)
const draft = ref('')
const replyDrafts = ref<Record<string, string>>({})
const expandedIds = ref<Set<string>>(new Set())
const composingIds = ref<Set<string>>(new Set())
const repliesByParent = ref<Record<string, ContentComment[]>>({})
const repliesLoading = ref<Record<string, boolean>>({})
const replySubmitting = ref<Record<string, boolean>>({})

const currentUserId = computed(() => authStore.user?.id || 'anonymous')

const scopeKey = computed(
  () => `${props.pageId}::${props.annotationId?.trim() || ''}`,
)

const uiPage = computed(() => page.value + 1)

function formatTime(value: string): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function canDelete(comment: ContentComment): boolean {
  return comment.authorUserId === currentUserId.value
}

function listToggleLabel(comment: ContentComment): string {
  if (expandedIds.value.has(comment.id)) return '收起评论'
  const count = comment.replyCount
  return count > 0 ? `展开评论 ${count}` : '展开评论'
}

function closeComposer(commentId: string) {
  const next = new Set(composingIds.value)
  next.delete(commentId)
  composingIds.value = next
  replyDrafts.value = { ...replyDrafts.value, [commentId]: '' }
}

async function loadRoots() {
  if (!props.pageId) {
    roots.value = []
    total.value = 0
    return
  }
  loading.value = true
  try {
    const result = await listContentComments(props.pageId, {
      annotationId: props.annotationId,
      page: page.value,
      pageSize: DEFAULT_PAGE_SIZE,
    })
    roots.value = result.items
    total.value = result.total
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载评论失败')
  } finally {
    loading.value = false
  }
}

async function loadReplies(commentId: string) {
  repliesLoading.value = { ...repliesLoading.value, [commentId]: true }
  try {
    const result = await listContentCommentReplies(props.pageId, commentId, {
      page: 0,
      pageSize: DEFAULT_PAGE_SIZE,
    })
    repliesByParent.value = {
      ...repliesByParent.value,
      [commentId]: result.items,
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载评论失败')
  } finally {
    repliesLoading.value = { ...repliesLoading.value, [commentId]: false }
  }
}

async function refreshExpandedAncestors(fromCommentId: string) {
  const visited = new Set<string>()
  let currentId: string | null = fromCommentId
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId)
    if (expandedIds.value.has(currentId) || repliesByParent.value[currentId]) {
      await loadReplies(currentId)
    }
    const cached: ContentComment | null = findCachedComment(currentId)
    currentId = cached?.parentId ?? null
  }
}

function findCachedComment(commentId: string): ContentComment | null {
  const root = roots.value.find((item) => item.id === commentId)
  if (root) return root
  for (const list of Object.values(repliesByParent.value)) {
    const found = list.find((item) => item.id === commentId)
    if (found) return found
  }
  return null
}

async function toggleList(comment: ContentComment) {
  const next = new Set(expandedIds.value)
  if (next.has(comment.id)) {
    next.delete(comment.id)
    expandedIds.value = next
    return
  }
  next.add(comment.id)
  expandedIds.value = next
  if (!repliesByParent.value[comment.id]) {
    await loadReplies(comment.id)
  }
}

function toggleComposer(comment: ContentComment) {
  const next = new Set(composingIds.value)
  if (next.has(comment.id)) {
    next.delete(comment.id)
    composingIds.value = next
    replyDrafts.value = { ...replyDrafts.value, [comment.id]: '' }
    return
  }
  next.add(comment.id)
  composingIds.value = next
}

async function submitRoot() {
  const body = draft.value.trim()
  if (!body || submitting.value) return
  submitting.value = true
  try {
    await createContentComment(props.pageId, {
      annotationId: props.annotationId,
      body,
    })
    draft.value = ''
    page.value = 0
    await loadRoots()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '发表评论失败')
  } finally {
    submitting.value = false
  }
}

async function submitChildComment(parent: ContentComment) {
  const body = (replyDrafts.value[parent.id] || '').trim()
  if (!body || replySubmitting.value[parent.id]) return
  replySubmitting.value = { ...replySubmitting.value, [parent.id]: true }
  try {
    await createContentComment(props.pageId, {
      annotationId: props.annotationId,
      parentId: parent.id,
      body,
    })
    closeComposer(parent.id)
    expandedIds.value = new Set(expandedIds.value).add(parent.id)
    await loadReplies(parent.id)
    await refreshExpandedAncestors(parent.id)
    await loadRoots()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '发表评论失败')
  } finally {
    replySubmitting.value = { ...replySubmitting.value, [parent.id]: false }
  }
}

async function removeComment(comment: ContentComment) {
  try {
    await deleteContentComment(props.pageId, comment.id)
    if (comment.parentId) {
      await loadReplies(comment.parentId)
      await refreshExpandedAncestors(comment.parentId)
    }
    const nextReplies = { ...repliesByParent.value }
    delete nextReplies[comment.id]
    repliesByParent.value = nextReplies
    const nextExpanded = new Set(expandedIds.value)
    nextExpanded.delete(comment.id)
    expandedIds.value = nextExpanded
    closeComposer(comment.id)
    await loadRoots()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '删除评论失败')
  }
}

function onPageChange(nextUiPage: number) {
  page.value = Math.max(0, nextUiPage - 1)
  void loadRoots()
}

provide('commentThread', {
  expandedIds,
  composingIds,
  repliesByParent,
  repliesLoading,
  replyDrafts,
  replySubmitting,
  formatTime,
  canDelete,
  listToggleLabel,
  toggleList,
  toggleComposer,
  submitChildComment,
  removeComment,
})

watch(
  scopeKey,
  () => {
    page.value = 0
    draft.value = ''
    replyDrafts.value = {}
    expandedIds.value = new Set()
    composingIds.value = new Set()
    repliesByParent.value = {}
    void loadRoots()
  },
  { immediate: true },
)
</script>

<template>
  <section
    class="comment-thread"
    :class="{ 'comment-thread--compact': compact }"
  >
    <header class="comment-thread__header">
      <h3 class="comment-thread__title">评论</h3>
      <span class="comment-thread__count">{{ total }}</span>
    </header>

    <div class="comment-thread__list">
      <div v-if="loading" class="comment-thread__empty">加载中…</div>
      <div v-else-if="roots.length === 0" class="comment-thread__empty">暂无评论，来发表第一条吧</div>
      <template v-else>
        <CommentThreadNode
          v-for="item in roots"
          :key="item.id"
          :comment="item"
          :depth="0"
        />
      </template>
    </div>

    <div v-if="total > DEFAULT_PAGE_SIZE" class="comment-thread__pager">
      <el-pagination
        :current-page="uiPage"
        :page-size="DEFAULT_PAGE_SIZE"
        :total="total"
        layout="prev, pager, next"
        size="small"
        background
        :pager-count="compact ? 3 : 5"
        @current-change="onPageChange"
      />
    </div>

    <div class="comment-thread__composer">
      <textarea
        v-model="draft"
        class="comment-thread__input"
        :rows="compact ? 2 : 3"
        maxlength="4000"
        placeholder="发表评论…"
      />
      <button
        type="button"
        class="comment-thread__submit"
        :disabled="!draft.trim() || submitting"
        @click="submitRoot"
      >
        发表评论
      </button>
    </div>
  </section>
</template>

<style scoped>
.comment-thread {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  width: 100%;
  margin-top: 24px;
  padding: 16px 0 8px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.comment-thread--compact {
  margin-top: 0;
  padding: 8px 12px 10px;
  border-top: 1px solid var(--el-border-color-lighter);
  min-height: 140px;
}

.comment-thread__header {
  display: flex;
  flex-shrink: 0;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 10px;
}

.comment-thread__title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.comment-thread--compact .comment-thread__title {
  font-size: 13px;
}

.comment-thread__count {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.comment-thread__list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
  min-height: 160px;
  max-height: 420px;
  overflow-y: auto;
}

.comment-thread--compact .comment-thread__list {
  min-height: 96px;
  max-height: 160px;
}

.comment-thread__empty {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  min-height: 120px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.comment-thread--compact .comment-thread__empty {
  min-height: 72px;
  font-size: 12px;
}

.comment-thread__pager {
  display: flex;
  flex-shrink: 0;
  justify-content: flex-end;
  margin-top: 10px;
}

.comment-thread__composer {
  display: flex;
  flex-shrink: 0;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}

.comment-thread__input {
  box-sizing: border-box;
  width: 100%;
  resize: vertical;
  padding: 8px 10px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  background: var(--el-bg-color);
  color: var(--el-text-color-primary);
  font: inherit;
  font-size: 13px;
  line-height: 1.45;
}

.comment-thread__input:focus {
  outline: none;
  border-color: var(--el-color-primary);
}

.comment-thread__submit {
  align-self: flex-end;
  padding: 6px 12px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  background: var(--el-fill-color-blank);
  color: var(--el-text-color-primary);
  font-size: 13px;
  cursor: pointer;
}

.comment-thread__submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.comment-thread__submit:not(:disabled):hover {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
}

/* Shared by recursive CommentThreadNode (unscoped child uses same class names via :deep) */
.comment-thread :deep(.comment-thread__item) {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.comment-thread :deep(.comment-thread__item--reply) {
  margin-left: 14px;
  padding-left: 10px;
  border-left: 2px solid var(--el-border-color-lighter);
}

.comment-thread :deep(.comment-thread__meta) {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: baseline;
}

.comment-thread :deep(.comment-thread__author) {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.comment-thread :deep(.comment-thread__time) {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.comment-thread :deep(.comment-thread__body) {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 13px;
  line-height: 1.5;
  color: var(--el-text-color-regular);
}

.comment-thread :deep(.comment-thread__actions) {
  display: flex;
  gap: 8px;
}

.comment-thread :deep(.comment-thread__action) {
  padding: 0;
  border: none;
  background: transparent;
  font-size: 12px;
  color: var(--el-color-primary);
  cursor: pointer;
}

.comment-thread :deep(.comment-thread__action--danger) {
  color: var(--el-color-danger);
}

.comment-thread :deep(.comment-thread__replies) {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 4px;
}

.comment-thread :deep(.comment-thread__empty--nested) {
  display: flex;
  min-height: 32px;
  align-items: center;
  justify-content: flex-start;
  padding: 4px 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.comment-thread :deep(.comment-thread__composer--reply) {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 0;
}

.comment-thread :deep(.comment-thread__input) {
  box-sizing: border-box;
  width: 100%;
  resize: vertical;
  padding: 8px 10px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  background: var(--el-bg-color);
  color: var(--el-text-color-primary);
  font: inherit;
  font-size: 13px;
  line-height: 1.45;
}

.comment-thread :deep(.comment-thread__input:focus) {
  outline: none;
  border-color: var(--el-color-primary);
}

.comment-thread :deep(.comment-thread__submit) {
  align-self: flex-end;
  padding: 6px 12px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  background: var(--el-fill-color-blank);
  color: var(--el-text-color-primary);
  font-size: 13px;
  cursor: pointer;
}

.comment-thread :deep(.comment-thread__submit:disabled) {
  opacity: 0.5;
  cursor: not-allowed;
}

.comment-thread :deep(.comment-thread__submit:not(:disabled):hover) {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
}
</style>

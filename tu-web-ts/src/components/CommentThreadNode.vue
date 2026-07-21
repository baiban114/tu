<script setup lang="ts">
import { computed, inject, type Ref } from 'vue'
import type { ContentComment } from '@/api/comment'
import CommentThreadNode from './CommentThreadNode.vue'

const props = defineProps<{
  comment: ContentComment
  depth?: number
}>()

const depth = computed(() => props.depth ?? 0)

type CommentThreadApi = {
  expandedIds: Ref<Set<string>>
  composingIds: Ref<Set<string>>
  repliesByParent: Ref<Record<string, ContentComment[]>>
  repliesLoading: Ref<Record<string, boolean>>
  replyDrafts: Ref<Record<string, string>>
  replySubmitting: Ref<Record<string, boolean>>
  formatTime: (value: string) => string
  canDelete: (comment: ContentComment) => boolean
  listToggleLabel: (comment: ContentComment) => string
  toggleList: (comment: ContentComment) => Promise<void>
  toggleComposer: (comment: ContentComment) => void
  submitChildComment: (parent: ContentComment) => Promise<void>
  removeComment: (comment: ContentComment) => Promise<void>
}

const api = inject<CommentThreadApi>('commentThread')!

const children = computed(() => api.repliesByParent.value[props.comment.id] || [])
const listExpanded = computed(() => api.expandedIds.value.has(props.comment.id))
const composing = computed(() => api.composingIds.value.has(props.comment.id))
const loadingChildren = computed(() => !!api.repliesLoading.value[props.comment.id])
const submitting = computed(() => !!api.replySubmitting.value[props.comment.id])
const showListToggle = computed(() => props.comment.replyCount > 0 || listExpanded.value)

const draftModel = computed({
  get: () => api.replyDrafts.value[props.comment.id] || '',
  set: (value: string) => {
    api.replyDrafts.value = { ...api.replyDrafts.value, [props.comment.id]: value }
  },
})

const nestClass = computed(() => (depth.value > 0 ? 'comment-thread__item--reply' : ''))
</script>

<template>
  <article class="comment-thread__item" :class="nestClass">
    <div class="comment-thread__meta">
      <span class="comment-thread__author">{{ comment.authorDisplayName }}</span>
      <span class="comment-thread__time">{{ api.formatTime(comment.createdAt) }}</span>
    </div>
    <p class="comment-thread__body">{{ comment.body }}</p>
    <div class="comment-thread__actions">
      <button
        v-if="showListToggle"
        type="button"
        class="comment-thread__action"
        @click="api.toggleList(comment)"
      >
        {{ api.listToggleLabel(comment) }}
      </button>
      <button type="button" class="comment-thread__action" @click="api.toggleComposer(comment)">
        {{ composing ? '取消' : '评论' }}
      </button>
      <button
        v-if="api.canDelete(comment)"
        type="button"
        class="comment-thread__action comment-thread__action--danger"
        @click="api.removeComment(comment)"
      >
        删除
      </button>
    </div>

    <div v-if="listExpanded" class="comment-thread__replies">
      <div v-if="loadingChildren" class="comment-thread__empty comment-thread__empty--nested">
        加载评论…
      </div>
      <CommentThreadNode
        v-for="child in children"
        :key="child.id"
        :comment="child"
        :depth="depth + 1"
      />
      <div v-if="!loadingChildren && children.length === 0" class="comment-thread__empty comment-thread__empty--nested">
        暂无评论
      </div>
    </div>

    <div v-if="composing" class="comment-thread__composer comment-thread__composer--reply">
      <textarea
        v-model="draftModel"
        class="comment-thread__input"
        rows="2"
        maxlength="4000"
        placeholder="写下评论…"
      />
      <button
        type="button"
        class="comment-thread__submit"
        :disabled="!draftModel.trim() || submitting"
        @click="api.submitChildComment(comment)"
      >
        发表评论
      </button>
    </div>
  </article>
</template>

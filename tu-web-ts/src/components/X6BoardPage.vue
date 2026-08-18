<script setup lang="ts">
import CanvasPage from '@/components/CanvasPage.vue'
import type { PageContent } from '@/api/types'

defineProps<{
  pageId: string
  content: PageContent
  pageTitle: string
}>()

defineEmits<{
  'content-change': [pageId: string, content: PageContent]
  'page-title-change': [title: string]
}>()
</script>

<template>
  <CanvasPage
    :page-id="pageId"
    page-type="x6board"
    :content="content"
    :page-title="pageTitle"
    @content-change="(pageId, content) => $emit('content-change', pageId, content)"
    @page-title-change="$emit('page-title-change', $event)"
  />
</template>

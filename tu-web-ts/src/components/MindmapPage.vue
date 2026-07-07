<script setup lang="ts">
import CanvasPage from '@/components/CanvasPage.vue'
import type { PageContent } from '@/api/types'

defineProps<{
  content: PageContent
  pageTitle: string
}>()

defineEmits<{
  'content-change': [content: PageContent]
  'page-title-change': [title: string]
}>()
</script>

<template>
  <CanvasPage
    page-type="mindmap"
    :content="content"
    :page-title="pageTitle"
    @content-change="$emit('content-change', $event)"
    @page-title-change="$emit('page-title-change', $event)"
  />
</template>

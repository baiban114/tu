<script setup lang="ts">
import { computed, ref } from 'vue'
import { nodeViewProps, NodeViewWrapper } from '@tiptap/vue-3'
import ResizableBlockWrapper from '../components/ResizableBlockWrapper.vue'
import {
  URL_EMBED_DEFAULT_HEIGHT,
  URL_EMBED_MAX_HEIGHT,
  URL_EMBED_MIN_HEIGHT,
} from '@/utils/urlDisplay'

const props = defineProps(nodeViewProps)

const blockId = computed(() => props.node.attrs.blockId || '')
const url = computed(() => String(props.node.attrs.url || ''))
const height = computed(() => Number(props.node.attrs.height) || URL_EMBED_DEFAULT_HEIGHT)
const loadFailed = ref(false)

function openInNewTab() {
  if (!url.value) return
  window.open(url.value, '_blank', 'noopener,noreferrer')
}

function onResize(_width: number | null, nextHeight: number | null) {
  if (nextHeight == null) return
  const clamped = Math.min(URL_EMBED_MAX_HEIGHT, Math.max(URL_EMBED_MIN_HEIGHT, Math.round(nextHeight)))
  props.updateAttributes({ height: clamped })
}
</script>

<template>
  <node-view-wrapper class="url-embed-block-nv" :data-block-id="blockId">
    <ResizableBlockWrapper
      :selected="selected"
      :resizable-axes="{ width: false, height: true }"
      :height="height"
      :min-height="URL_EMBED_MIN_HEIGHT"
      :max-height="URL_EMBED_MAX_HEIGHT"
      block-type-label="网页嵌入"
      :block-id="blockId"
      block-type="urlEmbed"
      @resize="onResize"
    >
      <template #header-meta>
        <span class="url-embed-block__url" :title="url">{{ url }}</span>
      </template>

      <div class="url-embed-block">
        <div v-if="loadFailed" class="url-embed-block__fallback">
          <p class="url-embed-block__fallback-url" :title="url">{{ url }}</p>
          <button type="button" class="url-embed-block__open-btn" @click="openInNewTab">
            在新标签打开
          </button>
        </div>
        <iframe
          v-else
          class="url-embed-block__iframe"
          :src="url"
          :title="url"
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          referrerpolicy="no-referrer"
          loading="lazy"
          @error="loadFailed = true"
        />
      </div>
    </ResizableBlockWrapper>
  </node-view-wrapper>
</template>

<style scoped>
.url-embed-block__url {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.url-embed-block {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: #f9fafb;
}

.url-embed-block__iframe {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
  background: #fff;
}

.url-embed-block__fallback {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 10px;
  height: 100%;
  padding: 16px;
  box-sizing: border-box;
}

.url-embed-block__fallback-url {
  margin: 0;
  font-size: 13px;
  color: #4b5563;
  word-break: break-all;
}

.url-embed-block__open-btn {
  padding: 6px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #fff;
  color: #374151;
  font-size: 12px;
  cursor: pointer;
}

.url-embed-block__open-btn:hover {
  background: #f3f4f6;
}
</style>
